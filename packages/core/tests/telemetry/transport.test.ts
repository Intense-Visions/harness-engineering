import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { send } from '../../src/telemetry/transport';
import type { TelemetryEvent } from '@harness-engineering/types';

function makeEvent(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    event: 'skill_invocation',
    distinct_id: 'test-uuid',
    timestamp: '2026-04-10T10:00:00.000Z',
    properties: {
      installId: 'test-uuid',
      os: 'linux',
      nodeVersion: 'v22.0.0',
      harnessVersion: '0.21.2',
      skillName: 'harness-tdd',
      duration: 1000,
      outcome: 'success',
    },
    ...overrides,
  };
}

describe('send', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends events to PostHog /batch with correct payload shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    const events = [makeEvent()];
    await send(events, 'phc_test_api_key');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0]!;
    expect(url).toBe('https://app.posthog.com/batch');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.api_key).toBe('phc_test_api_key');
    expect(body.batch).toHaveLength(1);
    expect(body.batch[0].event).toBe('skill_invocation');
  });

  it('resolves on first success without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries up to 3 times on server errors', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    globalThis.fetch = mockFetch;

    // Should not throw -- silent failure
    await expect(send([makeEvent()], 'phc_key')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on network errors (fetch throws)', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('succeeds on second attempt after first failure', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('never throws -- resolves silently after all retries fail', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('total failure'));
    globalThis.fetch = mockFetch;

    await expect(send([makeEvent()], 'phc_key')).resolves.toBeUndefined();
  });

  it('passes AbortSignal.timeout(5000) to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([makeEvent()], 'phc_key');

    const [, options] = mockFetch.mock.calls[0]!;
    expect(options.signal).toBeInstanceOf(AbortSignal);
    // AbortSignal.timeout produces a signal -- we verify it exists
  });

  it('skips network call for empty batch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    globalThis.fetch = mockFetch;

    await send([], 'phc_key');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not retry on 4xx client errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    globalThis.fetch = mockFetch;

    await expect(send([makeEvent()], 'phc_key')).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
