# **CI/CD Pipeline Orchestrator - Blueprint**

## **System Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                        API Layer (NestJS)                    │
│  - Webhook receiver (Git push events)                       │
│  - Dashboard API (pipeline status, logs)                    │
│  - Manual trigger endpoints                                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL 17                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Job Queue   │  │ Log Stream   │  │ Deploy Locks │     │
│  │  (Outbox)    │  │(LISTEN/      │  │ (Advisory)   │     │
│  │              │  │ NOTIFY)      │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Materialized │  │ Full-Text    │  │ Partitioned  │     │
│  │ Views        │  │ Search       │  │ Logs         │     │
│  │ (Stats)      │  │ (Logs)       │  │ (Time-series)│     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        ▼            ▼            ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │Worker 1 │ │Worker 2 │ │Worker 3 │ │Worker N │
   │(NestJS) │ │(NestJS) │ │(NestJS) │ │(NestJS) │
   └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## **Database Schema Design**

### **Core Tables**

#### 1. **pipelines** (Pipeline definitions)

```sql
CREATE TABLE pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    repository VARCHAR(500) NOT NULL,
    config JSONB NOT NULL, -- Stages, steps, env vars
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. **pipeline_runs** (Execution instances)

```sql
CREATE TABLE pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID REFERENCES pipelines(id),
    trigger_type VARCHAR(50) NOT NULL, -- 'git_push', 'manual', 'scheduled'
    trigger_metadata JSONB, -- commit hash, branch, author
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, success, failed, cancelled
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_created ON pipeline_runs(created_at DESC);
```

#### 3. **jobs** (Individual job queue - THE OUTBOX)

```sql
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_run_id UUID REFERENCES pipeline_runs(id),
    stage VARCHAR(100) NOT NULL, -- 'build', 'test', 'deploy'
    step_name VARCHAR(255) NOT NULL,
    command TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, success, failed
    priority INTEGER DEFAULT 5, -- Higher = more urgent

    -- Distributed queue fields
    claimed_by VARCHAR(100), -- worker_id
    claimed_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ, -- For detecting dead workers

    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Results
    exit_code INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_jobs_queue ON jobs(status, priority DESC, created_at)
    WHERE status = 'pending';
CREATE INDEX idx_jobs_heartbeat ON jobs(heartbeat_at)
    WHERE status = 'running';
