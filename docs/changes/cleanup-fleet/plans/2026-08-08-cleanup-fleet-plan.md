# Plan: cleanup-fleet skill

**Date:** 2026-08-08 · **Spec:** `docs/changes/cleanup-fleet/proposal.md` · **Tasks:** 14 · **Time:** ~70 min · **Integration Tier:** large

## Goal

Author the `cleanup-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the entropy/hotspot **quality-queue** member of the `-fleet` family — that turns an entropy/hotspot backlog into a ranked, confirmed, fan-out-remediated, independently-verified batch of scoped cleanup PRs through the shared five-phase SELECT → CONFIRM → DISPATCH → VERIFY → REPORT loop. The skill composes the existing detection skills for its queue (`harness-hotspot-detector`, `cleanup-dead-code`, `harness-dependency-health`, `detect_entropy`, churn) and the real `harness-codebase-cleanup` as its per-target pipeline; it cites the shared spine (`docs/reference/fleet-family.md`) and the family ADRs by title rather than restating them, and never auto-merges.

## Observable Truths (Acceptance Criteria)

1. `harness skill validate cleanup-fleet` exits 0 (all required behavioral + rigid sections present, `name` matches directory, referenced tools/deps exist, domain-specific Rationalizations parity passes).
2. `agents/skills/claude-code/cleanup-fleet/SKILL.md` contains, in order: `# heading` + `> summary`, `## When to Use` (positive + negative), `## Flags`, `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The `## Rationalizations to Reject` section is domain-specific (3–8 entries, none of the three universal filler rows) — the parity validator passes.
4. The SKILL.md and skill.yaml bodies contain zero internal roadmap/PR/issue numbers (they ship to adopter projects); the spine doc and ADRs are cited by name/title only.
5. `agents/skills/{codex,cursor,gemini-cli}/cleanup-fleet` each resolve as symlinks to `../claude-code/cleanup-fleet` (generated).
6. SKILL.md cites `docs/reference/fleet-family.md` as the shared spine and does not re-extract it; the queue/per-item/terminal parts are cleanup-fleet's own.
7. `docs/reference/skills-catalog.md` is regenerated and lists `cleanup-fleet`.
8. No new ADR — the family ADRs (_Subagent worktree fan-out…_, _front-load / park-unforeseen…_) are cited by title only.
9. `harness skill validate` (whole-suite) still exits 0 (no regression across the other skills).
10. `prettier --check` reports no formatting diffs for the created/edited files; `generate:plugin:check` and `generate-docs --check` pass for all targets.

## Uncertainties

- [ASSUMPTION] Ranking basis = composite churn × structural risk (co-change coupling + dependents) × entropy-finding density; highest-risk-with-remediable-findings first. Recorded in the PR "Assumptions made".
- [ASSUMPTION] Remediation scope = one coherent hotspot cluster / entropy finding-group per target per PR; unrelated cleanups never bundled.
- [ASSUMPTION] Safe class (auto-apply via codebase-cleanup --fix): dead-code / dead-export removal, commented-out-code removal, orphaned-dependency removal, import-ordering, forbidden-import replacement. Risky class (park for human): structural refactor of a high-churn hotspot, god-module split, any public-API / observable-behavior change.
- [ASSUMPTION] Platform skill-source dirs are exactly `codex`, `cursor`, `gemini-cli` (matches siblings); `antigravity` is a plugin-generation target, not a skill symlink source.
- [DEFERRABLE] Exact wording of per-phase prose and example transcripts — finalized during authoring; does not change task structure.

## File Map

- CREATE `agents/skills/claude-code/cleanup-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/cleanup-fleet/SKILL.md`
- CREATE `agents/skills/{codex,cursor,gemini-cli}/cleanup-fleet` (symlinks → `../claude-code/cleanup-fleet`, generated)
- CREATE `docs/changes/cleanup-fleet/{proposal.md,SKILLS.md,plans/…}` (lifecycle artifacts)
- MODIFY `docs/reference/skills-catalog.md` (regenerated — do not hand-edit)
- MODIFY generated plugin artifacts (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) via `harness generate`

## Skeleton

1. Foundation — skill dir, `skill.yaml`, SKILL heading + When to Use + Flags (~2 tasks, ~10 min)
2. Phase 1 SELECT (compose detectors → ranked targets) + CONFIRM prose (~2 tasks, ~12 min)
3. Phase 2 DISPATCH (codebase-cleanup fan-out + park-risky) prose (~1 task, ~6 min)
4. Phase 3 VERIFY (convergence + all-OS CI) + REPORT prose (~2 tasks, ~12 min)
5. Discipline — Harness Integration, Success Criteria, Gates, Escalation, Rationalizations, Red Flags, Examples, Test Scenarios (~4 tasks, ~18 min)
6. Registration + regen — validate, generate (symlinks, catalog, plugin dirs), format/generate checks (~3 tasks, ~12 min)

**Estimated total:** 14 tasks, ~70 minutes.

## Notes for the executor

- **This is skill-authoring** (docs/instructions), not TS package code. No code-level TDD; the verification equivalents are `harness skill validate cleanup-fleet` (schema + section parity), the embedded Test Scenarios, and `prettier --check` / `generate:plugin:check`.
- **Keep the SKILL.md self-contained.** The shared spine lives in `docs/reference/fleet-family.md` and is _cited_; the SKILL.md must still carry its full required sections to pass validation and run standalone in adopter projects.
- **Compose, don't reimplement.** The queue is built by running the existing detection skills; the per-target pipeline is the real `harness-codebase-cleanup`. Reimplementing detection or remediation is a gate violation.
- **Never `--no-verify`.** This worktree is nested under `.claude/`, which breaks the local `check-docs` push gate. Push via the GitHub API or a non-`.claude` worktree.
- **Generators are flaky under cold-start tsx in a symlinked worktree** — generate into a scratch dir and copy this skill's files atomically, then re-prettify in-repo (singleQuote:true).
