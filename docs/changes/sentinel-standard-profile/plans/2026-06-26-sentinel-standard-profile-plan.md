# Plan: Move sentinel-pre/post to the standard hook profile

**Date:** 2026-06-26 | **Spec:** docs/changes/sentinel-standard-profile/proposal.md | **Tasks:** 4 | **Time:** ~16 min | **Integration Tier:** medium

## Goal

Promote `sentinel-pre` and `sentinel-post` from the `strict` to the `standard` hook profile so default adopters receive prompt-injection defense, and reframe the documented tier contract so `standard` reads as "quality gates warn-never-block PLUS security/safety floors."

## Observable Truths (Acceptance Criteria)

1. The system shall include `sentinel-pre` and `sentinel-post` in `PROFILES.standard` and continue to include them in `PROFILES.strict` (additive-superset invariant holds).
2. The system shall not include `cost-tracker` or `strict-quality-gate` in `PROFILES.standard`.
3. When `buildSettingsHooks('standard')` runs, the system shall return 8 hooks: 3 `PreToolUse` (block-no-verify, protect-config, sentinel-pre), 2 `PostToolUse` (quality-warner, sentinel-post), 1 `PreCompact`, 2 `Stop`.
4. `profiles.test.ts`, `hooks/integration.test.ts`, and `commands/hooks.test.ts` pass; the scoped hooks + commands suite is green.
5. The `profiles.ts` header doc comment shall list sentinel under the `standard` bullet with "security/safety floors" framing, and keep `cost-tracker` under the `strict` bullet.
6. ADR-0046 exists in `docs/knowledge/decisions/` capturing the "standard tier = warns-never-blocks PLUS security floors" reframing.
7. A changeset exists in `.changeset/` noting the default-profile blocking-behavior change.

## File Map

- MODIFY `packages/cli/src/hooks/profiles.ts` (flip two `minProfile` rows; rewrite header doc comment lines 4-8)
- MODIFY `packages/cli/tests/hooks/profiles.test.ts` (assert sentinel ∈ standard)
- MODIFY `packages/cli/tests/commands/hooks.test.ts` (standard-profile counts 6→8, PreToolUse 2→3, PostToolUse 1→2; refresh strict comment)
- VERIFY (read-only) `packages/cli/tests/hooks/integration.test.ts` (iterates `PROFILES.strict` — set unchanged — so expected to stay green with no edit)
- CREATE `docs/knowledge/decisions/0046-standard-tier-carries-a-security-floor.md`
- CREATE `.changeset/sentinel-standard-profile.md`

## Skeleton

_Not produced — task count (4) below the standard-mode threshold (8)._

## Change Specification (delta)

### Hook tier contract (`PROFILES` / `profiles.ts` header)

- [MODIFIED] `sentinel-pre.minProfile`: `strict` → `standard`
- [MODIFIED] `sentinel-post.minProfile`: `strict` → `standard`
- [MODIFIED] Header doc comment: sentinel moves from the `strict` bullet to the `standard` bullet; `standard` gains "security/safety floors" framing; `cost-tracker` stays on the `strict` bullet
- [UNCHANGED] `sentinel-pre.js` / `sentinel-post.js` scripts, `initHooks`, `update.ts` — reconciliation rides the existing `harness update` → `initHooks` path

## Uncertainties

- [ASSUMPTION] Changeset bump type is `minor` (security-posture promotion = new default behavior). If the maintainer prefers `patch`, only the front-matter line in Task 3 changes. Decisive choice: `minor`.
- [DEFERRABLE] Knowledge-graph enrichment ("standard tier now carries a security floor") from the spec's Knowledge Impact section is captured narratively by ADR-0046; no separate graph-write task is included. Revisit if graph nodes are desired.
- [RESOLVED] `integration.test.ts` iterates `PROFILES.strict`, whose membership is unchanged (strict still contains all 10 hooks; `HOOK_SCRIPTS.length === PROFILES.strict.length` stays 10). Expected: no edit. Task 1 confirms by running it.

## Sequencing rationale (note on TDD ordering)

The spec's Implementation Order requires the source flip first, then the test updates. This is a tier-table contract flip rather than new behavioral logic, so the updated tests _lock the new invariant_ rather than drive it. To honor that ordering while keeping each commit atomic and green, Task 1 performs source-then-tests **within a single task**: flip the table, observe the existing `hooks.test.ts` count assertion go red (evidence the flip took effect), then update the tests to green and commit once. This avoids landing a transiently-red commit while preserving the requested order. Files touched in Task 1: `profiles.ts`, `profiles.test.ts`, `hooks.test.ts` (3 — at the limit), plus a read-only check of `integration.test.ts`.

## Tasks

### Task 1: Flip the tier table, reframe the header doc comment, and re-lock the test invariant

