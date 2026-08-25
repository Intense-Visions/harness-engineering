---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add an advisory SKILL.md instruction-density check to `harness validate`.

HumanLayer's RPI→CRISPY postmortem identified a ~150-200 instruction-follow budget as the
ceiling that, once exceeded, forced a full workflow rebuild. `harness validate` now
estimates the imperative-instruction count (numbered steps + imperative-verb bullets +
`MUST`/`SHALL`/`REQUIRED` directives) at each context-budget packing level `run_skill`
loads, and surfaces a non-blocking `SKILL-DENSITY` warning when a loaded level exceeds the
budget (default 175, configurable via `skills.instructionBudget`). Because progressive
disclosure is the mitigation being validated, density is measured per cumulative packing
level rather than over the whole file. The check is advisory only — it never fails the
gate. `harness-skill-authoring` gains a matching guidance note.

New core exports: `countImperativeInstructions`, `analyzeSkillInstructionDensity`,
`DEFAULT_INSTRUCTION_BUDGET`.
