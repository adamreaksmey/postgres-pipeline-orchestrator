# Mini-Jenkin — CI/CD Pipeline Orchestrator Powered by PostgreSQL

Mini-Jenkin is a **lightweight CI/CD orchestrator** built with **NestJS** and **PostgreSQL 17**, designed to prove that PostgreSQL can handle _everything_: job queues, real-time logs, deployment locking, retries, and metrics—all **without Redis, Kafka, RabbitMQ, or any external message broker**.

Think of PostgreSQL not just as a database, but as the _engine of your distributed system_.

---

## Features

- **Git webhooks** — Trigger pipelines automatically on push events
- **Distributed job queue** — Workers claim jobs with `SELECT ... FOR UPDATE SKIP LOCKED`
- **Real-time log streaming** — `LISTEN`/`NOTIFY` powers live log updates
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
| Database      | PostgreSQL 17  |
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

See [blueprint.md](./blueprint.md) for full architecture and SQL patterns.

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development without Docker)

### Quick Start with Docker

```bash
git clone <repo>
cd mini-jenkin
docker compose up -d
```

- API: **[http://localhost:3000](http://localhost:3000)**
- PostgreSQL: Default port 5432, DB `cicd`, user `admin`, password `password`

---

## Running Locally

1. Start PostgreSQL 17 (Docker or local install)
2. Apply schema: see `blueprint.md` or `database/migrations`
3. Start API: `npm run start:api`
4. Start Workers: `npm run start:worker` (multiple instances simulate distributed workers)

---

## How It Works

1. Git push → Webhook creates `pipeline_run` and inserts jobs
2. Workers claim jobs using `SELECT ... FOR UPDATE SKIP LOCKED`
3. Logs stream to `job_logs` table; `NOTIFY` triggers live UI updates
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

- [blueprint.md](./blueprint.md) — Full system design: schema, indexes, SQL patterns, NestJS layout, workflow, Docker Compose, and stress scenarios.
