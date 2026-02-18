/**
 * 4. Log streaming
 * Triggers a run, waits until a job exists, then fetches job logs (and optionally opens SSE).
 * Measures: trigger latency, time-to-first-job, time-to-first-log (polling GET .../logs).
 * For true SSE stress, run fewer VUs so each can hold an SSE connection; here we poll logs.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

const triggerLatency = new Trend('trigger_run_latency_ms');
const timeToFirstJob = new Trend('time_to_first_job_ms');
const timeToFirstLog = new Trend('time_to_first_log_ms');

let pipelineId = __ENV.PIPELINE_ID;

export const options = {
  vus: 5,
  iterations: 10,
  thresholds: {
    http_req_failed: ['rate<0.1'],
  },
};

export function setup() {
  if (pipelineId) return { pipelineId };
  const res = http.get(`${baseUrl}/pipelines`);
  if (!check(res, { 'list pipelines ok': (r) => r.status === 200 }))
    throw new Error('GET /pipelines failed');
  const list = res.json();
  if (!Array.isArray(list) || list.length === 0) throw new Error('No pipelines');
  pipelineId = list[0].id;
  return { pipelineId };
}

export default function (data) {
  // const t0 = Date.now();
  const triggerRes = http.post(
    `${baseUrl}/runs`,
    JSON.stringify({ pipelineId: data.pipelineId, triggerType: 'manual' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  triggerLatency.add(triggerRes.timings.duration);

  if (triggerRes.status !== 201) {
    return;
  }
  const run = triggerRes.json();
  const runId = run.id;
  if (!runId) return;

  const tTrigger = Date.now();
  let jobId = null;
  for (let i = 0; i < 60; i++) {
    sleep(0.5);
    const jobsRes = http.get(`${baseUrl}/runs/${runId}/jobs`);
    if (jobsRes.status !== 200) continue;
    const payload = jobsRes.json();
    const jobs = Array.isArray(payload?.jobs) ? payload.jobs : (payload?.run?.jobs ?? []);
    const first = jobs[0];
    if (first?.id) {
      jobId = first.id;
      timeToFirstJob.add(Date.now() - tTrigger);
      break;
    }
  }
  if (!jobId) return;

  const tJob = Date.now();
  for (let i = 0; i < 30; i++) {
    sleep(0.3);
    const logsRes = http.get(`${baseUrl}/runs/${runId}/jobs/${jobId}/logs`);
    if (logsRes.status !== 200) continue;
    const logs = logsRes.json();
    if (Array.isArray(logs) && logs.length > 0) {
      timeToFirstLog.add(Date.now() - tJob);
      break;
    }
  }
}
