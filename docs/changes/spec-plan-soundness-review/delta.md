# Change Delta: Spec & Plan Soundness Review

**Date:** 2026-03-21
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md

## New Artifacts

- [ADDED] `agents/skills/claude-code/harness-soundness-review/skill.yaml` — skill manifest with two modes (spec, plan), four phases (check, fix, converge, surface), cognitive_mode meticulous-verifier
- [ADDED] `agents/skills/claude-code/harness-soundness-review/SKILL.md` — full skill definition with 14 checks (S1-S7 spec mode, P1-P7 plan mode), SoundnessFinding schema, convergence loop, auto-fix procedures, surfacing UX, graph integration with fallback
- [ADDED] `agents/skills/gemini-cli/harness-soundness-review/skill.yaml` — byte-identical platform copy
- [ADDED] `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` — byte-identical platform copy

## Changes to harness-brainstorming

- [MODIFIED] `agents/skills/claude-code/harness-brainstorming/SKILL.md` — Phase 4 VALIDATE: added step 2 invoking `harness-soundness-review --mode spec` after section review and before writing spec to docs/
- [MODIFIED] `agents/skills/claude-code/harness-brainstorming/skill.yaml` — added `harness-soundness-review` to `depends_on` array
- [MODIFIED] `agents/skills/gemini-cli/harness-brainstorming/SKILL.md` — same change as claude-code copy
- [MODIFIED] `agents/skills/gemini-cli/harness-brainstorming/skill.yaml` — same change as claude-code copy

## Changes to harness-planning

- [MODIFIED] `agents/skills/claude-code/harness-planning/SKILL.md` — Phase 4 VALIDATE: added step 6 invoking `harness-soundness-review --mode plan` after completeness verification and before writing plan
- [MODIFIED] `agents/skills/claude-code/harness-planning/skill.yaml` — added `harness-soundness-review` to `depends_on` array
- [MODIFIED] `agents/skills/gemini-cli/harness-planning/SKILL.md` — same change as claude-code copy
- [MODIFIED] `agents/skills/gemini-cli/harness-planning/skill.yaml` — same change as claude-code copy

## No Changes

- No existing checks, validation commands, or harness CLI behavior modified
- No new user-facing commands added (soundness review is invoked automatically by parent skills)
- No changes to `harness validate` or `harness check-deps`
