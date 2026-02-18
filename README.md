# Mini-Jenkin — CI/CD Pipeline Orchestrator

> *A lightweight CI/CD orchestrator that uses PostgreSQL as its queue, pub/sub bus, lock server, and analytics engine — no Kafka, Redis, or RabbitMQ required.*

Most teams reach for distributed infrastructure before they've truly tested what they already have. Mini-Jenkin is a deliberate experiment in the opposite direction: **push your current stack to its limits first, then add new technology only when you have a clear reason to.**

PostgreSQL is far more capable than we usually ask of it. This project puts those capabilities front and center:

- **Queue** — jobs claimed with `SELECT ... FOR UPDATE SKIP LOCKED`
- **Pub/Sub** — `LISTEN/NOTIFY` for real-time log streaming
- **Locking** — advisory locks for safe deploy concurrency
- **Reliability** — heartbeat-based retries and dead-worker reclaim
- **Analytics** — materialized views, full-text search, and pipeline metrics

---

## Features

- **Git webhooks** — Trigger pipelines automatically on push events
- **Distributed job queue** — Workers claim jobs without conflicts or duplication
- **Real-time log streaming** — Postgres triggers emit `NOTIFY` events; the API forwards them via SSE
- **Deployment locking** — `pg_try_advisory_lock` ensures one active deploy per environment
- **Dead worker recovery** — Heartbeats allow other workers to reclaim stuck jobs
- **Reliable outbound notifications** — Outbox table guarantees Slack/Discord delivery with retries
- **Dashboard metrics** — Queue depth, worker utilization, latency, and throughput via materialized views

---

## Tech Stack

| Layer         | Technology          |
| ------------- | ------------------- |
| API           | NestJS              |
| Database      | PostgreSQL (latest) |
| Runtime       | Node.js 18+         |
| Orchestration | Docker Compose      |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       API (NestJS)                          │
│        Webhooks · Dashboard API · Manual triggers           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL 17                            │
│   Job queue · Outbox · LISTEN/NOTIFY · Advisory locks       │
│   Materialized views · Partitioned logs · Full-text search  │
└──────────┬──────────────┬──────────────┬────────────────────┘
           │              │              │
      Worker 1       Worker 2       Worker N
```

PostgreSQL is the heart of the system. There is nothing else in the critical path.

Full schema, indexes, SQL patterns, NestJS module layout, and stress scenarios are documented in [`mini-jenkin/blueprint.md`](./mini-jenkin/blueprint.md).

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development outside Docker)

### Quick Start

```bash
docker compose up -d
```

| Service    | URL / Address                          |
| ---------- | -------------------------------------- |
| API        | http://localhost:3000                  |
| Swagger UI | http://localhost:3000/docs             |
| PostgreSQL | localhost:5432 · DB `cicd` · user `admin` · password `password` |

The Swagger path is configurable via the `SWAGGER_PATH` environment variable.

### Running Locally (without Docker)

```bash
# 1. Start PostgreSQL (Docker or local install)
# 2. Set your database connection
cp .env.example .env   # then edit DATABASE_URL

# 3. Start the API
npm run start:dev

# 4. Start one or more workers (multiple instances simulate a distributed pool)
RUN_WORKER_LOOP=true npm run start:worker
```

---

## How It Works

1. **Trigger** — A git push sends a webhook to the API, which creates a `pipeline_run` and enqueues jobs.
2. **Claim** — Workers race to claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED`; only one worker wins each row.
3. **Stream** — Log entries are written to `job_logs`; a Postgres trigger fires `NOTIFY job_logs`; the API forwards events to connected clients via SSE.
4. **Lock** — Deploy jobs call `pg_try_advisory_lock` so only one deploy runs per environment at a time.
5. **Deliver** — Outbound Slack/Discord notifications are written to an outbox table and retried until confirmed.

---

## Reliability

| Concern               | Mechanism                                              |
| --------------------- | ------------------------------------------------------ |
| Duplicate job claims  | `FOR UPDATE SKIP LOCKED` — atomic, no double-pick      |
| Stuck / crashed workers | Heartbeat timestamps; other workers reclaim expired jobs |
| Deploy race conditions | Advisory locks — one winner per environment            |
| Missed notifications  | Outbox table with retry loop                           |

---

## Dashboard Metrics

All metrics are served from materialized views and refreshed on demand.

- **Queue depth** — pending jobs waiting to be claimed
- **Worker utilization** — active jobs relative to active workers
- **Job latency** — time from creation to first claim
- **Throughput & success rate** — jobs/sec, pass/fail ratio
- **Lock contention** — how often deploys are blocked

Refresh strategies and view definitions are in [`blueprint.md`](./mini-jenkin/blueprint.md).

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PATCH/DELETE` | `/pipelines` | Pipeline CRUD |
| `GET` | `/runs` | List pipeline runs |
| `GET` | `/runs/:id` | Run details |
| `GET` | `/runs/:id/jobs` | Jobs for a run |
| `POST` | `/runs` | Trigger a run manually |
| `POST` | `/webhooks/git/push` | Git push webhook |
| `GET` | `/stream/logs` | SSE — all job logs |
| `GET` | `/stream/logs/:jobId` | SSE — logs for one job |
| `GET` | `/dashboard/pipeline-stats` | Materialized view stats |
| `POST` | `/dashboard/pipeline-stats/refresh` | Refresh materialized view |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/docs-json` | OpenAPI JSON |

---

## Development (Live Reload in Docker)

The repo includes `docker-compose.override.yml` which mounts the source tree and runs `nest --watch` inside the container:

```bash
docker compose up --build
```

If you modify `package.json`, rebuild the API image explicitly:

```bash
docker compose up --build api
```

---

## Philosophy

Kafka, Redis, and RabbitMQ are excellent tools — when you actually need them. The problem is that we often add them out of habit or anticipation rather than necessity, before we've understood what our existing infrastructure can do.

Mini-Jenkin is a concrete argument for a different default: **start with what you have, understand it deeply, and only introduce new systems when you've hit a real wall.** Postgres is running in almost every production stack. It has a job queue, a pub/sub bus, a distributed lock server, and an analytics engine built in. Most teams never use them.

This project does. Not because Postgres is always the right answer — but because knowing what it can do makes you a better judge of when it isn't.