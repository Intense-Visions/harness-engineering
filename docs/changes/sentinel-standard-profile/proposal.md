---
title: Move sentinel-pre/post to the standard hook profile
status: planned
keywords: [hook-profiles, sentinel, prompt-injection, security-floor, standard-tier, taint-state]
roadmap: github:Intense-Visions/harness-engineering#556
---

# Move sentinel-pre/post to the standard hook profile

## Overview & Goals

`sentinel-pre` / `sentinel-post` provide prompt-injection defense — detection of
zero-width characters, RTL/LTR overrides, role-reassignment, permission-escalation,
base64 exfiltration, and blocking of destructive bash during a tainted session. They
currently ship at the `strict` profile only (`packages/cli/src/hooks/profiles.ts:37-38`).

The default profile is `standard` (`packages/cli/src/commands/setup.ts:166`), so the
overwhelming majority of adopters receive **none** of this defense. The goal is to
promote both hooks to `standard` so default adopters are protected, while `cost-tracker`
remains strict-only as an unrelated concern. (Roadmap #556, P0.)

## Decisions Made

1. **Move both hooks to `standard`** (not post-only). Default adopters get both
   detection (`sentinel-post`) and enforcement (`sentinel-pre`). Post-only would leave
   the most important enforcement off by default, defeating the P0 intent.
2. **Reframe the tier contract; do not neuter the hook.** `sentinel-pre`'s exit-2 block
   stays. The header doc comment is corrected so `standard` reads as
   _"quality-warns-never-blocks **plus security/safety floors.**"_ Rationale:
   `block-no-verify` already blocks at `minimal`, so "never blocks" was always about
   _quality gates_, not _safety floors_. `sentinel-pre` only blocks a destructive op in
   an _already-tainted_ session (`sentinel-pre.js:128-171`) — the same safety-floor class
   as `block-no-verify`.
3. **`cost-tracker` remains `strict`.** It is cost telemetry, not security, and is out of
   scope for this change.
4. **Reconciliation rides the existing `harness update` path** — no new migration code.
   Add a changeset and a CHANGELOG-grade notice because this changes default _blocking_
   behavior for existing standard adopters.

## Technical Design

- `packages/cli/src/hooks/profiles.ts`:
  - Flip `minProfile: 'strict' → 'standard'` on the `sentinel-pre` and `sentinel-post`
    rows (lines 37-38).
  - Update the header doc comment (lines 4-8): move `sentinel-pre`/`sentinel-post` from
    the `strict` bullet into the `standard` bullet, and add the "security/safety floors"
    framing to the `standard` description. Keep `cost-tracker` on the `strict` bullet.
- No change to the hook scripts (`sentinel-pre.js`, `sentinel-post.js`), to `initHooks`,
  or to `update.ts`. Reconciliation is already additive: `harness update` calls
  `initHooks` (`update.ts:392`), which rebuilds the active hook set from the live
  `PROFILES` table and re-merges `.claude/settings.json`
  (`hooks/init.ts:98,156-158`). The moment the tier table changes, existing `standard`
  projects pick up sentinel on their next `harness update`.

## Integration Points

- **Entry Points:** None new. The behavior of existing `setup` / `update` /
  `hooks init|add|list` shifts via the tier table; no new command, MCP tool, or skill.
- **Registrations Required:** None. No barrel export, skill tier, or route registration
  changes.
- **Documentation Updates:** The `profiles.ts` header doc comment (the tier contract) is
  the documentation surface and is updated in Technical Design. A changeset entry is added.
- **Architectural Decisions:** **ADR-0046** is warranted. This changes the default
  security posture _and_ reframes the documented tier contract — exactly the load-bearing
  hook-profile change that the neighboring roadmap item ("flag hook-profile changes without
  an ADR") expects to be ADR-grade. Decision #2 (safety-floor reframing) is the ADR's core
  claim.
- **Knowledge Impact:** Reinforce the graph concept that the `standard` tier now carries a
  _security floor_, distinct from quality gates which remain warn-only until `strict`.

## Success Criteria

1. `PROFILES.standard` contains `sentinel-pre` and `sentinel-post`; `PROFILES.strict`
   still contains them (additive-superset invariant holds).
2. `PROFILES.standard` does **not** contain `cost-tracker` or `strict-quality-gate`.
3. `profiles.test.ts`, `hooks/integration.test.ts`, and `commands/hooks.test.ts` are
   updated and green; the full `packages/cli` suite passes.
4. A fresh `standard` init materializes `sentinel-pre`/`sentinel-post` into
   `.claude/settings.json`.
5. ADR-0046 exists and a changeset is present.

## Implementation Order

1. Flip the tier table and update the header doc comment in `profiles.ts`.
2. Update `profiles.test.ts` assertions (assert sentinel ∈ standard; keep
   cost-tracker ∉ standard) and any affected integration/snapshot fixtures.
3. Write ADR-0046 and the changeset.
4. Run `pnpm --filter @harness-engineering/cli test` (hooks + commands) and
   `harness validate`.

## Tradeoffs & Risks

- Default adopters now run two `matcher:'*'` hooks on every tool call. This overhead is
  already proven at the `strict` profile, but it is real per-call cost at the new default.
- The first time a default adopter hits a tainted-session block, it may surprise them.
  The changeset notice exists to make this behavior change discoverable.
- Primary implementation risk is a missed test/snapshot assertion; mitigated by the
  explicit success criteria above.
