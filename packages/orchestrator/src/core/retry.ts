const CONTINUATION_DELAY_MS = 1000;
const BASE_FAILURE_DELAY_MS = 10000;
const DEFAULT_MAX_RETRY_BACKOFF_MS = 300000;

/**
 * Calculate retry delay based on attempt number and retry type.
 *
 * Continuation retries: fixed 1000ms delay.
 * Failure retries: exponential backoff 10000 * 2^(attempt-1), capped at maxRetryBackoffMs.
 */
export function calculateRetryDelay(
  attempt: number,
  type: 'continuation' | 'failure',
  maxRetryBackoffMs: number = DEFAULT_MAX_RETRY_BACKOFF_MS
): number {
  if (type === 'continuation') {
    return CONTINUATION_DELAY_MS;
  }
  const delay = BASE_FAILURE_DELAY_MS * Math.pow(2, attempt - 1);
  return Math.min(delay, maxRetryBackoffMs);
}
