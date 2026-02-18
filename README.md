
# Mini-Jenkin — CI/CD Pipeline Orchestrator

> *A lightweight CI/CD orchestrator that runs entirely on PostgreSQL — no Kafka, Redis, or RabbitMQ needed.*

Most teams add distributed infrastructure way before they actually need it. Mini-Jenkin goes the other way: **see how far your existing stack can take you first, then bring in new tools only when you have a real reason to.**

Turns out Postgres can do a lot more than we usually ask of it. This project leans into that:

- **Queue** — jobs claimed with `SELECT ... FOR UPDATE SKIP LOCKED`
- **Pub/Sub** — `LISTEN/NOTIFY` for real-time log streaming
- **Locking** — advisory locks so deploys don't step on each other
- **Reliability** — heartbeat-based retries and dead-worker reclaim
- **Analytics** — materialized views, full-text search, and pipeline metrics

---

## Features

- **Git webhooks** — pipelines kick off automatically on push
- **Distributed job queue** — workers grab jobs without conflicts or duplication
- **Real-time log streaming** — Postgres triggers fire `NOTIFY` events; the API ships them to clients via SSE
- **Deployment locking** — `pg_try_advisory_lock` keeps one active deploy per environment
- **Dead worker recovery** — heartbeats let other workers pick up where a crashed one left off
- **Reliable notifications** — an outbox table makes sure your Slack/Discord messages actually get delivered
- **Dashboard metrics** — queue depth, worker utilization, latency, and throughput from materialized views

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

Postgres is the whole show here. Nothing else in the critical path.

Full schema, indexes, SQL patterns, NestJS module layout, and stress scenarios are in [`mini-jenkin/blueprint.md`](./mini-jenkin/blueprint.md).

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local dev outside Docker)

### Quick Start

```bash
docker compose up -d
```

| Service    | URL / Address                          |
| ---------- | -------------------------------------- |
| API        | http://localhost:3000                  |
| Swagger UI | http://localhost:3000/docs             |
| PostgreSQL | localhost:5432 · DB `cicd` · user `admin` · password `password` |

The Swagger path is configurable via `SWAGGER_PATH` if you want to change it.

### Running Locally (without Docker)

```bash
# 1. Start PostgreSQL (Docker or local install)
# 2. Set your database connection
cp .env.example .env   # then edit DATABASE_URL

# 3. Start the API
npm run start:dev

# 4. Start one or more workers (spin up multiple to simulate a distributed pool)
RUN_WORKER_LOOP=true npm run start:worker
```

---

## How It Works

1. **Trigger** — a git push hits the webhook, which creates a `pipeline_run` and queues up jobs
2. **Claim** — workers race to grab jobs with `SELECT ... FOR UPDATE SKIP LOCKED`; only one wins each row
3. **Stream** — logs land in `job_logs`, a Postgres trigger fires `NOTIFY job_logs`, and the API streams them to clients via SSE
4. **Lock** — deploy jobs use `pg_try_advisory_lock` so only one deploy runs per environment at a time
5. **Deliver** — Slack/Discord notifications go into an outbox table and get retried until they stick

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

All metrics come from materialized views, refreshed on demand.

- **Queue depth** — pending jobs waiting to be claimed
- **Worker utilization** — active jobs vs. active workers
- **Job latency** — time from creation to first claim
- **Throughput & success rate** — jobs/sec, pass/fail ratio
- **Lock contention** — how often deploys are getting blocked

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

If you change `package.json`, rebuild the API image explicitly:

```bash
docker compose up --build api
```

---

## Philosophy

Kafka, Redis, and RabbitMQ are great — when you actually need them. The thing is, a lot of teams reach for them out of habit or just-in-case thinking, before really understanding what their existing setup can handle.

Mini-Jenkin bets on a different default: **start with what you've got, really get to know it, and only add new systems when you've hit an actual wall.** Postgres is already running in almost every production stack. It's got a job queue, pub/sub, distributed locking, and analytics built right in. Most teams just never use any of it.

This project does. Not because Postgres is always the answer — but because knowing what it's capable of makes you a way better judge of when it's not.