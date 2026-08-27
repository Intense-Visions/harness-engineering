# Plan: Cross-run claim lease — Phase 1 (Core primitive)

**Date:** 2026-08-26 | **Spec:** `docs/changes/fleet-cross-run-claim-lease/proposal.md` (§Technical Design "The claim record" / "New FleetClaim type and pure core module"; Implementation Order Phase 1) | **Tasks:** 5 | **Time:** ~20 min | **Integration Tier:** medium

## Goal

Ship the pure, offline core primitive of the fleet work-claim lease: a `FleetClaim` type plus a network-free `fleet/claims` module (`buildClaimBody` / `parseClaimComment` / `isLeaseLive` / constants), unit-tested for SC2/SC5/SC6 and wired through both package barrels. Independently shippable; no GitHub I/O, no skill/member wiring (deferred to Phase 2+).

## Observable Truths (Acceptance Criteria)

1. **[SC6 round-trip]** `parseClaimComment(buildClaimBody(x))` deep-equals `x` for a well-formed `FleetClaim x`. → Task 3
2. **[SC6 tolerance]** `parseClaimComment` returns `null` (never throws) for: a comment lacking the `<!-- harness-fleet-claim -->` marker (foreign), a marked comment whose JSON is malformed, and a marked comment whose JSON fails the schema. → Task 3
3. **[SC5 clock-skew]** `isLeaseLive` computes staleness from `serverUpdatedAt`, NOT `claim.claimedAt`: a claim carrying a wildly skewed `claimedAt` yields a liveness decision that follows only `serverUpdatedAt`. → Task 4
4. **[SC2 TTL]** `isLeaseLive` returns `false` once `serverUpdatedAt + leaseSeconds < now`, and `true` while `serverUpdatedAt + leaseSeconds > now`. → Task 4
5. **[constants]** The module exports `CLAIM_LABEL === 'fleet:claimed'`, `DEFAULT_LEASE_SECONDS === 720`, `HEARTBEAT_SECONDS === 240`. → Task 2
6. **[types barrel]** `FleetClaim` and `FleetClaimSchema` are importable from `@harness-engineering/types`. → Task 1
7. **[core barrel]** `buildClaimBody` / `parseClaimComment` / `isLeaseLive` / constants are importable from `@harness-engineering/core` (barrel contains `export * from './fleet'`). → Task 5
8. **[health]** `node packages/cli/dist/bin/harness.js validate`, `pnpm run generate:barrels:check`, and the two package test suites pass. → every task

## Decisions (this phase)

- **D-P1a — Schema + type live in `@harness-engineering/types`; pure functions + constants live in `@harness-engineering/core`.** Mirrors `fleet-handoff.ts` (shape in types) while honoring the spec's export table (build/parse/TTL + constants are the core module's surface). The core module imports `FleetClaimSchema` from types for validation, so the shape cannot drift between writer and reader.
- **D-P1b — `FleetClaimSchema` uses a plain (non-`.strict()`) `z.object`.** Zod strips unknown keys, giving forward-tolerance to a future-version field while still returning `null` on genuinely foreign JSON. The `<!-- harness-fleet-claim -->` marker is the primary foreign-comment guard (checked before the schema); the schema guards field types. Round-trip (SC6) still holds exactly because the known fields are preserved.
- **D-P1c — `buildClaimBody` serializes `input` verbatim (does not inject `v`).** Keeps `parseClaimComment(buildClaimBody(x))` exactly deep-equal to `x`; the round-trip fixture supplies `v: FLEET_CLAIM_VERSION` explicitly (as `fleet-handoff.test.ts` does with its version constant).

## Uncertainties

- **[ASSUMPTION]** Core barrel auto-discovery (`discoverStarModules`, generate-core-barrel.mjs:169-179) picks up any top-level `src/<dir>/index.ts` and emits `export * from './<dir>'`; a `DIR_COMMENTS` entry only sets the JSDoc + canonical ordering. Verified against the generator; therefore a `SELECTIVE_EXPORTS` block is NOT required for `fleet`. If auto-discovery were ever changed to a strict allowlist, Task 5 would need a `SELECTIVE_EXPORTS.fleet` block instead.
- **[DEFERRABLE]** JSON indentation (2-space) is cosmetic; `parseClaimComment` re-parses JSON so whitespace never affects the round-trip.
- **[DEFERRABLE]** Whether `owner` should be validated against a GitHub-login charset — out of scope for the primitive; the skill layer supplies real logins.