**Depends on:** none | **Files:** `packages/cli/src/hooks/profiles.ts`, `packages/cli/tests/hooks/profiles.test.ts`, `packages/cli/tests/commands/hooks.test.ts` (+ read-only `packages/cli/tests/hooks/integration.test.ts`)

1. In `packages/cli/src/hooks/profiles.ts`, change the `sentinel-pre` row (line 37):

   ```ts
   { name: 'sentinel-pre', event: 'PreToolUse', matcher: '*', minProfile: 'standard' },
   ```

2. Change the `sentinel-post` row (line 38):

   ```ts
   { name: 'sentinel-post', event: 'PostToolUse', matcher: '*', minProfile: 'standard' },
   ```

3. Replace the header doc comment (lines 4-8) with:

   ```ts
   /**
    * Hook profile definitions.
    *
    * Profiles are additive: each higher tier includes all hooks from lower tiers.
    * - minimal: safety floor (block-no-verify only)
    * - standard: + protect-config, quality-warner (quality gates warn, never block),
    *   pre-compact-state, adoption-tracker, telemetry-reporter, plus security/safety
    *   floors: sentinel-pre, sentinel-post. Quality gates warn-never-block here; the
    *   security floors may block (e.g. a destructive bash op in an already-tainted
    *   session) — the same safety-floor class as block-no-verify. (default)
    * - strict: + strict-quality-gate (blocks on quality violations), cost-tracker
    */
   ```

4. Run the command suite to observe the pre-existing assertion fail (proves the flip landed):

   ```
   pnpm --filter @harness-engineering/cli test -- commands/hooks.test.ts
   ```

   Expect the `builds standard profile with 6 hooks` test to FAIL (PreToolUse now 3, PostToolUse now 2).

5. In `packages/cli/tests/commands/hooks.test.ts`, update the standard-profile test (lines 35-43) to:

   ```ts
   it('builds standard profile with 8 hooks across 4 events', () => {
     const hooks = buildSettingsHooks('standard');
     expect(hooks.PreToolUse).toHaveLength(3); // block-no-verify, protect-config, sentinel-pre
     expect(hooks.PostToolUse).toHaveLength(2); // quality-warner, sentinel-post
     expect(hooks.PreCompact).toHaveLength(1);
     expect(hooks.Stop).toHaveLength(2);
     expect(hooks.Stop[0].hooks[0].command).toContain('adoption-tracker.js');
     expect(hooks.Stop[1].hooks[0].command).toContain('telemetry-reporter.js');
   });
   ```

6. In the same file, update the strict-profile comment (lines 47-48) so sentinel is annotated as inherited from standard:

   ```ts
   expect(hooks.PreToolUse).toHaveLength(3); // block-no-verify, protect-config, sentinel-pre (all from standard)
   expect(hooks.PostToolUse).toHaveLength(3); // quality-warner, sentinel-post (from standard), strict-quality-gate
   ```

   (Counts are unchanged — strict still has 3/3 — only the comments change.)

7. In `packages/cli/tests/hooks/profiles.test.ts`, extend the standard test (after line 21, before the `not.toContain` assertions) to lock the new invariant:

   ```ts
   expect(PROFILES.standard).toContain('sentinel-pre');
   expect(PROFILES.standard).toContain('sentinel-post');
   ```

   Leave the existing `expect(PROFILES.standard).not.toContain('cost-tracker')` and `not.toContain('strict-quality-gate')` and the additive-superset test untouched — they still hold.

8. Read `packages/cli/tests/hooks/integration.test.ts` and confirm no edit is needed (it iterates `PROFILES.strict`, unchanged; `HOOK_SCRIPTS` length stays 10). Do not edit unless an assertion references sentinel's strict-only placement.

9. Run the scoped suite — observe green:

   ```
   pnpm --filter @harness-engineering/cli test -- hooks/profiles.test.ts hooks/integration.test.ts commands/hooks.test.ts
   ```

10. Run: `harness validate`

11. Commit: `feat(hooks): promote sentinel-pre/post to the standard profile`

### Task 2: Write ADR-0046 — standard tier carries a security floor

**Depends on:** Task 1 | **Files:** `docs/knowledge/decisions/0046-standard-tier-carries-a-security-floor.md` | **Category:** integration

