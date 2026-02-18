# Load testing with Grafana k6

Stress tests for the Mini-Jenkin API and Postgres-backed job queue. Requires the API (and optionally workers + Postgres) to be running.

## Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed (e.g. `brew install k6` or [installer](https://grafana.com/docs/k6/latest/set-up/install-k6/)).

## Base URL

Set the API base URL (default `http://localhost:3000`):

```bash
export BASE_URL=http://localhost:3000
# or
BASE_URL=http://localhost:3000 k6 run scripts/mass-enqueue.js
```

## Scripts

| Script                     | Note section                | What it does                                                                           |
| -------------------------- | --------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/mass-enqueue.js`  | 1 Job queue throughput     | Mass trigger runs (POST /runs); measures enqueue latency and success rate.             |
| `scripts/advisory-lock.js` | 2 Advisory lock contention | Triggers many runs on a pipeline with deploy jobs (same env); measures lock behaviour. |
| `scripts/log-streaming.js` | 4 Log streaming            | Triggers a run, subscribes to SSE job logs, measures event latency.                    |
| `scripts/mixed-load.js`    | 6 Mixed load               | Combined: trigger runs, poll run status, hit dashboard and deployment-locks.           |

## Run

```bash
cd load-testing

# 1. Mass enqueue (default 50 VUs, 30s; or 1000 triggers in total)
k6 run scripts/mass-enqueue.js

# 2. Advisory lock (many deploy runs; use pipeline with deploy stage, e.g. backend-api)
k6 run scripts/advisory-lock.js

# 3. Log streaming (SSE + trigger)
k6 run scripts/log-streaming.js

# 4. Mixed load
k6 run scripts/mixed-load.js
```

Override options via env or script edits (see each script’s `options` and `__ENV`).

## Pipeline IDs

Scripts that need a `pipelineId` will **GET /pipelines** once at init and use the first pipeline (seed data). To target a specific pipeline (e.g. one with deploy stages), set:

```bash
export PIPELINE_ID=<uuid-from-GET-pipelines>
```

## Output

- k6 prints a summary: request rate, latency percentiles, success rate, etc.
- Optional: stream results to Grafana Cloud or [output to JSON/CSV](https://grafana.com/docs/k6/latest/results-output/real-time/).

Example:

```
k6 run --out json=results.json scripts/mass-enqueue.js
```

## Manual / out-of-k6

- **§3 Heartbeat / reclaim:** Kill a worker mid-job and confirm reclaim (heartbeat timeout ~30s, reclaim loop ~15s).
- **§7 Failure & recovery:** Kill workers, disconnect DB, then reconnect; verify jobs complete and no duplicate claims.

These are not automated in k6; run them manually and observe DB and worker logs.