_No BLOCKING uncertainties — Phase 2 decomposition is unblocked._

## File Map

- CREATE `packages/types/src/fleet-claim.ts`
- CREATE `packages/types/tests/fleet-claim.test.ts`
- MODIFY `packages/types/src/index.ts` (export FleetClaim block)
- CREATE `packages/core/src/fleet/claims/index.ts`
- CREATE `packages/core/src/fleet/claims/index.test.ts`
- CREATE `packages/core/src/fleet/index.ts`
- MODIFY `scripts/generate-core-barrel.mjs` (add `fleet` to `DIR_COMMENTS`)
- MODIFY `packages/core/src/index.ts` (regenerated barrel — do not hand-edit)

## Skeleton

_Not produced — task count (5) is below the standard-mode threshold (8)._

## Integration Tier Assessment

**medium.** This phase adds new public exports across two packages (`@harness-engineering/types` and `@harness-engineering/core`) that require barrel registration (types index edit + core-barrel `DIR_COMMENTS` + regenerate). It stays within existing packages — no new CLI command, no new MCP tool, no new skill, no docs/ADR (those are Phase 2 and Phase 4). Registrations required (this phase): types barrel export + core barrel wiring — both folded into the tasks below. No knowledge-materialization or ADR work in this phase.

## Tasks

### Task 1: Add `FleetClaim` type + zod schema to the types package

**Depends on:** none | **Files:** `packages/types/src/fleet-claim.ts`, `packages/types/tests/fleet-claim.test.ts`, `packages/types/src/index.ts` | **Owns:** `packages/types/src/fleet-claim.ts`

1. Write the test first — CREATE `packages/types/tests/fleet-claim.test.ts`:

   ```ts
   import { describe, it, expect } from 'vitest';
   import { FleetClaimSchema, FLEET_CLAIM_VERSION, type FleetClaim } from '../src/fleet-claim';

   const wellFormed: FleetClaim = {
     v: FLEET_CLAIM_VERSION,
     owner: 'chadjw',
     runId: 'rf-1a2b3c',
     fleet: 'roadmap-fleet',
     item: '#1490',
     claimedAt: '2026-08-26T14:20:00Z',
     leaseSeconds: 720,
   };

   describe('FleetClaimSchema', () => {
     it('accepts a well-formed claim', () => {
       const parsed = FleetClaimSchema.parse(wellFormed);
       expect(parsed).toEqual(wellFormed);
     });

     it('rejects a claim missing required fields', () => {
       const bad = { owner: 'chadjw' };
       expect(FleetClaimSchema.safeParse(bad).success).toBe(false);
     });

     it('rejects a non-positive leaseSeconds', () => {
       expect(FleetClaimSchema.safeParse({ ...wellFormed, leaseSeconds: 0 }).success).toBe(false);
     });

     it('treats v as optional', () => {
       const { v: _v, ...noVersion } = wellFormed;
       expect(FleetClaimSchema.safeParse(noVersion).success).toBe(true);
     });
   });
   ```

2. Run the test — observe FAIL (module does not exist yet):
   `pnpm --filter @harness-engineering/types exec vitest run tests/fleet-claim.test.ts`
