# Plan: Event-Sourced State Model — Phase 3 (Migration + Write-Path Cutover)

**Date:** 2026-06-27 | **Spec:** `docs/changes/event-sourced-state-model/proposal.md` (Implementation Order → Phase 3) | **Tasks:** 17 | **Checkpoints:** 3 | **Time:** ~70 min | **Integration Tier:** large

> **Blast radius: HIGH.** This phase inverts state ownership (event log becomes authoritative; `state.json` becomes a dead legacy artifact). It touches the live write/read paths of `manage_state`, `recordInteraction`/`emit_interaction`, `gather_context`, the `state` MCP resource, and the `state show` CLI. It is a **semantics-preserving storage swap**: every external behavior must be byte-for-byte unchanged; only the storage mechanism changes (per-field events + derived snapshot, instead of a mutated `state.json`). Strictly incremental and reversible — one write site per task, one reader per task, each independently committed and green. No big-bang rewrite. Does **not** retire `events.jsonl` (Phase 5) and does **not** build the lane machine (Phase 4).

## Goal

Make the append-only event log the authoritative store for core state: a genesis `state_imported` event imports the legacy `state.json` once (idempotent, crash-safe); all three `saveState` mutation sites emit events instead; all six `loadState` readers read `toHarnessState(readSnapshot(...).coreState)` — with zero observable behavior change and no remaining production `saveState` mutation (SC1).

## Observable Truths (Acceptance Criteria)

1. **[SC1]** No production code path mutates state via `saveState`. Grep of `packages/cli/src` and `packages/core/src` finds `saveState(` only at its definition (`state-persistence.ts`) and the barrel re-export (`state/index.ts`) — zero call sites. A guard test asserts this.
2. **[SC7 / D6 — genesis idempotency]** When a legacy `state.json` exists and the log has **no** `state_imported` event, the first read/write emits exactly **one** `state_imported` event capturing the legacy contents. A re-run is a **no-op** (idempotent on "a `state_imported` event is present in the log", NOT on "the file exists").
3. **[SC7 / D6 — crash safety]** An empty log left by a crashed import (legacy file still present, no `state_imported` event yet) still imports on the next run. A crash after the event was emitted but before the legacy file was renamed does **not** double-import (the event is authoritative).
4. **[Parity — writes]** `manage_state append_entry` (global decisions fallback), `recordInteraction` (interaction → decision), and `manage_state reset` produce the **same observable core-state** through the new read path as the legacy `saveState` path produced through `loadState`.
5. **[Parity — reads]** `manage_state show`, `gather_context` (state slice), the `state` MCP resource, and `state show` CLI return the **same `HarnessState`-shaped output** as before — same fields, same JSON, same Result/error shape.
6. **[Carry-forward — snapshot hardening]** `readStoredSnapshot` treats a snapshot as a cache miss (recompute from log) unless `schemaVersion === 2` **and** `coreState` is a non-null object — a version-skewed snapshot degrades to recompute.
7. **[Carry-forward — DP1]** The vestigial `position_set.payload.position` string field is removed from the schema; the projection reads only `{ phase?, task? }`; all Phase-1/2 fixtures are reauthored. `npx vitest run` over the event-sourcing module is green.
8. `harness validate` passes (baseline unchanged); `harness check-deps` introduces no new circular dependency; barrels are regenerated for the new `migrate.ts` export.

## Exhaustive Write/Read Site Inventory (Task 0 enumeration — verified by grep)

### Write sites (`saveState` mutations → `emitEvent`) — exactly 3

| #   | Location                                                                                       | Current behavior                                                                                              | Converts to                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| W1  | `packages/cli/src/mcp/tools/state.ts:239-249` (`handleAppendEntry`, global-decisions fallback) | `loadState` → `decisions.push({date, decision, context})` → `saveState`                                       | `emitCoreEvent` → `decision_recorded { id, text, context }`                                                         |
| W2  | `packages/cli/src/mcp/tools/interaction.ts:370-380` (`recordInteraction`)                      | `loadState` → `decisions.push({date, decision:'[type:id] …', context:'pending user response'})` → `saveState` | `emitCoreEvent` → `decision_recorded { id, text:'[type:id] …', context:'pending user response' }`                   |
| W3  | `packages/cli/src/mcp/tools/state.ts:155-160` (`handleReset`)                                  | `saveState({...DEFAULT_STATE})` (wholesale wipe)                                                              | `resetEventLog` (truncate log + clear snapshot/blobs + emit genesis `state_imported{ legacyState: DEFAULT_STATE }`) |

Definition/re-export (left in place, marked `@deprecated`, NOT a call site): `packages/core/src/state/state-persistence.ts:40`, `packages/core/src/state/index.ts:21`.

### Read sites (`loadState` → `toHarnessState(readSnapshot(...).coreState)`) — 6 total

