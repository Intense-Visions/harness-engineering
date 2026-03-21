# Change Delta: Development Loop Chaining

**Date:** 2026-03-21
**Proposal:** docs/changes/development-loop-chaining/proposal.md
**Plan:** docs/plans/2026-03-21-development-loop-chaining-plan.md

## Changes to `packages/core/src/interaction/types.ts`

- [MODIFIED] `TransitionSchema` gains two new required fields: `requiresConfirmation: z.boolean()` and `summary: z.string()`
- [MODIFIED] `Transition` TypeScript type (inferred from schema) gains `requiresConfirmation: boolean` and `summary: string`

## Changes to `packages/mcp-server/src/tools/interaction.ts`

- [MODIFIED] `emitInteractionDefinition` transition schema gains `requiresConfirmation` and `summary` properties (added to `required`)
- [MODIFIED] `EmitInteractionInput` interface's `transition` field gains `requiresConfirmation: boolean` and `summary: string`
- [MODIFIED] Transition handler includes `summary` in the prompt text
- [ADDED] Transition handler returns `autoTransition: true` and `nextAction` string when `requiresConfirmation` is `false`

## Changes to harness-brainstorming SKILL.md

- [ADDED] Handoff.json write at end of Phase 4 (after spec sign-off)
- [ADDED] `emit_interaction` call with confirmed transition to planning
- [ADDED] "If user confirms/declines" branching instructions

## Changes to harness-planning SKILL.md

- [ADDED] `emit_interaction` call with confirmed transition to execution at end of Phase 4

## Changes to harness-execution SKILL.md

- [ADDED] `emit_interaction` call with auto-transition to verification at plan completion
- [ADDED] "Immediately invoke harness-verification" instruction
- [ADDED] Guard: only transition when all tasks complete (not on partial completion or blockers)

## Changes to harness-verification SKILL.md

- [ADDED] Handoff.json write at verification completion
- [ADDED] Conditional `emit_interaction` call with auto-transition to review (on PASS only)
- [ADDED] "Immediately invoke harness-code-review" instruction (on PASS only)
- [ADDED] Guard: do not transition on FAIL verdict

## Changes to harness-code-review SKILL.md

- [ADDED] Handoff.json write at review completion (Phase 7)
- [ADDED] Conditional `emit_interaction` call with confirmed transition to merge (on APPROVE only)
- [ADDED] Guard: do not transition on REQUEST_CHANGES assessment
