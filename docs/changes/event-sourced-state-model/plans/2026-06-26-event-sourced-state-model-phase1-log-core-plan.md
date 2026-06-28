# Plan: Event-Sourced State Model — Phase 1 (Log Core)

**Date:** 2026-06-26 | **Spec:** `docs/changes/event-sourced-state-model/proposal.md` | **Tasks:** 11 | **Time:** ~42 min | **Integration Tier:** medium

> Scope: **Phase 1 only** from the spec's Implementation Order — event schema + ordering +
> lock-free append + ordered read + blob spill, in a new
> `packages/core/src/state/event-sourcing/` module. **Foundation only.** No projections,
> no snapshot/materialize, no lane machine, no migration, no reader cutover (Phases 2-6).
> Strictly **additive**: no existing file changes behavior; the legacy `state/events.ts`
> (`emitEvent`/`loadEvents`) and `state-persistence.ts` are untouched.

## Goal

Provide a durable, lock-free, deterministically-orderable append-only event log
(`state.events.jsonl` + `state.events.blobs/`) under the existing `getStateDir` scope, with
a zod-validated discriminated-union event model and the INV-1 (`writerId`) / INV-2 (`seq`)
ordering invariants proven by concurrency and replay tests.

## Observable Truths (Acceptance Criteria)

1. **The system shall** persist each emitted event as one JSONL line in
   `state.events.jsonl` at the directory resolved by `getStateDir(projectPath, stream?, session?)`.
2. **When** an event is emitted, **the system shall** stamp it with the process `writerId`
   (INV-1) and `seq = max(tailSeq, localCounter) + 1` where `tailSeq` is re-read from the
   live log on every append (INV-2) — never a cached in-memory max.
3. **The system shall** generate `writerId` exactly once per process (UUIDv4, with a
   `hostname:pid:random` fallback when no crypto source exists) and reuse it for every
   append in that process.
4. **When** events are read back, **the system shall** return them sorted by
   `(seq asc, writerId asc)` — a deterministic total order independent of wall-clock skew;
   `timestamp` is never the ordering authority.
5. **If** a serialized log line would exceed `MAX_LINE_BYTES` (4096), **then the system
   shall** spill the event payload to `state.events.blobs/<hash>.json` written (atomically,
   temp+rename) **before** the referencing log line, so a crash leaves an orphan blob and
   **never** a dangling reference; the on-disk line stays under the bound.
6. **When** a spilled event is read, **the system shall** rehydrate its payload from the
   referenced blob transparently, yielding a value equal to the pre-spill event.
7. **Concurrency (SC3):** N OS processes each with a distinct `writerId` appending K events
   concurrently lose zero events (`count === N*K`) and produce no repeated `(seq, writerId)`
   pair.
8. **Replay determinism (SC3):** loading a fixed (shuffled-on-disk) event set yields an
   identical `(seq asc, writerId asc)` total order across repeated runs, with the `writerId`
   tiebreak resolving equal-`seq` events deterministically.
9. `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing`
   passes; `pnpm run generate:barrels:check` passes; `harness validate` introduces no new
   issues (pre-existing dashboard-color + drift/llm circular-dep findings are unrelated).

## File Map

```
CREATE packages/core/src/state/event-sourcing/constants.ts
CREATE packages/core/src/state/event-sourcing/events.ts
CREATE packages/core/src/state/event-sourcing/writer-id.ts
CREATE packages/core/src/state/event-sourcing/log.ts
CREATE packages/core/src/state/event-sourcing/index.ts
CREATE packages/core/tests/state/event-sourcing/events.test.ts
CREATE packages/core/tests/state/event-sourcing/writer-id.test.ts
CREATE packages/core/tests/state/event-sourcing/log.test.ts
CREATE packages/core/tests/state/event-sourcing/concurrency.test.ts
CREATE packages/core/tests/state/event-sourcing/replay-order.test.ts
CREATE packages/core/tests/state/event-sourcing/concurrency-worker.mts   (test fixture)
MODIFY packages/core/src/state/index.ts                                  (namespaced re-export)
MODIFY packages/core/src/index.ts                                        (regenerated barrel — via generator, do not hand-edit)
```

Reused existing (read-only, NOT modified): `state-shared.ts` (`getStateDir`),
`shared/uuid.ts` (`generateId`), `state/learnings-content.ts` (`computeContentHash`),
`shared/result.ts` (`Result`/`Ok`/`Err`).

## Key Design Decisions (Phase-1 scoped)

- **D-P1-a — Namespaced barrel export.** The new module's public functions are named
  `emitEvent`/`loadEvents` (spec API surface), which collide with the legacy
  `state/events.ts` exports already in the package barrel. Phase 1 is additive and must NOT
  retire the legacy export (that is Phase 5). Therefore wire the new module into the package
  via `export * as eventSourcing from './event-sourcing'` in `state/index.ts`, exposing
  `eventSourcing.emitEvent` / `eventSourcing.loadEvents`. Later phases flatten this once the
  legacy log is retired.
