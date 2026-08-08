# Plan: test-fleet skill

**Date:** 2026-08-08 · **Spec:** `docs/changes/test-fleet/proposal.md` · **Tasks:** 14 · **Time:** ~70 min · **Integration Tier:** large

## Goal

Author the `test-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — a quality-queue member of the `-fleet` family — that turns a test-coverage backlog into a batch of green, reviewable test PRs through a five-phase SELECT → CONFIRM → DISPATCH → VERIFY → REPORT loop. Compose `harness-test-advisor` for coverage-gap selection, run the real `harness-tdd` then `test-craft` authoring flow per target, verify by added behavior-asserting tests + a coverage delta + all-OS CI, and cite the documented family spine (`docs/reference/fleet-family.md`). No new shared doc, no new ADR.

## Observable Truths (Acceptance Criteria)

1. `harness skill validate test-fleet` exits 0 (all required behavioral + rigid sections present, `name` matches directory, referenced tools/deps exist, domain-specific Rationalizations parity passes).
2. `agents/skills/claude-code/test-fleet/SKILL.md` contains, in order: `# heading` + `> summary`, `## When to Use` (positive + negative), `## Flags`, `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The `## Rationalizations to Reject` section is domain-specific (3–8 entries, none of the three universal filler rows) — the parity validator passes.
4. The SKILL.md and skill.yaml bodies contain zero internal roadmap/PR/issue numbers (they ship to adopter projects); the spine doc and ADRs are cited by name/title only.
5. `agents/skills/{codex,cursor,gemini-cli}/test-fleet` each resolve as symlinks to `../claude-code/test-fleet`.
6. The SKILL.md cites `docs/reference/fleet-family.md` for the shared spine and states only the stage-specific parts (coverage-gap queue, tdd/test-craft per-item pipeline, authoring-shaped verification, test-PR terminal act).
7. `docs/reference/skills-catalog.md` is regenerated and lists `test-fleet`.
8. `harness skill validate` (whole-suite) still exits 0 (no regression across the other skills).
9. `prettier --check` reports no formatting diffs for the created/edited files.

## Uncertainties

- [ASSUMPTION] Platform skill-source dirs are exactly `codex`, `cursor`, `gemini-cli` (matches roadmap-fleet / pr-fleet); `antigravity` is a plugin-generation target, not a skill symlink source.
- [ASSUMPTION] No new ADR — family-level design is fixed by the fan-out ADR + interaction-model ADR + the documented spine; test-fleet's stage-specific choices are member-local and recorded in the proposal/SKILL.md. (Also avoids ADR-number collision with concurrent sibling members.)
- [ASSUMPTION] "Covered" = exercised by a behavior-asserting test; the coverage metric is whatever `harness-test-advisor` reports for the project.
- [ASSUMPTION] Ranking = criticality × coverage-deficit via roadmap-pilot-style scoring; uncovered critical paths rank highest.
- [ASSUMPTION] Per-target PR scope = one PR per target, small cohesive targets grouped, capped review-sized.
- [ASSUMPTION] canary test-authoring is an optional composition; the hard dependency is the harness authoring flow so the skill runs standalone.
- [DEFERRABLE] Exact per-phase prose and example transcripts — finalized during authoring; does not change task structure.

## File Map

- CREATE `agents/skills/claude-code/test-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/test-fleet/SKILL.md`
- CREATE `agents/skills/codex/test-fleet` (symlink → `../claude-code/test-fleet`)
- CREATE `agents/skills/cursor/test-fleet` (symlink → `../claude-code/test-fleet`)
- CREATE `agents/skills/gemini-cli/test-fleet` (symlink → `../claude-code/test-fleet`)
- MODIFY `docs/reference/skills-catalog.md` (regenerated — do not hand-edit)
- MODIFY generated plugin artifacts (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) via `harness generate`

## Skeleton

1. Foundation — skill dir, `skill.yaml`, SKILL heading + When to Use + Flags (~2 tasks, ~10 min)
2. Phase 1 SELECT (coverage-gap enumeration + criticality×deficit ordering) + CONFIRM (target list, drops, forks, grouping) prose (~2 tasks, ~12 min)
3. Phase 2 DISPATCH (tdd→test-craft authoring fan-out, no coverage-theater) prose (~1 task, ~6 min)
4. Phase 3 VERIFY (added tests + coverage delta + all-OS CI) + REPORT prose (~2 tasks, ~12 min)
5. Discipline — Harness Integration, Success Criteria, Gates, Escalation, Rationalizations, Red Flags, Examples, Test Scenarios (~4 tasks, ~18 min)
6. Registration + regen — validate, symlinks, catalog/plugin regen, format sweep (~3 tasks, ~12 min)

**Estimated total:** 14 tasks, ~70 minutes.

## Notes for the executor

- **This is skill-authoring** (docs/instructions), not TS package code. There is no code-level TDD; the verification equivalents are `harness skill validate test-fleet` (schema + section parity), the embedded Test Scenarios, and `prettier --check`. Every authoring task's acceptance check names the concrete gate that proves it.
- **Keep the SKILL.md self-contained.** The shared spine lives in `docs/reference/fleet-family.md` and is _cited_, but the SKILL.md must still carry its full required sections to pass validation and run standalone in adopter projects.
- **Never `--no-verify`.** This worktree is nested under `.claude/`, which breaks the local `check-docs` push gate (self-excludes → scans zero files). Push via the GitHub API or a non-`.claude` worktree.
- **Never run destructive write-mode generators blindly** — `generate:plugin:all` write-mode wipes sibling command files in a symlinked worktree; extract only test-fleet's regenerated plugin files per target and restore the rest, then confirm `generate:plugin:check` passes for all targets.
