## Stress & Reliability Test Plan

**Implementation:** Grafana k6 scripts live in `load-testing/scripts/`. See `load-testing/README.md` for how to run them.

---

### 1 — Job Queue Throughput

**Goal:** Verify the system handles many jobs being enqueued and claimed simultaneously.

**Test 1: Mass Enqueue**
Fire 1,000–10,000 webhook events or jobs at once.

Observe:

- `job_queue` insert times
- Advisory locks (should not block inserts)
- `pipeline_runs.status` updates

**Test 2: Multi-Worker Claim**
Run 5–20 worker instances simultaneously, each calling `claimNextOrWait()`.

Measure:

- Job claim latency
- No double claims
- Job completion consistency

---

### 2 — Advisory Lock Contention

**Goal:** Ensure `pg_try_advisory_lock` prevents multiple deployments per environment without blocking the system.

**Test:**
Trigger 10–50 `deploy` jobs for the same environment simultaneously.

Measure:

- How many jobs acquire the lock
- How long other jobs wait/retry
- Lock release correctness after job finishes

---

### 3 — Heartbeat / Stuck Job Reclaim

**Goal:** Verify jobs are properly reclaimed when a worker dies or stalls.

**Test:**
Start a job, then simulate a worker crash (kill the Node process). Let the reclaim loop run with a ~30s heartbeat timeout.

Measure:

- `heartbeat_at` updates
- Job transitions back to `pending`
- Job is claimed correctly by another worker

---

### 4 — Log Streaming / LISTEN-NOTIFY

**Goal:** Ensure high-volume log streaming works without lost messages.

**Test:**
Launch jobs that produce hundreds of log lines per second. Subscribe via SSE / `getLogStream()`.

Measure:

- Latency from `INSERT` → `NOTIFY` → subscriber
- Missed or truncated messages
- Payload size limits (8KB cap on PG `NOTIFY`)

---

### 5 — Stage/Step Ordering _(optional)_

**Goal:** Show that job dependencies and stage gating are enforced.

**Test:**
Enqueue a pipeline with multiple stages. Observe that jobs are only claimed in order (by priority + stage), and that no stage 2 job runs before stage 1 completes.

> **Note:** The system does not currently enforce stage gating. This test is useful as a baseline — it makes the absence of gating visible under load and sets a clear target for when gating is added.

---

### 6 — Mixed Load (End-to-End Stress)

**Goal:** Simulate a realistic deployment workload across webhooks, job execution, logging, and lock contention simultaneously.

**Test:**
Enqueue 500–1,000 mixed jobs (normal + deploy). Run 5–10 workers. Flood log streaming at the same time.

Measure:

- Worker CPU & memory
- Job completion rate
- Advisory lock wait times
- Latency of logs appearing via SSE

---

### 7 — Failure & Recovery

**Goal:** Verify resilience of a pure-Postgres system under failure conditions.

- **Test 1:** Kill random workers mid-job → jobs are reclaimed and completed by other workers
- **Test 2:** Disconnect the DB, then reconnect → system recovers gracefully
- **Test 3:** Flood log streaming → oversized payloads are truncated safely without crashing
