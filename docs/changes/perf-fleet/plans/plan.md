# Plan: perf-fleet skill

**Date:** 2026-08-30 · **Spec:** `docs/changes/perf-fleet/proposal.md` · **Issue:** #1233 · **Tasks:** 10 · **Integration Tier:** large

## Goal

Author the `perf-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the performance quality-queue member of the `-fleet` family — that turns a perf-budget-violation/runtime-regression backlog into a ranked, confirmed, fan-out-remediated, independently-verified **tiered** batch of perf-fix PRs and filed redesign issues through the shared five-phase SELECT → CONFIRM → DISPATCH → VERIFY → REPORT loop. The skill composes the existing perf detectors/measurement (`check_performance`, `harness check-perf`, `get_perf_baselines`, `get_critical_paths`, `harness-perf`) for its queue and before/after measurement and the real `harness-debugging` / `harness-refactoring` as its per-target fix drivers; it holds a measured-before/after bar (the perf analog of bug-fleet's reproduction bar), cites the shared spine and family ADRs by title rather than restating them, and never auto-merges.

## Observable Truths (Acceptance Criteria)

1. `harness skill validate perf-fleet` exits 0 (all required sections present, `name` matches directory, referenced tools/deps exist, domain-specific Rationalizations parity passes).
2. `SKILL.md` contains, in order: `# heading` + `> summary`, `## Boundary`, `## When to Use` (positive + negative), `## Flags`, `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The `## Rationalizations to Reject` section is domain-specific (none of the three universal filler rows) — the parity validator passes.
4. The measured before/after bar is an Iron Law; "never move the goalpost" (rebaseline / threshold relaxation) is a Gate and a Test Scenario; the risky class is filed-not-applied.
5. The SKILL.md and skill.yaml bodies contain zero internal roadmap/PR/issue numbers (they ship to adopters); the spine doc and ADRs are cited by name/title only.
6. `agents/skills/{codex,cursor,gemini-cli}/perf-fleet` each resolve as symlinks to `../claude-code/perf-fleet`.
7. `docs/reference/skills-catalog.md` + `docs/reference/tool-catalog.md` regenerated and list `perf-fleet`; slash commands generated for all platforms.
8. No new ADR — the family ADRs (0087 fan-out, 0088 front-load/park, 0105 claim-lease) are cited by title only.
9. `harness skill validate` (whole-suite) still exits 0 (no regression across the other skills).
10. `prettier --check` reports no diffs; `generate:plugin:check`, `generate-docs`, and tool-catalog freshness pass; a no-release changeset is present.

## Uncertainties

- [RESOLVED] Auto-remediate vs only-file (the candidate park) → **tiered** by bug-fleet/craft-fleet precedent: auto-remediate the safe class into fix PRs, file the risky class as issues with measurement evidence. Recorded in provenance `parkedForks` and argued in proposal.md.
- [ASSUMPTION] Per-target pipeline is a FIXED measure→remediate→re-measure loop (fix-driver selected by cause: regression→debugging, structural breach→refactoring); ADR 0103 routing is N/A (bug-fleet precedent).
- [ASSUMPTION] Measured before/after is taken against UNMODIFIED baselines; a baseline/threshold edit is a goalpost move that fails VERIFY. Baselines persisted only via `update_perf_baselines`.
- [ASSUMPTION] Safe class = bounded local optimization, no public-API/observable-behaviour change; risky class = large/architectural redesign or hot-path correctness change → filed.
- [ASSUMPTION] Register perf-fleet in fleet-family.md Members table + quality-queue sentence for completeness (low-risk additive row).
- [DEFERRABLE] Exact wording of per-phase prose and example transcripts — finalized during authoring; does not change task structure.

## File Map

- CREATE `agents/skills/claude-code/perf-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/perf-fleet/SKILL.md`
- CREATE `agents/skills/{codex,cursor,gemini-cli}/perf-fleet` (symlinks → `../claude-code/perf-fleet`)
- CREATE `docs/changes/perf-fleet/{proposal.md,provenance.json,SKILLS.md,plans/plan.md}` (lifecycle artifacts)
- MODIFY `docs/reference/fleet-family.md` (register perf-fleet: Members table + conveyor sentence)
- MODIFY `docs/reference/skills-catalog.md`, `docs/reference/tool-catalog.md` (regenerated — do not hand-edit)
- MODIFY generated plugin artifacts (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) via generators
- CREATE `.changeset/perf-fleet.md` (empty no-release changeset)

## Implementation Order

1. Author `skill.yaml` (rigid tier-2 contract; depends_on harness-perf / harness-debugging / harness-refactoring / harness-roadmap-pilot; five phases; addresses perf-regression + high-complexity).
2. Author `SKILL.md` modeled on docs-fleet's five-phase layout + bug-fleet's measured-bar/tiered-terminal shape; Boundary vs cleanup-fleet/cicd-fleet on the measurement line.
3. Create the three platform-mirror symlinks.
4. Run `harness skill validate perf-fleet` and the whole-suite validate.
5. Register perf-fleet in `fleet-family.md`.
6. Run generators (`generate:plugin:all`, `generate-docs`, `generate:tool-catalog`).
7. Write lifecycle artifacts (proposal, provenance, plan, SKILLS) and the changeset.
8. `prettier --write` created/edited files; run freshness checks (`generate:plugin:check`, tool-catalog `--check`).
9. Build CLI (Node 22) and commit through the pre-commit gates (never `--no-verify`).
10. Open PR `Closes #1233`; verify all-OS CI.
