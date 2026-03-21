# Development Loop Chaining

**Date:** 2026-03-20
**Status:** Proposed
**Parent:** [Harness v2 Design Patterns](../harness-v2-patterns/proposal.md) — Patterns 3, 5
**Depends on:** [Interaction Surface Abstraction](../interaction-surface-abstraction/proposal.md)
**Scope:** Suggest-and-confirm transitions between 5 core development loop skills
**Keywords:** development-loop, phase-transition, suggest-confirm, auto-transition, handoff, chaining, emit-interaction

## Overview

Add suggest-and-confirm transitions between the 5 core development loop skills (brainstorming, planning, execution, verification, review) so each phase naturally flows into the next. Confirmed transitions ask before proceeding; auto-transitions proceed immediately. All transitions go through `emit_interaction` for recording and traceability. Complementary to autopilot — manual workflows get friction reduction, autopilot ignores suggestions and drives its own flow.

### Non-goals

- Replacing or modifying autopilot's state machine
- Adding transitions to non-core skills (each subsystem spec handles its own)
- Building an orchestration engine — the LLM follows instructions, not a runtime

## Decisions

| Decision                    | Choice                                                              | Rationale                                                                                    |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Relationship to autopilot   | Complementary — skills suggest, autopilot drives its own flow       | Autopilot has retry budgets, complexity assessment, and state machine beyond simple chaining |
| Confirmed transitions       | brainstorming→planning, planning→execution, review→merge/PR         | These start new work; user should decide when to proceed                                     |
| Auto transitions            | execution→verification, verification→review                         | You always want to verify and review; no reason to ask                                       |
| Handoff coverage            | All 5 skills write handoff.json                                     | Brainstorming, verification, and review currently don't; needed for transitions              |
| Transition mechanism        | All through `emit_interaction` with `requiresConfirmation` flag     | Consistent recording and traceability; same tool for both confirmed and auto                 |
| Auto-transition reliability | `nextAction` field in tool response reinforces SKILL.md instruction | Two signals are harder for LLM to ignore in long contexts                                    |
| Summary richness            | 1-2 sentence summary + key metrics                                  | Helps user decide on non-CLI surfaces without opening files                                  |

## Technical Design

### Transition Map

```
brainstorming ──[confirm]──→ planning ──[confirm]──→ execution ──[auto]──→ verification ──[auto]──→ review ──[confirm]──→ merge/PR
```

### `emit_interaction` Extension

The `transition` type in `emit_interaction` gains fields:

```typescript
transition?: {
  completedPhase: string;
  suggestedNext: string;
  reason: string;
  artifacts: string[];
  requiresConfirmation: boolean;       // true = wait for user, false = proceed immediately
  summary: string;                     // 1-2 sentence rich summary with key metrics
}
```

**Tool response for confirmed transitions:**

```json
{
  "id": "tr_001",
  "prompt": "Spec approved: Unified Code Review Pipeline — 7-phase pipeline with parallel agents, graph-scoped context. 10 success criteria, 8 implementation phases. Proceed to planning?",
  "handoffWritten": true
}
```

**Tool response for auto-transitions:**

```json
{
  "id": "tr_002",
  "prompt": "Proceeding to verification...",
  "handoffWritten": true,
  "autoTransition": true,
  "nextAction": "Invoke harness-verification skill now"
}
```

### Per-Skill Changes

#### 1. harness-brainstorming (new: handoff + transition)

At end of Phase 4, after spec sign-off:

```
Write handoff.json:
{
  "fromSkill": "harness-brainstorming",
  "phase": "VALIDATE",
  "summary": "<1-sentence spec summary>",
  "artifacts": ["<spec file path>"],
  "decisions": [{"what": "<decision>", "why": "<rationale>"}],
  "contextKeywords": ["<domain keywords>"]
}

Call emit_interaction:
{
  type: "transition",
  transition: {
    completedPhase: "brainstorming",
    suggestedNext: "planning",
    reason: "Spec approved and written to docs/",
    artifacts: ["<spec path>"],
    requiresConfirmation: true,
    summary: "<Spec title> — <key design choices>. <N> success criteria, <N> implementation phases."
  }
}

If user confirms: invoke harness-planning with the spec path.
If user declines: stop. Handoff is written for future invocation.
```

#### 2. harness-planning (existing handoff + new transition)

At end of Phase 4, after plan sign-off. Handoff already written — add transition:

```
Call emit_interaction:
{
  type: "transition",
  transition: {
    completedPhase: "planning",
    suggestedNext: "execution",
    reason: "Plan approved with all tasks defined",
    artifacts: ["<plan path>"],
    requiresConfirmation: true,
    summary: "<Plan title> — <N> tasks across <N> phases, <N> checkpoints. Estimated <time>."
  }
}

If user confirms: invoke harness-execution with the plan path.
If user declines: stop. Handoff is written for future invocation.
```

#### 3. harness-execution (existing handoff + new transition)

At plan completion (all tasks done). Handoff already written — add transition:

```
Call emit_interaction:
{
  type: "transition",
  transition: {
    completedPhase: "execution",
    suggestedNext: "verification",
    reason: "All tasks complete",
    artifacts: ["<list of created/modified files>"],
    requiresConfirmation: false,
    summary: "Completed <N> tasks. <N> files created, <N> modified. All quick gates passed."
  }
}

Response includes nextAction: "Invoke harness-verification skill now"
Immediately invoke harness-verification without waiting for user input.
```

