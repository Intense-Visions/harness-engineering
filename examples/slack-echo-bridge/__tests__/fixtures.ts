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
      status: 'success',
      findings: [{ severity: 'info', message: '12 rules covered' }],
      fixed: [],
    },
  };
}

/** Produce the X-Harness-Signature header value the orchestrator would send for `body`. */
export function signBody(secret: string, body: Buffer | string): string {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  return `sha256=${createHmac('sha256', secret).update(buf).digest('hex')}`;
}