3. CREATE `packages/types/src/fleet-claim.ts` (mirror `fleet-handoff.ts` header/doc style):

   ```ts
   // packages/types/src/fleet-claim.ts
   //
   // FleetClaim — the advisory cross-run work-claim lease record for the -fleet
   // family (docs/changes/fleet-cross-run-claim-lease/proposal.md).
   //
   // A claim is published as a GitHub issue/PR comment: an HTML marker line plus
   // a fenced JSON block, so two clones running a fleet concurrently auto-
   // partition the backlog instead of duplicating it. This module owns ONLY the
   // shape + schema; the pure render/parse/TTL logic lives in
   // @harness-engineering/core (fleet/claims), and all GitHub I/O stays in the
   // skill layer.

   import { z } from 'zod';

   /** Current version of the fleet claim payload envelope. Parsers tolerate an
    * absent or unknown `v`. */
   export const FLEET_CLAIM_VERSION = 1;

   /**
    * The advisory work-claim lease payload one fleet run publishes for one item.
    * - `v`            — envelope version (forward-compat; optional).
    * - `owner`        — GitHub login of the claiming run's operator.
    * - `runId`        — unique id of the claiming run (reclaim-race tiebreak).
    * - `fleet`        — which fleet took the claim (e.g. `'roadmap-fleet'`).
    * - `item`         — the item identifier claimed (issue/PR number, e.g. `'#1490'`).
    * - `claimedAt`    — ISO-8601 write time; ADVISORY ONLY. Staleness is computed
    *                    from the GitHub server `updated_at`, never this field.
    * - `leaseSeconds` — TTL seconds; live while `serverUpdatedAt + leaseSeconds > now`.
    *
    * Unknown keys are stripped (not rejected) for forward-tolerance; the claim
    * comment's HTML marker is the primary foreign-comment guard.
    */
   export const FleetClaimSchema = z.object({
     v: z.number().int().positive().optional(),
     owner: z.string().min(1),
     runId: z.string().min(1),
     fleet: z.string().min(1),
     item: z.string().min(1),
     claimedAt: z.string().min(1),
     leaseSeconds: z.number().int().positive(),
   });

   export type FleetClaim = z.infer<typeof FleetClaimSchema>;
   ```

4. Export from `packages/types/src/index.ts` — add immediately after the `// --- Fleet Handoff ... ---` block (around line 449):

   ```ts
   // --- Fleet Claim (cross-run advisory work-claim lease, fleet-cross-run-claim-lease) ---
   export { FLEET_CLAIM_VERSION, FleetClaimSchema } from './fleet-claim';
   export type { FleetClaim } from './fleet-claim';
   ```

5. Run the test — observe PASS:
   `pnpm --filter @harness-engineering/types exec vitest run tests/fleet-claim.test.ts`
6. Run: `node packages/cli/dist/bin/harness.js validate`
7. Commit: `feat(types): add FleetClaim type + schema for fleet claim lease`

### Task 2: Core `fleet/claims` module — constants + `buildClaimBody` (TDD)

**Depends on:** Task 1 | **Files:** `packages/core/src/fleet/claims/index.ts`, `packages/core/src/fleet/claims/index.test.ts` | **Owns:** `packages/core/src/fleet/**`

1. Write the test first — CREATE `packages/core/src/fleet/claims/index.test.ts`:

   ````ts
   import { describe, it, expect } from 'vitest';
   import { FLEET_CLAIM_VERSION, type FleetClaim } from '@harness-engineering/types';
   import {
     buildClaimBody,
     CLAIM_LABEL,
     CLAIM_MARKER,
     DEFAULT_LEASE_SECONDS,
     HEARTBEAT_SECONDS,
   } from './index';

   const claim: FleetClaim = {
     v: FLEET_CLAIM_VERSION,
     owner: 'chadjw',
     runId: 'rf-1a2b3c',
     fleet: 'roadmap-fleet',
     item: '#1490',
     claimedAt: '2026-08-26T14:20:00Z',
     leaseSeconds: 720,
   };

   describe('fleet/claims constants', () => {
     it('exposes the documented constant values', () => {
       expect(CLAIM_LABEL).toBe('fleet:claimed');
       expect(DEFAULT_LEASE_SECONDS).toBe(720);
       expect(HEARTBEAT_SECONDS).toBe(240);
     });
   });

   describe('buildClaimBody', () => {
     it('renders the HTML marker then a fenced json block', () => {
       const body = buildClaimBody(claim);
       expect(body).toContain(CLAIM_MARKER);
       expect(body).toMatch(/```json\n[\s\S]*\n```/);
       expect(body.indexOf(CLAIM_MARKER)).toBeLessThan(body.indexOf('```json'));
     });

     it('embeds the exact claim payload as parseable json', () => {
       const body = buildClaimBody(claim);
       const json = /```json\n([\s\S]*?)\n```/.exec(body)![1];
       expect(JSON.parse(json)).toEqual(claim);
     });
   });
   ````

