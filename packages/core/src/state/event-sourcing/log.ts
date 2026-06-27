// packages/core/src/state/event-sourcing/log.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import { getStateDir } from '../state-shared';
import { computeContentHash } from '../learnings-content';
import { EVENT_LOG_FILE, EVENT_BLOBS_DIR, MAX_LINE_BYTES, BLOB_REF_KEY } from './constants';
import {
  EventSchema,
  StoredEventSchema,
  isBlobRef,
  type Event,
  type EventInput,
  type Scope,
} from './events';
import { getWriterId } from './writer-id';

export interface EventLogOptions {
  stream?: string | undefined;
  session?: string | undefined;
}

export interface EventLogPaths {
  dir: string;
  logPath: string;
  blobsDir: string;
}

/** Resolve the on-disk paths for an event log at the given scope. */
export async function eventLogPaths(
  projectPath: string,
  options?: EventLogOptions
): Promise<EventLogPaths> {
  const dirResult = await getStateDir(projectPath, options?.stream, options?.session);
  if (!dirResult.ok) throw dirResult.error;
  const dir = dirResult.value;
  return {
    dir,
    logPath: path.join(dir, EVENT_LOG_FILE),
    blobsDir: path.join(dir, EVENT_BLOBS_DIR),
  };
}

/** INV-2 helper: highest seq currently in the live log (0 if none). Re-read every append. */
export function readTailSeq(logPath: string): number {
  if (!fs.existsSync(logPath)) return 0;
  const content = fs.readFileSync(logPath, 'utf-8');
  let max = 0;
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const seq = (JSON.parse(line) as { seq?: unknown }).seq;
      if (typeof seq === 'number' && seq > max) max = seq;
    } catch {
      /* skip malformed */
    }
  }
  return max;
}

/** Rehydrate a stored line's payload from its blob if it is a blob reference. */
function rehydratePayload(payload: unknown, blobsDir: string): unknown {
  if (!isBlobRef(payload)) return payload;
  const blobPath = path.join(blobsDir, `${payload.$blob}.json`);
  const raw = fs.readFileSync(blobPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Ordered read: parse stored lines (skip malformed), rehydrate blobs, validate against
 * the strict schema, and return sorted by (seq asc, writerId asc) — a deterministic total
 * order (INV-1 + INV-2). timestamp is never used for ordering.
 */
export async function loadEvents(
  projectPath: string,
  options?: EventLogOptions
): Promise<Result<Event[], Error>> {
  try {
    const { logPath, blobsDir } = await eventLogPaths(projectPath, options);
    if (!fs.existsSync(logPath)) return Ok([]);
    const content = fs.readFileSync(logPath, 'utf-8');
    const events: Event[] = [];
    for (const line of content.split('\n')) {
      if (line.trim() === '') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue; // malformed line — JSONL resilience
      }
      const stored = StoredEventSchema.safeParse(parsed);
      if (!stored.success) continue;
      const payload = rehydratePayload(stored.data.payload, blobsDir);
      const full = EventSchema.safeParse({ ...stored.data, payload });
      if (full.success) events.push(full.data);
    }
    events.sort(
      (a, b) => a.seq - b.seq || (a.writerId < b.writerId ? -1 : a.writerId > b.writerId ? 1 : 0)
    );
    return Ok(events);
  } catch (error) {
    return Err(
      new Error(`Failed to load events: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

/** INV-2: per-log verified-monotonic local counter (keyed by resolved log path). */
const localCounters = new Map<string, number>();

/** Test-only: clear local seq counters between cases. */
export function resetLocalCountersForTests(): void {
  localCounters.clear();
}

export interface EmitResult {
  seq: number;
  writerId: string;
}

/**
 * If the fully-serialized line would reach MAX_LINE_BYTES, spill the payload to
 * <blobsDir>/<hash>.json (atomic temp+rename) written BEFORE the caller appends the line,
 * and return a { $blob: hash } reference to embed instead. Otherwise return the payload
 * unchanged. Blob writes are content-addressed and therefore idempotent.
 */
function spillIfNeeded(
  envelope: { seq: number; writerId: string; timestamp: string; scope: Scope; type: string },
  payload: unknown,
  blobsDir: string
): unknown {
  const candidate = Buffer.byteLength(JSON.stringify({ ...envelope, payload }) + '\n', 'utf-8');
  if (candidate < MAX_LINE_BYTES) return payload;
  const json = JSON.stringify(payload);
  const hash = computeContentHash(json);
  fs.mkdirSync(blobsDir, { recursive: true });
  const blobPath = path.join(blobsDir, `${hash}.json`);
  if (!fs.existsSync(blobPath)) {
    const tmp = `${blobPath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, blobPath); // atomic; blob durable BEFORE the referencing line
  }
  return { [BLOB_REF_KEY]: hash };
}

/**
 * Lock-free append. Resolves scope paths, stamps writerId (INV-1) and
 * seq = max(readTailSeq(live log), localCounter) + 1 (INV-2, re-derived every append),
 * then appends one JSONL line via a single O_APPEND write (flag 'a'). Oversized payloads
 * are spilled to a blob BEFORE the line (added in Task 6 — here all payloads are inline).
 */
export async function emitEvent(
  projectPath: string,
  input: EventInput,
  options?: EventLogOptions
): Promise<Result<EmitResult, Error>> {
  try {
    const { dir, logPath, blobsDir } = await eventLogPaths(projectPath, options);
    fs.mkdirSync(dir, { recursive: true });

    const writerId = getWriterId();
    const tailSeq = readTailSeq(logPath);
    const local = localCounters.get(logPath) ?? 0;
    const seq = Math.max(tailSeq, local) + 1;
    localCounters.set(logPath, seq);

    const scope: Scope = { stream: options?.stream, session: options?.session };
    const envelope = {
      seq,
      writerId,
      timestamp: new Date().toISOString(),
      scope,
      type: input.type,
    };
    const storedPayload = spillIfNeeded(envelope, input.payload, blobsDir);
    const line = Buffer.from(
      JSON.stringify({ ...envelope, payload: storedPayload }) + '\n',
      'utf-8'
    );
    fs.appendFileSync(logPath, line, { flag: 'a' });
    return Ok({ seq, writerId });
  } catch (error) {
    return Err(
      new Error(`Failed to emit event: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

export type { Scope };
