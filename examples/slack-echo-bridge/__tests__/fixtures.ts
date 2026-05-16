import { createHmac } from 'node:crypto';
import type { GatewayEvent } from '../src/types.js';

export const TEST_SECRET = 'test-secret-32-bytes-of-entropy!';

export function makeMaintenanceCompletedEvent(): GatewayEvent {
  return {
    id: 'evt_0123456789abcdef',
    type: 'maintenance.completed',
    timestamp: '2026-05-15T12:00:00.000Z',
    data: {
      taskId: 'rule-coverage-scan',
      startedAt: '2026-05-15T11:59:50.000Z',
      completedAt: '2026-05-15T12:00:00.000Z',
      status: 'success',
      // Use NON-zero counts so any future regression that defaulted both to 0
      // (e.g., re-introducing `?.length ?? 0` over a non-array field) would
      // produce "0 findings, 0 fixed" — which the rendered-text assertion in
      // webhook-handler.test.ts would then fail on.
      findings: 3,
      fixed: 1,
      prUrl: null,
      prUpdated: false,
    },
  };
}

/** Produce the X-Harness-Signature header value the orchestrator would send for `body`. */
export function signBody(secret: string, body: Buffer | string): string {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  return `sha256=${createHmac('sha256', secret).update(buf).digest('hex')}`;
}