| #   | Location                                                                     | Notes                                                                            |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| R1  | `packages/cli/src/mcp/tools/state.ts:105-106` (`handleShow`)                 | pure reader; returns `Result<HarnessState>` via `resultToMcpResponse`            |
| R2  | `packages/cli/src/mcp/tools/gather-context.ts:233-234` (`statePromise`)      | pure reader; must keep `Result<HarnessState>` shape for downstream consumers     |
| R3  | `packages/cli/src/mcp/resources/state.ts:3-5`                                | pure reader; keep the preceding `migrateToStreams` call; `JSON.stringify(value)` |
| R4  | `packages/cli/src/commands/state/show.ts:3,38` (`state show` CLI)            | pure reader; prints `HarnessState` fields                                        |
| R5  | `packages/cli/src/mcp/tools/state.ts:240` (inside `handleAppendEntry`)       | **read-before-write — eliminated by W1** (emit needs no prior read)              |
| R6  | `packages/cli/src/mcp/tools/interaction.ts:371` (inside `recordInteraction`) | **read-before-write — eliminated by W2**                                         |

So 4 standalone readers (R1–R4) convert to the snapshot API; R5/R6 disappear with their write conversions.

## File Map

- CREATE `packages/core/src/state/event-sourcing/migrate.ts` (genesis import + `resetEventLog`)
- CREATE `packages/core/tests/state/event-sourcing/migrate.test.ts`
- MODIFY `packages/core/src/state/event-sourcing/index.ts` (barrel: export `importLegacyState`, `resetEventLog`)
- MODIFY `packages/core/src/state/event-sourcing/snapshot.ts` (harden `readStoredSnapshot` — truth #6)
- MODIFY `packages/core/tests/state/event-sourcing/snapshot.test.ts` (harden tests)
- MODIFY `packages/core/src/state/event-sourcing/events.ts` (DP1: drop `position` field)
- MODIFY `packages/core/src/state/event-sourcing/projections/core-state.ts` (DP1 comment cleanup)
- MODIFY (DP1 fixtures) `packages/core/tests/state/event-sourcing/{log,events,snapshot,snapshot.property,replay-order}.test.ts`, `projections/core-state.test.ts`, `concurrency-worker.mts`
- MODIFY `packages/core/src/state/state-persistence.ts` (`@deprecated` JSDoc on `saveState`/`loadState`)
- CREATE `packages/cli/src/shared/state-events.ts` (`readHarnessState`, `emitCoreEvent`)
- CREATE `packages/cli/tests/shared/state-events.test.ts`
- CREATE `packages/cli/tests/mcp/tools/state-sc1-guard.test.ts` (SC1 ratchet guard)
- MODIFY `packages/cli/src/mcp/tools/state.ts` (W1, W3, R1)
- MODIFY `packages/cli/src/mcp/tools/interaction.ts` (W2, R6)
- MODIFY `packages/cli/src/mcp/tools/gather-context.ts` (R2)
- MODIFY `packages/cli/src/mcp/resources/state.ts` (R3)
- MODIFY `packages/cli/src/commands/state/show.ts` (R4)
- MODIFY test files alongside each converted site (parity tests)

## Uncertainties

- **[ASSUMPTION → RESOLVED at checkpoint] `reset` maps to truncate + re-genesis.** The spec's core-state event catalog has no `state_reset` event. The honest, in-catalog, semantics-preserving translation of the legacy wholesale `saveState({...DEFAULT_STATE})` wipe is: truncate the event log, delete the derived snapshot/blobs, then emit a fresh genesis `state_imported{ legacyState: DEFAULT_STATE }` so (a) the next read projects to an empty `HarnessState` deep-equal to `DEFAULT_STATE`, and (b) the genesis-present invariant holds so a lingering legacy `state.json` is not re-imported. This is the one **destructive/irreversible** mapping → `[checkpoint:decision]` at Task 11.
- **[ASSUMPTION] No concurrent production writers during the cutover window.** Between write-cutover and read-cutover (or vice-versa) the log and the legacy `state.json` diverge for un-converted sites. Ordering is chosen (genesis → writes → reads) so **no write is ever lost** (writes land in the authoritative log immediately); the only interim artifact is that un-converted readers show stale data until their task lands — recoverable, never data loss. Documented as a concern.
- **[DEFERRABLE] `saveState`/`loadState` removal.** Left in place as dead, `@deprecated`-annotated functions to keep blast radius minimal and the change reversible. Physical removal is Phase 6 cleanup.
- **[DEFERRABLE] Genesis trigger placement.** Genesis runs lazily via the CLI helpers (`readHarnessState`/`emitCoreEvent`), memoized per resolved log path per process, so it executes at most once per scope without a separate migration command to forget.

## Cutover ordering rationale

**Genesis → writes → reads.** After genesis the log mirrors `state.json`, so converting writes first guarantees every mutation is captured in the authoritative log (no lost writes). Write-task parity tests assert via the **new** read path (`readHarnessState`) directly, so they are self-contained and green even before readers are cut over. Reads convert last; their parity tests confirm the public readers now reflect the events. Interim window (un-converted readers showing stale data) is low-severity and recoverable.

## Skeleton

1. Carry-forward hardening — snapshot validation + DP1 cleanup (~4 tasks, ~16 min)
2. Genesis migration + reset primitive (core) (~2 tasks, ~10 min)
3. CLI compose helpers + SC1 ratchet guard (~2 tasks, ~9 min)
4. Write-path cutover, one site per task (~3 tasks, ~13 min)
5. Read-path cutover, one site per task (~4 tasks, ~14 min)
6. Final SC1 guard + integration (barrels/validate) (~2 tasks, ~8 min)

**Estimated total:** 17 tasks, ~70 min. _Skeleton approval: present at execution start (standard rigor, 17 ≥ 8 tasks)._

---

## Tasks

### Task 1: SC1 inventory + ratchet guard test (green baseline)

**Depends on:** none | **Files:** `packages/cli/tests/mcp/tools/state-sc1-guard.test.ts`

1. Create the guard test. It scans `packages/cli/src` and `packages/core/src` for `saveState(` invocations (excluding the definition file `state-persistence.ts` and the barrel `state/index.ts`), and asserts the set equals a `KNOWN_MUTATIONS` allowlist that starts with the 3 sites and is ratcheted down to `[]` as conversions land:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Files where `saveState` legitimately appears as a definition/re-export, not a mutation call.
const ALLOWED_FILES = ['state-persistence.ts', path.join('state', 'index.ts')];

// Ratchet: each write-conversion task removes its entry. SC1 is met when this is empty.
const KNOWN_MUTATIONS = [
  'packages/cli/src/mcp/tools/state.ts', // W1 handleAppendEntry — removed in Task 9
  'packages/cli/src/mcp/tools/interaction.ts', // W2 recordInteraction — removed in Task 10
  'packages/cli/src/mcp/tools/state.ts:reset', // W3 handleReset       — removed in Task 11
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('SC1 — no production saveState mutation (ratchet)', () => {
  it('matches the known-mutations allowlist (shrinks to empty as cutover lands)', () => {
    const roots = ['packages/cli/src', 'packages/core/src'].map((r) =>
      path.resolve(__dirname, '../../../../..', r)
    );
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (ALLOWED_FILES.some((a) => file.endsWith(a))) continue;
        const src = fs.readFileSync(file, 'utf-8');
        if (/\bsaveState\s*\(/.test(src)) hits.push(file);
      }
    }
    // Two distinct call sites live in state.ts (W1 + W3); de-dupe to file granularity here,
    // and assert the W2 file is present. Exact-zero is asserted in Task 16.
    expect(hits.some((h) => h.endsWith(path.join('tools', 'state.ts')))).toBe(true);
    expect(hits.some((h) => h.endsWith(path.join('tools', 'interaction.ts')))).toBe(true);
  });
});
```

2. Run: `npx vitest run packages/cli/tests/mcp/tools/state-sc1-guard.test.ts` — observe pass (baseline captures current mutation sites).
3. Run: `harness validate`
4. Commit: `test(state): add SC1 saveState-mutation ratchet guard (baseline)`

> Note: this guard captures the starting state. Tasks 9–11 update it as each write site converts; Task 16 replaces it with the strict exact-zero assertion.

---

### Task 2: Harden `readStoredSnapshot` structural validation (carry-forward)

**Depends on:** none | **Files:** `packages/core/src/state/event-sourcing/snapshot.ts`, `packages/core/tests/state/event-sourcing/snapshot.test.ts`
**Skills:** `ts-type-guards` (reference), `ts-zod-integration` (reference)

1. Add tests to `snapshot.test.ts`: a stored snapshot file with (a) `schemaVersion !== 2`, (b) `coreState` null, and (c) `coreState` a non-object — each must be treated as a cache miss, so `readSnapshot` recomputes from the log (returns the reduced value, not the stale stored object). Drive by writing a malformed `state.snapshot.json` next to a log whose `reduce()` differs, then asserting `readSnapshot` returns the recomputed result.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/snapshot.test.ts` — observe failure (current check only validates `meta.lastSeq`).
3. Tighten `readStoredSnapshot` (snapshot.ts ~138):

```ts
function readStoredSnapshot(snapPath: string): Snapshot | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      (parsed as { schemaVersion?: unknown }).schemaVersion === 2 &&
      typeof (parsed as { meta?: { lastSeq?: unknown } }).meta?.lastSeq === 'number' &&
      (parsed as { coreState?: unknown }).coreState !== null &&
      typeof (parsed as { coreState?: unknown }).coreState === 'object'
    ) {
      return parsed as Snapshot;
    }
    return null; // version-skewed / structurally invalid → cache miss → recompute
  } catch {
    return null;
  }
}
```

4. Run the test — observe pass. Run the full module suite: `npx vitest run packages/core/tests/state/event-sourcing/` — green.
5. Run: `harness validate`
6. Commit: `fix(core): harden readStoredSnapshot to require schemaVersion 2 + object coreState`

---

### Task 3: DP1 fixture reauthor — group A (log + concurrency)

**Depends on:** none | **Files:** `packages/core/tests/state/event-sourcing/log.test.ts`, `packages/core/tests/state/event-sourcing/concurrency-worker.mts`

1. Mechanical rename of the `position_set` payload key in these fixtures from the vestigial `{ position: 'X' }` to the structured `{ phase: 'X' }`. For the oversize/spill cases (`log.test.ts:358,377,397,423` using `'a'.repeat(...)`), move the large string onto `phase` (e.g. `{ phase: 'a'.repeat(spillLen) }`) so the payload stays oversized AND survives `PositionSetPayload` validation after Task 5. These fixtures assert ordering/seq/spill, not payload content, so the rename is behavior-neutral while the superset schema still accepts both keys.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/log.test.ts` and the concurrency suite — observe pass (superset schema still valid; no source change yet).
3. Run: `harness validate`
4. Commit: `test(core): reauthor log/concurrency fixtures off vestigial position field (DP1)`

---

### Task 4: DP1 fixture reauthor — group B (events, snapshot, replay, projection)

**Depends on:** Task 3 | **Files:** `packages/core/tests/state/event-sourcing/events.test.ts`, `snapshot.test.ts`, `snapshot.property.test.ts`, `replay-order.test.ts`, `projections/core-state.test.ts`

1. Same mechanical rename: `position_set` payloads `{ position: 'X' }` → `{ phase: 'X' }`. In `events.test.ts:22,48` keep the cases that assert `position_set` validity, now using `{ phase: 'P1' }`. Leave the `decision_recorded`-based mismatch/negative case (`events.test.ts:37`) untouched — it remains the schema-mismatch fixture (per the Phase-2 handoff, `position_set` can no longer serve as the mismatch case). In `core-state.test.ts`, ensure projection assertions read `position.phase`/`position.task`.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/` — observe pass.
3. Run: `harness validate`
4. Commit: `test(core): reauthor snapshot/replay/projection fixtures off vestigial position field (DP1)`

---

### Task 5: DP1 — drop vestigial `position` from the schema (source)

**Depends on:** Task 4 | **Files:** `packages/core/src/state/event-sourcing/events.ts`, `packages/core/src/state/event-sourcing/projections/core-state.ts`

1. In `events.ts`, remove the `position: z.string().optional()` line from `PositionSetPayload` and delete the DP1 comment (lines ~27-34), leaving:

```ts
const PositionSetPayload = z.object({
  phase: z.string().optional(),
  task: z.string().optional(),
});
```

`EventInput`'s `position_set` variant already infers from `PositionSetPayload`, so it updates automatically.

2. In `core-state.ts` (~78-84), simplify the `position_set` comment to drop the "vestigial `position` string is ignored (DP1)" note (the field no longer exists); the field-by-field `{ phase?, task? }` construction is unchanged.
3. Run: `npx vitest run packages/core/tests/state/event-sourcing/` — observe pass (all fixtures already off the dropped field after Tasks 3–4).
4. Run: `harness validate` and `npx tsc --noEmit -p packages/core` (exit 0).
5. Commit: `refactor(core): drop vestigial position_set.position superset field (DP1)`

---

### Task 6: Genesis migration — `importLegacyState` (core) `[checkpoint:human-verify]`

**Depends on:** Task 5 | **Files:** `packages/core/src/state/event-sourcing/migrate.ts`, `packages/core/tests/state/event-sourcing/migrate.test.ts`, `packages/core/src/state/event-sourcing/index.ts`
**Skills:** `ts-zod-integration` (reference)

1. Write `migrate.test.ts` covering D6:
   - **(a) imports once:** legacy `state.json` present, log has no `state_imported` → after `importLegacyState`, the log contains exactly one `state_imported` whose `payload.legacyState` deep-equals the legacy file; `loadEvents` then projects to that state.
   - **(b) idempotent re-run:** second `importLegacyState` call appends nothing (still exactly one `state_imported`).
   - **(c) idempotent on event, not file:** with a `state_imported` already in the log but the legacy file still present (crash-after-emit-before-rename), `importLegacyState` is a no-op (no second import).
   - **(d) crash-after-empty:** legacy file present, log file exists but empty → still imports.
   - **(e) no legacy file:** no `state.json` → no-op, no event emitted, no throw.
   - **(f) rename:** on successful import the legacy `state.json` is renamed to `state.json.imported`; a failed rename is non-fatal (event is authoritative).
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/migrate.test.ts` — observe failure (module absent).
3. Create `migrate.ts`:

```ts
// packages/core/src/state/event-sourcing/migrate.ts
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import { STATE_FILE } from '../state-shared';
import { HarnessStateSchema } from '../types';
import { eventLogPaths, loadEvents, emitEvent, type EventLogOptions } from './log';

/** Process-level memo: at most one genesis check per resolved log path per process. */
const ensured = new Set<string>();

/** True if the log already carries a genesis `state_imported` event (D6 idempotency key). */
async function hasGenesis(projectPath: string, options?: EventLogOptions): Promise<boolean> {
  const loaded = await loadEvents(projectPath, options);
  if (!loaded.ok) return false; // unreadable log → treat as not-yet-imported (import will re-run safely)
  return loaded.value.some((e) => e.type === 'state_imported');
}

/**
 * D6 genesis import. Idempotent on "a `state_imported` event is present in the log" — NOT on
 * "the legacy file exists". Crash-safe: an empty log from a crashed import still imports; an
 * already-emitted genesis is never duplicated. Emits ONE honest `state_imported` capturing the
 * legacy snapshot verbatim — no fabricated per-field events. Renames the consumed file aside.
 */
export async function importLegacyState(
  projectPath: string,
  options?: EventLogOptions
): Promise<Result<{ imported: boolean }, Error>> {
  try {
    const { dir } = await eventLogPaths(projectPath, options);
    const memoKey = dir;
    if (ensured.has(memoKey)) return Ok({ imported: false });

    if (await hasGenesis(projectPath, options)) {
      ensured.add(memoKey);
      return Ok({ imported: false });
    }

    const legacyPath = path.join(dir, STATE_FILE);
    if (!fs.existsSync(legacyPath)) {
      ensured.add(memoKey);
      return Ok({ imported: false }); // fresh project, nothing to import
    }

    const parsed = HarnessStateSchema.safeParse(JSON.parse(fs.readFileSync(legacyPath, 'utf-8')));
    if (!parsed.success) {
      // Unreadable/invalid legacy file: do not fabricate. Leave it; reads fall back to empty.
      ensured.add(memoKey);
      return Ok({ imported: false });
    }

    const emit = await emitEvent(
      projectPath,
      { type: 'state_imported', payload: { legacyState: parsed.data } },
      options
    );
    if (!emit.ok) return emit;

    // Authoritative event is committed; renaming the file aside is best-effort (non-fatal).
    try {
      fs.renameSync(legacyPath, `${legacyPath}.imported`);
    } catch {
      /* event is authoritative; a re-run is a no-op via hasGenesis */
    }
    ensured.add(memoKey);
    return Ok({ imported: true });
  } catch (error) {
    return Err(
      new Error(
        `Failed to import legacy state: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}

/** Test-only: clear the per-process memo so tests exercise the on-disk idempotency path. */
export function __resetGenesisMemoForTests(): void {
  ensured.clear();
}
```

4. Export from the barrel (`index.ts`): `export { importLegacyState } from './migrate';`
5. Run the test — observe pass. Run `npx tsc --noEmit -p packages/core` (exit 0).
6. Run: `harness validate`
7. `[checkpoint:human-verify]` — On a copy of a real legacy `.harness/state.json`, run `importLegacyState`, then `toHarnessState(readSnapshot(...).coreState)`, and confirm the projected state deep-equals the original file. Confirm a second run is a no-op and the file was renamed to `state.json.imported`.
8. Commit: `feat(core): add idempotent crash-safe genesis state_imported migration`

---

### Task 7: `resetEventLog` primitive (core)

**Depends on:** Task 6 | **Files:** `packages/core/src/state/event-sourcing/migrate.ts`, `packages/core/tests/state/event-sourcing/migrate.test.ts`, `packages/core/src/state/event-sourcing/index.ts`

1. Add tests: after seeding a log with several events and a materialized snapshot, `resetEventLog` leaves a state whose projection deep-equals `DEFAULT_STATE` (empty `position`/`decisions`/`blockers`/`progress`); the snapshot file and blobs dir are cleared; and a subsequent `importLegacyState` is a no-op (a genesis `state_imported` is present, so a lingering legacy `state.json` is NOT re-imported).
2. Run the test — observe failure.
3. Implement `resetEventLog` in `migrate.ts`:

```ts
import { DEFAULT_STATE } from '../types';
import { SNAPSHOT_FILE, EVENT_LOG_FILE, EVENT_BLOBS_DIR } from './constants';

/**
 * Event-sourced equivalent of the legacy `saveState({...DEFAULT_STATE})` wipe: truncate the
 * authoritative log, drop the derived snapshot + blobs, then emit a fresh genesis carrying
 * DEFAULT_STATE so (a) the next read projects to an empty HarnessState and (b) the
 * genesis-present invariant holds (a stale legacy state.json is not re-imported). Destructive
 * by design — `reset` discards history, matching the legacy wholesale overwrite.
 */
export async function resetEventLog(
  projectPath: string,
  options?: EventLogOptions
): Promise<Result<void, Error>> {
  try {
    const { dir } = await eventLogPaths(projectPath, options);
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(path.join(dir, EVENT_LOG_FILE), { force: true });
    fs.rmSync(path.join(dir, SNAPSHOT_FILE), { force: true });
    fs.rmSync(path.join(dir, EVENT_BLOBS_DIR), { recursive: true, force: true });
    ensured.delete(dir); // allow genesis bookkeeping to re-run for this scope
    const emit = await emitEvent(
      projectPath,
      { type: 'state_imported', payload: { legacyState: { ...DEFAULT_STATE } } },
      options
    );
    if (!emit.ok) return emit;
    ensured.add(dir); // genesis now present
    return Ok(undefined);
  } catch (error) {
    return Err(
      new Error(
        `Failed to reset event log: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
```

4. Export from the barrel: add `resetEventLog` to the `./migrate` export line.
5. Run the test — observe pass. `npx tsc --noEmit -p packages/core` (exit 0).
6. Run: `harness validate`
7. Commit: `feat(core): add resetEventLog (truncate + re-genesis) for event-sourced reset`

---

### Task 8: CLI compose helpers — `readHarnessState` + `emitCoreEvent`

**Depends on:** Task 7 | **Files:** `packages/cli/src/shared/state-events.ts`, `packages/cli/tests/shared/state-events.test.ts`
**Skills:** `gof-facade-pattern` (reference)

1. Write `state-events.test.ts`: (a) `readHarnessState` on a fresh project with a legacy `state.json` returns a `HarnessState` deep-equal to that file (genesis-then-read); (b) `emitCoreEvent` appends a `decision_recorded`, and a following `readHarnessState` includes it **unioned onto** the imported legacy decisions (no legacy loss); (c) both return the `Result` shape callers expect.
2. Run the test — observe failure (module absent).
3. Create the shared facade (single place where genesis composes with read/write; both MCP tools and CLI commands import it):

```ts
// packages/cli/src/shared/state-events.ts
import {
  importLegacyState,
  readSnapshot,
  toHarnessState,
  emitEvent,
  type HarnessState,
  type EventInput,
  type Result,
} from '@harness-engineering/core';

interface Scope {
  stream?: string | undefined;
  session?: string | undefined;
}

/** Authoritative read: genesis-import (idempotent) → snapshot → legacy-shaped HarnessState. */
export async function readHarnessState(
  projectPath: string,
  scope?: Scope
): Promise<Result<HarnessState, Error>> {
  const { Ok } = await import('@harness-engineering/core');
  await importLegacyState(projectPath, scope); // idempotent, memoized
  const snap = await readSnapshot(projectPath, scope);
  if (!snap.ok) return snap;
  return Ok(toHarnessState(snap.value.coreState));
}

/** Authoritative write: genesis-import first (so appends union onto legacy) → emit one event. */
export async function emitCoreEvent(
  projectPath: string,
  event: EventInput,
  scope?: Scope
): Promise<Result<{ seq: number; writerId: string }, Error>> {
  await importLegacyState(projectPath, scope); // capture legacy state before the first append
  return emitEvent(projectPath, event, scope);
}
```

> Verify exact `@harness-engineering/core` export names for `HarnessState`, `EventInput`, `Result`, `Ok` during execution; adjust imports to the real barrel surface.

4. Run the test — observe pass. `npx tsc --noEmit -p packages/cli` (exit 0).
5. Run: `harness validate`
6. Commit: `feat(cli): add readHarnessState + emitCoreEvent event-sourcing facade`

---

### Task 9: Convert W1 — `handleAppendEntry` global-decisions fallback (write)

**Depends on:** Task 8 | **Files:** `packages/cli/src/mcp/tools/state.ts`, `packages/cli/tests/mcp/tools/state.test.ts`, `packages/cli/tests/mcp/tools/state-sc1-guard.test.ts`

1. Add a parity test: `append_entry` with `section: 'decisions'`, no session, given `authorSkill`/`content`, then `readHarnessState` shows a decision with `decision === content`, `context === authorSkill`, a non-empty ISO `date`, and `target: 'global-state'` in the response — matching the legacy `{date, decision, context}` push shape.
2. Run the test — observe failure (still on `saveState`, but assert via the new read path which won't see the legacy `state.json` write).
3. Replace `state.ts:239-249` (the `loadState`/`push`/`saveState` block):

```ts
const { randomUUID } = await import('crypto');
const { emitCoreEvent } = await import('../../shared/state-events.js');
const r = await emitCoreEvent(
  projectPath,
  {
    type: 'decision_recorded',
    payload: { id: randomUUID(), text: input.content, context: input.authorSkill },
  },
  { stream: input.stream }
);
if (!r.ok) return resultToMcpResponse(r);
return resultToMcpResponse(Ok({ appended: true, target: 'global-state' }));
```

Remove the now-unused `loadState, saveState` import on line 239. 4. Run the parity test — observe pass. 5. Update the SC1 ratchet test: remove the `state.ts // W1` entry from `KNOWN_MUTATIONS`. Run it — green (W3 reset still keeps `state.ts` present). 6. Run: `harness validate` 7. Commit: `refactor(cli): emit decision_recorded for append_entry global fallback (W1)`

---

### Task 10: Convert W2 — `recordInteraction` (write)

**Depends on:** Task 9 | **Files:** `packages/cli/src/mcp/tools/interaction.ts`, `packages/cli/tests/mcp/tools/interaction.test.ts`, `packages/cli/tests/mcp/tools/state-sc1-guard.test.ts`

1. Add a parity test: invoke a `recordInteraction` round-trip, then `readHarnessState` shows a decision with `decision === '[type:id] <decision>'` and `context === 'pending user response'` — matching the legacy push exactly. (Failure-tolerant: like today, a state-recording error must remain non-fatal.)
2. Run the test — observe failure.
3. Replace `interaction.ts:370-380`:

```ts
const { emitCoreEvent } = await import('../../shared/state-events.js');
await emitCoreEvent(
  projectPath,
  {
    type: 'decision_recorded',
    payload: { id, text: `[${type}:${id}] ${decision}`, context: 'pending user response' },
  },
  { stream }
);
```

Keep the surrounding `try/catch` (recording failure stays non-fatal); the `id` parameter (the interaction id) is unique per interaction, so it doubles as the decision id. Remove the `loadState, saveState` import. 4. Run the parity test — observe pass. 5. Update the SC1 ratchet test: remove the `interaction.ts // W2` entry; drop the `interaction.ts`-present assertion. Run it — green. 6. Run: `harness validate` 7. Commit: `refactor(cli): emit decision_recorded from recordInteraction (W2)`

---

### Task 11: Convert W3 — `handleReset` (write) `[checkpoint:decision]`

**Depends on:** Task 10 | **Files:** `packages/cli/src/mcp/tools/state.ts`, `packages/cli/tests/mcp/tools/state.test.ts`, `packages/cli/tests/mcp/tools/state-sc1-guard.test.ts`

1. `[checkpoint:decision]` — Confirm the reset semantics mapping before implementing: **`reset` = truncate the log + clear snapshot/blobs + emit genesis `state_imported{ DEFAULT_STATE }`** (destructive; discards event history, matching the legacy wholesale wipe). Options: (A) truncate + re-genesis [recommended — in-catalog, semantics-preserving, no new event type]; (B) introduce a `state_reset` event type [out of Phase-3 scope, expands the catalog]; (C) leave `reset` on legacy `saveState` [violates SC1]. Proceed on approval of (A).
2. Add a parity test: seed some events, call `reset`, then `readHarnessState` deep-equals `DEFAULT_STATE`; response is `{ reset: true }`; a subsequent `importLegacyState` is a no-op (genesis present).
3. Run the test — observe failure.
4. Replace `handleReset` (state.ts:155-160):

```ts
async function handleReset(projectPath: string, input: StateInput) {
  const { resetEventLog } = await import('@harness-engineering/core');
  const result = await resetEventLog(projectPath, {
    stream: input.stream,
    session: input.session,
  });
  if (!result.ok) return resultToMcpResponse(result);
  return resultToMcpResponse(Ok({ reset: true }));
}
```

5. Run the parity test — observe pass.
6. Update the SC1 ratchet test: remove the `state.ts:reset // W3` entry → `KNOWN_MUTATIONS` is now `[]`. Run it — green (no `saveState` mutation in either file).
7. Run: `harness validate`
8. Commit: `refactor(cli): reset via event-log truncate + re-genesis (W3, SC1 writes done)`

---

### Task 12: Convert R1 — `handleShow` (read)

**Depends on:** Task 11 | **Files:** `packages/cli/src/mcp/tools/state.ts`, `packages/cli/tests/mcp/tools/state.test.ts`

1. Add a parity test: with a legacy `state.json` present, `manage_state show` returns the same `HarnessState` JSON it returned via `loadState` (genesis imports it; projection reproduces it).
2. Run the test — observe failure (or trivially passing if no events; ensure the fixture has a populated legacy file).
3. Replace `handleShow` (state.ts:104-107):

```ts
async function handleShow(projectPath: string, input: StateInput) {
  const { readHarnessState } = await import('../../shared/state-events.js');
  return resultToMcpResponse(
    await readHarnessState(projectPath, { stream: input.stream, session: input.session })
  );
}
```

4. Run the parity test — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(cli): read manage_state show from snapshot projection (R1)`

---

### Task 13: Convert R2 — `gather_context` state slice (read)

**Depends on:** Task 12 | **Files:** `packages/cli/src/mcp/tools/gather-context.ts`, `packages/cli/tests/mcp/tools/gather-context.test.ts`

1. Add a parity test: `gather_context` with `include: ['state']` returns the same state slice (`Result<HarnessState>` consumed identically downstream) as before.
2. Run the test — observe failure/regression risk.
3. Replace the `statePromise` (gather-context.ts:232-236) — keep it returning `Result<HarnessState>` so downstream `.ok`/`.value` handling is untouched:

```ts
const statePromise = includeSet.has('state')
  ? import('../../shared/state-events.js').then((m) =>
      m.readHarnessState(projectPath, { session: input.session })
    )
  : Promise.resolve(null);
```

(Preserve the existing scope semantics: `loadState(projectPath, undefined, input.session)` passed `session` only — keep `{ session: input.session }`.) 4. Run the parity test plus the existing `gather-context.test.ts` — observe pass. 5. Run: `harness validate` 6. Commit: `refactor(cli): gather_context reads state from snapshot projection (R2)`

---

### Task 14: Convert R3 — `state` MCP resource (read)

**Depends on:** Task 13 | **Files:** `packages/cli/src/mcp/resources/state.ts`, `packages/cli/tests/mcp/resources/state.test.ts` (create if absent)

1. Add a parity test: `getStateResource` returns the same stringified `HarnessState` JSON as before for a populated legacy file; the error/fallback branches still emit the default empty-state JSON.
2. Run the test — observe failure.
3. Convert `resources/state.ts` — keep the `migrateToStreams` call, swap the reader:

```ts
export async function getStateResource(projectRoot: string): Promise<string> {
  try {
    const { migrateToStreams } = await import('@harness-engineering/core');
    const { readHarnessState } = await import('../../shared/state-events.js');
    await migrateToStreams(projectRoot);
    const result = await readHarnessState(projectRoot);
    if (result.ok) return JSON.stringify(result.value, null, 2);
    return JSON.stringify({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  } catch {
    return JSON.stringify({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  }
}
```

4. Run the parity test — observe pass.
5. Run: `harness validate`
6. Commit: `refactor(cli): state MCP resource reads from snapshot projection (R3)`

---

### Task 15: Convert R4 — `state show` CLI command (read)

**Depends on:** Task 14 | **Files:** `packages/cli/src/commands/state/show.ts`, `packages/cli/tests/commands/state/show.test.ts` (create if absent)

1. Add a parity test: `state show` (text, `--json`, `--quiet`) prints the same fields/JSON as before for a populated legacy file.
2. Run the test — observe failure.
3. Convert `show.ts`: replace the `import { loadState }` and the `loadState(...)` call with the shared facade:

```ts
import { readHarnessState } from '../../shared/state-events';
// ...
const result = await readHarnessState(path.resolve(opts.path), { stream: opts.stream });
```

Keep `import type { HarnessState } from '@harness-engineering/core';` and the print helpers unchanged. 4. Run the parity test — observe pass. 5. Run: `harness validate` 6. Commit: `refactor(cli): state show CLI reads from snapshot projection (R4)`

---

### Task 16: Final SC1 guard (exact-zero) + deprecate `saveState`/`loadState` `[checkpoint:human-verify]`

**Depends on:** Task 15 | **Files:** `packages/cli/tests/mcp/tools/state-sc1-guard.test.ts`, `packages/core/src/state/state-persistence.ts`

1. Replace the ratchet assertion with the strict SC1 invariant: scanning `packages/cli/src` and `packages/core/src` for `saveState(` (excluding `state-persistence.ts` and `state/index.ts`) yields **zero** hits. Add a companion assertion that `loadState(` has zero production call sites too (all readers migrated, truth #5/SC8).
2. Run: `npx vitest run packages/cli/tests/mcp/tools/state-sc1-guard.test.ts` — observe pass (exact-zero).
3. Add `@deprecated` JSDoc to `saveState` and `loadState` in `state-persistence.ts` noting they are dead post-Phase-3 (no production callers; physical removal deferred to Phase 6). Do not delete — keeps the change reversible and avoids touching the barrel/external surface.
4. Run the full affected suites: `npx vitest run packages/cli/tests/ packages/core/tests/state/` — green.
5. Run: `harness validate` (baseline unchanged) and `harness check-deps` (no new circular deps).
6. `[checkpoint:human-verify]` — Phase 3 review: confirm SC1 (grep clean), SC7 (genesis idempotent + crash-safe), and parity across all 7 converted sites. Confirm `events.jsonl` is NOT retired and no lane-machine code was added (Phases 4–5 untouched).
7. Commit: `test(state): assert SC1 zero saveState mutations; deprecate saveState/loadState`

---

### Task 17: Integration — barrels + exports + final validate `[category: integration]`

**Depends on:** Task 16 | **Files:** generated barrels, `packages/core/src/state/event-sourcing/index.ts` (verify)

1. Regenerate barrels so the new `migrate.ts` exports (`importLegacyState`, `resetEventLog`) are picked up by the core public surface: run `pnpm generate:barrels` (or the repo's barrel script), then `pnpm generate:barrels:check` — green.
2. Confirm `@harness-engineering/core` re-exports `importLegacyState` and `resetEventLog` (used by `state.ts` reset + the CLI facade). Build if needed: `pnpm turbo build --filter=@harness-engineering/core --filter=@harness-engineering/cli`.
3. Run: `harness validate` and `harness check-deps` (only the 2 pre-existing circular deps remain).
4. Commit: `chore(core): regenerate barrels for event-sourcing migrate exports`

---

## Validation Trace (truth → task)

| Observable truth                    | Delivered by                                  |
| ----------------------------------- | --------------------------------------------- |
| SC1 (zero saveState mutations)      | Tasks 1, 9, 10, 11 (ratchet), 16 (exact-zero) |
| SC7 genesis idempotent + crash-safe | Task 6                                        |
| Parity — writes (W1/W2/W3)          | Tasks 9, 10, 11                               |
| Parity — reads (R1–R4)              | Tasks 12, 13, 14, 15                          |
| Snapshot hardening (carry-forward)  | Task 2                                        |
| DP1 vestigial field removed         | Tasks 3, 4, 5                                 |
| harness validate / barrels          | Tasks 16, 17                                  |

## Risks / Concerns (HIGH blast radius)

- **Irreversible step — `reset` truncates the log (Task 11).** Destroys event history for the scope by design (gated by `[checkpoint:decision]`). Recoverable only from git/backups, not from the log itself.
- **Mildly irreversible — genesis renames `state.json` → `state.json.imported` (Task 6).** Renamed, not deleted; recoverable. Gated by `[checkpoint:human-verify]`.
- **Cutover window.** Genesis→writes→reads ordering guarantees no lost writes (writes hit the authoritative log immediately); the only interim artifact is that un-converted readers (R1–R4) show stale data until their task lands. Low severity, recoverable, and no concurrent production writers are assumed during the cutover.
- **Scope coupling in `state.ts`.** Two mutation sites (W1 append, W3 reset) live in one file; the SC1 ratchet tracks them at sub-file granularity to keep each conversion independently green.
- **Cross-package export timing.** `resetEventLog`/`importLegacyState` must be barrel-exported before `state.ts`/facade import them; Task 17 regenerates barrels and a `turbo build` may be required for the CLI to resolve fresh core exports (known fresh-worktree hazard).
- **Out of scope (do not touch):** `events.jsonl` retirement (Phase 5), lane machine / `projectLanes` / `transitionLane` / `task-transition` action (Phase 4), AGENTS.md / ADRs / `.harness` layout docs (Phase 6).
  </content>
  </invoke>
