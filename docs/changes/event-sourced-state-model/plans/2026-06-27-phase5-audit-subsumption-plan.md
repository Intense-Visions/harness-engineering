# Plan: Phase 5 — Audit Subsumption (#580)

**Date:** 2026-06-27 | **Spec:** `docs/changes/event-sourced-state-model/proposal.md` (Phase 5) | **Tasks:** 17 | **Time:** ~70 min | **Integration Tier:** medium

> Phases 1–4 are complete: log core, core-state projection + snapshot (schemaVersion 2 with empty `audit` placeholder), write-path cutover, and the guarded lane machine. This plan covers **only** Phase 5 from the spec's Implementation Order: audit event types, retire `events.jsonl`, derive the observability timeline from the audit projection, update `gather_context`. It folds in **#580** (Append-Only Session Audit Trail).

## Goal

Make the unified authoritative event log the sole carrier of session provenance: add the three #580 audit event types, fill the `audit` subdocument via a pure `projectAudit` fold, derive the `gather_context` timeline from that projection, and retire the legacy born-deduplicated `events.jsonl` machinery — leaving `coreState`/`lanes` byte-identical.

## Observable Truths (Acceptance Criteria)

1. The event-sourcing schema validates three new additive event types — `user_input_captured`, `approval_requested`, `approval_resolved` — and **rejects** malformed audit payloads (`EventSchema.safeParse` → `success: false`). (SC: spec Event model → Audit events.)
2. `projectAudit(events)` is a pure fold returning `{ entries: AuditEntry[] }` ordered by `(seq asc, writerId asc)`; given a log with no audit events it returns `{ entries: [] }`; `reduce(events).audit` equals `projectAudit(events)` while `coreState` and `lanes` are **byte-identical** to Phase 4 output for the same log.
3. When `emit_interaction` records an interaction round-trip, the log persists a `user_input_captured` event (verbatim) plus matching `approval_requested` / `approval_resolved` events, all recoverable via `projectAudit(loadEvents(...))`. (SC5 / #580 subsumption proof.)
4. `gather_context` still returns a non-empty timeline string for a session with audit activity, now derived from the `audit` projection (`readSnapshot → formatAuditTimeline`), never from `events.jsonl`. (SC6.)
5. No production code path writes or reads `events.jsonl`; the legacy `emitEvent`/`loadEvents`/`formatEventTimeline`/`SkillEvent` surface in `packages/core/src/state/events.ts` is gone (or relocated per the Task 1 decision), and a guard test asserts it. (SC6, D5.)
6. `harness validate` passes (modulo the pre-existing, unrelated dashboard-token and drift/craft circular-dep findings noted below); the full `core` + `cli` test suites are green.

## Uncertainties

- **[BLOCKING → resolved by Task 1 checkpoint] Skill-lifecycle telemetry disposition.** The legacy `events.jsonl` carries TWO interleaved streams: (a) state/audit-adjacent events and (b) **skill-lifecycle telemetry** (`phase_transition`, `gate_result`, `handoff`, `error`, skill-invoked) emitted via `emitSkillEvent`. Stream (b) is consumed by **`packages/cli/src/hooks/adoption-tracker.js`**, which reads `.harness/events.jsonl` directly to reconstruct skill invocations into `.harness/metrics/adoption.jsonl`. D5 calls `events.jsonl` "observability-only and lossy by design," but the spec's Phase 5 does not name the adoption-tracker dependency. Retiring `events.jsonl` therefore cannot be a pure deletion — it regresses adoption telemetry. **Task 1 is a `[checkpoint:decision]`** to pick the disposition (relocate/rename vs. remove vs. defer). The recommended default (relocate the skill-telemetry stream to a renamed CLI-owned file) is encoded below.
- **[ASSUMPTION] Response-half wiring of the approval round-trip.** `emit_interaction` only sends the prompt; the current code has no in-tool path that observes the user's verbatim answer (the orchestrator has `interactions-resolve`, but that is out of Phase 5 scope). The plan emits `approval_requested` + `user_input_captured` at prompt time inside `recordInteraction`, and emits `approval_resolved` through an explicit resolution helper. **A second `[checkpoint:decision]`** in the interaction group confirms the production wiring point for the resolution helper; the SC5 test drives the full round-trip through the core helpers regardless, which is sufficient proof of the subsumption artifact.
- **[DEFERRABLE] Timeline richness.** The audit projection is sparser than the old skill-event timeline. The spec (SC6) only requires the timeline "still renders, now derived from the audit projection." `formatAuditTimeline` renders audit entries; enriching it with core/lane events is a future consideration, not built here.
- **[DEFERRABLE → Phase 6] Docs / ADRs / knowledge-graph and the `state.ts`/`skill.ts` telemetry call-site cleanup commentary.** Phase 6 owns docs. This plan only touches those call sites mechanically as required by the Task 1 disposition.

## Pre-existing validation state (not introduced by this plan)

- `harness validate` reports dashboard hardcoded-color/token findings (`packages/dashboard/src/client/**`).
- `harness check-deps` reports two circular deps (`cli/src/drift/**`, `cli/src/shared/craft/llm/**`).
  Both predate Phase 5 and are out of scope; every task's `harness validate` step is judged against this baseline.

## events.jsonl Caller Inventory (the retirement is a removal with callers)

Grep basis: `emitEvent` / `loadEvents` / `emitSkillEvent` / `formatEventTimeline` / `SkillEvent` / `events.jsonl` across `packages/`. Disambiguated from the **new** event-sourcing `emitEvent`/`loadEvents` (in `event-sourcing/log.ts`, file `state.events.jsonl`) and from unrelated `emitEvent` symbols (orchestrator base-ref callback; `feedback/config.ts` `emitEvents` flag; `design-craft/.../signal-events.jsonl`).

**Legacy machinery to retire** — `packages/core/src/state/events.ts`: `SkillEvent`, `SkillEventSchema`, `EmitEventInput`, `EmitEventOptions`, `EmitEventResult`, `LoadEventsOptions`, `EventType`, `emitEvent`, `loadEvents`, `formatEventTimeline`, `clearEventHashCache`. Re-exported from `packages/core/src/state/index.ts:146-159`. File-name constant `EVENTS_FILE = 'events.jsonl'` in `packages/core/src/state/constants.ts:15`.

| Caller                                                                                                             | Symbol                                                                  | Stream                   | Disposition                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `cli/src/mcp/tools/gather-context.ts:320,324`                                                                      | `loadEvents` + `formatEventTimeline`                                    | timeline read            | **Repoint** → `readSnapshot` + `formatAuditTimeline` (Task 11). The only legacy READ caller.                             |
| `cli/src/mcp/tools/event-emitter.ts:17-19`                                                                         | core `emitEvent` (via `emitSkillEvent`)                                 | skill telemetry WRITE    | **Decision (Task 1)**: relocate to renamed CLI-owned telemetry log / remove / defer.                                     |
| `cli/src/mcp/tools/state.ts:170,205,234,355,370`                                                                   | `emitSkillEvent` (`error`,`gate_result`,`handoff`,`phase_transition`×2) | skill telemetry          | Follows Task 1 disposition (Task 12).                                                                                    |
| `cli/src/mcp/tools/interaction.ts:291,297`                                                                         | `emitSkillEvent` (`phase_transition`,`handoff`)                         | skill telemetry          | Follows Task 1 disposition (Task 12).                                                                                    |
| `cli/src/mcp/tools/skill.ts:150`                                                                                   | `emitSkillEvent` (skill-invoked)                                        | skill telemetry          | Follows Task 1 disposition (Task 12).                                                                                    |
| **`cli/src/hooks/adoption-tracker.js:143-195`**                                                                    | **direct `readFileSync('.harness/events.jsonl')`**                      | skill telemetry CONSUMER | **The real blocker.** Reconstructs skill invocations → `adoption.jsonl`. Must be repointed/removed per Task 1 (Task 12). |
| `cli/src/shared/state-events.ts:8` (comment), `cli/src/templates/post-write.ts:81` (gitignore line `events.jsonl`) | doc/comment/ignore                                                      | —                        | Mechanical cleanup (Task 13/14).                                                                                         |
| `core/state/index.ts:146-159`                                                                                      | barrel re-exports                                                       | —                        | Remove (Task 13).                                                                                                        |

**Not affected (false-positive symbols):** `orchestrator/src/orchestrator.ts:347`, `orchestrator/src/workspace/manager.ts` (`emitBaseRefFallbackEvent` callback); `core/feedback/config.ts` (`emitEvents` boolean); `core/feedback/logging/emitter.ts`; `cli/design-craft/measurement/signal.ts` (`signal-events.jsonl`); `core/telemetry/trajectory.ts` (consumes Claude-Code `AgentEvent` snapshots with `usage`, **not** `SkillEvent`); `core/adoption/reader.ts` + `command-telemetry.ts` (read/write `adoption.jsonl`, a different file).

**Recommended Task 1 disposition (default unless the checkpoint overrides):** Relocate the skill-telemetry stream out of the retired `core/state/events.ts` into a self-contained CLI-owned writer that appends to `.harness/metrics/skill-events.jsonl` (renamed away from `events.jsonl`); update `adoption-tracker.js` to read the renamed file. This satisfies "no production code writes/reads `events.jsonl`" **and** preserves adoption telemetry, keeping the audit/state log authoritative without a behavior regression.

## File Map

- MODIFY `packages/core/src/state/event-sourcing/events.ts` (add 3 audit payloads + union members + `StoredEventSchema` enum + `EventInput`)
- CREATE `packages/core/src/state/event-sourcing/projections/audit.ts` (`AuditEntry`, `AuditProjection`, `projectAudit`, `formatAuditTimeline`)
- MODIFY `packages/core/src/state/event-sourcing/snapshot.ts` (import `projectAudit`/`AuditProjection` from projection; `reduce()` calls `projectAudit`; drop placeholder `AuditProjection`)
- MODIFY `packages/core/src/state/event-sourcing/index.ts` (export `projectAudit`, `AuditEntry`, `formatAuditTimeline`; repoint `AuditProjection`; reconcile Phase-1 namespacing note)
- CREATE `packages/core/tests/state/event-sourcing/projections/audit.test.ts`
- MODIFY `packages/core/tests/state/event-sourcing/events.test.ts` (audit schema cases)
- MODIFY `packages/core/tests/state/event-sourcing/snapshot.test.ts` (audit populated; core/lanes unchanged)
- MODIFY `packages/cli/src/shared/state-events.ts` (audit emit helpers + `readAuditTimeline`)
- MODIFY `packages/cli/src/mcp/tools/interaction.ts` (`recordInteraction` emits audit; resolution helper)
- MODIFY `packages/cli/src/mcp/tools/gather-context.ts` (timeline → audit projection)
- MODIFY `packages/cli/tests/mcp/tools/interaction.test.ts` (SC5 round-trip)
- MODIFY `packages/cli/tests/mcp/tools/gather-context.test.ts` (timeline parity / still renders)
- DELETE `packages/core/src/state/events.ts` (legacy machinery) — or gut per Task 1
- MODIFY `packages/core/src/state/index.ts` (remove legacy re-exports)
- MODIFY `packages/core/src/state/constants.ts` (remove `EVENTS_FILE`)
- MODIFY `packages/cli/src/mcp/tools/event-emitter.ts` (per Task 1 disposition)
- MODIFY `packages/cli/src/mcp/tools/state.ts`, `interaction.ts`, `skill.ts` (per Task 1 disposition)
- MODIFY `packages/cli/src/hooks/adoption-tracker.js` (per Task 1 disposition)
- CREATE `packages/cli/tests/mcp/tools/events-jsonl-retired.guard.test.ts` (no production write/read of `events.jsonl`)
- MODIFY `packages/cli/src/templates/post-write.ts` (gitignore line)
- (relocation path only) CREATE `packages/cli/src/mcp/tools/skill-telemetry.ts` + test

## Skeleton (rigor: standard, 17 tasks ≥ 8 → skeleton produced)

1. Enumerate legacy callers + decide skill-telemetry/adoption-tracker disposition — `[checkpoint:decision]` (~1 task, ~5 min)
2. Audit event schema (core) (~1 task, ~6 min)
3. `projectAudit` fold + `formatAuditTimeline` (core) (~3 tasks, ~15 min)
4. Snapshot/barrel wiring of audit projection (core) (~2 tasks, ~10 min)
5. Interaction audit emission + resolution round-trip — includes `[checkpoint:decision]` (~3 tasks, ~14 min)
6. Timeline repoint of `gather_context` (cli) (~2 tasks, ~9 min)
7. Retire `events.jsonl` machinery + execute disposition + guard (~4 tasks, ~16 min)
8. Final validate + suite + reconciliation — `[checkpoint:human-verify]` (~1 task, ~5 min)

_Skeleton approved: pending (covered by the final plan sign-off)._

## Tasks

### Task 1: Enumerate legacy callers and decide the skill-telemetry / adoption-tracker disposition

**Depends on:** none | **Files:** none (analysis + decision) | **Category:** integration

`[checkpoint:decision]` This is the riskiest part of Phase 5 — a removal with a live downstream consumer (`adoption-tracker.js`).

1. Re-run the caller grep to confirm the inventory is still current:
   `grep -rn "emitEvent\|loadEvents\|emitSkillEvent\|formatEventTimeline\|SkillEvent\|events\.jsonl" packages/ --include="*.ts" --include="*.js" | grep -v node_modules | grep -v "/dist/"`
2. Present the disposition decision (use `emit_interaction` type `question`):
   - **A) Relocate + rename (recommended).** Move skill-telemetry emit/format into a CLI-owned `skill-telemetry.ts` writing `.harness/metrics/skill-events.jsonl`; repoint `adoption-tracker.js`. _Pros:_ retires `events.jsonl`, preserves adoption telemetry, no behavior regression. _Cons:_ touches 6 files; mild scope. _Risk:_ medium.
   - **B) Remove skill-telemetry.** Delete the `emitSkillEvent` calls and the `adoption-tracker.js` events.jsonl branch outright. _Pros:_ smallest diff, fully honors D5 "lossy/observability-only." _Cons:_ regresses adoption telemetry input. _Risk:_ medium-high.
   - **C) Defer.** Keep `emitSkillEvent` writing to a renamed file via a thin shim, defer the adoption-tracker rewrite to a follow-up. _Pros:_ unblocks the audit work now. _Cons:_ leaves a partial retirement. _Risk:_ low.
   - **Recommendation:** A (confidence: medium).
