# Phase 4 Plan: ADR + conductor + docs

**Phase:** 4 (low). **Integration tier:** low. **Checkpoints:** 0.

Small, additive closing phase: record the family decision as an ADR, thread the two flags through the conductor, and pin the ADR reference in the spine. AGENTS.md has no fleet-coordination summary section (verified via grep) → no AGENTS.md change needed; the `fleet-family.md` spine section remains the canonical doc.

## Tasks

### Task 1: Family ADR 0104 — cross-run advisory work-claim lease

**Files:** `docs/knowledge/decisions/0104-fleet-cross-run-claim-lease.md`

Author the ADR (read a recent neighbor, e.g. `0103-*.md` and `0088`-referencing ADRs, to match the exact template/frontmatter the repo's ADR validator expects). Content: the decision to give ID-based fleet members a GitHub-backed advisory claim lease bridging the `SELECT → PR-open` window; the **soft-reservation-over-true-CAS-git-ref** rationale (best-effort, not exactly-once — records _why not_ a hard guarantee, per spec D3); staleness off the GitHub server clock; the open-PR-is-the-durable-claim rule; v1 scope = ID-based members only (roadmap/issue/pr), area-based deferred. Status: accepted. Cross-reference ADR 0088 (front-load/park model) and the spine section. Depends on: nothing.

### Task 2: Pin the ADR reference in the spine

**Files:** `docs/reference/fleet-family.md`

The spine section currently references the claim-lease ADR as "authored in Phase 4" / forthcoming with no number. Replace that forward-reference with the concrete **ADR 0104** link, and add it to the `## References` list if that list enumerates family ADRs. Do not alter any other section. Depends on: Task 1.

### Task 3: Conductor flag pass-through

**Files:** `agents/skills/claude-code/fleet-command/SKILL.md`

Add `--lease-seconds <n>` and `--no-claim` to the conductor's flags table (the `| \`--flag\` |` table around lines 36-41), described as **passed through verbatim to each ID-based member lane** (the conductor owns scheduling/budget, not the per-item claim — claims remain member-owned, per the spec's "fleet-command interaction" section). One sentence, referencing the spine section. Depends on: nothing.

### Task 4: Commit the stranded Phase 2 plan + regenerate mirrors

**Files:** `docs/changes/fleet-cross-run-claim-lease/plans/2026-08-26-fleet-claim-spine-reference-member-plan.md` (untracked → track it), plugin/gemini mirror artifacts for `fleet-command`.

`git add` the untracked Phase 2 spine plan (it belongs in history alongside the others). Run `pnpm run generate:plugin:all` for the fleet-command SKILL.md edit, commit regenerated artifacts, and confirm `generate:plugin:check` + `generate:barrels:check` green. Depends on: Task 3.

## Verification

- ADR validator / `harness validate` accepts the new ADR (correct frontmatter, number, no duplicate).
- Spine section references ADR 0104 (no remaining "forthcoming"/"Phase 4" placeholder for the ADR).
- `skill validate fleet-command` passes; `generate:plugin:check` + `generate:barrels:check` green.
- No core/types code changes.
