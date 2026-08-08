# Plan: pr-fleet skill

**Date:** 2026-08-08 · **Spec:** `docs/changes/pr-fleet/proposal.md` · **Tasks:** 18 · **Time:** ~85 min · **Integration Tier:** large

## Goal

Author the `pr-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the terminal **land** stage of the `-fleet` family — that turns an open-PR queue into a triaged, review-assisted, human-authorized, independently-verified batch land through a five-phase SELECT → CONFIRM → DISPATCH → VERIFY → LAND/REPORT loop. Extract the genuinely-shared, stage-agnostic `-fleet` spine into `docs/reference/fleet-family.md` (cited by roadmap-fleet and the remaining siblings), add the land-stage human-merge-gate ADR, platform symlinks, and regenerated docs.

## Observable Truths (Acceptance Criteria)

1. `harness skill validate pr-fleet` exits 0 (all required behavioral + rigid sections present, `name` matches directory, referenced tools/deps exist, domain-specific Rationalizations parity passes).
2. `agents/skills/claude-code/pr-fleet/SKILL.md` contains, in order: `# heading` + `> summary`, `## When to Use` (positive + negative), `## Flags`, `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, LAND/REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The `## Rationalizations to Reject` section is domain-specific (3–8 entries, none of the three universal filler rows) — the parity validator passes.
4. The SKILL.md and skill.yaml bodies contain zero internal roadmap/PR/issue numbers (they ship to adopter projects); the spine doc and ADRs are cited by name/title only.
5. `agents/skills/{codex,cursor,gemini-cli}/pr-fleet` each resolve as symlinks to `../claude-code/pr-fleet`.
6. `docs/reference/fleet-family.md` exists, captures the shared spine (five-phase skeleton, governor/machine-storm cap, artifact + all-OS-CI verification, worktree fan-out + push caveat, never-silent-merge), and is cross-referenced from both roadmap-fleet and pr-fleet SKILL.md.
7. `docs/reference/skills-catalog.md` is regenerated and lists `pr-fleet`.
8. One ADR exists: `docs/knowledge/decisions/0089-pr-fleet-land-stage-human-merge-gate.md`, with the repo ADR frontmatter + Context/Decision/Consequences/Alternatives Considered/References, and states where the merge authority sits for the terminal fleet stage.
9. `harness skill validate` (whole-suite) still exits 0 (no regression across the other 79 skills).
10. `pnpm format:check` (or `prettier --check`) reports no formatting diffs for the created/edited files.

## Uncertainties

- [ASSUMPTION] Platform skill-source dirs are exactly `codex`, `cursor`, `gemini-cli` (matches roadmap-fleet); `antigravity` is a plugin-generation target, not a skill symlink source.
- [ASSUMPTION] Next free ADR number is 0089 (highest existing is 0088). If a concurrent branch claims it, renumber per the ADR convention.
- [PARKED] Documented shared-contract (reference doc) vs physically-extracted runtime `-fleet` library/base skill — recommended default is the reference doc (consistent with ADR 0088 precedent); parked for the human because it commits all five remaining siblings.
- [PARKED] Exact seat of the human merge gate — recommended default is the CONFIRM batch-authorization + verified LAND executor; parked for the human (alternatives: post-verify second touchpoint, or GitHub-native auto-merge-on-green).
- [DEFERRABLE] Exact wording of per-phase prose and example transcripts — finalized during authoring; does not change task structure.

## File Map

- CREATE `agents/skills/claude-code/pr-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/pr-fleet/SKILL.md`
- CREATE `agents/skills/codex/pr-fleet` (symlink → `../claude-code/pr-fleet`)
- CREATE `agents/skills/cursor/pr-fleet` (symlink → `../claude-code/pr-fleet`)
- CREATE `agents/skills/gemini-cli/pr-fleet` (symlink → `../claude-code/pr-fleet`)
- CREATE `docs/reference/fleet-family.md` (the extracted shared spine)
- CREATE `docs/knowledge/decisions/0089-pr-fleet-land-stage-human-merge-gate.md`
- MODIFY `agents/skills/claude-code/roadmap-fleet/SKILL.md` (add a one-line cross-reference to the shared spine doc)
- MODIFY `docs/reference/skills-catalog.md` (regenerated — do not hand-edit)
- MODIFY generated plugin artifacts (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) via `harness generate-slash-commands`

## Skeleton

1. Foundation — skill dir, `skill.yaml`, SKILL heading + When to Use + Flags (~2 tasks, ~10 min)
2. Shared spine doc — `docs/reference/fleet-family.md` (~1 task, ~10 min)
3. Phase 1 SELECT (triage taxonomy) + CONFIRM (merge authorization) prose (~2 tasks, ~12 min)
4. Phase 2 DISPATCH (review-assist fan-out) prose (~1 task, ~6 min)
5. Phase 3 VERIFY + LAND/REPORT prose (~2 tasks, ~12 min)
6. Discipline — Harness Integration, Success Criteria, Gates, Escalation, Rationalizations, Red Flags, Examples, Test Scenarios (~4 tasks, ~18 min)
7. Registration + regen — validate, symlinks, roadmap-fleet cross-ref, slash-command regen, catalog regen (~4 tasks, ~12 min)
8. ADR + final sweep — land-stage ADR, prettier/format:check/validate sweep (~2 tasks, ~5 min)

**Estimated total:** 18 tasks, ~85 minutes.

## Notes for the executor

- **This is skill-authoring** (docs/instructions), not TS package code. There is no code-level TDD; the verification equivalents are `harness skill validate pr-fleet` (schema + section parity), the embedded Test Scenarios, and `format:check`. Every authoring task's acceptance check names the concrete gate that proves it.
- **Keep the SKILL.md self-contained.** The shared spine lives in `docs/reference/fleet-family.md` and is _cited_, but the SKILL.md must still carry its full required sections to pass validation and to run standalone in adopter projects — the reference doc is a reader aid and sibling-onboarding anchor, not an include.
- **Never `--no-verify`.** This worktree is nested under `.claude/`, which breaks the local `check-docs` push gate (self-excludes → scans zero files). Push via the GitHub API or a non-`.claude` worktree.
- **Never run destructive write-mode generators blindly** — prefer `harness generate-slash-commands` / `harness generate` as roadmap-fleet did, and commit the regenerated shared files (plugin commands, skills-catalog).
