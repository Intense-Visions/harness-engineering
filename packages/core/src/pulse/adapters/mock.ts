import type { PulseAdapter, PulseWindow, SanitizedResult } from '@harness-engineering/types';
import { registerPulseAdapter } from './registry';
import { ALLOWED_FIELD_KEYS, PII_FIELD_DENYLIST } from '../sanitize';

export const MOCK_ADAPTER_NAME = 'mock';

const ALLOWED_FIELD_SET: ReadonlySet<string> = new Set(ALLOWED_FIELD_KEYS);

const adapter: PulseAdapter = {
  async query(_window: PulseWindow, _eventNames?: string[]): Promise<unknown> {
    return {
      event_name: 'mock.event',
      count: 42,
      timestamp_bucket: new Date().toISOString().slice(0, 10),
      latency_ms: 123,
    };
  },
  sanitize(raw: unknown): SanitizedResult {
    const fields: Record<string, unknown> = {};
    if (raw && typeof raw === 'object') {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (PII_FIELD_DENYLIST.test(key)) continue;
        if (!ALLOWED_FIELD_SET.has(key)) continue;
        fields[key] = value;
      }
    }
    return { fields: fields as SanitizedResult['fields'], distributions: {} };
  },
};

export function registerMockAdapter(): void {
  registerPulseAdapter(MOCK_ADAPTER_NAME, adapter);
}
