// packages/core/src/state/event-sourcing/writer-id.ts
import * as os from 'os';
import { generateId } from '../../shared/uuid';

let cached: string | undefined;

/**
 * INV-1: a globally-unique, stable-per-process writer id.
 * Generated once (UUIDv4 via generateId; hostname:pid:random fallback if no crypto),
 * then reused for every append in this process. HARNESS_EVENT_WRITER_ID overrides
 * (used by concurrency/replay test fixtures to assign distinct, asserted ids).
 */
export function getWriterId(): string {
  if (cached !== undefined) return cached;
  const override = process.env.HARNESS_EVENT_WRITER_ID;
  if (override && override.length > 0) {
    cached = override;
    return cached;
  }
  try {
    cached = generateId();
  } catch {
    cached = `${os.hostname()}:${process.pid}:${Math.random().toString(36).slice(2)}`;
  }
  return cached;
}

/** Test-only: clears the cached id so a fresh resolution can be exercised. */
export function __resetWriterIdForTests(): void {
  cached = undefined;
}