- **D-P1-b — Atomic-append byte bound pinned to 4096.** `MAX_LINE_BYTES = 4096` (4 KiB) is
  the conservative cross-platform bound: one typical filesystem block / memory page. A single
  `fs.appendFileSync(path, buf)` issues one `write(2)` under `O_APPEND` (flag `'a'`); keeping
  the buffer at/under one block avoids interleaving on macOS/Linux local filesystems. Lines
  at/over the bound spill their payload to a blob.
- **D-P1-c — Generic payload spill via `$blob` marker.** Each event variant nests its
  type-specific data under a single `payload` object. On spill, the stored line's `payload`
  becomes `{ "$blob": "<hash>" }` (`BLOB_REF_KEY`); the blob file holds the real payload JSON.
  This keeps spill logic generic across all current and future event variants.
- **D-P1-d — Minimal event catalog.** Phase 1 ships only the variants needed to exercise the
  log: `state_imported` (genesis; carries a potentially-large `legacyState`, exercising
  spill), `decision_recorded`, `position_set`. The full per-domain catalog lands in
  Phases 2-5.
- **D-P1-e — `writerId` env override for tests.** `writer-id.ts` honors
  `HARNESS_EVENT_WRITER_ID` when set. This lets the concurrency test fixture assign distinct,
  asserted ids per child process and supports deterministic replay fixtures. Harmless in
  production (unset).

## Uncertainties

- [ASSUMPTION] `fs.appendFileSync` with a single `Buffer` under 4 KiB is atomic under
  `O_APPEND` on the developer/CI filesystems (macOS APFS, Linux ext4/overlayfs). The
  concurrency test (Task 9) is the empirical guard; if it flakes, revisit the bound or add an
  `O_APPEND`+`fs.writeSync(fd, buf)` path. Does not block decomposition.
- [DEFERRABLE] Exact `seq` storage width / overflow handling — JS number is fine for the
  foreseeable event volume; revisit only if compaction (explicit Non-Goal) is ever built.
- [DEFERRABLE] Blob garbage-collection of orphans — Phase 1 leaves orphans in place
  (harmless, GC-able); a sweeper is out of scope.

## Skeleton

1. Module scaffold + pinned constants (~1 task, ~3 min)
2. Event schema (discriminated union + stored/blob variants) — TDD (~1 task, ~5 min)
3. `writerId` generation + env override — TDD (~1 task, ~4 min)
4. Ordered read + `readTailSeq` — TDD (~1 task, ~5 min)
5. Lock-free append (INV-2 seq derivation) — TDD (~1 task, ~5 min)
6. Blob spill / rehydrate — TDD (~1 task, ~5 min)
7. INV-2 stale-max regression test (~1 task, ~3 min)
8. Module barrel `index.ts` (~1 task, ~2 min)
9. Concurrency test (SC3, INV-1/INV-2) + worker fixture — [checkpoint] (~1 task, ~5 min)
10. Deterministic replay-order test (SC3) (~1 task, ~3 min)
11. Package-barrel integration (namespaced) — [checkpoint] (~1 task, ~3 min)

**Estimated total:** 11 tasks, ~42 min.
_Skeleton approval: produced inline; non-interactive planning invocation, no live gate._

## Tasks

### Task 1: Scaffold module + pinned constants

**Depends on:** none | **Files:** `packages/core/src/state/event-sourcing/constants.ts`, `packages/core/src/state/event-sourcing/index.ts`

1. Create `packages/core/src/state/event-sourcing/constants.ts`:
   ```ts
   // packages/core/src/state/event-sourcing/constants.ts
   /** Authoritative append-only event log file name (resolved per getStateDir scope). */
   export const EVENT_LOG_FILE = 'state.events.jsonl';
   /** Directory holding spilled oversized event payloads, as <hash>.json files. */
   export const EVENT_BLOBS_DIR = 'state.events.blobs';
   /**
    * Conservative cross-platform atomic single-write() bound (one fs block / memory page).
    * A serialized JSONL line (including trailing newline) at/over this size spills its
    * payload to a blob so the on-disk line stays under one atomic append.
    */
   export const MAX_LINE_BYTES = 4096;
   /** Marker key replacing a spilled payload on the stored line: { "$blob": "<hash>" }. */
   export const BLOB_REF_KEY = '$blob';
   ```
2. Create `packages/core/src/state/event-sourcing/index.ts` with a placeholder barrel
   (filled in Task 8):
   ```ts
   // packages/core/src/state/event-sourcing/index.ts
   export * from './constants';
   ```
3. Run: `pnpm --filter @harness-engineering/core exec tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(core/event-sourcing): scaffold module and pin atomic-append constants`

### Task 2: Event schema — discriminated union + stored/blob variants (TDD)

**Depends on:** Task 1 | **Files:** `packages/core/src/state/event-sourcing/events.ts`, `packages/core/tests/state/event-sourcing/events.test.ts`

