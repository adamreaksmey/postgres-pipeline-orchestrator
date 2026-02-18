/**
 * 1. Job queue throughput — Mass enqueue
 * Fires many trigger-run requests; measures insert/response latency and success rate.
 * Run with API + workers + Postgres up. Use PIPELINE_ID or first pipeline from GET /pipelines.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const triggerLatency = new Trend('trigger_run_latency_ms');
const errorRate = new Rate('trigger_errors');

// Optional: set PIPELINE_ID to target a specific pipeline; otherwise script fetches first pipeline.
let pipelineId = __ENV.PIPELINE_ID;

export const options = {
  vus: 20,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    trigger_run_latency_ms: ['p(95)<5000'],
  },
};

export function setup() {
  if (pipelineId) return { pipelineId };
  const res = http.get(`${baseUrl}/pipelines`);
  if (!check(res, { 'list pipelines ok': (r) => r.status === 200 })) {
    throw new Error('GET /pipelines failed - ensure API is up and seeded');
  }
  const list = res.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('No pipelines found - seed the DB (run API once with SYNC_DATABASE=true)');
  }
  pipelineId = list[0].id;
  return { pipelineId };
}

export default function (data) {
  const res = http.post(
    `${baseUrl}/runs`,
    JSON.stringify({
      pipelineId: data.pipelineId,
      triggerType: 'manual',
      trigger_metadata: { source: 'k6', vu: __VU, iter: __ITER },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'trigger_run' },
    },
  );

  triggerLatency.add(res.timings.duration);
  const ok = check(res, { 'trigger 201': (r) => r.status === 201 });
  errorRate.add(!ok);

  if (!ok && res.status !== 201) {
    console.warn(`trigger failed: ${res.status} ${res.body?.substring(0, 200)}`);
  }

  sleep(0.1 + Math.random() * 0.2);
}
