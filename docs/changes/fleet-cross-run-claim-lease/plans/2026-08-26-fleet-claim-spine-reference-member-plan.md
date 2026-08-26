# Plan: Cross-run claim lease — Phase 2 (Spine + reference member)

**Date:** 2026-08-26 | **Spec:** `docs/changes/fleet-cross-run-claim-lease/proposal.md` (§Implementation Order → Phase 2) | **Tasks:** 6 | **Time:** ~26 min | **Integration Tier:** medium

## Goal

State the cross-run work-claim lease once in the `-fleet` family spine, wire its full SELECT → CLAIM → HEARTBEAT → RELEASE lifecycle into `roadmap-fleet` as the reference implementation, and prove the claim-lifecycle logic (SC1/SC3/SC4) with a two-runner simulation over the pure core primitive.

## Scope boundary (this phase only)

- **In scope:** the spine section in `docs/reference/fleet-family.md`; the `roadmap-fleet` SELECT + DISPATCH wiring (reference member only); a pure SELECT-composition helper co-located with the `fleet/claims` module; the two-runner integration test (SC1/SC3/SC4); the barrel/plugin/mirror regeneration those changes require.
- **Out of scope (later phases):** `issue-fleet` / `pr-fleet` wiring and Phase 3 flags roll-out; the family claim-lease **ADR** and `fleet-command` flag pass-through and `AGENTS.md` pointer (Phase 4). The spine section therefore references the family ADR as **forthcoming (Phase 4)** and pins no number — `0103` is now taken by Item-type routing (#1506), so the ADR will take the next free number when Phase 4 authors it.

## Prior-phase baseline (verified, build on — do not re-create)

Phase 1 shipped and committed the pure primitive. Confirmed by reading the tree:

- `packages/types/src/fleet-claim.ts` → `FleetClaim` + `FleetClaimSchema` + `FLEET_CLAIM_VERSION`, exported from `packages/types/src/index.ts:452-453`.
- `packages/core/src/fleet/claims/index.ts` → `buildClaimBody`, `parseClaimComment`, `isLeaseLive`, `CLAIM_LABEL` (`'fleet:claimed'`), `CLAIM_MARKER`, `DEFAULT_LEASE_SECONDS` (720), `HEARTBEAT_SECONDS` (240) — pure, offline, no `gh`/fs.
- `packages/core/src/fleet/index.ts` → `export * from './claims';`; core index `export * from './fleet'`; `fleet` is already in the core-barrel `DIR_COMMENTS` allowlist (`scripts/generate-core-barrel.mjs:149`). So a new file inside `fleet/claims` needs only a manual `export * from './select'` in `claims/index.ts` — **no** core-barrel-allowlist edit.
- Co-located test convention: `packages/core/src/fleet/claims/index.test.ts` (vitest).
- `docs/reference/fleet-family.md` already contains a `## Item-type routing (build-shaped members)` section (PR #1506) and a `## References` list ending at **ADR 0103** — the new section must slot in cleanly WITHOUT disturbing either.
- Platform mirrors are **symlinks**: `agents/skills/{cursor,codex,gemini-cli}/roadmap-fleet -> ../claude-code/roadmap-fleet` (verified). Editing `claude-code/roadmap-fleet/SKILL.md` updates all three automatically; only the generated Gemini `.toml` (`.gemini-extension/commands/roadmap-fleet.toml`) and the plugin bundles need a regen (`generate:plugin:*`), and pre-commit enforces `generate:plugin:check`.

## Observable Truths (Acceptance Criteria)

1. **OT1 (SC1 — no double-build):** In a two-runner simulation, once runner A claims an item, runner B's `selectUnclaimed` drops that item as `claimed-elsewhere`; the fake store holds exactly one live claim (one `runId`) per item. _Verify:_ `two-runner.integration.test.ts` green.
2. **OT2 (SC3 — PR is the durable claim):** Once an item's PR is open, `classifyClaim` drops it via the **open-PR path** (`in-progress-elsewhere`) — not the lease path (`claimed-elsewhere`) — even after the `fleet:claimed` label is removed and the lease has lapsed; the fake store's `releaseLabel` succeeds. _Verify:_ integration test.
3. **OT3 (SC4 — graceful degradation):** With the claim-scan unavailable (`claimScanAvailable: false`, modelling absent `gh` auth), `classifyClaim`/`selectUnclaimed` consult only the open-PR path, drop nothing on the lease path, and never throw. _Verify:_ integration test.
4. **OT4 (pure export wiring):** `classifyClaim` / `selectUnclaimed` (and their types) are importable from `@harness-engineering/core` via the `fleet/claims` barrel; `pnpm generate:barrels:check` is clean; `packages/core/src/fleet` stays pure (no `node:fs`/`node:child_process`/`gh`). _Verify:_ import + `generate:barrels:check` + grep gate.
5. **OT5 (spine section):** `docs/reference/fleet-family.md` gains a `## Cross-run claim lease` section stating the record format, the SELECT→CLAIM→HEARTBEAT→RELEASE lifecycle, server-`updated_at` staleness, the open-PR-is-the-durable-claim rule, soft-reservation/skip-and-move-on, the reclaim tiebreak, `gh`-degradation, and that it applies to the ID-based members — without disturbing the `## Item-type routing` section or the `## References` list. _Verify:_ read + `internal-refs.test.ts` green.
6. **OT6 (reference member):** `roadmap-fleet/SKILL.md` SELECT drops live-leased items (and degrades when `gh` is absent) and DISPATCH claims → heartbeats → releases, **referencing the spine** rather than restating it; `--lease-seconds` / `--no-claim` flags are documented. _Verify:_ `harness skill validate roadmap-fleet` + read.
7. **OT7 (mirror/plugin regen):** Gemini `.toml` + plugin bundles regenerate with no drift; the md symlinks carry the edit automatically. _Verify:_ `pnpm generate:plugin:check` + `git status` clean.

## File Map

- CREATE `packages/core/src/fleet/claims/select.ts` — pure SELECT-composition helper (`classifyClaim`, `selectUnclaimed`, types).
- CREATE `packages/core/src/fleet/claims/select.test.ts` — unit tests for the helper branches.
- CREATE `packages/core/src/fleet/claims/two-runner.integration.test.ts` — SC1/SC3/SC4 two-runner simulation + in-memory fake GitHub claim store.
- MODIFY `packages/core/src/fleet/claims/index.ts` — add `export * from './select';`.
- MODIFY `docs/reference/fleet-family.md` — add the `## Cross-run claim lease` section.
- MODIFY `agents/skills/claude-code/roadmap-fleet/SKILL.md` — SELECT drop (Task 4) + DISPATCH lifecycle, Flags, Harness Integration (Task 5).
- MODIFY (generated) `.gemini-extension/commands/roadmap-fleet.toml` + plugin bundles — via `generate:plugin` (Task 6).

## Uncertainties

- [ASSUMPTION] The two `.integration.test.ts` / co-located `.test.ts` files run under the core package's default `vitest run` glob (same directory as the existing `index.test.ts`, which is picked up). If the repo scopes `.integration.test.ts` differently, Task 2 names the file `two-runner.test.ts` instead. _Mitigation:_ Task 2's verify step runs the file explicitly by path, so a glob mismatch surfaces immediately.
- [ASSUMPTION] `harness skill validate roadmap-fleet` does not require the new flags to be wired into a CLI arg parser (the flags are prose in a skill doc; the ID-based members are agent-driven, `gh` I/O in the skill layer). Confirmed by the spec: "no new CLI command"; flags are documented behavior, not code.
- [DEFERRABLE] Exact heartbeat-edit `gh` invocation wording in the skill prose — the mechanism is agent-executed; the skill states intent + cadence, not a literal command line.

## Tasks

### Task 1: Add the pure SELECT-composition helper (`classifyClaim` / `selectUnclaimed`) with unit tests (TDD)

**Depends on:** none | **Files:** `packages/core/src/fleet/claims/select.ts`, `packages/core/src/fleet/claims/select.test.ts`, `packages/core/src/fleet/claims/index.ts` | **Owns:** `packages/core/src/fleet/claims/**`

1. Create the unit test `packages/core/src/fleet/claims/select.test.ts` FIRST:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
   import { buildClaimBody } from './index';
   import { classifyClaim, selectUnclaimed, type ItemClaimContext } from './select';

   const NOW = '2026-08-26T14:30:00Z';
   const FRESH = '2026-08-26T14:28:00Z'; // +2m ago, well within a 720s lease
   const STALE = '2026-08-26T14:00:00Z'; // 30m ago, past a 720s lease

   const claim = (over: Partial<FleetClaim> = {}): FleetClaim => ({
     v: FLEET_CLAIM_VERSION,
     owner: 'chadjw',
     runId: 'rf-AAA',
     fleet: 'roadmap-fleet',
     item: '#1490',
     claimedAt: '2026-08-26T14:28:00Z',
     leaseSeconds: 720,
     ...over,
   });
   const ctx = (over: Partial<ItemClaimContext> = {}): ItemClaimContext => ({
     item: '#1490',
     hasOpenPr: false,
     claimComment: { body: buildClaimBody(claim()), serverUpdatedAt: FRESH },
     ...over,
   });

   describe('classifyClaim — precedence', () => {
     it('drops an open-PR item as in-progress-elsewhere (durable claim wins)', () => {
       // open PR AND a live lease → open-PR path wins (SC3 / D6)
       expect(classifyClaim(ctx({ hasOpenPr: true }), { now: NOW })).toEqual({
         item: '#1490',
         drop: true,
         reason: 'in-progress-elsewhere',
       });
     });

     it('drops a live lease from another run as claimed-elsewhere', () => {
       expect(classifyClaim(ctx(), { now: NOW, myRunId: 'rf-BBB' })).toEqual({
         item: '#1490',
         drop: true,
         reason: 'claimed-elsewhere',
       });
     });

     it('keeps an item whose live lease is our own run', () => {
       expect(classifyClaim(ctx(), { now: NOW, myRunId: 'rf-AAA' }).drop).toBe(false);
     });

     it('keeps an item with a stale lease (reclaimable)', () => {
       const stale = ctx({
         claimComment: { body: buildClaimBody(claim()), serverUpdatedAt: STALE },
       });
       expect(classifyClaim(stale, { now: NOW, myRunId: 'rf-BBB' }).drop).toBe(false);
     });

     it('keeps a novel item (no PR, no claim comment)', () => {
       expect(classifyClaim(ctx({ claimComment: null }), { now: NOW }).drop).toBe(false);
     });

     it('keeps an item whose claim comment is foreign/unparseable (never throws)', () => {
       const foreign = ctx({
         claimComment: { body: 'just a normal comment', serverUpdatedAt: FRESH },
       });
       expect(classifyClaim(foreign, { now: NOW }).drop).toBe(false);
     });
   });

   describe('classifyClaim — degradation (SC4)', () => {
     it('ignores the lease path when the claim-scan is unavailable', () => {
       // live lease present, but scan unavailable → only the open-PR path is consulted
       expect(
         classifyClaim(ctx(), { now: NOW, myRunId: 'rf-BBB', claimScanAvailable: false }).drop
       ).toBe(false);
     });
     it('still drops an open PR even when the claim-scan is unavailable', () => {
       expect(
         classifyClaim(ctx({ hasOpenPr: true }), { now: NOW, claimScanAvailable: false }).reason
       ).toBe('in-progress-elsewhere');
     });
   });

   describe('selectUnclaimed', () => {
     it('returns only the items SELECT should still build', () => {
       const items = [
         ctx({ item: '#1', claimComment: null }), // novel → keep
         ctx({ item: '#2', hasOpenPr: true }), // open PR → drop
         ctx({ item: '#3' }), // live foreign lease → drop
         ctx({
           item: '#4',
           claimComment: { body: buildClaimBody(claim({ item: '#4' })), serverUpdatedAt: STALE },
         }), // stale → keep
       ];
       const kept = selectUnclaimed(items, { now: NOW, myRunId: 'rf-BBB' }).map((i) => i.item);
       expect(kept).toEqual(['#1', '#4']);
     });
   });
   ```

2. Run the test — observe failure (module `./select` does not exist):
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/select.test.ts`
3. Create the implementation `packages/core/src/fleet/claims/select.ts`:

   ```ts
   // packages/core/src/fleet/claims/select.ts
   //
   // Pure, offline SELECT-phase composition helpers for the cross-run fleet
   // work-claim lease (docs/changes/fleet-cross-run-claim-lease/proposal.md,
   // Phase 2). NO network, NO `gh`, NO fs — every function is a pure transform
   // over data the caller already fetched. All GitHub I/O (label scan, comment
   // fetch, open-PR cross-check) lives in the member skill layer that CALLS
   // these; this module only decides whether an item is claimed elsewhere.

   import { isLeaseLive, parseClaimComment } from './index';

   /**
    * Why SELECT drops a candidate. Mirrors roadmap-fleet's `crossCheck`
    * vocabulary: an open PR is the DURABLE claim (`in-progress-elsewhere`, the
    * existing drop); a live lease is a soft reservation (`claimed-elsewhere`).
    */
   export type DropClassification = 'in-progress-elsewhere' | 'claimed-elsewhere';

   /** Everything the caller already fetched about one candidate item. */
   export interface ItemClaimContext {
     /** Item identifier (issue/PR number, e.g. '#1490'). */
     item: string;
     /** True if the existing merged/open-PR cross-check found an open PR. */
     hasOpenPr: boolean;
     /**
      * The `fleet:claimed` claim comment body + its GitHub-server `updated_at`,
      * or null/undefined when there is no claim (or the scan was unavailable).
      */
     claimComment?: { body: string; serverUpdatedAt: Date | string } | null;
   }

   export interface SelectOptions {
     /** Reader's current time (server-comparable ISO string or Date). */
     now: Date | string;
     /** This run's own runId — never drop on our OWN live claim. */
     myRunId?: string;
     /**
      * False ⇒ the `gh` claim-label scan was unavailable; degrade to the
      * open-PR cross-check only (SC4). Defaults to true.
      */
     claimScanAvailable?: boolean;
   }

   export interface ItemDecision {
     item: string;
     drop: boolean;
     reason: DropClassification | null;
   }

   /**
    * Decide whether one candidate should be dropped from SELECT. Precedence
    * (first match wins):
    *   1. An open PR is the DURABLE claim (D6 / SC3) → `in-progress-elsewhere`.
    *      Wins even after the lease label is removed and the lease has lapsed.
    *   2. A LIVE lease written by ANOTHER run → `claimed-elsewhere` (soft
    *      reservation). A stale lease, our own claim, a foreign/unparseable
    *      comment, or (SC4) an unavailable claim-scan are all ignored → keep.
    * Pure and non-throwing.
    */
   export function classifyClaim(ctx: ItemClaimContext, opts: SelectOptions): ItemDecision {
     if (ctx.hasOpenPr) {
       return { item: ctx.item, drop: true, reason: 'in-progress-elsewhere' };
     }
     const scanOn = opts.claimScanAvailable !== false;
     if (scanOn && ctx.claimComment) {
       const claim = parseClaimComment(ctx.claimComment.body);
       if (
         claim &&
         claim.runId !== opts.myRunId &&
         isLeaseLive(claim, ctx.claimComment.serverUpdatedAt, opts.now)
       ) {
         return { item: ctx.item, drop: true, reason: 'claimed-elsewhere' };
       }
     }
     return { item: ctx.item, drop: false, reason: null };
   }

   /** Keep only the candidates SELECT should still build (`drop === false`). */
   export function selectUnclaimed(
     items: ItemClaimContext[],
     opts: SelectOptions
   ): ItemClaimContext[] {
     return items.filter((ctx) => !classifyClaim(ctx, opts).drop);
   }
   ```

4. Wire the barrel — add to `packages/core/src/fleet/claims/index.ts` (append after the existing exports, at the end of the file):

   ```ts
   // SELECT-phase composition helpers (Phase 2) — pure, offline.
   export * from './select';
   ```

5. Run the test — observe pass:
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/select.test.ts`
6. Typecheck (Phase 1 hit `noUncheckedIndexedAccess`; `select.ts` uses no index access, but confirm):
   `pnpm --filter @harness-engineering/core typecheck`
7. Confirm the barrel is still coherent and core stays pure:
   `pnpm generate:barrels:check` and `grep -rE "node:fs|node:child_process|execSync|'gh'" packages/core/src/fleet` (expect no matches).
8. Commit: `feat(core): add pure SELECT claim-drop helper (classifyClaim/selectUnclaimed)`

### Task 2: Two-runner simulation integration test — SC1/SC3/SC4 (TDD-characterization)

**Depends on:** Task 1 | **Files:** `packages/core/src/fleet/claims/two-runner.integration.test.ts` | **Owns:** `packages/core/src/fleet/claims/**`

> This test composes the already-shipped primitives (`buildClaimBody`/`parseClaimComment`/`isLeaseLive`) with the Task-1 helper over an in-memory fake GitHub claim store — the offline stand-in for the `gh` I/O the skill layer performs. It validates the claim-lifecycle LOGIC, not the skill prose. Because Task 1 already implements the logic, the file is written to pass on creation (a characterization/integration test).

1. Create `packages/core/src/fleet/claims/two-runner.integration.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
   import { buildClaimBody, parseClaimComment, isLeaseLive } from './index';
   import { classifyClaim, type ItemClaimContext } from './select';

   // --- In-memory fake GitHub claim store (offline stand-in for the gh layer) ---
   // Models exactly the surface the skill's SELECT/CLAIM/HEARTBEAT/RELEASE touch:
   // the `fleet:claimed` label, the (single, latest) claim comment with a
   // server-stamped updated_at, and open-PR state.
   interface ItemState {
     labeled: boolean;
     commentBody: string | null;
     serverUpdatedAt: string | null; // GitHub-server updated_at of the claim comment
     openPr: boolean;
   }
   class FakeClaimStore {
     private items = new Map<string, ItemState>();
     private state(item: string): ItemState {
       let s = this.items.get(item);
       if (!s) {
         s = { labeled: false, commentBody: null, serverUpdatedAt: null, openPr: false };
         this.items.set(item, s);
       }
       return s;
     }
     /** CLAIM / reclaim: add label + post (or replace) the claim comment. */
     claim(item: string, claim: FleetClaim, serverNow: string) {
       const s = this.state(item);
       s.labeled = true;
       s.commentBody = buildClaimBody(claim);
       s.serverUpdatedAt = serverNow;
     }
     /** HEARTBEAT: edit the comment → the SERVER bumps updated_at. */
     heartbeat(item: string, serverNow: string) {
       this.state(item).serverUpdatedAt = serverNow;
     }
     /** RELEASE: remove the label (comment stays as audit trail). */
     releaseLabel(item: string) {
       this.state(item).labeled = false;
     }
     openPullRequest(item: string) {
       this.state(item).openPr = true;
     }
     /** What SELECT reads back for one item. */
     contextFor(item: string): ItemClaimContext {
       const s = this.state(item);
       return {
         item,
         hasOpenPr: s.openPr,
         claimComment:
           s.commentBody && s.serverUpdatedAt
             ? { body: s.commentBody, serverUpdatedAt: s.serverUpdatedAt }
             : null,
       };
     }
     /** How many DISTINCT runs currently hold a LIVE lease on this item. */
     liveClaimRunIds(item: string, now: string): string[] {
       const s = this.state(item);
       if (!s.labeled || !s.commentBody || !s.serverUpdatedAt) return [];
       const parsed = parseClaimComment(s.commentBody);
       if (!parsed || !isLeaseLive(parsed, s.serverUpdatedAt, now)) return [];
       return [parsed.runId];
     }
   }

   const mkClaim = (runId: string, item: string, at: string): FleetClaim => ({
     v: FLEET_CLAIM_VERSION,
     owner: 'op',
     runId,
     fleet: 'roadmap-fleet',
     item,
     claimedAt: at,
     leaseSeconds: 720,
   });

   describe('two-runner simulation — SC1: no double-build under concurrency', () => {
     it('runner B drops an item runner A holds a live claim on', () => {
       const store = new FakeClaimStore();
       const item = '#1490';
       const t0 = '2026-08-26T14:00:00Z';

       // Runner A enters DISPATCH → claims the item.
       store.claim(item, mkClaim('rf-A', item, t0), t0);

       // Runner B's SELECT (a few seconds later) reads the claim and decides.
       const tB = '2026-08-26T14:00:20Z';
       const decision = classifyClaim(store.contextFor(item), { now: tB, myRunId: 'rf-B' });
       expect(decision).toEqual({ item, drop: true, reason: 'claimed-elsewhere' });

       // Invariant: exactly ONE runId holds a live claim (never both).
       expect(store.liveClaimRunIds(item, tB)).toEqual(['rf-A']);
     });
   });

   describe('two-runner simulation — SC3: the PR is the durable claim', () => {
     it('drops via the open-PR path (not the lease path) after RELEASE + lapse', () => {
       const store = new FakeClaimStore();
       const item = '#1491';
       const t0 = '2026-08-26T14:00:00Z';

       store.claim(item, mkClaim('rf-A', item, t0), t0); // A claims
       store.openPullRequest(item); // A opens its PR
       store.releaseLabel(item); // RELEASE: label removed
       expect(store.state?.(item)).toBeUndefined(); // (state is private; asserted via behavior below)

       // Time advances FAR past the lease so the lease path is definitively dead.
       const tLater = '2026-08-26T15:00:00Z';
       const decision = classifyClaim(store.contextFor(item), { now: tLater, myRunId: 'rf-B' });
       expect(decision.drop).toBe(true);
       expect(decision.reason).toBe('in-progress-elsewhere'); // open-PR path, NOT claimed-elsewhere

       // The label is releasable and now released; no live lease remains.
       expect(store.liveClaimRunIds(item, tLater)).toEqual([]);
     });
   });

   describe('two-runner simulation — SC4: graceful degradation when gh is absent', () => {
     it('falls back to open-PR-cross-check-only, never throws', () => {
       const store = new FakeClaimStore();
       const claimed = '#1492';
       const withPr = '#1493';
       const t0 = '2026-08-26T14:00:00Z';
       store.claim(claimed, mkClaim('rf-A', claimed, t0), t0);
       store.openPullRequest(withPr);

       const now = '2026-08-26T14:00:10Z';
       // gh auth absent → claimScanAvailable: false. The claimed item is KEPT
       // (lease path skipped); the open-PR item is still dropped.
       const keep = classifyClaim(store.contextFor(claimed), { now, claimScanAvailable: false });
       const drop = classifyClaim(store.contextFor(withPr), { now, claimScanAvailable: false });
       expect(keep.drop).toBe(false);
       expect(drop).toEqual({ item: withPr, drop: true, reason: 'in-progress-elsewhere' });
     });
   });
   ```

   > NOTE for the executor: delete the illustrative `expect(store.state?.(item)).toBeUndefined();` line before running — `state` is private and that line only documents intent. Keep the behavioral assertions.

2. Run the test — observe pass (logic already exists from Task 1):
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/two-runner.integration.test.ts`
3. Confirm the whole `fleet/claims` suite is green together:
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/`
4. Commit: `test(core): two-runner claim-lease simulation (SC1/SC3/SC4)`

### Task 3: Add the `## Cross-run claim lease` section to the family spine `[checkpoint:human-verify]`

**Depends on:** Task 1 | **Files:** `docs/reference/fleet-family.md`

> Placement: insert the new section immediately AFTER `## The concurrency governor (machine-storm cap)` and BEFORE `## The worktree push-path caveat`. The governor bounds one invocation; the lease bounds across invocations — the pairing reads naturally. Do NOT touch the `## Item-type routing` section or the `## References` list (the ADR is Phase 4).

1. Insert this section after the concurrency-governor section:

   ```markdown
   ## Cross-run claim lease (ID-based members)

   The concurrency governor above bounds a single _invocation_. It says nothing about a **second run on another clone** enumerating the same backlog at the same time — the family's one un-covered collision. The **cross-run claim lease** closes exactly the `SELECT → PR-open` window for the ID-based members (`roadmap-fleet`, `issue-fleet`, `pr-fleet`), whose items already carry a GitHub-native id at SELECT. It is **advisory** — best-effort backlog auto-partitioning, never an exactly-once mutex; that trade-off (soft reservation over a true-CAS git-ref lock) is deliberate and is recorded in the family claim-lease ADR authored in Phase 4.

   **The claim record.** A claim is one GitHub issue/PR comment: an HTML marker line `<!-- harness-fleet-claim -->` followed by a fenced JSON block carrying `{ v, owner, runId, fleet, item, claimedAt, leaseSeconds }`. The shape is the `FleetClaim` type in `@harness-engineering/types`; the pure render/parse/TTL primitives — `buildClaimBody`, `parseClaimComment`, `isLeaseLive`, plus `CLAIM_LABEL` (`fleet:claimed`), `DEFAULT_LEASE_SECONDS` (720), `HEARTBEAT_SECONDS` (240) — live in `@harness-engineering/core` (`fleet/claims`). All `gh` I/O stays in the member's orchestration layer; the core module is pure and offline.

   **Lifecycle — SELECT → CLAIM → HEARTBEAT → RELEASE.**

   | Step      | What the member does                                                                                                                                                                                                                                                                                                                              |
   | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | SELECT    | Enumerate candidates as today, plus fetch `--label fleet:claimed` items and their claim comments (piggybacks the existing enumeration — no extra `gh pr list`). Drop an item with an **open PR** (`in-progress-elsewhere`, the existing drop) **or** a **live lease written by another run** (`claimed-elsewhere`). A **stale** lease is ignored. |
   | CLAIM     | On entering DISPATCH for an item, add the `fleet:claimed` label and post the claim comment. Re-read first: if a competing live claim appeared since SELECT, **yield the item** (soft reservation — skip and move on).                                                                                                                             |
   | HEARTBEAT | While the worker builds, edit the claim comment every `HEARTBEAT_SECONDS`, bumping the server `updated_at` and extending the lease.                                                                                                                                                                                                               |
   | RELEASE   | On PR-open, remove the `fleet:claimed` label (the comment stays as an audit trail). The **open PR is now the durable claim** and backstops the item via the existing open-PR drop.                                                                                                                                                                |

   **Staleness = the server clock, not the writer's.** A lease is live while `serverUpdatedAt + leaseSeconds > now`, computed from the GitHub-server `updated_at` of the claim comment — never the writer-stamped `claimedAt`. This defeats cross-machine clock skew and lets a crashed run's lease self-heal: no heartbeat ⇒ the lease lapses at `updated_at + leaseSeconds` ⇒ the next run's SELECT reclaims it. A terminal non-`done` outcome with no PR also releases the label so the item is not stranded.

   **Soft reservation, not a mutex.** Contention skips and moves on rather than blocking — concurrency becomes backlog auto-partitioning (the front-load / park-and-continue model, ADR 0088). **Reclaim tiebreak:** reclaiming a stale lease appends a _fresh_ claim comment; if two runs reclaim at once the earliest server-stamped comment wins, and the loser detects a competing live claim (runId mismatch) on its first heartbeat re-read and yields. Residual double-work is bounded to that sub-second race — by design never worse than today's uncoordinated behavior.

   **Graceful degradation.** If `gh` auth is absent the member cannot scan the claim label; it **degrades to the open-PR cross-check only** and logs the degradation — it never aborts (matching each member's existing "missing `gh` auth degrades to the available source" posture). An escape hatch `--no-claim` disables the mechanism entirely; `--lease-seconds <n>` overrides the TTL.

   Each ID-based member's `SKILL.md` **references this section** from its SELECT and DISPATCH steps rather than restating the mechanism.
   ```

2. Verify the section slotted in without disturbing neighbours — confirm `## Item-type routing` and the `## References` list (ending at ADR 0103) are unchanged:
   `grep -n "^## " docs/reference/fleet-family.md` (expect the new heading between the governor and the push-path caveat; Item-type routing and References intact).
3. Run the skills cross-reference test:
   `pnpm --filter @harness-engineering/core exec vitest run agents/skills/tests/internal-refs.test.ts` _(if the runner is not core-scoped, run `npx vitest run agents/skills/tests/internal-refs.test.ts` from the repo root)._
4. `[checkpoint:human-verify]` — Show the rendered section to the human: this is the **canonical family contract** every ID-based member will cite, so confirm the voice, the placement, and the forthcoming-ADR phrasing before proceeding.
5. Commit: `docs(fleet-family): add the cross-run claim lease spine section`

### Task 4: Wire the claim-lease drop into `roadmap-fleet` SELECT

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

> The mirrors (`cursor`/`codex`/`gemini-cli`) are symlinks to this file — editing it updates all three. Reference the spine section; do NOT restate the mechanism.

1. In **Phase 1: SELECT**, augment step 1 (enumerate). After the existing sentence ending "record which source was unavailable rather than aborting.", append:

   > Additionally fetch items carrying the `fleet:claimed` label and their claim comments — this piggybacks the same enumeration (no extra `gh pr list`) and feeds the cross-run claim-lease drop in the next step (see the **§Cross-run claim lease** section of `docs/reference/fleet-family.md`).

2. In **Phase 1: SELECT** step 2 (cross-check), after the sentence ending "A candidate with an open PR in flight is **in-progress elsewhere** — drop it from the batch.", append:

   > A candidate carrying a **live claim lease written by another run** is **claimed-elsewhere** — drop it as a soft reservation; a **stale** lease is ignored and the item stays claimable. Staleness and the lease record are defined once in the **§Cross-run claim lease** section of `docs/reference/fleet-family.md` — do not restate it here. If `gh` auth is absent, skip the claim-label scan and **degrade to the open-PR cross-check only** (log the degradation; never abort).

3. In the **`Candidate` record** block (Phase 1 step 6), extend the `crossCheck` field's comment to include the new classification:

   ```
     crossCheck,        // "novel" | "already-resolved" | "in-progress-elsewhere" | "claimed-elsewhere"
   ```

4. Verify the skill still validates:
   `node packages/cli/dist/bin/harness.js skill validate roadmap-fleet`
5. Commit: `feat(roadmap-fleet): drop live-leased items in SELECT (cross-run claim lease)`

### Task 5: Wire CLAIM → HEARTBEAT → RELEASE into `roadmap-fleet` DISPATCH + flags + integration pointer

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/roadmap-fleet/SKILL.md`

> Mirror the existing structural pattern: a **bolded, non-numbered block appended after the DISPATCH numbered steps** (like the "Worker handoff — return the canonical `FleetHandoffRecord`" block). This avoids renumbering the DISPATCH list.

1. In the **Flags** table, add two rows after the existing `--dry-run` row:

   ```markdown
   | `--lease-seconds` | Override the cross-run claim-lease TTL (default 720s); see §Cross-run claim lease in `docs/reference/fleet-family.md` |
   | `--no-claim` | Disable the cross-run claim lease entirely — fall back to open-PR-cross-check-only coordination |
   ```

2. In **Phase 3: DISPATCH**, append a bolded block immediately AFTER the "Worker handoff — return the canonical `FleetHandoffRecord`" paragraph:

   ```markdown
   **Claim the item before building — cross-run claim lease (CLAIM → HEARTBEAT → RELEASE).** On entering DISPATCH for an item, the orchestrator takes the item's cross-run claim so a concurrent run on another clone auto-partitions around it: add the `fleet:claimed` label and post the claim comment, then **re-read** — if a competing live claim appeared since SELECT, **yield this item** (soft reservation) and continue the batch. While the worker builds, the orchestrator **heartbeats** the claim (edits the comment every `HEARTBEAT_SECONDS`) so a live-but-slow item is not mistaken for a dead one. On PR-open it **releases** the label — the open PR is now the durable claim (VERIFY's existing open-PR handling backstops it). A parked or failed item with no PR also releases the label so it is not stranded. Under `--no-claim` this whole step is skipped. The record format, TTL/staleness semantics, and the reclaim tiebreak are stated once in the **§Cross-run claim lease** section of `docs/reference/fleet-family.md` — this member references them, it does not restate them.
   ```

3. In **Harness Integration**, add a bullet after the `docs/reference/fleet-family.md` bullet (or extend nothing else):

   ```markdown
   - **§Cross-run claim lease (`docs/reference/fleet-family.md`) + `@harness-engineering/core` (`fleet/claims`)** — The canonical cross-run coordination mechanism this member consumes in SELECT (drop live-leased items) and DISPATCH (CLAIM → HEARTBEAT → RELEASE); the pure `buildClaimBody`/`parseClaimComment`/`isLeaseLive` primitives and `classifyClaim`/`selectUnclaimed` helpers live in core, all `gh` I/O in this skill layer.
   ```

4. Verify the skill still validates:
   `node packages/cli/dist/bin/harness.js skill validate roadmap-fleet`
5. Commit: `feat(roadmap-fleet): claim/heartbeat/release lifecycle in DISPATCH + lease flags`

### Task 6: Regenerate mirror/plugin artifacts and confirm no drift

**Depends on:** Task 5 | **Files:** `.gemini-extension/commands/roadmap-fleet.toml` (generated), plugin bundles under `packages/cli/dist/agents/...` and `.claude`/`.cursor`/`.codex` targets | **Category:** integration

1. Regenerate the barrels (picks up the new `fleet/claims/select` export) and confirm clean:
   `pnpm generate:barrels:check`
2. Regenerate the plugin/mirror artifacts for every target (the SKILL.md edits reach the Gemini `.toml` and the plugin bundles here; the `.md` symlinks are already current):
   `pnpm generate:plugin:all`
3. Confirm the generators are idempotent / no residual drift:
   `pnpm generate:plugin:check` and `git status --short` (expect only the intended regenerated artifacts, cleanly staged).
4. Commit: `chore(plugin): regenerate roadmap-fleet mirror + gemini toml for claim-lease`

## Sequencing & Parallelism

- **Task 1** (core helper) has no dependencies — the critical-path root.
- **Task 2** depends on Task 1 (imports the helper).
- **Task 3** depends on Task 1 conceptually (the spine cites the core exports the helper joins) and is the doc the skill tasks cite; it can run in parallel with Task 2 (disjoint files).
- **Tasks 4 → 5** are strictly sequential (same file, `roadmap-fleet/SKILL.md`) and both depend on Task 3 (they reference the spine section it creates).
- **Task 6** is last (depends on Task 5 — it regenerates from the final skill content).

## Integration Tier Assessment

**medium.** New public core exports (`classifyClaim`/`selectUnclaimed` via the `fleet/claims` barrel), a new canonical spine section, reference-member wiring, and barrel/plugin regeneration — all within existing packages, 3–15 files, no new package or skill. Integration requirements: **wiring + project updates** (barrels regen, plugin/gemini regen). Knowledge materialization (the family ADR) and the conductor pass-through / AGENTS.md pointer are the **large-tier** items deliberately deferred to Phase 4.

## Known-failure / caveat check

- `harness validate` on this branch reports ~389 **pre-existing** issues (dashboard color-token literals, `planned` roadmap rows with no spec/plan, drift rules) unrelated to this phase — the same baseline Phase 1 recorded. Per-task gates here are targeted vitest + `skill validate` + `generate:*:check` + the pure-module grep, not the whole-tree `validate`. Do not treat the baseline red as a regression; only NEW findings in the touched files matter.
- `check-deps` passes clean (verified during planning).
- Core enforces `noUncheckedIndexedAccess` (Phase 1 tripped on regex-capture access). `select.ts` uses no index access; if any is added later, guard it.
- Keep `packages/core/src/fleet` pure — the fake GitHub store lives ONLY in the test file, never in `select.ts`.
