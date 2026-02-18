/**
 * 6. Mixed load — End-to-end stress
 * Combined: trigger runs, list runs, get run with jobs, dashboard pipeline-stats and deployment-locks.
 * Simulates realistic traffic while workers process the job queue.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';

const triggerLatency = new Trend('trigger_run_latency_ms');
const listRunsLatency = new Trend('list_runs_latency_ms');
const runWithJobsLatency = new Trend('run_with_jobs_latency_ms');
const dashboardLatency = new Trend('dashboard_latency_ms');
const errorRate = new Rate('errors');

let pipelineId = __ENV.PIPELINE_ID;

export const options = {
  vus: 10,
  duration: '60s',
  thresholds: {
    http_req_failed: ['rate<0.1'],
    trigger_run_latency_ms: ['p(95)<5000'],
    dashboard_latency_ms: ['p(95)<2000'],
  },
};

export function setup() {
  if (pipelineId) return { pipelineId };
  const res = http.get(`${baseUrl}/pipelines`);
  if (!check(res, { 'list pipelines ok': (r) => r.status === 200 })) {
    throw new Error('GET /pipelines failed');
  }
  const list = res.json();
  if (!Array.isArray(list) || list.length === 0) throw new Error('No pipelines');
  pipelineId = list[0].id;
  return { pipelineId };
}

export default function (data) {
  const r = Math.random();

  if (r < 0.35) {
    const res = http.post(
      `${baseUrl}/runs`,
      JSON.stringify({
        pipelineId: data.pipelineId,
        triggerType: 'manual',
        trigger_metadata: { source: 'k6_mixed', vu: __VU },
      }),
      { headers: { 'Content-Type': 'application/json' }, tags: { name: 'trigger' } },
    );
    triggerLatency.add(res.timings.duration);
    errorRate.add(!check(res, { 'trigger ok': (r) => r.status === 201 }));
  } else if (r < 0.6) {
    const res = http.get(`${baseUrl}/runs?pipelineId=${data.pipelineId}`, {
      tags: { name: 'list_runs' },
    });
    listRunsLatency.add(res.timings.duration);
    if (res.status === 200 && Array.isArray(res.json())) {
      const runs = res.json();
      if (runs.length > 0 && Math.random() < 0.5) {
        const runId = runs[0].id;
        const rwj = http.get(`${baseUrl}/runs/${runId}/jobs`, { tags: { name: 'run_with_jobs' } });
        runWithJobsLatency.add(rwj.timings.duration);
      }
    }
  } else if (r < 0.85) {
    const res = http.get(`${baseUrl}/dashboard/pipeline-stats`, { tags: { name: 'dashboard' } });
    dashboardLatency.add(res.timings.duration);
    errorRate.add(!check(res, { 'dashboard ok': (r) => r.status === 200 }));
  } else {
    const res = http.get(`${baseUrl}/dashboard/deployment-locks`, {
      tags: { name: 'deployment_locks' },
    });
    dashboardLatency.add(res.timings.duration);
    errorRate.add(!check(res, { 'deployment_locks ok': (r) => r.status === 200 }));
  }

  sleep(0.1 + Math.random() * 0.3);
}