3. Record the chosen disposition into the session `decisions` via `manage_state` (section `decisions`).
4. Run: `harness validate`
5. No commit (analysis only); the decision is consumed by Tasks 12–14.

> Tasks 2–11 are **independent of this decision** and can proceed in parallel with awaiting the checkpoint.

---

### Task 2: Add the three audit event types to the event-sourcing schema (additive)

**Depends on:** none | **Files:** `packages/core/src/state/event-sourcing/events.ts`, `packages/core/tests/state/event-sourcing/events.test.ts`

1. In `events.test.ts`, add cases (write first, observe failure):
   - `EventSchema.safeParse` succeeds for a well-formed `user_input_captured` event (`payload: { text: 'hi', interactionId: 'i1' }`), an `approval_requested` (`{ interactionId, kind, prompt }`), and an `approval_resolved` (`{ interactionId, response }`), each with a full envelope (`seq`, `writerId`, `timestamp`, `scope`).
   - `EventSchema.safeParse` **fails** for `approval_requested` missing `prompt`, and for `user_input_captured` with a non-string `text`.
   - `StoredEventSchema` accepts each new `type` (relaxed payload).
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/events.test.ts` — observe failure.
3. In `events.ts`, after `SessionSummarizedPayload`, add:
   ```ts
   // --- Phase 5: audit-trail vocabulary (subsumes #580), additive ---
   const UserInputCapturedPayload = z.object({
     text: z.string(),
     interactionId: z.string().optional(),
   });
   const ApprovalRequestedPayload = z.object({
     interactionId: z.string().min(1),
     kind: z.string().min(1),
     prompt: z.string(),
   });
   const ApprovalResolvedPayload = z.object({
     interactionId: z.string().min(1),
     response: z.string(),
   });
   ```
4. Add three members to the `EventSchema` discriminated union (mirroring the existing members):
   ```ts
   z.object({ ...envelopeShape, type: z.literal('user_input_captured'), payload: UserInputCapturedPayload }),
   z.object({ ...envelopeShape, type: z.literal('approval_requested'), payload: ApprovalRequestedPayload }),
   z.object({ ...envelopeShape, type: z.literal('approval_resolved'), payload: ApprovalResolvedPayload }),
   ```
5. Add the three literals to `StoredEventSchema`'s `z.enum([...])`.
6. Add three arms to the `EventInput` union:
   ```ts
   | { type: 'user_input_captured'; payload: z.infer<typeof UserInputCapturedPayload> }
   | { type: 'approval_requested'; payload: z.infer<typeof ApprovalRequestedPayload> }
   | { type: 'approval_resolved'; payload: z.infer<typeof ApprovalResolvedPayload> };
   ```
7. Run: `npx vitest run packages/core/tests/state/event-sourcing/events.test.ts` — observe pass.
8. Run: `harness validate`
9. Commit: `feat(event-sourcing): add audit event types (user_input_captured, approval_*) — #580`