2. Run the test — observe FAIL (module missing):
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/index.test.ts`
3. CREATE `packages/core/src/fleet/claims/index.ts`:

   ```ts
   // packages/core/src/fleet/claims/index.ts
   //
   // Pure, offline primitives for the cross-run fleet work-claim lease
   // (docs/changes/fleet-cross-run-claim-lease/proposal.md, Phase 1).
   //
   // NO network, NO `gh`, NO fs — every function here is a pure transform over
   // strings/dates, matching the repo's injected-IO discipline. All GitHub I/O
   // lives in the skill/orchestration layer that CALLS these.

   import { FleetClaimSchema, type FleetClaim } from '@harness-engineering/types';

   /** The GitHub label a claimed item carries; the cheap one-call SELECT filter. */
   export const CLAIM_LABEL = 'fleet:claimed';

   /** Default lease TTL: 12 minutes — tolerates one missed heartbeat. */
   export const DEFAULT_LEASE_SECONDS = 720;

   /** Heartbeat cadence: 4 minutes — renews the lease well within the TTL. */
   export const HEARTBEAT_SECONDS = 240;

   /** HTML marker line that unambiguously identifies a fleet claim comment. */
   export const CLAIM_MARKER = '<!-- harness-fleet-claim -->';

   /**
    * Render a claim as a GitHub comment body: the HTML marker line followed by a
    * fenced JSON block. Serializes `input` verbatim so a subsequent
    * {@link parseClaimComment} round-trips deep-equal.
    */
   export function buildClaimBody(input: FleetClaim): string {
     return `${CLAIM_MARKER}\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\`\n`;
   }
   ```

   _(Note: reference `FleetClaimSchema` import is added now so Task 3 needs no import edit; if the linter flags an unused import in this task, defer the import to Task 3 instead.)_

4. Run the test — observe PASS:
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/index.test.ts`
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(core): add fleet/claims module constants + buildClaimBody`

### Task 3: `parseClaimComment` — SC6 round-trip + tolerance (TDD)

**Depends on:** Task 2 | **Files:** `packages/core/src/fleet/claims/index.ts`, `packages/core/src/fleet/claims/index.test.ts` | **Owns:** `packages/core/src/fleet/**`

1. Append tests to `packages/core/src/fleet/claims/index.test.ts`:

   ```ts
   import { buildClaimBody as _b, parseClaimComment } from './index'; // if not already imported, add parseClaimComment to the existing import

   describe('parseClaimComment — round-trip (SC6)', () => {
     it('deep-equals the original claim through build → parse', () => {
       expect(parseClaimComment(buildClaimBody(claim))).toEqual(claim);
     });

     it('parses a claim embedded in surrounding prose', () => {
       const body = `Heads up team, claiming this now.\n\n${buildClaimBody(claim)}\n\nCheers.`;
       expect(parseClaimComment(body)).toEqual(claim);
     });
   });

   describe('parseClaimComment — tolerance (SC6)', () => {
     it('returns null for a foreign comment (no marker)', () => {
       expect(parseClaimComment('just a normal PR comment')).toBeNull();
     });

     it('returns null for a marked comment with malformed json', () => {
       const body = `${CLAIM_MARKER}\n\n\`\`\`json\n{ not: valid json,,, }\n\`\`\`\n`;
       expect(parseClaimComment(body)).toBeNull();
     });

     it('returns null for a marked comment whose json fails the schema', () => {
       const body = `${CLAIM_MARKER}\n\n\`\`\`json\n${JSON.stringify({ owner: 'x' })}\n\`\`\`\n`;
       expect(parseClaimComment(body)).toBeNull();
     });

     it('never throws on empty or non-json bodies', () => {
       expect(parseClaimComment('')).toBeNull();
       expect(parseClaimComment(CLAIM_MARKER)).toBeNull();
     });
   });
   ```

   (Fold `parseClaimComment` into the module's existing `import { ... } from './index'` line — do not duplicate the import.)

2. Run — observe FAIL (`parseClaimComment` undefined):
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/index.test.ts`
3. Add `parseClaimComment` to `packages/core/src/fleet/claims/index.ts`:

   ````ts
   /**
    * Tolerantly parse a GitHub comment body into a {@link FleetClaim}. Returns
    * `null` — never throws — for a foreign comment (missing marker), a marked
    * comment with malformed JSON, or a marked comment whose payload fails the
    * schema.
    */
   export function parseClaimComment(body: string): FleetClaim | null {
     if (typeof body !== 'string' || !body.includes(CLAIM_MARKER)) return null;
     const afterMarker = body.slice(body.indexOf(CLAIM_MARKER) + CLAIM_MARKER.length);
     const fence = /```json\s*\n([\s\S]*?)\n```/.exec(afterMarker);
     if (!fence) return null;
     let raw: unknown;
     try {
       raw = JSON.parse(fence[1]);
     } catch {
       return null;
     }
     const parsed = FleetClaimSchema.safeParse(raw);
     return parsed.success ? parsed.data : null;
   }
   ````