1. Create `packages/core/tests/state/event-sourcing/events.test.ts` first:

   ```ts
   import { describe, it, expect } from 'vitest';
   import {
     EventSchema,
     StoredEventSchema,
     ScopeSchema,
     type Event,
   } from '../../../src/state/event-sourcing/events';

   const envelope = {
     seq: 1,
     writerId: 'w-1',
     timestamp: '2026-06-26T10:00:00.000Z',
     scope: { stream: undefined, session: undefined },
   };

   describe('EventSchema', () => {
     it('validates a decision_recorded event', () => {
       const e = { ...envelope, type: 'decision_recorded', payload: { id: 'd1', text: 'use X' } };
       expect(EventSchema.safeParse(e).success).toBe(true);
     });
     it('validates a position_set event', () => {
       const e = { ...envelope, type: 'position_set', payload: { position: 'EXECUTE' } };
       expect(EventSchema.safeParse(e).success).toBe(true);
     });
     it('validates a state_imported genesis event', () => {
       const e = { ...envelope, type: 'state_imported', payload: { legacyState: { a: 1 } } };
       expect(EventSchema.safeParse(e).success).toBe(true);
     });
     it('rejects an unknown event type', () => {
       const e = { ...envelope, type: 'nope', payload: {} };
       expect(EventSchema.safeParse(e).success).toBe(false);
     });
     it('rejects a payload mismatched to its type', () => {
       const e = { ...envelope, type: 'position_set', payload: { id: 'd1', text: 'x' } };
       expect(EventSchema.safeParse(e).success).toBe(false);
     });
   });

   describe('StoredEventSchema (on-disk, may carry a blob ref)', () => {
     it('accepts a payload replaced by a blob marker', () => {
       const e = { ...envelope, type: 'state_imported', payload: { $blob: 'abc123' } };
       expect(StoredEventSchema.safeParse(e).success).toBe(true);
     });
   });

   describe('ScopeSchema', () => {
     it('accepts an empty (global) scope', () => {
       expect(ScopeSchema.safeParse({}).success).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/events.test.ts` — observe failure (module missing).
3. Create `packages/core/src/state/event-sourcing/events.ts`:

   ```ts
   // packages/core/src/state/event-sourcing/events.ts
   import { z } from 'zod';
   import { BLOB_REF_KEY } from './constants';

   /** Resolution scope for an event log (mirrors getStateDir params). */
   export const ScopeSchema = z.object({
     stream: z.string().optional(),
     session: z.string().optional(),
   });
   export type Scope = z.infer<typeof ScopeSchema>;

   /** Shared envelope fields stamped on every event. */
   const envelopeShape = {
     seq: z.number().int().nonnegative(),
     writerId: z.string().min(1),
     timestamp: z.string(),
     scope: ScopeSchema,
   };

   // --- Phase 1 minimal payload catalog (extended in later phases) ---
   const StateImportedPayload = z.object({ legacyState: z.unknown() });
   const DecisionRecordedPayload = z.object({ id: z.string(), text: z.string() });
   const PositionSetPayload = z.object({ position: z.string() });

   /** Strict in-memory event union (payload fully present). */
   export const EventSchema = z.discriminatedUnion('type', [
     z.object({
       ...envelopeShape,
       type: z.literal('state_imported'),
       payload: StateImportedPayload,
     }),
     z.object({
       ...envelopeShape,
       type: z.literal('decision_recorded'),
       payload: DecisionRecordedPayload,
     }),
     z.object({ ...envelopeShape, type: z.literal('position_set'), payload: PositionSetPayload }),
   ]);
   export type Event = z.infer<typeof EventSchema>;
   export type EventType = Event['type'];

   /** On-disk blob reference marker (replaces an oversized payload on the stored line). */
   export const BlobRefSchema = z.object({ [BLOB_REF_KEY]: z.string().min(1) }).strict();
   export type BlobRef = z.infer<typeof BlobRefSchema>;

   /**
    * Relaxed schema for a line as stored on disk: the payload may be the real payload
    * OR a blob reference. Used at read time before rehydration; rehydrated events are then
    * validated against EventSchema.
    */
   export const StoredEventSchema = z.object({
     ...envelopeShape,
     type: z.enum(['state_imported', 'decision_recorded', 'position_set']),
     payload: z.union([z.record(z.unknown()), BlobRefSchema]),
   });
   export type StoredEvent = z.infer<typeof StoredEventSchema>;

   /** Caller-supplied input; envelope fields (seq/writerId/timestamp/scope) are stamped by emitEvent. */
   export type EventInput =
     | { type: 'state_imported'; payload: z.infer<typeof StateImportedPayload> }
     | { type: 'decision_recorded'; payload: z.infer<typeof DecisionRecordedPayload> }
     | { type: 'position_set'; payload: z.infer<typeof PositionSetPayload> };

   /** True when a stored payload is a blob reference rather than an inline payload. */
   export function isBlobRef(payload: unknown): payload is BlobRef {
     return BlobRefSchema.safeParse(payload).success;
   }
   ```

