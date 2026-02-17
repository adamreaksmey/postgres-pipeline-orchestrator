# Mini-Jenkin — CI/CD Pipeline Orchestrator (PostgreSQL-first)

Mini-Jenkin is a **lightweight CI/CD orchestrator** built with **NestJS** and **PostgreSQL** (latest), designed to prove that PostgreSQL can handle the “distributed systems primitives” you typically bolt on:

- **Queue**: `jobs` claimed with `FOR UPDATE SKIP LOCKED`
- **Pub/Sub**: `LISTEN/NOTIFY` (DB emits events)
- **Locking**: advisory locks for deploy contention
- **Reliability**: retries + dead-worker reclaim via heartbeats

Think of PostgreSQL not just as storage, but as the **engine** of the system.

---

## Features

- **Git webhooks** — Trigger pipelines automatically on push events
- **Distributed job queue** — Workers claim jobs with `SELECT ... FOR UPDATE SKIP LOCKED`
- **Real-time log streaming** — `LISTEN`/`NOTIFY` powers live log updates (Postgres trigger emits events)
- **Deployment locking** — Advisory locks ensure only one deploy per environment at a time
- **Retries & dead worker handling** — Heartbeats let workers reclaim stuck jobs
- **Reliable webhooks** — Outbox table guarantees notifications to Slack/Discord
- **Dashboard-ready metrics** — Materialized views, full-text search, and pipeline stats

_Postgres is no longer just storage—it’s your queue, pub/sub system, scheduler, and analytics engine._

---

## Tech Stack

| Layer         | Technology     |
| ------------- | -------------- |
| API           | NestJS         |
| Database      | PostgreSQL (latest) |
| Runtime       | Node.js        |
| Orchestration | Docker Compose |

---

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
│  Job queue • Outbox • LISTEN/NOTIFY • Advisory locks        │
│  Materialized views • Partitioned logs • Full-text search   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬────────────┐
        ▼            ▼            ▼            ▼
   Worker 1      Worker 2     Worker 3     Worker N
```

_PostgreSQL is at the heart of the system, replacing traditional brokers and orchestration tools._

See `mini-jenkin/blueprint.md` for the full architecture and SQL patterns.

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development without Docker)

### Quick Start with Docker

```bash
docker compose up -d
```

- API: **[http://localhost:3000](http://localhost:3000)**
- Swagger UI: **[http://localhost:3000/docs](http://localhost:3000/docs)** (configurable via `SWAGGER_PATH`)
- PostgreSQL: Default port 5432, DB `cicd`, user `admin`, password `password`

---

## Running Locally

1. Start PostgreSQL (Docker or local install)
2. Copy env: `cp .env.example .env` (or export `DATABASE_URL`)
3. Start API: `npm run start:dev`
4. Start Workers: `RUN_WORKER_LOOP=true npm run start:worker` (multiple instances simulate distributed workers)

---

## How It Works

1. Git push → Webhook creates `pipeline_run` and inserts jobs
2. Workers claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED`
3. Logs stream to `job_logs`; **Postgres trigger** emits `NOTIFY job_logs` events; API SSE forwards to clients
4. Deploy jobs acquire advisory locks (`pg_try_advisory_lock`) for safe concurrency
5. Webhooks use outbox table with retry mechanism

> Every distributed mechanism—from queueing to pub/sub—is powered purely by PostgreSQL.

---

## Reliability & Stress

- High throughput: multiple pipelines and workers without duplication
- Dead worker reclaim: stuck jobs automatically retried
- Deploy contention: one winner per environment
- Log streaming: LISTEN/NOTIFY under load
- Webhook delivery: guaranteed via outbox retries

---

## Metrics (Dashboard)

- Queue depth (pending jobs)
- Worker utilization (active jobs/workers)
- Job latency (created → started)
- Success rate & throughput (jobs/sec)
- Deploy lock contention

Materialized views and refresh strategies are fully defined in [blueprint.md](./blueprint.md).

---

## Philosophy

Mini-Jenkin is a statement: **PostgreSQL can do it all.**

- Queue? Postgres.
- Pub/Sub? Postgres.
- Locking and orchestration? Postgres.
- Metrics, search, analytics? Postgres.

Why rely on Kafka, RabbitMQ, or Redis when your database is powerful enough to be _everything_?

---

## Further Reading

- `mini-jenkin/blueprint.md` — Full system design: schema, indexes, SQL patterns, NestJS layout, workflow, Docker Compose, and stress scenarios.

---

## API Endpoints (high-level)

- **Pipelines CRUD**: `GET/POST/PATCH/DELETE /pipelines`
- **Runs**: `GET /runs`, `GET /runs/:id`, `GET /runs/:id/jobs`, `POST /runs`
- **Git webhook**: `POST /webhooks/git/push`
- **Logs (SSE)**: `GET /stream/logs` and `GET /stream/logs/:jobId`
- **Swagger**: `GET /docs` (and `GET /docs-json`)

---

## Dev Mode (live reload in Docker)

This repo includes `docker-compose.override.yml` so the **API** can run with a mounted source tree and `nest --watch`.

```bash
docker compose up --build
```

If you change `package.json`, rebuild the API image:

```bash
docker compose up --build api
```