4. Run — observe PASS:
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/index.test.ts`
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(core): add tolerant parseClaimComment with round-trip + null-on-foreign`

### Task 4: `isLeaseLive` — SC2 (TTL) + SC5 (clock-skew) (TDD)

**Depends on:** Task 3 | **Files:** `packages/core/src/fleet/claims/index.ts`, `packages/core/src/fleet/claims/index.test.ts` | **Owns:** `packages/core/src/fleet/**`

1. Append tests to `packages/core/src/fleet/claims/index.test.ts` (add `isLeaseLive` to the module import):

   ```ts
   describe('isLeaseLive — TTL off server updated_at (SC2)', () => {
     const server = '2026-08-26T14:20:00Z'; // serverUpdatedAt
     it('is live while server + leaseSeconds > now', () => {
       // 720s lease; now = +600s → still live
       expect(isLeaseLive(claim, server, '2026-08-26T14:30:00Z')).toBe(true);
     });
     it('is dead once server + leaseSeconds < now', () => {
       // now = +800s (> 720s) → stale
       expect(isLeaseLive(claim, server, '2026-08-26T14:33:20Z')).toBe(false);
     });
     it('accepts Date instances as well as ISO strings', () => {
       expect(isLeaseLive(claim, new Date(server), new Date('2026-08-26T14:30:00Z'))).toBe(true);
     });
     it('returns false for an unparseable timestamp', () => {
       expect(isLeaseLive(claim, 'not-a-date', '2026-08-26T14:30:00Z')).toBe(false);
     });
   });

   describe('isLeaseLive — clock-skew safety (SC5)', () => {
     it('follows serverUpdatedAt and ignores a wildly skewed claimedAt', () => {
       // claimedAt is a YEAR in the future (skewed writer clock); the decision
       // must depend ONLY on serverUpdatedAt + now.
       const skewed = { ...claim, claimedAt: '2027-08-26T14:20:00Z' };
       // server just now, now = +10s → live regardless of the future claimedAt
       expect(isLeaseLive(skewed, '2026-08-26T14:20:00Z', '2026-08-26T14:20:10Z')).toBe(true);
       // server long ago, now well past lease → stale despite future claimedAt
       expect(isLeaseLive(skewed, '2026-08-26T14:20:00Z', '2026-08-26T15:20:00Z')).toBe(false);
     });
   });
   ```

2. Run — observe FAIL (`isLeaseLive` undefined):
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/index.test.ts`
3. Add `isLeaseLive` + `toMs` helper to `packages/core/src/fleet/claims/index.ts`:

   ```ts
   /**
    * Is the lease still live? Staleness is computed from the GitHub SERVER
    * timestamp (`serverUpdatedAt`), NEVER `claim.claimedAt`, so a claim written
    * by a clock-skewed machine can neither prematurely expire nor over-trust.
    * Live iff `serverUpdatedAt + leaseSeconds > now`. An unparseable timestamp
    * is treated as not-live (fail safe → reclaimable).
    */
   export function isLeaseLive(
     claim: FleetClaim,
     serverUpdatedAt: Date | string,
     now: Date | string
   ): boolean {
     const updatedMs = toMs(serverUpdatedAt);
     const nowMs = toMs(now);
     if (updatedMs === null || nowMs === null) return false;
     return updatedMs + claim.leaseSeconds * 1000 > nowMs;
   }

   function toMs(t: Date | string): number | null {
     const ms = t instanceof Date ? t.getTime() : Date.parse(t);
     return Number.isNaN(ms) ? null : ms;
   }
   ```

4. Run — observe PASS:
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/index.test.ts`
5. Run: `node packages/cli/dist/bin/harness.js validate`
6. Commit: `feat(core): add isLeaseLive (server-clock TTL, skew-safe)`