---

### Task 3: Create `projectAudit` fold (pure projection)

**Depends on:** Task 2 | **Files:** `packages/core/src/state/event-sourcing/projections/audit.ts`, `packages/core/tests/state/event-sourcing/projections/audit.test.ts`

1. Create `audit.test.ts` (write first):
   - empty log → `{ entries: [] }`.
   - a log with `approval_requested` then `approval_resolved` then `user_input_captured` (assigned out-of-order `seq`s) → `entries` sorted by `(seq asc, writerId asc)`, each entry carrying `{ seq, timestamp, kind, interactionId, text }` where `text` is the verbatim `prompt`/`response`/`text` respectively.
   - non-audit events (`decision_recorded`, `lane_transitioned`) are ignored (do not appear in `entries`).
   - order-independence: shuffling the input array yields an identical projection (mirror the `lanes.test.ts` pattern).
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/projections/audit.test.ts` — observe failure.
3. Create `audit.ts`:

   ```ts
   // packages/core/src/state/event-sourcing/projections/audit.ts
   //
   // Phase 5: pure fold of audit events (user_input_captured + approval_requested +
   // approval_resolved) into the append-only session audit trail (subsumes #580).
   // Mirrors lanes.ts: defensively copies + sorts by (seq, writerId), no IO, order-independent.
   import type { Event } from '../events';

   export type AuditKind = 'user_input_captured' | 'approval_requested' | 'approval_resolved';

   export interface AuditEntry {
     seq: number;
     timestamp: string;
     kind: AuditKind;
     interactionId?: string;
     /** Verbatim text: the captured user input, the approval prompt, or the response. */
     text: string;
   }
   export interface AuditProjection {
     entries: AuditEntry[];
   }

   /** Deterministic total order: (seq asc, writerId asc) — identical to loadEvents. */
   function bySeqThenWriter(a: Event, b: Event): number {
     return a.seq - b.seq || (a.writerId < b.writerId ? -1 : a.writerId > b.writerId ? 1 : 0);
   }

   export function projectAudit(events: Event[]): AuditProjection {
     const sorted = [...events].sort(bySeqThenWriter);
     const entries: AuditEntry[] = [];
     for (const event of sorted) {
       if (event.type === 'user_input_captured') {
         const e: AuditEntry = {
           seq: event.seq,
           timestamp: event.timestamp,
           kind: 'user_input_captured',
           text: event.payload.text,
         };
         if (event.payload.interactionId !== undefined)
           e.interactionId = event.payload.interactionId;
         entries.push(e);
       } else if (event.type === 'approval_requested') {
         entries.push({
           seq: event.seq,
           timestamp: event.timestamp,
           kind: 'approval_requested',
           interactionId: event.payload.interactionId,
           text: event.payload.prompt,
         });
       } else if (event.type === 'approval_resolved') {
         entries.push({
           seq: event.seq,
           timestamp: event.timestamp,
           kind: 'approval_resolved',
           interactionId: event.payload.interactionId,
           text: event.payload.response,
         });
       }
     }
     return { entries };
   }
   ```

4. Run: `npx vitest run packages/core/tests/state/event-sourcing/projections/audit.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(event-sourcing): projectAudit fold for the session audit trail — #580`

