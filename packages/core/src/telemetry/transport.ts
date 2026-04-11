import type { TelemetryEvent } from '@harness-engineering/types';

const POSTHOG_BATCH_URL = 'https://app.posthog.com/batch';
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;

/**
 * Sleeps for the given milliseconds. Used for linear backoff between retries.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends telemetry events to PostHog HTTP /batch endpoint.
 *
 * - 3 attempts with linear backoff (1s, 2s)
 * - 5s timeout per attempt via AbortSignal.timeout
 * - Silent failure: never throws, never blocks session teardown
 */
export async function send(events: TelemetryEvent[], apiKey: string): Promise<void> {
  if (events.length === 0) return;

  const payload = { api_key: apiKey, batch: events };
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(POSTHOG_BATCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return;
      if (res.status < 500) return; // 4xx = permanent failure, do not retry
    } catch {
      // Network error or timeout -- retry
    }
    // Linear backoff: 1s after first failure, 2s after second
    if (attempt < MAX_ATTEMPTS - 1) {
      await sleep(1_000 * (attempt + 1));
    }
  }
  // Silent failure -- all retries exhausted
}
