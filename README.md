# Mini-Jenkin — CI/CD Pipeline Orchestrator

A lightweight CI/CD pipeline orchestrator built with **NestJS** and **PostgreSQL 17**. Pipelines, job queue, real-time logs, and deployment locking are all backed by PostgreSQL—no Redis or external message broker required.

## Features

- **Git webhooks** — Trigger pipelines on push events
- **Distributed job queue** — Workers claim jobs with `SELECT ... FOR UPDATE SKIP LOCKED`
- **Real-time log streaming** — `LISTEN`/`NOTIFY` for live log updates in the dashboard
- **Deployment locking** — Advisory locks prevent concurrent deploys to the same environment
- **Retries & dead worker handling** — Heartbeats and reclaim for failed or stuck jobs
- **Webhook outbox** — Reliable delivery of notifications (e.g. Slack/Discord) with retries
- **Dashboard-ready metrics** — Materialized views for pipeline stats; full-text search on logs

## Tech Stack

| Layer        | Technology   |
|-------------|--------------|
| API         | NestJS       |
| Database    | PostgreSQL 17|
| Runtime     | Node.js      |
| Orchestration | Docker Compose |

## Architecture (High Level)

```
┌─────────────────────────────────────────────────────────────┐
│                     API (NestJS)                            │
│  Webhooks • Dashboard API • Manual triggers                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL 17                             │
│  Job queue (outbox) • LISTEN/NOTIFY • Advisory locks        │
│  Materialized views • Partitioned logs • Full-text search   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        ▼            ▼            ▼            ▼
   Worker 1      Worker 2     Worker 3     Worker N
```

See [blueprint.md](./blueprint.md) for the full architecture and schema.

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development without Docker)

### Quick Start with Docker

1. Clone the repo and enter the project:

   ```bash
   cd mini-jenkin
   ```

2. Start services (PostgreSQL + API + workers):

   ```bash
   docker compose up -d
   ```

3. API: **http://localhost:3000**

### Environment

PostgreSQL is configured in Docker Compose. For local runs, ensure:

- `POSTGRES_DB=cicd`
- `POSTGRES_USER=admin`
- `POSTGRES_PASSWORD=password`
- Default port: `5432`

### Running Locally (without Docker)

- Start PostgreSQL 17 (e.g. via Docker or local install).
- Apply schema (see `blueprint.md` or `database/migrations`).
- API: `npm run start:api`
- Workers: `npm run start:worker` (run multiple instances to simulate multiple workers).

## Project Structure

```
src/
├── api/           # REST: pipelines, runs, git webhooks
├── worker/        # Job claim loop, executor, heartbeat
├── queue/         # Job queue + webhook outbox
├── streaming/     # LISTEN/NOTIFY + SSE for logs
├── locks/         # Deployment advisory locks
└── database/      # Connection + migrations
```

Details and file names are in [blueprint.md](./blueprint.md).

## How It Works (Example Flow)

1. **Git push** → Webhook creates a `pipeline_run` and inserts **jobs** into the queue.
2. **Workers** poll with `SELECT ... FOR UPDATE SKIP LOCKED`, claim a job, set `claimed_by` and `heartbeat_at`.
3. **Execution** streams output into `job_logs` and sends `NOTIFY` for real-time UI.
4. **Deploy jobs** use `pg_try_advisory_lock('deploy:production')` so only one production deploy runs at a time.
5. **Completion** can enqueue a row in `webhooks_outbox` for Slack/Discord; a separate processor sends with retries.

## Stress & Reliability

The blueprint defines scenarios to validate:

- High throughput (many runs, many workers, no duplicate execution)
- Worker failures (reclaim and retry)
- Deploy contention (single winner per environment)
- Log volume (LISTEN/NOTIFY under load)
- Webhook reliability (retries, no message loss)

See [blueprint.md](./blueprint.md) for the full list and SQL patterns.

## Metrics (Dashboard)

Target metrics to expose:

- Queue depth (pending jobs)
- Worker utilization (active jobs / workers)
- Job latency (created → started)
- Success rate and throughput (jobs/sec)
- Deploy lock contention

Materialized view `pipeline_stats` and refresh strategy are described in the blueprint.

## Further Reading

- **[blueprint.md](./blueprint.md)** — Full system design: schema, indexes, SQL patterns, NestJS layout, workflow, Docker Compose, and stress scenarios.