---

### Task 4: Add `formatAuditTimeline` (the derived observability timeline)

**Depends on:** Task 3 | **Files:** `packages/core/src/state/event-sourcing/projections/audit.ts`, `packages/core/tests/state/event-sourcing/projections/audit.test.ts`

1. Add to `audit.test.ts` (write first):
   - empty projection → `''`.
   - a projection with the three kinds → a newline-joined string, most-recent-last, each line `- HH:MM [<kind>] <text>` (truncating `text`), capped at `limit` entries (default 20). Mirror the legacy `formatEventTimeline` shape so existing display expectations hold.
2. Run the audit test — observe failure.
3. Add to `audit.ts`:

   ```ts
   const KIND_LABEL: Record<AuditKind, string> = {
     user_input_captured: 'input',
     approval_requested: 'approval?',
     approval_resolved: 'approval=',
   };

   function hhmm(timestamp: string): string {
     try {
       const d = new Date(timestamp);
       return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
     } catch {
       return '??:??';
     }
   }

   /** Compact timeline for gather_context, derived from the audit projection (replaces formatEventTimeline). */
   export function formatAuditTimeline(audit: AuditProjection, limit = 20): string {
     if (audit.entries.length === 0) return '';
     return audit.entries
       .slice(-limit)
       .map((e) => {
         const text = e.text.length > 80 ? `${e.text.slice(0, 77)}...` : e.text;
         return `- ${hhmm(e.timestamp)} [${KIND_LABEL[e.kind]}] ${text}`;
       })
       .join('\n');
   }
   ```