```

#### 4. **job_logs** (Partitioned by time)

```sql
CREATE TABLE job_logs (
    id BIGSERIAL,
    job_id UUID NOT NULL REFERENCES jobs(id),
    log_line TEXT NOT NULL,
    log_level VARCHAR(20) DEFAULT 'info',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions (automate this later)
CREATE TABLE job_logs_2024_02 PARTITION OF job_logs
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Full-text search
CREATE INDEX idx_job_logs_search ON job_logs USING GIN(to_tsvector('english', log_line));
CREATE INDEX idx_job_logs_job ON job_logs(job_id, timestamp DESC);
```

#### 5. **deployment_locks** (Prevent concurrent deploys)

```sql
CREATE TABLE deployment_locks (
    environment VARCHAR(100) PRIMARY KEY, -- 'production', 'staging'
    locked_by UUID REFERENCES pipeline_runs(id),
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- Auto-release after timeout
);

CREATE INDEX idx_deployment_locks_expires ON deployment_locks(expires_at);
```

#### 6. **webhooks_outbox** (Notification queue)

```sql
CREATE TABLE webhooks_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL, -- 'pipeline.completed', 'job.failed'
    payload JSONB NOT NULL,
    webhook_url TEXT NOT NULL,

    status VARCHAR(50) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 5,
    next_retry_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_webhooks_queue ON webhooks_outbox(status, next_retry_at)
    WHERE status = 'pending';
```

---

### **Materialized Views (Replace Redis Cache)**

#### Build statistics dashboard

```sql
CREATE MATERIALIZED VIEW pipeline_stats AS
SELECT
    p.id AS pipeline_id,
    p.name,
    COUNT(pr.id) AS total_runs,
    COUNT(CASE WHEN pr.status = 'success' THEN 1 END) AS success_count,
    COUNT(CASE WHEN pr.status = 'failed' THEN 1 END) AS failure_count,
    ROUND(AVG(EXTRACT(EPOCH FROM (pr.completed_at - pr.started_at)))) AS avg_duration_seconds,
    MAX(pr.created_at) AS last_run_at
FROM pipelines p
LEFT JOIN pipeline_runs pr ON p.id = pr.pipeline_id
WHERE pr.created_at > NOW() - INTERVAL '30 days'
GROUP BY p.id, p.name;

CREATE UNIQUE INDEX ON pipeline_stats(pipeline_id);

-- Refresh every 5 minutes
CREATE OR REPLACE FUNCTION refresh_pipeline_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY pipeline_stats;
END;
$$ LANGUAGE plpgsql;
```

---

## **Key PostgreSQL Features Used**

### 1. **Job Queue with SKIP LOCKED**

```sql
-- Worker claims next job atomically
UPDATE jobs
SET
    status = 'running',
    claimed_by = 'worker-123',
    claimed_at = NOW(),
    heartbeat_at = NOW()
WHERE id = (
    SELECT id FROM jobs
    WHERE status = 'pending'
    ORDER BY priority DESC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING *;
```

### 2. **Advisory Locks for Deployments**

```sql
-- Try to acquire lock for production deploy
SELECT pg_try_advisory_lock(hashtext('deploy:production'));

-- Returns true if lock acquired, false if already locked
-- Lock auto-releases when connection closes (worker dies)
```

### 3. **LISTEN/NOTIFY for Real-time Logs**

```sql
-- Worker inserts log
INSERT INTO job_logs (job_id, log_line) VALUES (...);
NOTIFY job_logs, '{"job_id": "abc-123", "line": "Building..."}';

-- Dashboard listens
LISTEN job_logs;
-- Receives notifications in real-time
```

### 4. **Dead Worker Detection**

```sql
-- Reclaim jobs from dead workers (heartbeat > 30s old)
UPDATE jobs
SET
    status = 'pending',
    claimed_by = NULL,
    claimed_at = NULL,
    retry_count = retry_count + 1
WHERE status = 'running'
    AND heartbeat_at < NOW() - INTERVAL '30 seconds'
    AND retry_count < max_retries;
```

---

## **NestJS Application Structure**

```
src/
├── main.ts                          # Bootstrap
├── app.module.ts                    # Root module
│
├── api/                             # REST API Layer
│   ├── pipelines/
│   │   ├── pipelines.controller.ts  # CRUD for pipelines
│   │   └── pipelines.service.ts
│   ├── runs/
│   │   ├── runs.controller.ts       # Trigger, status, logs
│   │   └── runs.service.ts
│   └── webhooks/
│       └── git-webhook.controller.ts # Receive Git push events
│
├── worker/                          # Background Worker
│   ├── worker.service.ts            # Main worker loop
│   ├── job-claimer.service.ts       # Claims jobs from queue
│   ├── job-executor.service.ts      # Executes shell commands
│   └── heartbeat.service.ts         # Updates heartbeat
│
├── queue/                           # Queue Management
│   ├── job-queue.service.ts         # Job CRUD + claim logic
│   └── webhook-queue.service.ts     # Webhook outbox processor
│
├── streaming/                       # Real-time Features
│   ├── log-stream.service.ts        # LISTEN/NOTIFY for logs
│   └── sse.controller.ts            # Server-Sent Events endpoint
│
├── locks/                           # Distributed Locking
│   └── deployment-lock.service.ts   # Advisory locks
│
└── database/
    ├── database.module.ts           # PostgreSQL connection
    └── migrations/                  # Schema migrations
```

---

## **Workflow Example: Git Push → Deploy**

```
1. Git Push Event
   ↓
2. Webhook Controller receives push
   ↓
3. Create pipeline_run (status: pending)
   ↓
4. Parse pipeline config → Create jobs
   - Job 1: stage=build, command="npm install && npm build"
   - Job 2: stage=test, command="npm test" (depends on Job 1)
   - Job 3: stage=deploy, command="./deploy.sh production"
   ↓
5. Worker polls queue (SELECT ... FOR UPDATE SKIP LOCKED)
   ↓
6. Worker claims Job 1
   - Sets status='running', claimed_by='worker-1'
   ↓
7. Worker executes command
   - Streams logs → INSERT INTO job_logs + NOTIFY
   ↓
8. Job 1 completes (status='success')
   - Job 2 becomes eligible (dependency met)
   ↓
9. Another worker claims Job 2
   ↓
10. Job 3 (deploy) tries to acquire lock
    - SELECT pg_try_advisory_lock(hashtext('deploy:production'))
    - If locked → waits or fails
    ↓
11. Deploy completes → Release lock
    ↓
12. Create webhook notification (INSERT INTO webhooks_outbox)
    ↓
13. Webhook worker processes outbox
    - Sends POST to Slack/Discord
    - Retries on failure with exponential backoff
```

---

## **Stress Test Scenarios**

### Scenario 1: High Throughput

- 100 concurrent pipeline runs
- 10 workers fighting for jobs
- Verify: No duplicate job execution, all jobs complete

### Scenario 2: Worker Failures

- Kill workers mid-job
- Verify: Jobs get reclaimed and retry

### Scenario 3: Deploy Contention

- 5 pipelines try to deploy to production simultaneously
- Verify: Only 1 succeeds, others wait or fail gracefully

### Scenario 4: Log Ingestion

- Stream 10,000 log lines/second
- Verify: Dashboard receives real-time updates via LISTEN/NOTIFY

### Scenario 5: Webhook Reliability

- Webhook endpoint goes down
- Verify: Retries with exponential backoff, no message loss

---

## **Metrics to Track**

Dashboard should show:

- **Queue depth**: Pending jobs count
- **Worker utilization**: Active jobs / total workers
- **Job latency**: Time from created → started
- **Success rate**: % of jobs that succeed
- **Throughput**: Jobs/second completed
- **Lock contention**: How often deploy locks are blocked

---

## **Docker Compose Setup**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: cicd
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
    ports:
      - '5432:5432'
    volumes:
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql

  api:
    build: .
    command: npm run start:api
    ports:
      - '3000:3000'
    depends_on:
      - postgres

  worker-1:
    build: .
    command: npm run start:worker
    depends_on:
      - postgres

  worker-2:
    build: .
    command: npm run start:worker
    depends_on:
      - postgres

  worker-3:
    build: .
    command: npm run start:worker
    depends_on:
      - postgres
```
