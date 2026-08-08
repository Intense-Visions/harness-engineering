# Plan: issue-fleet skill

**Date:** 2026-08-08 · **Spec:** `docs/changes/issue-fleet/proposal.md` · **Tasks:** 14 · **Time:** ~70 min · **Integration Tier:** large

## Goal

Author the `issue-fleet` claude-code rigid orchestrator skill (`SKILL.md` + `skill.yaml`) — the **intake** stage and entry point of the `-fleet` family — that turns an open-issue backlog into a clean, ranked, deduped, routed queue for the downstream fleets, through a five-phase SELECT → CONFIRM → DISPATCH → VERIFY → HANDOFF/REPORT loop. The skill **cites** the already-on-main shared spine (`docs/reference/fleet-family.md`) and defines only its intake-stage parts (open-issue queue, label/dedup/route/prioritize taxonomy, human destructive-close gate, terminal ranked queue). Register platform symlinks and regenerate integrations. No new shared doc and no new ADR.

## Observable Truths (Acceptance Criteria)

1. `harness skill validate issue-fleet` exits 0 (all required behavioral + rigid sections present, `name` matches directory, referenced tools/deps exist, domain-specific Rationalizations parity passes).
2. `agents/skills/claude-code/issue-fleet/SKILL.md` contains, in order: `# heading` + `> summary`, `## When to Use` (positive + negative), `## Flags`, `## Process` with `### Iron Law` and five named phases (SELECT, CONFIRM, DISPATCH, VERIFY, HANDOFF/REPORT), `## Harness Integration`, `## Success Criteria`, `## Gates`, `## Escalation`, `## Rationalizations to Reject`, `## Red Flags`, `## Examples`, `## Test Scenarios`.
3. The `## Rationalizations to Reject` section is domain-specific (3–8 entries, none of the universal filler rows) — the parity validator passes.
4. The SKILL.md and skill.yaml bodies contain zero internal roadmap/PR/issue numbers (they ship to adopter projects); the spine doc and ADRs are cited by name/title only.
5. `agents/skills/{codex,cursor,gemini-cli}/issue-fleet` each resolve as symlinks to `../claude-code/issue-fleet`.
6. `SKILL.md` cross-references `docs/reference/fleet-family.md` and states only the intake-stage-specific parts (queue, taxonomy, terminal act), not a re-extraction of the spine.
7. `docs/reference/skills-catalog.md` is regenerated and lists `issue-fleet`.
8. Generated plugin/agent artifacts (`.claude-plugin/`, `.cursor-plugin/`, `.gemini-extension/`, `.antigravity-extension/`) are regenerated via `harness generate` and committed.
9. `harness skill validate` (whole-suite) shows no NEW skill-schema regression attributable to issue-fleet.
10. `prettier --check` reports no formatting diffs for the created/edited files.

## Uncertainties

- [ASSUMPTION] Platform skill-source dirs are exactly `codex`, `cursor`, `gemini-cli` (matches roadmap-fleet/pr-fleet); `antigravity` is a plugin-generation target, not a skill symlink source.
- [ASSUMPTION] Triage taxonomy = label/dedup/route/prioritize using the project's existing label vocabulary; issue-fleet never invents new labels.
- [ASSUMPTION] Dedup heuristic = signal-match against the shared open-issue snapshot + merged-PR search; a duplicate is closed with a citation, never a bare close.
- [ASSUMPTION] Routing rules map issue shape → downstream fleet (decision→adr-fleet, feature/enhancement→roadmap-fleet, CI-red→cicd-fleet, coverage-gap→test-fleet, entropy/hotspot→cleanup-fleet).
- [ASSUMPTION] Worktree isolation degrades to queue-slice partitioning for the read-mostly intake stage (triage produces issue-metadata mutations via `gh`, not code).
- [ASSUMPTION] No new ADR: issue-fleet introduces no cross-cutting decision; it builds on ADR 0087 + ADR 0088.
- [DEFERRABLE] Exact wording of per-phase prose and example transcripts — finalized during authoring; does not change task structure.

## File Map

- CREATE `agents/skills/claude-code/issue-fleet/skill.yaml`
- CREATE `agents/skills/claude-code/issue-fleet/SKILL.md`
- CREATE `agents/skills/codex/issue-fleet` (symlink → `../claude-code/issue-fleet`)
- CREATE `agents/skills/cursor/issue-fleet` (symlink → `../claude-code/issue-fleet`)
- CREATE `agents/skills/gemini-cli/issue-fleet` (symlink → `../claude-code/issue-fleet`)
- MODIFY `docs/roadmap.d/issue-fleet.md` (link the spec)
- MODIFY `docs/reference/skills-catalog.md` (regenerated — do not hand-edit)
- MODIFY generated plugin/agent artifacts via `harness generate`

## Skeleton

1. Foundation — skill dir, `skill.yaml`, SKILL heading + When to Use + Flags (~2 tasks, ~10 min)
2. Phase 1 SELECT (four-axis triage + dedup snapshot) + CONFIRM (destructive-close authorization) prose (~2 tasks, ~12 min)
3. Phase 3 DISPATCH (queue-slice triage fan-out) prose (~1 task, ~6 min)
4. Phase 4 VERIFY + Phase 5 HANDOFF/REPORT prose (~2 tasks, ~12 min)
5. Discipline — Harness Integration, Success Criteria, Gates, Escalation, Rationalizations, Red Flags, Examples, Test Scenarios (~3 tasks, ~15 min)
6. Registration + regen — validate, symlinks, spec-shard link, `harness generate`, catalog regen (~3 tasks, ~10 min)
7. Final sweep — prettier/format:check, whole-suite validate (~1 task, ~5 min)

**Estimated total:** 14 tasks, ~70 minutes.

## Notes for the executor

- **This is skill-authoring** (docs/instructions), not TS package code. There is no code-level TDD; the verification equivalents are `harness skill validate issue-fleet` (schema + section parity), the embedded Test Scenarios, and `format:check`.
- **Keep the SKILL.md self-contained.** The shared spine lives in `docs/reference/fleet-family.md` and is _cited_, but the SKILL.md must still carry its full required sections to pass validation and to run standalone in adopter projects.
- **Never `--no-verify`.** This worktree is nested under `.claude/`, which breaks the local `check-docs` push gate (self-excludes → scans zero files). Push via the GitHub API or a non-`.claude` worktree.
- **Regen touches SHARED files** (`.claude-plugin/commands/`, `.cursor-plugin/commands/`, `docs/reference/skills-catalog.md`) — commit the regenerated output and note it in the PR; the orchestrator resolves cross-sibling conflicts at merge.
