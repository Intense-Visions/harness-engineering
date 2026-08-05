# Question-File Interview Mode

**Keywords:** interview, question-file, async, contradiction-detection, pushback, strategy, pulse, brainstorming, answer-tag

## Overview

`harness-strategy`, `harness-pulse`, and `harness-brainstorming` are interview skills: they
convert vague human intent into a durable artifact (`STRATEGY.md`, a `pulse:` config block,
a spec) through a one-question-at-a-time interactive loop with skill-specific pushback rules.
That interactive loop assumes a single human at the keyboard for a synchronous session.

This change adds an **opt-in, file-based** variant of that loop — **question-file mode** —
for async, team-reviewable, durable decision capture. The skill writes its questions to a
committable file with a `[Answer]:` tag per question, a human (or the whole team) fills in
answers over time, and the skill reads them back and proceeds through the same pushback
rules. It also adds a **cross-answer contradiction-detection pass** that extends each skill's
existing pushback rules by judging the collected answers _against each other_, not just in
isolation.

Adapted from AI-DLC's `[Answer]:` question-file ritual and its mandatory ambiguity pass
(adoption #4 from `docs/research/aidlc-comparison-analysis.md` [AIDLC-4]).

### Goals

1. A consistent, opt-in file-based interview mode across all three interview skills.
2. A single shared answer-file convention (`[Answer]:` tag, file location, read-back ritual)
   that a reviewer who has seen one answer file can read for any skill.
3. A cross-answer contradiction-detection pass added to each skill's existing pushback rules,
   running in both interactive and file mode.

### Non-Goals

- Replacing the interactive interview. Interactive stays the default; file mode is opt-in and
  human-initiated, never automatic.
- Changing any artifact writer, schema validation, PII gate, or `.bak` behavior. File mode
  changes only how answers are _gathered_.
- A mechanical answer-file parser or a new MCP tool (see Decision 3).

## Decisions

| #   | Decision                     | Choice                                                                                     | Rationale                                                                                                                                                               |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Distribution of the mode     | Skill-instruction addition only (SKILL.md + a shared `references/question-file-mode.md`)   | These are markdown skills executed by an agent; the interview logic is already 100% instruction-level. A code change would be inconsistent with the existing design.    |
| 2   | Shared convention location   | Byte-identical `references/question-file-mode.md` carried by each of the three skills      | Skills are self-contained and distributed independently; a truly shared file cannot live in one skill only. Identical content per skill _is_ the shared convention.     |
| 3   | Contradiction detection form | Instruction-level (agent judgment), not a mechanical helper                                | Consistent with every existing interview rule — nothing in the codebase parses natural-language answers (see `harness-strategy/references/interview.md`). No changeset. |
| 4   | Contradiction pass authority | Surface-and-reconcile, not a hard gate                                                     | Matches the harness escalation-based, human-in-the-loop model; the analysis explicitly rejects AI-DLC's universal stop-and-approve gates.                               |
| 5   | Answer-file location         | `docs/interviews/<topic>-questions.md`, session-scoped fallback under `.harness/sessions/` | Durable + committable + diff-able is the point; session scope mirrors the handoff-pollution lesson for autopilot runs.                                                  |
| 6   | Credential handling in files | DB connection strings are never written to the answer file (pulse)                         | The answer file is committable; a persisted credential would defeat the pulse PII/READ-WRITE-DB gates. Credentials stay interactive.                                    |

## Technical Design

No source code changes. The change is entirely in `agents/skills/`:

- **New shared reference** — `references/question-file-mode.md`, byte-identical in all three
  skills. Defines: when to use file mode, the answer-file location/naming, the `[Answer]:`
  convention, the WRITE → FILL → READ-BACK → PUSH-BACK → CONTRADICTION → PROCEED ritual, the
  cross-answer contradiction categories, and context hygiene.
- **`harness-strategy/SKILL.md`** — a `Question-File Mode (opt-in)` subsection mapping the
  ritual onto the five (+ optional) strategy sections; `references/interview.md` gains
  `Rule 4: Cross-answer contradiction detection` alongside the three existing rules.
- **`harness-pulse/SKILL.md`** — a `Question-File Mode (opt-in)` subsection mapping the ritual
  onto the pulse questions (with the DB-credential carve-out); `references/interview.md` gains
  a `Cross-Answer Contradiction Detection` section extending the SMART bar.
- **`harness-brainstorming/SKILL.md`** — a `Question-File Mode (opt-in)` subsection mapping the
  ritual onto the EVALUATE decision questions; Phase 2 step 5 is generalized from
  strategy-contradiction to a full cross-answer contradiction pass.

Each skill's four platform variants (claude-code, cursor, gemini-cli, codex) are kept in
parity — real copies for strategy/pulse, symlinks-to-claude-code for brainstorming.

### Integration Points

- **Entry Points** — No new entry points. Question-file mode is a documented sub-mode of the
  three existing skills, reached from the existing `/harness:strategy`, `/harness:pulse`, and
  `/harness:brainstorming` commands when the human opts in. `skill.yaml` metadata is unchanged,
  so generated slash-command wrappers do not change.
- **Registrations Required** — None. No new skills, MCP tools, or barrel exports.
- **Documentation Updates** — The three SKILL.md files and the new shared reference are the
  documentation. No AGENTS.md change required.
- **Architectural Decisions** — None rise to a standalone ADR; Decisions 3 and 4 (instruction-
  level, surface-and-reconcile) restate existing harness conventions rather than establishing
  new ones.
- **Knowledge Impact** — The `[Answer]:` answer-file convention and the cross-answer
  contradiction categories are the durable concepts introduced.

## Success Criteria

- Each of the three skills documents an opt-in Question-File Mode that reuses its existing
  pushback rules and its existing artifact writer unchanged.
- The `references/question-file-mode.md` convention is byte-identical across the three skills
  and across all four platform variants.
- Each skill documents a cross-answer contradiction-detection pass that surfaces (never
  auto-resolves) contradictions and is bounded by a 2-round cap.
- The existing `harness-strategy` contract test still passes (the three named rules, repair
  keywords, 2-round cap, and fixtures are untouched).
- `pnpm --filter @harness-engineering/skills-tests test` (skills tests), `tsc --noEmit`,
  `eslint`, and `generate:plugin:check` are all green.

## Implementation Order

1. Author the shared `references/question-file-mode.md` convention.
2. Wire Question-File Mode + contradiction detection into each of the three skills.
3. Propagate to the four platform variants and verify parity.
4. Verify the gauntlet (skills tests, typecheck, lint, plugin-generation check).