#### 4. harness-verification (new: handoff + transition)

At verification completion:

```
Write handoff.json:
{
  "fromSkill": "harness-verification",
  "phase": "COMPLETE",
  "summary": "<verdict summary>",
  "artifacts": ["<verified file paths>"],
  "verdict": "pass" | "fail",
  "gaps": ["<gap descriptions if any>"]
}

If verdict is PASS:
  Call emit_interaction:
  {
    type: "transition",
    transition: {
      completedPhase: "verification",
      suggestedNext: "review",
      reason: "Verification passed at all 3 levels",
      artifacts: ["<verified files>"],
      requiresConfirmation: false,
      summary: "Verification passed: <N> artifacts checked. EXISTS, SUBSTANTIVE, WIRED all passed."
    }
  }

  Response includes nextAction: "Invoke harness-code-review skill now"
  Immediately invoke harness-code-review without waiting for user input.

If verdict is FAIL:
  Do NOT emit transition. Surface gaps to user for resolution.
```

#### 5. harness-code-review (new: handoff + transition)

At review completion (Phase 7 OUTPUT):

```
Write handoff.json:
{
  "fromSkill": "harness-code-review",
  "phase": "OUTPUT",
  "summary": "<assessment summary>",
  "assessment": "approve" | "request-changes" | "comment",
  "findingCount": { "critical": N, "important": N, "suggestion": N },
  "artifacts": ["<reviewed files>"]
}

If assessment is "approve":
  Call emit_interaction:
  {
    type: "transition",
    transition: {
      completedPhase: "review",
      suggestedNext: "merge",
      reason: "Review approved with no blocking issues",
      artifacts: ["<reviewed files>"],
      requiresConfirmation: true,
      summary: "Review approved. <N> suggestions noted. Ready to create PR or merge."
    }
  }

  If user confirms: proceed to create PR or merge.
  If user declines: stop. Handoff is written for future invocation.

If assessment is "request-changes":
  Do NOT emit transition. Surface findings to user for resolution.
  After fixes, re-run review.
```

### Autopilot Compatibility

Autopilot's state machine drives transitions via its own `currentState` field. When autopilot is active:

- Individual skills still call `emit_interaction` (for recording)
- Autopilot reads its own `autopilot-state.json` to determine next state, not the transition suggestion
- The `requiresConfirmation` flag is irrelevant — autopilot has its own approval gates
- Result: transitions are recorded in handoff.json (useful for traceability) but don't control autopilot's flow

### Transition Recording

Every transition (confirmed or auto) is recorded in two places:

1. `.harness/handoff.json` — for the next skill to read
2. `.harness/state.json` decisions array — for traceability:

```json
{
  "date": "2026-03-20T14:30:00Z",
  "decision": "Transition: brainstorming → planning",
  "context": "User confirmed. Spec: docs/changes/unified-code-review-pipeline/proposal.md"
}
```

## Success Criteria

1. **All 5 skills emit transitions** — brainstorming, planning, execution, verification, and review all call `emit_interaction({type: 'transition'})` on completion
2. **All 5 skills write handoff.json** — brainstorming, verification, and review gain handoff writes; planning and execution are unchanged
3. **Confirmed transitions wait** — brainstorming→planning, planning→execution, review→merge present a prompt and wait for user response
4. **Auto transitions proceed** — execution→verification and verification→review proceed immediately with `nextAction` in tool response
5. **Rich summaries** — every transition prompt includes 1-2 sentence summary with key metrics
6. **Declined transitions are safe** — if user declines a confirmed transition, handoff.json is still written for future invocation; no state is lost
7. **Failed phases don't transition** — verification failure and review request-changes do NOT emit transitions; they surface issues instead
8. **Autopilot compatibility** — autopilot continues to work unchanged; transition recordings add traceability without affecting autopilot's state machine
9. **Transitions are traceable** — every transition recorded in both handoff.json and state.json decisions array
10. **Manual invocation still works** — users can invoke any skill directly without going through the chain; transitions are suggestions, not requirements

## Implementation Order

1. **`emit_interaction` transition extension** — Add `requiresConfirmation`, `summary`, `autoTransition`, and `nextAction` fields to the transition type. Depends on the interaction surface abstraction spec being implemented first (core types + tool).

2. **harness-brainstorming** — Add handoff.json write and confirmed transition to planning. This is the entry point of the chain and was already migrated to `emit_interaction` in the interaction surface spec.

3. **harness-planning** — Add confirmed transition to execution. Handoff already exists — just add the `emit_interaction` call.

4. **harness-execution** — Add auto-transition to verification. Handoff already exists — add the `emit_interaction` call with `requiresConfirmation: false` and `nextAction`.

5. **harness-verification** — Add handoff.json write and auto-transition to review. Add conditional logic: only transition on pass, surface gaps on fail.

6. **harness-code-review** — Add handoff.json write and conditional confirmed transition to merge. Only transition on approve, surface findings on request-changes.

7. **End-to-end validation** — Run through the full chain manually (brainstorming→planning→execution→verification→review) to verify transitions flow correctly, auto-transitions fire reliably, and handoff.json is written at each step.
