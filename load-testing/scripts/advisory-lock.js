/**
 * 2. Advisory lock contention
 * Triggers many runs on a pipeline that has deploy jobs (same environment).
 * Measures how many triggers succeed and response latency; workers will contend for pg_try_advisory_lock.
 * Use pipeline "backend-api" (has deploy staging/production) or set PIPELINE_ID.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const triggerLatency = new Trend('trigger_run_latency_ms');
const errorRate = new Rate('trigger_errors');

let pipelineId = __ENV.PIPELINE_ID;

export const options = {
  vus: 15,
  duration: '45s',
  thresholds: {
    http_req_failed: ['rate<0.1'],
    trigger_run_latency_ms: ['p(95)<8000'],
  },
};

export function setup() {
  if (pipelineId) return { pipelineId };
  const res = http.get(`${baseUrl}/pipelines`);
  if (!check(res, { 'list pipelines ok': (r) => r.status === 200 })) {
    throw new Error('GET /pipelines failed');
  }
  const list = res.json();
  const withDeploy = list.find((p) => (p.name || '').toLowerCase().includes('backend'));
  pipelineId = (withDeploy || list[0])?.id;
  if (!pipelineId) throw new Error('No pipeline found');
  return { pipelineId };
}

export default function (data) {
  const res = http.post(
    `${baseUrl}/runs`,
    JSON.stringify({
      pipelineId: data.pipelineId,
      triggerType: 'manual',
      trigger_metadata: { load_test: 'advisory_lock', vu: __VU },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'trigger_run_deploy' },
    },
  );

  triggerLatency.add(res.timings.duration);
  const ok = check(res, { 'trigger 201': (r) => r.status === 201 });
  errorRate.add(!ok);

  sleep(0.2 + Math.random() * 0.3);
}