1. Create `docs/knowledge/decisions/0046-standard-tier-carries-a-security-floor.md` with this content:

   ```markdown
   ---
   number: 0046
   title: The standard hook tier carries a security floor
   date: 2026-06-26
   status: accepted
   tier: medium
   source: docs/changes/sentinel-standard-profile/proposal.md
   ---

   ## Context

   `sentinel-pre` / `sentinel-post` provide prompt-injection defense (zero-width and
   RTL/LTR override detection, role-reassignment and permission-escalation detection,
   base64 exfiltration detection, and blocking of destructive bash during an
   already-tainted session). They shipped at the `strict` profile only, while the default
   profile is `standard` (`packages/cli/src/commands/setup.ts`). The overwhelming majority
   of adopters therefore received none of this defense.

   The header doc comment in `packages/cli/src/hooks/profiles.ts` framed `standard` as
   "warns, never blocks." Taken literally, that framing made promoting a hook that _can_
   exit-2 block look like a tier-contract violation. But `block-no-verify` already blocks
   at `minimal`, so "never blocks" was always about _quality gates_, never about _safety
   floors_. `sentinel-pre` only blocks a destructive op in an already-tainted session
   (`sentinel-pre.js`) — the same safety-floor class as `block-no-verify`.

   ## Decision

   The `standard` tier carries a **security/safety floor** distinct from quality gates:

   - Quality gates (`quality-warner`) warn-never-block until `strict` (where
     `strict-quality-gate` enforces). This is unchanged.
   - Safety floors (`block-no-verify`, and now `sentinel-pre` / `sentinel-post`) may block.
     `sentinel-pre`'s exit-2 block is preserved, not neutered.

   Concretely: `sentinel-pre` and `sentinel-post` move to `minProfile: 'standard'`, and the
   tier-contract doc comment is corrected to read "quality gates warn-never-block PLUS
   security/safety floors." `cost-tracker` stays `strict` — it is cost telemetry, not a
   security floor.

   Reconciliation rides the existing `harness update` → `initHooks` path; no migration code
   is added. Existing `standard` projects pick up sentinel on their next `harness update`.

   ## Consequences

   **Positive:**

   - Default adopters receive prompt-injection detection and tainted-session enforcement
     without opting into `strict`.
   - The tier contract is now precise: "warn-never-block" scopes to quality gates, and the
     security floor is a named, documented property of `standard`.

   **Negative / risks:**

   - Default adopters now run two `matcher:'*'` hooks on every tool call. The overhead is
     already proven at `strict`, but it is real per-call cost at the new default.
   - The first tainted-session block may surprise a default adopter. The changeset notice
     exists to make the behavior change discoverable.
   ```

2. Run: `harness validate`

3. Commit: `docs(decisions): add ADR-0046 standard tier carries a security floor`

### Task 3: Add the changeset for the default-profile behavior change

**Depends on:** Task 2 | **Files:** `.changeset/sentinel-standard-profile.md` | **Category:** integration

1. Create `.changeset/sentinel-standard-profile.md`:

   ```markdown
   ---
   '@harness-engineering/cli': minor
   ---

   Promote sentinel-pre/sentinel-post to the standard hook profile so default adopters get
   prompt-injection defense out of the box. This changes default _blocking_ behavior:
   in an already-tainted session, sentinel-pre can now block a destructive bash op for
   projects on the standard profile (previously strict-only). Existing standard projects
   pick up the hooks on their next `harness update`. cost-tracker remains strict-only.
   ```

2. Run: `harness validate`

3. Commit: `chore(changeset): sentinel moves to the standard hook profile`

### Task 4: Verify scoped suite and project health

**Depends on:** Task 3 | **Files:** none (verification)

[checkpoint:human-verify] — Confirm the scoped suite is green and `harness validate` shows no new issues beyond the known pre-existing baseline (roadmap-spec warnings; two pre-existing circular-dependency findings in `drift/catalog` and `shared/craft/llm`).

1. Run the hooks + commands scope:

   ```
   pnpm --filter @harness-engineering/cli test -- hooks/ commands/hooks.test.ts
   ```

   Expect all green, including the updated `profiles.test.ts`, `integration.test.ts`, and `commands/hooks.test.ts`.

2. Run: `harness validate`

3. Confirm Observable Truths 1-7 are satisfied. No commit (verification only); if any assertion is red, return to Task 1.

## Traceability

| Observable Truth                                  | Delivered by                          |
| ------------------------------------------------- | ------------------------------------- |
| 1 (sentinel ∈ standard & strict; additive)        | Task 1 (steps 1-2, 7)                 |
| 2 (cost-tracker / strict-quality-gate ∉ standard) | Task 1 (step 7, unchanged assertions) |
| 3 (standard buildSettingsHooks counts)            | Task 1 (step 5)                       |
| 4 (three test files green)                        | Task 1 (steps 5-9), Task 4            |
| 5 (header doc comment reframe)                    | Task 1 (step 3)                       |
| 6 (ADR-0046)                                      | Task 2                                |
| 7 (changeset)                                     | Task 3                                |

## Known pre-existing baseline (not caused by this change)

- `harness validate` reports ~353 roadmap-spec warnings (planned items without specs) and two circular-dependency findings (`drift/catalog/index.ts`, `shared/craft/llm/*`). These predate this change; do not attempt to fix them here.