4. Run the test command from step 2 — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core/event-sourcing): add zod event schema (envelope + minimal variants + blob marker)`

### Task 3: writerId generation + env override (TDD)

**Depends on:** Task 1 | **Files:** `packages/core/src/state/event-sourcing/writer-id.ts`, `packages/core/tests/state/event-sourcing/writer-id.test.ts`

1. Create `packages/core/tests/state/event-sourcing/writer-id.test.ts` first:

   ```ts
   import { describe, it, expect, afterEach } from 'vitest';
   import {
     getWriterId,
     __resetWriterIdForTests,
   } from '../../../src/state/event-sourcing/writer-id';

   afterEach(() => {
     delete process.env.HARNESS_EVENT_WRITER_ID;
     __resetWriterIdForTests();
   });

   describe('getWriterId (INV-1)', () => {
     it('is stable across calls within a process', () => {
       expect(getWriterId()).toBe(getWriterId());
     });
     it('returns a non-empty string', () => {
       expect(getWriterId().length).toBeGreaterThan(0);
     });
     it('honors HARNESS_EVENT_WRITER_ID override (first resolution)', () => {
       process.env.HARNESS_EVENT_WRITER_ID = 'fixed-writer-7';
       expect(getWriterId()).toBe('fixed-writer-7');
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/writer-id.test.ts` — observe failure.
3. Create `packages/core/src/state/event-sourcing/writer-id.ts`:

   ```ts
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
   ```

4. Run the test command from step 2 — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core/event-sourcing): add stable per-process writerId (INV-1) with env override`

### Task 4: Ordered read + readTailSeq (TDD)

**Depends on:** Task 2 | **Files:** `packages/core/src/state/event-sourcing/log.ts`, `packages/core/tests/state/event-sourcing/log.test.ts`

> This task creates `log.ts` with the **read side only** (paths resolution, `readTailSeq`,
> `loadEvents` with sort + malformed-line resilience; blob rehydration stubbed to inline
> payloads for now — completed in Task 6). Append is added in Task 5.

1. Create `packages/core/tests/state/event-sourcing/log.test.ts` first with read-side tests:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as os from 'os';
   import * as path from 'path';
   import { loadEvents, readTailSeq, eventLogPaths } from '../../../src/state/event-sourcing/log';

   let dir: string;
   beforeEach(() => {
     dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eslog-'));
   });
   afterEach(() => {
     fs.rmSync(dir, { recursive: true, force: true });
   });

   function writeLines(logPath: string, objs: unknown[]) {
     fs.writeFileSync(logPath, objs.map((o) => JSON.stringify(o)).join('\n') + '\n');
   }

   describe('loadEvents (ordered read)', () => {
     it('returns [] when no log file exists', async () => {
       const r = await loadEvents(dir);
       expect(r.ok && r.value).toEqual([]);
     });
     it('sorts by (seq asc, writerId asc) regardless of on-disk order', async () => {
       const { logPath } = await eventLogPaths(dir);
       writeLines(logPath, [
         {
           seq: 2,
           writerId: 'b',
           timestamp: 't',
           scope: {},
           type: 'position_set',
           payload: { position: 'P2' },
         },
         {
           seq: 1,
           writerId: 'b',
           timestamp: 't',
           scope: {},
           type: 'position_set',
           payload: { position: 'P1' },
         },
         {
           seq: 2,
           writerId: 'a',
           timestamp: 't',
           scope: {},
           type: 'position_set',
           payload: { position: 'P2a' },
         },
       ]);
       const r = await loadEvents(dir);
       expect(r.ok).toBe(true);
       if (!r.ok) return;
       expect(r.value.map((e) => [e.seq, e.writerId])).toEqual([
         [1, 'b'],
         [2, 'a'],
         [2, 'b'],
       ]);
     });
     it('skips malformed JSON lines', async () => {
       const { logPath } = await eventLogPaths(dir);
       fs.writeFileSync(
         logPath,
         JSON.stringify({
           seq: 1,
           writerId: 'a',
           timestamp: 't',
           scope: {},
           type: 'position_set',
           payload: { position: 'P' },
         }) + '\n{ not json\n'
       );
       const r = await loadEvents(dir);
       expect(r.ok && r.value.length).toBe(1);
     });
   });

   describe('readTailSeq', () => {
     it('returns 0 for a missing file', async () => {
       const { logPath } = await eventLogPaths(dir);
       expect(readTailSeq(logPath)).toBe(0);
     });
     it('returns the max seq across all lines', async () => {
       const { logPath } = await eventLogPaths(dir);
       writeLines(logPath, [
         {
           seq: 5,
           writerId: 'a',
           timestamp: 't',
           scope: {},
           type: 'position_set',
           payload: { position: 'P' },
         },
         {
           seq: 3,
           writerId: 'b',
           timestamp: 't',
           scope: {},
           type: 'position_set',
           payload: { position: 'P' },
         },
       ]);
       expect(readTailSeq(logPath)).toBe(5);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/log.test.ts` — observe failure.
3. Create `packages/core/src/state/event-sourcing/log.ts` (read side):

   ```ts
   // packages/core/src/state/event-sourcing/log.ts
   import * as fs from 'fs';
   import * as path from 'path';
   import type { Result } from '../../shared/result';
   import { Ok, Err } from '../../shared/result';
   import { getStateDir } from '../state-shared';
   import { EVENT_LOG_FILE, EVENT_BLOBS_DIR } from './constants';
   import { EventSchema, StoredEventSchema, isBlobRef, type Event, type Scope } from './events';

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
         new Error(
           `Failed to load events: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }

   export type { Scope };
   ```

4. Run the test command from step 2 — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core/event-sourcing): ordered read + readTailSeq with deterministic (seq,writerId) sort`

### Task 5: Lock-free append with INV-2 seq derivation (TDD)

**Depends on:** Task 3, Task 4 | **Files:** `packages/core/src/state/event-sourcing/log.ts`, `packages/core/tests/state/event-sourcing/log.test.ts`

1. Append to `packages/core/tests/state/event-sourcing/log.test.ts` a new `describe('emitEvent (append)')` block:

   ```ts
   import { emitEvent } from '../../../src/state/event-sourcing/log';
   import { __resetWriterIdForTests } from '../../../src/state/event-sourcing/writer-id';
   import { resetLocalCountersForTests } from '../../../src/state/event-sourcing/log';

   describe('emitEvent (append, INV-2)', () => {
     beforeEach(() => {
       process.env.HARNESS_EVENT_WRITER_ID = 'w-test';
       __resetWriterIdForTests();
       resetLocalCountersForTests();
     });
     afterEach(() => {
       delete process.env.HARNESS_EVENT_WRITER_ID;
     });

     it('appends one JSONL line per event and round-trips via loadEvents', async () => {
       const r1 = await emitEvent(dir, { type: 'position_set', payload: { position: 'A' } });
       const r2 = await emitEvent(dir, {
         type: 'decision_recorded',
         payload: { id: 'd1', text: 'x' },
       });
       expect(r1.ok && r2.ok).toBe(true);
       const loaded = await loadEvents(dir);
       expect(loaded.ok && loaded.value.length).toBe(2);
       if (loaded.ok) expect(loaded.value.map((e) => e.seq)).toEqual([1, 2]);
     });

     it('stamps writerId and a monotonically increasing seq (max(tailSeq, local)+1)', async () => {
       const r = await emitEvent(dir, { type: 'position_set', payload: { position: 'A' } });
       expect(r.ok && r.value.writerId).toBe('w-test');
       expect(r.ok && r.value.seq).toBe(1);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/log.test.ts` — observe failure.
3. Extend `log.ts`: add imports + the append implementation:

   ```ts
   // add to existing imports in log.ts
   import { getWriterId } from './writer-id';
   import { MAX_LINE_BYTES } from './constants';
   import { type EventInput } from './events';

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
       const { dir, logPath } = await eventLogPaths(projectPath, options);
       fs.mkdirSync(dir, { recursive: true });

       const writerId = getWriterId();
       const tailSeq = readTailSeq(logPath);
       const local = localCounters.get(logPath) ?? 0;
       const seq = Math.max(tailSeq, local) + 1;
       localCounters.set(logPath, seq);

       const scope: Scope = { stream: options?.stream, session: options?.session };
       const event = {
         seq,
         writerId,
         timestamp: new Date().toISOString(),
         scope,
         type: input.type,
         payload: input.payload,
       };

       const line = Buffer.from(JSON.stringify(event) + '\n', 'utf-8');
       // NOTE: blob spill for line.byteLength >= MAX_LINE_BYTES is added in Task 6.
       fs.appendFileSync(logPath, line, { flag: 'a' });
       return Ok({ seq, writerId });
     } catch (error) {
       return Err(
         new Error(
           `Failed to emit event: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }

   void MAX_LINE_BYTES; // referenced fully in Task 6
   ```

4. Run the test command from step 2 — observe pass.
5. Run: `harness validate`
6. Commit: `feat(core/event-sourcing): lock-free append with re-derived seq (INV-2)`

### Task 6: Blob spill + rehydrate for oversized payloads (TDD)

**Depends on:** Task 5 | **Files:** `packages/core/src/state/event-sourcing/log.ts`, `packages/core/tests/state/event-sourcing/log.test.ts`

1. Append a `describe('blob spill (truth 5/6)')` block to `log.test.ts`:

   ```ts
   import { MAX_LINE_BYTES, EVENT_BLOBS_DIR } from '../../../src/state/event-sourcing/constants';

   describe('blob spill', () => {
     beforeEach(() => {
       process.env.HARNESS_EVENT_WRITER_ID = 'w-blob';
       __resetWriterIdForTests();
       resetLocalCountersForTests();
     });
     afterEach(() => {
       delete process.env.HARNESS_EVENT_WRITER_ID;
     });

     it('keeps the stored line under MAX_LINE_BYTES and rehydrates the payload on read', async () => {
       const big = 'x'.repeat(MAX_LINE_BYTES * 2);
       const r = await emitEvent(dir, {
         type: 'state_imported',
         payload: { legacyState: { big } },
       });
       expect(r.ok).toBe(true);

       const { logPath } = await eventLogPaths(dir);
       const onDiskLine = fs.readFileSync(logPath, 'utf-8').trim();
       expect(Buffer.byteLength(onDiskLine + '\n', 'utf-8')).toBeLessThan(MAX_LINE_BYTES);
       expect(onDiskLine).toContain('$blob');

       const blobs = fs.readdirSync(path.join(dir, EVENT_BLOBS_DIR));
       expect(blobs.length).toBe(1);

       const loaded = await loadEvents(dir);
       expect(loaded.ok).toBe(true);
       if (loaded.ok && loaded.value[0]?.type === 'state_imported') {
         expect((loaded.value[0].payload.legacyState as { big: string }).big).toBe(big);
       } else {
         throw new Error('expected rehydrated state_imported event');
       }
     });

     it('writes the blob before the log line (crash leaves orphan blob, never dangling ref)', async () => {
       // White-box: a small payload never spills; an oversized one always produces a blob
       // file whose existence does not depend on the line. Assert blob+line both present and
       // the line references the existing blob hash.
       const big = 'y'.repeat(MAX_LINE_BYTES * 2);
       const r = await emitEvent(dir, { type: 'state_imported', payload: { legacyState: big } });
       expect(r.ok).toBe(true);
       const { logPath } = await eventLogPaths(dir);
       const stored = JSON.parse(fs.readFileSync(logPath, 'utf-8').trim());
       const hash = stored.payload.$blob as string;
       expect(fs.existsSync(path.join(dir, EVENT_BLOBS_DIR, `${hash}.json`))).toBe(true);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/log.test.ts` — observe failure.
3. Edit `log.ts`: add the hash import and a `spillIfNeeded` helper, and call it in `emitEvent`
   before serializing the final line. Replace the Task-5 NOTE/`void MAX_LINE_BYTES` section:

   ```ts
   // add import near the top of log.ts
   import { computeContentHash } from '../learnings-content';
   import { BLOB_REF_KEY } from './constants';

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
   ```

   Then in `emitEvent`, between building the envelope and serializing the line, replace the
   inline-payload block with:

   ```ts
   const { dir, logPath, blobsDir } = await eventLogPaths(projectPath, options);
   // ...writerId/seq/scope as before...
   const envelope = { seq, writerId, timestamp: new Date().toISOString(), scope, type: input.type };
   const storedPayload = spillIfNeeded(envelope, input.payload, blobsDir);
   const line = Buffer.from(
     JSON.stringify({ ...envelope, payload: storedPayload }) + '\n',
     'utf-8'
   );
   fs.appendFileSync(logPath, line, { flag: 'a' });
   ```

   Remove the leftover `void MAX_LINE_BYTES;` line.

4. Run the test command from step 2 — observe pass. Also re-run Task 5's append tests to
   confirm no regression: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/log.test.ts`.
5. Run: `harness validate`
6. Commit: `feat(core/event-sourcing): spill oversized payloads to blob written before the log line`

### Task 7: INV-2 stale-max regression test

**Depends on:** Task 5 | **Files:** `packages/core/tests/state/event-sourcing/log.test.ts`

1. Append a focused regression test asserting `seq` is re-derived from the live tail, not a
   stale local max — the exact bug INV-2 prevents:

   ```ts
   describe('INV-2: seq re-derived from live tail, never a stale local max', () => {
     beforeEach(() => {
       process.env.HARNESS_EVENT_WRITER_ID = 'w-inv2';
       __resetWriterIdForTests();
       resetLocalCountersForTests();
     });
     afterEach(() => {
       delete process.env.HARNESS_EVENT_WRITER_ID;
     });

     it('jumps ahead of an externally-bumped tail rather than reusing a cached max', async () => {
       const first = await emitEvent(dir, { type: 'position_set', payload: { position: 'A' } });
       expect(first.ok && first.value.seq).toBe(1);

       // Simulate a *different* writer appending a higher seq directly to the live log.
       const { logPath } = await eventLogPaths(dir);
       fs.appendFileSync(
         logPath,
         JSON.stringify({
           seq: 50,
           writerId: 'other',
           timestamp: 't',
           scope: {},
           type: 'position_set',
           payload: { position: 'Z' },
         }) + '\n'
       );

       // Our next append must read the live tail (50) and emit 51, NOT 2 from a cached max.
       const next = await emitEvent(dir, { type: 'position_set', payload: { position: 'B' } });
       expect(next.ok && next.value.seq).toBe(51);
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/log.test.ts` — observe pass (the Task-5 implementation already satisfies this; the test pins the invariant against regressions).
3. Run: `harness validate`
4. Commit: `test(core/event-sourcing): pin INV-2 seq re-derivation against stale-max regression`

### Task 8: Complete the module barrel

**Depends on:** Task 6 | **Files:** `packages/core/src/state/event-sourcing/index.ts`

1. Replace `packages/core/src/state/event-sourcing/index.ts` with the full barrel:
   ```ts
   // packages/core/src/state/event-sourcing/index.ts
   export * from './constants';
   export { EventSchema, StoredEventSchema, BlobRefSchema, ScopeSchema, isBlobRef } from './events';
   export type { Event, EventType, EventInput, StoredEvent, BlobRef, Scope } from './events';
   export { getWriterId } from './writer-id';
   export { emitEvent, loadEvents, readTailSeq, eventLogPaths } from './log';
   export type { EventLogOptions, EventLogPaths, EmitResult } from './log';
   ```
   (Do NOT export the `__resetWriterIdForTests` / `resetLocalCountersForTests` test hooks.)
2. Run: `pnpm --filter @harness-engineering/core exec tsc --noEmit`
3. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing`
4. Run: `harness validate`
5. Commit: `feat(core/event-sourcing): export public log-core API from module barrel`

### Task 9: Concurrency test (SC3 / INV-1 / INV-2) + worker fixture `[checkpoint:human-verify]`

**Depends on:** Task 8 | **Files:** `packages/core/tests/state/event-sourcing/concurrency-worker.mts`, `packages/core/tests/state/event-sourcing/concurrency.test.ts`

> `[checkpoint:human-verify]` — This is a load-bearing invariant test (Observable Truth 7).
> After it passes, pause and confirm with a human that it spawns **real OS processes** with
> **distinct writerIds** and asserts **zero lost events** and **no repeated `(seq, writerId)`
> pair**, and that it is not flaky across a few runs.

1. Create the worker fixture `packages/core/tests/state/event-sourcing/concurrency-worker.mts`:

   ```ts
   // Spawned as a separate OS process (distinct writerId per INV-1) by concurrency.test.ts.
   // Args: <projectDir> <count>. Env: HARNESS_EVENT_WRITER_ID (distinct per worker).
   import { emitEvent } from '../../../src/state/event-sourcing/log.js';

   const [, , projectDir, countStr] = process.argv;
   const count = Number(countStr);

   async function main() {
     for (let i = 0; i < count; i++) {
       const r = await emitEvent(projectDir, {
         type: 'position_set',
         payload: { position: `p${i}` },
       });
       if (!r.ok) {
         console.error(String(r.error));
         process.exit(1);
       }
     }
     process.exit(0);
   }
   void main();
   ```

2. Create `packages/core/tests/state/event-sourcing/concurrency.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as os from 'os';
   import * as path from 'path';
   import { fileURLToPath } from 'url';
   import { spawn } from 'child_process';
   import { loadEvents } from '../../../src/state/event-sourcing/log';

   const WORKER = fileURLToPath(new URL('./concurrency-worker.mts', import.meta.url));
   const TSX = fileURLToPath(new URL('../../../../../node_modules/.bin/tsx', import.meta.url));

   function runWorker(projectDir: string, writerId: string, count: number): Promise<number> {
     return new Promise((resolve, reject) => {
       const child = spawn(TSX, [WORKER, projectDir, String(count)], {
         env: { ...process.env, HARNESS_EVENT_WRITER_ID: writerId },
         stdio: ['ignore', 'ignore', 'inherit'],
       });
       child.on('exit', (code) =>
         code === 0 ? resolve(0) : reject(new Error(`worker ${writerId} exited ${code}`))
       );
       child.on('error', reject);
     });
   }

   let dir: string;
   beforeEach(() => {
     dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esconc-'));
   });
   afterEach(() => {
     fs.rmSync(dir, { recursive: true, force: true });
   });

   describe('SC3 concurrency (INV-1/INV-2)', () => {
     it('N processes with distinct writerIds lose zero events and never repeat (seq, writerId)', async () => {
       const N = 8;
       const K = 50;
       const writerIds = Array.from({ length: N }, (_, i) => `writer-${i}`);
       await Promise.all(writerIds.map((w) => runWorker(dir, w, K)));

       const loaded = await loadEvents(dir);
       expect(loaded.ok).toBe(true);
       if (!loaded.ok) return;

       // Zero lost events.
       expect(loaded.value.length).toBe(N * K);
       // No repeated (seq, writerId) pair.
       const keys = new Set(loaded.value.map((e) => `${e.seq}|${e.writerId}`));
       expect(keys.size).toBe(N * K);
       // Each writer contributed exactly K events.
       for (const w of writerIds) {
         expect(loaded.value.filter((e) => e.writerId === w).length).toBe(K);
       }
     }, 30_000);
   });
   ```

3. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/concurrency.test.ts` — observe pass. Re-run 2-3 times to confirm non-flaky.
4. `[checkpoint:human-verify]` — Present the passing run; confirm true multi-process,
   distinct-writerId, zero-loss, no-duplicate-key behavior before proceeding.
5. Run: `harness validate`
6. Commit: `test(core/event-sourcing): SC3 multi-process concurrency proves INV-1/INV-2 (zero loss, unique keys)`

### Task 10: Deterministic replay-order test (SC3)

**Depends on:** Task 8 | **Files:** `packages/core/tests/state/event-sourcing/replay-order.test.ts`

1. Create `packages/core/tests/state/event-sourcing/replay-order.test.ts`:

   ```ts
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as os from 'os';
   import * as path from 'path';
   import { loadEvents, eventLogPaths } from '../../../src/state/event-sourcing/log';

   let dir: string;
   beforeEach(() => {
     dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esreplay-'));
   });
   afterEach(() => {
     fs.rmSync(dir, { recursive: true, force: true });
   });

   describe('SC3 deterministic replay order', () => {
     it('produces an identical (seq asc, writerId asc) order across repeated loads, with writerId tiebreak', async () => {
       const { logPath } = await eventLogPaths(dir);
       // Same seq, different writerIds → tiebreak must be deterministic. Shuffled on disk.
       const lines = [
         {
           seq: 3,
           writerId: 'm',
           timestamp: 'z',
           scope: {},
           type: 'position_set',
           payload: { position: 'c' },
         },
         {
           seq: 1,
           writerId: 'z',
           timestamp: 'a',
           scope: {},
           type: 'position_set',
           payload: { position: 'a' },
         },
         {
           seq: 2,
           writerId: 'b',
           timestamp: 'y',
           scope: {},
           type: 'position_set',
           payload: { position: 'b1' },
         },
         {
           seq: 2,
           writerId: 'a',
           timestamp: 'x',
           scope: {},
           type: 'position_set',
           payload: { position: 'b2' },
         },
       ];
       fs.writeFileSync(logPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

       const order1 = await loadEvents(dir);
       const order2 = await loadEvents(dir);
       expect(order1.ok && order2.ok).toBe(true);
       if (!order1.ok || !order2.ok) return;

       const keys1 = order1.value.map((e) => `${e.seq}|${e.writerId}`);
       expect(keys1).toEqual(['1|z', '2|a', '2|b', '3|m']);
       expect(order1.value.map((e) => `${e.seq}|${e.writerId}`)).toEqual(
         order2.value.map((e) => `${e.seq}|${e.writerId}`)
       );
     });
   });
   ```

2. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing/replay-order.test.ts` — observe pass.
3. Run: `harness validate`
4. Commit: `test(core/event-sourcing): deterministic replay order with writerId tiebreak (SC3)`

### Task 11: Wire module into the package barrel (namespaced) `[checkpoint:human-verify]` `Category: integration`

**Depends on:** Task 8 | **Files:** `packages/core/src/state/index.ts`, `packages/core/src/index.ts` (regenerated)

> Integration task derived from spec Integration Points → Registrations Required: "Core
> barrel-export regeneration for the new `event-sourcing/` module." Uses the **namespaced**
> form (D-P1-a) to avoid colliding with the legacy `emitEvent`/`loadEvents` exports — Phase 1
> must not retire the legacy log (that is Phase 5).

1. Edit `packages/core/src/state/index.ts` — append at the end:
   ```ts
   /**
    * Event-sourced state log (Phase 1: log core). Namespaced to avoid colliding with the
    * legacy `events.ts` emitEvent/loadEvents until the legacy log is retired (Phase 5).
    */
   export * as eventSourcing from './event-sourcing';
   ```
2. Run: `pnpm run generate:barrels` (regenerates `packages/core/src/index.ts`).
3. Run: `pnpm run generate:barrels:check` — observe pass (barrel is fresh, no collision).
4. Run: `pnpm --filter @harness-engineering/core exec tsc --noEmit` — confirm no duplicate-export errors.
5. `[checkpoint:human-verify]` — Confirm the package now exposes `eventSourcing.emitEvent` /
   `eventSourcing.loadEvents` without disturbing the legacy `emitEvent`/`loadEvents` exports,
   and that `generate:barrels:check` is green (CI gates on it).
6. Run: `pnpm --filter @harness-engineering/core exec vitest run tests/state/event-sourcing` — full module suite green.
7. Run: `harness validate`
8. Commit: `feat(core/event-sourcing): expose log-core via namespaced package barrel`

## Traceability (Observable Truth → Task)

| Truth                                     | Tasks |
| ----------------------------------------- | ----- |
| 1 (JSONL line at scope dir)               | 4, 5  |
| 2 (writerId + INV-2 seq)                  | 5, 7  |
| 3 (INV-1 writerId stable/unique)          | 3, 9  |
| 4 (ordered read (seq,writerId))           | 4, 10 |
| 5 (blob spilled before line, under bound) | 1, 6  |
| 6 (rehydrate on read)                     | 6     |
| 7 (concurrency zero-loss, unique keys)    | 9     |
| 8 (deterministic replay order)            | 10    |
| 9 (suite + barrel + validate green)       | 8, 11 |

## Notes for Execution

- Pre-existing `harness validate` failures (dashboard hardcoded colors; `drift/findings` and
  `shared/craft/llm` circular deps) are unrelated to this module — do not attempt to fix them
  here; only ensure this module adds no new findings.
- Tests live under `packages/core/tests/state/event-sourcing/` (the repo keeps tests out of
  `src/`); imports use `../../../src/state/event-sourcing/...`.
- `harness repo` hazard: concurrent automation can reset the worktree HEAD and a `pnpm
install` can wipe `dist/`. Commit after every task; if pre-commit hits MODULE_NOT_FOUND,
  run `pnpm turbo build` first.
- `pnpm run generate:barrels:check` is a CI gate — never hand-edit `packages/core/src/index.ts`.

```

```