4. Run the audit test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(event-sourcing): formatAuditTimeline derives the observability timeline — #580`

---

### Task 5: Wire `projectAudit` into `reduce()` and reconcile the Snapshot type

**Depends on:** Task 3 | **Files:** `packages/core/src/state/event-sourcing/snapshot.ts`, `packages/core/tests/state/event-sourcing/snapshot.test.ts`

1. In `snapshot.test.ts` (write first):
   - `reduce(eventsWithAudit).audit` deep-equals `projectAudit(eventsWithAudit)`.
   - For a log with NO audit events, `reduce(log).coreState` and `reduce(log).lanes` are **byte-identical** (`JSON.stringify` equality) to the Phase-4 baseline — proves additivity.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/snapshot.test.ts` — observe failure.
3. In `snapshot.ts`:
   - Replace the local placeholder `AuditProjection` interface and its DP2 comment with an import + re-export:
     ```ts
     import { projectAudit, type AuditProjection } from './projections/audit';
     export type { AuditProjection };
     ```
   - In `reduce()`, replace `audit: {}, // Phase 5: extended additively` with `audit: projectAudit(events),`.
   - Leave `coreState`/`lanes`/`meta` lines untouched.
4. Run: `npx vitest run packages/core/tests/state/event-sourcing/snapshot.test.ts` — observe pass.
5. Run the property + parity suites to confirm `reduce === readSnapshot` still holds:
   `npx vitest run packages/core/tests/state/event-sourcing/snapshot.property.test.ts packages/core/tests/state/event-sourcing/replay-order.test.ts`
6. Run: `harness validate`
7. Commit: `feat(event-sourcing): populate snapshot.audit via projectAudit — #580`

---

### Task 6: Update the event-sourcing barrel and reconcile the Phase-1 namespacing note

**Depends on:** Task 5 | **Files:** `packages/core/src/state/event-sourcing/index.ts` | **Category:** integration