### Task 5: Wire the core barrel — `fleet/index.ts` + `DIR_COMMENTS` + regenerate

**Depends on:** Task 4 | **Files:** `packages/core/src/fleet/index.ts`, `scripts/generate-core-barrel.mjs`, `packages/core/src/index.ts` (regenerated) | **Category:** integration | **Owns:** `packages/core/src/fleet/index.ts`

1. CREATE `packages/core/src/fleet/index.ts` (the top-level dir index the barrel auto-discovers):

   ```ts
   // packages/core/src/fleet — cross-run fleet coordination primitives.
   export * from './claims';
   ```

2. In `scripts/generate-core-barrel.mjs`, add a `fleet` entry to the `DIR_COMMENTS` map (near line 148, after `roadmap:` reads well) so the generated barrel gives `fleet` a first-class comment + canonical ordering:

   ```js
   fleet:
     'Fleet coordination module — pure cross-run work-claim lease primitives (build/parse/server-clock TTL) for the -fleet family.',
   ```

3. Regenerate both barrels: `pnpm run generate:barrels`
4. Verify the core barrel now re-exports fleet — `packages/core/src/index.ts` should contain `export * from './fleet';`:
   `grep -n "export \* from './fleet'" packages/core/src/index.ts`
5. Verify barrel freshness gate passes: `pnpm run generate:barrels:check`
6. Verify the public export surface compiles end-to-end (import from the package root):
   `pnpm --filter @harness-engineering/core exec vitest run src/fleet/claims/index.test.ts`
7. Run: `node packages/cli/dist/bin/harness.js validate`
8. Commit: `feat(core): wire fleet/claims into the core barrel`

## Sequencing & Parallelism

- **Task 1** is independent (types package) — no dependency.
- **Tasks 2 → 3 → 4** form a strict chain: all three edit the same two files (`packages/core/src/fleet/claims/index.{ts,test.ts}`), so they must run sequentially.
- **Task 5** depends on Task 4 (needs the finished `claims/index.ts` and its barrel-visible exports).
- Task 1 and Task 2 could technically start in parallel (different packages), but Task 2's test imports `FleetClaim` from `@harness-engineering/types`, so Task 1 should land (or at least its type export exist) before Task 2's test runs. Treat Task 1 as a prerequisite for Task 2 in practice.

## Verification (whole phase)

- `pnpm --filter @harness-engineering/types test`
- `pnpm --filter @harness-engineering/core test`
- `pnpm run generate:barrels:check`
- `node packages/cli/dist/bin/harness.js validate`
- Confirm no `fs` / `child_process` / `gh` import appears in `packages/core/src/fleet/**` (pure-module discipline): `grep -rnE "node:fs|node:child_process|execSync|['\"]gh " packages/core/src/fleet` returns nothing.

## Notes / Constraints Honored

- **Pure-core / injected-IO:** `fleet/claims` is string/date-only; no network, no fs, no `gh`. Verified by the grep gate above.
- **Windows path-safety:** the module and its tests use zero filesystem paths (pure transforms over strings), so there are no `path` literals to normalize — Windows-safe by construction.
- **Core barrel is generated, not hand-edited:** `packages/core/src/index.ts` carries the `AUTO-GENERATED` header; the only hand edit is the `DIR_COMMENTS` entry in `scripts/generate-core-barrel.mjs`, then `pnpm run generate:barrels`.
- **Types index is hand-maintained** (not auto-generated): the `FleetClaim` export is added manually, mirroring the `fleet-handoff` export block.
- **No checkpoints:** this phase is mechanically verifiable (tests + validate + barrel-check); no human-verify / decision / action pauses required.