1. In `index.ts`:
   - Change `export type { Snapshot, AuditProjection } from './snapshot';` to keep `Snapshot` from `./snapshot` and add the audit surface from the projection:
     ```ts
     export type { Snapshot } from './snapshot';
     export { projectAudit, formatAuditTimeline } from './projections/audit';
     export type { AuditProjection, AuditEntry, AuditKind } from './projections/audit';
     ```
   - Update the Phase-5 placeholder comment (lines 16–17) to reflect that `audit` is now a real projection.
2. Run: `npx vitest run packages/core/tests/state/event-sourcing/` (full module suite) — observe pass.
3. Regenerate barrels if the repo tracks generated registries: `harness validate` will surface drift; if a barrel/registry generator exists, run it and re-stage.
4. Run: `harness validate`
5. Commit: `chore(event-sourcing): export audit projection from the barrel — #580`

---

### Task 7: Add audit emit + resolution helpers to the CLI state-events compose point

**Depends on:** Task 6 | **Files:** `packages/cli/src/shared/state-events.ts`, `packages/cli/tests/shared/state-events.test.ts` (create if absent)

1. Write a test (first) asserting that `emitApprovalRequested` + `emitUserInputCaptured` + `emitApprovalResolved` each append an event recoverable via `eventSourcing.loadEvents`, and that `readAuditTimeline` returns a non-empty string after a round-trip and `''` for an empty log.
2. Run the test — observe failure.
3. In `state-events.ts`, add to the destructure: `formatAuditTimeline`, and add helpers built on the existing `emitCoreEvent` pattern (genesis-import-then-append):
   ```ts
   export async function emitUserInputCaptured(
     projectPath: string,
     text: string,
     interactionId?: string,
     scope?: Scope
   ) {
     const payload: eventSourcing.EventInput['payload'] = interactionId
       ? { text, interactionId }
       : { text };
     return emitCoreEvent(
       projectPath,
       { type: 'user_input_captured', payload } as eventSourcing.EventInput,
       scope
     );
   }
   export async function emitApprovalRequested(
     projectPath: string,
     interactionId: string,
     kind: string,
     prompt: string,
     scope?: Scope
   ) {
     return emitCoreEvent(
       projectPath,
       { type: 'approval_requested', payload: { interactionId, kind, prompt } },
       scope
     );
   }
   export async function emitApprovalResolved(
     projectPath: string,
     interactionId: string,
     response: string,
     scope?: Scope
   ) {
     return emitCoreEvent(
       projectPath,
       { type: 'approval_resolved', payload: { interactionId, response } },
       scope
     );
   }
   export async function readAuditTimeline(projectPath: string, scope?: Scope): Promise<string> {
     const snap = await readSnapshot(projectPath, scope);
     if (!snap.ok) return '';
     return formatAuditTimeline(snap.value.audit);
   }
   ```
   (Destructure `readSnapshot`/`formatAuditTimeline` from `eventSourcing` at the top, alongside the existing `readSnapshot`.)
4. Run the test — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): audit emit + readAuditTimeline helpers on the state-events compose point — #580`

---

### Task 8: Decide and confirm the response-half wiring point

**Depends on:** Task 7 | **Files:** none (decision) | **Category:** integration

`[checkpoint:decision]` Confirm where `approval_resolved` + the response-side `user_input_captured` are emitted in production (the prompt side is settled: `recordInteraction`). Present options via `emit_interaction` type `question`:

- **A)** Emit on the next `manage_state` decision update that references the interaction id (the existing `'pending user response'` decision is resolved). _Risk:_ low.
- **B)** Add an explicit `emit_interaction` resolution mode/parameter carrying the verbatim answer. _Risk:_ medium (schema surface change).
- **C)** Capture verbatim user input via a `UserPromptSubmit` hook (broadest #580 reading). _Risk:_ medium (new hook), likely Phase 6.
- **Recommendation:** A for `approval_resolved`; the SC5 test drives the round-trip through the Task 7 helpers regardless (confidence: medium).

1. Present the decision; record it to session `decisions`.
2. Run: `harness validate`
3. No commit.

---

### Task 9: Emit audit events from `recordInteraction` (prompt side) + SC5 round-trip test

**Depends on:** Task 7, Task 8 | **Files:** `packages/cli/src/mcp/tools/interaction.ts`, `packages/cli/tests/mcp/tools/interaction.test.ts`

1. In `interaction.test.ts` (write first) — the **SC5 subsumption proof**:
   - Drive a round-trip: call `handleEmitInteraction` with a `confirmation` (records the prompt), then invoke the resolution helper (per Task 8) with a verbatim response.
   - Assert `projectAudit(await eventSourcing.loadEvents(projectPath, { stream }))` recovers a `user_input_captured`, an `approval_requested` (verbatim prompt), and an `approval_resolved` (verbatim response) sharing the interaction `id`.
2. Run: `npx vitest run packages/cli/tests/mcp/tools/interaction.test.ts` — observe failure.
3. In `recordInteraction`, alongside the existing `emitCoreEvent('decision_recorded')`, add (non-fatal, same try block):
   ```ts
   const { emitApprovalRequested, emitUserInputCaptured } =
     await import('../../shared/state-events.js');
   await emitUserInputCaptured(projectPath, decision, id, { stream });
   await emitApprovalRequested(projectPath, id, type, decision, { stream });
   ```
   Wire the resolution helper (`emitApprovalResolved`) at the Task-8 decided point.
4. Run: `npx vitest run packages/cli/tests/mcp/tools/interaction.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): emit_interaction persists the #580 audit round-trip — closes #580`

---

### Task 10: Repoint `gather_context` timeline to the audit projection

**Depends on:** Task 7 | **Files:** `packages/cli/src/mcp/tools/gather-context.ts`, `packages/cli/tests/mcp/tools/gather-context.test.ts`

1. In `gather-context.test.ts` (write first): after a session has audit activity, the gather_context result's timeline/events field is a non-empty string and matches `readAuditTimeline` output; with no audit activity it is empty. Assert it does NOT depend on `events.jsonl` (no such file written/read).
2. Run: `npx vitest run packages/cli/tests/mcp/tools/gather-context.test.ts` — observe failure.
3. In `gather-context.ts`, replace the `eventsPromise` body (lines ~318–326):
   ```ts
   const eventsPromise = shouldIncludeEvents
     ? import('../../shared/state-events.js').then((m) =>
         m.readAuditTimeline(projectPath, { session: input.session })
       )
     : Promise.resolve(null);
   ```
   Remove the now-dead `core.loadEvents` / `core.formatEventTimeline` usage here.
4. Run: `npx vitest run packages/cli/tests/mcp/tools/gather-context.test.ts packages/cli/tests/mcp/tools/gather-context-session.test.ts packages/cli/tests/mcp/tools/gather-context-extra.test.ts` — observe pass.
5. Run: `harness validate`
6. Commit: `feat(cli): gather_context timeline derives from the audit projection — #580 SC6`

---

### Task 11: Execute the Task 1 disposition for the skill-telemetry stream + adoption-tracker

**Depends on:** Task 1 | **Files:** per chosen disposition (default A): CREATE `packages/cli/src/mcp/tools/skill-telemetry.ts` (+ test); MODIFY `event-emitter.ts`, `state.ts`, `interaction.ts`, `skill.ts`, `packages/cli/src/hooks/adoption-tracker.js` | **Category:** integration

> Default = Disposition A (relocate + rename). If the checkpoint chose B or C, follow that branch instead and adjust the guard test (Task 14) accordingly.

1. (A) Write a test for `skill-telemetry.ts`: `emitSkillEvent(projectPath, evt)` appends one JSONL line to `.harness/metrics/skill-events.jsonl`; never throws.
2. Run — observe failure.
3. (A) Create `skill-telemetry.ts` owning the `EmitEventInput`-shaped record write to `.harness/metrics/skill-events.jsonl` (self-contained; no dependency on `core/state/events.ts`). Repoint `event-emitter.ts`'s `emitSkillEvent` to it (keep the same exported signature so `state.ts`/`interaction.ts`/`skill.ts` call sites are unchanged).
4. (A) Update `adoption-tracker.js`: change the read path from `.harness/events.jsonl` to `.harness/metrics/skill-events.jsonl` (line ~144) and its skipping/log message; keep the reconstruction logic intact.
5. Run: `npx vitest run packages/cli/tests/` for the affected tool/hook tests — observe pass.
6. Run: `harness validate`
7. Commit: `refactor(cli): relocate skill-telemetry off events.jsonl to metrics/skill-events.jsonl — #580 D5`

---

### Task 12: Delete the legacy `events.ts` machinery and its core barrel exports

**Depends on:** Task 10, Task 11 | **Files:** DELETE `packages/core/src/state/events.ts`; MODIFY `packages/core/src/state/index.ts`, `packages/core/src/state/constants.ts` | **Category:** integration

1. Confirm no remaining importer of the legacy surface:
   `grep -rn "formatEventTimeline\|SkillEvent\|clearEventHashCache\|EVENTS_FILE\|from './events'\|from '../events'" packages/core/src packages/cli/src --include="*.ts" | grep -v event-sourcing`
   (Expected: only `core/state/index.ts` re-exports + `constants.ts` definition remain.)
2. Delete `packages/core/src/state/events.ts`.
3. In `core/state/index.ts`, remove the `export { emitEvent, loadEvents, formatEventTimeline, SkillEventSchema, clearEventHashCache } from './events';` block and the `export type { SkillEvent, EventType, EmitEventInput, EmitEventOptions, EmitEventResult, LoadEventsOptions } from './events';` block (lines ~143–159). Update the now-stale "namespaced to avoid colliding ... retired in Phase 5" comment on the `eventSourcing` export to state the collision is resolved.
4. In `core/state/constants.ts`, remove `export const EVENTS_FILE = 'events.jsonl';`.
5. Delete the legacy test file if present: `packages/core/tests/state/events.test.ts` (the SkillEvent tests).
6. Run: `npx vitest run packages/core` — observe pass (typecheck surfaces any missed importer).
7. Run: `harness validate`
8. Commit: `refactor(core): retire legacy events.jsonl machinery — #580 D5`

---

### Task 13: Mechanical cleanup of `events.jsonl` references

**Depends on:** Task 12 | **Files:** `packages/cli/src/templates/post-write.ts`, `packages/cli/src/shared/state-events.ts` (comment) | **Category:** integration

1. In `post-write.ts`, update the gitignore template: under Disposition A, replace the bare `events.jsonl` ignore line with `metrics/skill-events.jsonl` (and keep `state.events.jsonl` ignored, already covered). Under B, remove the line.
2. In `state-events.ts`, fix the now-inaccurate comment referencing "the legacy top-level `emitEvent`/`loadEvents` are the skill-event log."
3. If a template-snapshot test guards `post-write.ts`, update the snapshot.
4. Run: `harness validate`
5. Commit: `chore(cli): scrub stale events.jsonl references — #580`

---

### Task 14: Guard test — `events.jsonl` is never written or read by production code

**Depends on:** Task 12, Task 13 | **Files:** `packages/cli/tests/mcp/tools/events-jsonl-retired.guard.test.ts`

1. Write the guard test (no implementation needed — it asserts the post-retirement state):
   - A source-scan assertion: no `.ts`/`.js` under `packages/*/src` (excluding tests, `state.events.jsonl`, `signal-events.jsonl`, `adoption.jsonl`, and — under Disposition A — `skill-events.jsonl`) contains the literal `'events.jsonl'` as a path. Implement by walking `src` dirs and asserting the legacy bare filename is absent.
   - A behavioral assertion: run a full `emit_interaction` round-trip + a `manage_state` mutation in a temp project and assert `fs.existsSync('.harness/events.jsonl') === false`.
2. Run: `npx vitest run packages/cli/tests/mcp/tools/events-jsonl-retired.guard.test.ts` — observe pass.
3. Run: `harness validate`
4. Commit: `test(cli): guard that events.jsonl is retired from production paths — #580 SC6`

---

### Task 15: Update `manage_state` action reference comment (if the audit emit surfaces there)

**Depends on:** Task 9 | **Files:** `packages/cli/src/mcp/tools/state.ts` (comments only) | **Category:** integration

1. If Task 8 wired `approval_resolved` through a `manage_state` decision update, add a short comment at that action documenting the audit emission. (No behavior change beyond Task 8/9; comment-only.)
2. Run: `harness validate`
3. Commit: `docs(cli): note audit emission on the manage_state decision path — #580`

> If Task 8 did not route through `manage_state`, skip this task.

---

### Task 16: Full suite + parity reconciliation

**Depends on:** Task 14 | **Files:** none

1. Run the full core + cli suites:
   `npx vitest run packages/core packages/cli`
2. Confirm green (excluding any pre-existing unrelated failures on `main`; cross-check `.harness/failures.md` and recent CI).
3. Run: `harness validate` and `harness check-deps` — confirm no NEW findings beyond the pre-existing dashboard-token + drift/craft circular-dep baseline.
4. No commit (verification).

---

### Task 17: Final human verification of the #580 subsumption artifact

**Depends on:** Task 16 | **Files:** none | **Category:** integration

`[checkpoint:human-verify]` Show: (a) the SC5 round-trip test output proving `projectAudit` recovers the three audit events; (b) `gather_context` rendering a timeline with no `events.jsonl` present; (c) the guard test green. On confirmation, the #580 roadmap row is closed (per SC5). Pause for human confirmation before considering Phase 5 done.

## Sequencing Notes

- **Critical path:** 2 → 3 → 5 → 6 → 7 → (9 ‖ 10) → 12 → 14 → 16 → 17.
- **Parallelizable:** Task 1 (decision) runs alongside Tasks 2–10 (audit + interaction + timeline are independent of the telemetry disposition). Task 11 depends only on Task 1. Tasks 9 and 10 are independent (different files) once Task 7 lands.
- **Riskiest task:** Task 11 + Task 12 (the `events.jsonl` retirement) — gated behind the Task 1 checkpoint and the Task 12 importer-grep; deliberately sequenced after the timeline repoint (Task 10) so the only legacy READ caller is already migrated before deletion.

## Integration Tier: medium

New exports (`projectAudit`, `formatAuditTimeline`, audit event types/`AuditProjection`/`AuditEntry`), new feature within existing packages, ~12–18 files, barrel regeneration, `manage_state`/`gather_context` behavior repoint. No new package, no new public CLI surface. Docs/ADRs/knowledge-graph are explicitly Phase 6, not here.
