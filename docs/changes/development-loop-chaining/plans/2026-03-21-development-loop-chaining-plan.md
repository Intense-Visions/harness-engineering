# Plan: Development Loop Chaining

**Date:** 2026-03-21
**Spec:** docs/changes/development-loop-chaining/proposal.md
**Depends on:** docs/changes/interaction-surface-abstraction/plans/2026-03-21-interaction-surface-abstraction-plan.md (must be implemented first)
**Estimated tasks:** 9
**Estimated time:** 35 minutes

## Goal

Add suggest-and-confirm transitions between the 5 core development loop skills so each phase naturally flows into the next, with confirmed transitions (brainstorming, planning, review) waiting for user approval and auto-transitions (execution, verification) proceeding immediately.

## Observable Truths (Acceptance Criteria)

1. When `TransitionSchema.safeParse()` is called with `{ completedPhase: 'brainstorming', suggestedNext: 'planning', reason: 'Spec approved', artifacts: ['spec.md'], requiresConfirmation: true, summary: 'Auth pipeline — 5 decisions. 8 criteria.' }`, it returns `{ success: true }`.
2. When `TransitionSchema.safeParse()` is called with a transition missing the `requiresConfirmation` field, it returns `{ success: false }`.
3. When `TransitionSchema.safeParse()` is called with a transition missing the `summary` field, it returns `{ success: false }`.
4. When `handleEmitInteraction` is called with a transition where `requiresConfirmation: false`, the response JSON includes `autoTransition: true` and a `nextAction` string.
5. When `handleEmitInteraction` is called with a transition where `requiresConfirmation: true`, the response JSON does NOT include `autoTransition` or `nextAction`.
6. The harness-brainstorming SKILL.md contains instructions to write `handoff.json` at the end of Phase 4 and call `emit_interaction` with a confirmed transition to planning.
7. The harness-planning SKILL.md contains instructions to call `emit_interaction` with a confirmed transition to execution at the end of Phase 4.
8. The harness-execution SKILL.md contains instructions to call `emit_interaction` with an auto-transition (`requiresConfirmation: false`) to verification at plan completion, and to immediately invoke harness-verification.
9. The harness-verification SKILL.md contains instructions to write `handoff.json` at verification completion and call `emit_interaction` with an auto-transition to review (conditional on PASS verdict only).
10. The harness-code-review SKILL.md contains instructions to write `handoff.json` at review completion and call `emit_interaction` with a confirmed transition to merge (conditional on APPROVE assessment only).
11. If verification verdict is FAIL, the harness-verification SKILL.md shall not emit a transition.
12. If review assessment is REQUEST_CHANGES, the harness-code-review SKILL.md shall not emit a transition.
13. All 5 SKILL.md files reference the `emit_interaction` tool for transitions (not direct user prompting).
14. `npx vitest run packages/core/tests/interaction/types.test.ts` passes (including new `requiresConfirmation` and `summary` field tests).
15. `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` passes (including new auto-transition response tests).
16. `harness validate` passes after all tasks are complete.

## File Map

```
MODIFY packages/core/src/interaction/types.ts (add requiresConfirmation and summary to TransitionSchema)
MODIFY packages/core/tests/interaction/types.test.ts (add tests for new fields)
MODIFY packages/mcp-server/src/tools/interaction.ts (extend transition handler and type definition for requiresConfirmation, autoTransition, nextAction)
MODIFY packages/mcp-server/tests/tools/interaction.test.ts (add auto-transition response tests)
MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md (add handoff write + confirmed transition)
MODIFY agents/skills/claude-code/harness-planning/SKILL.md (add confirmed transition to execution)
MODIFY agents/skills/claude-code/harness-execution/SKILL.md (add auto-transition to verification)
MODIFY agents/skills/claude-code/harness-verification/SKILL.md (add handoff write + conditional auto-transition)
MODIFY agents/skills/claude-code/harness-code-review/SKILL.md (add handoff write + conditional confirmed transition)
```

## Tasks

### Task 1: Extend TransitionSchema with requiresConfirmation and summary fields (TDD)

**Depends on:** Interaction surface abstraction plan fully implemented
**Files:** `packages/core/src/interaction/types.ts`, `packages/core/tests/interaction/types.test.ts`

1. Add tests to `packages/core/tests/interaction/types.test.ts` in the existing `TransitionSchema` describe block:

   ```typescript
   it('validates a transition with requiresConfirmation and summary', () => {
     const result = TransitionSchema.safeParse({
       completedPhase: 'brainstorming',
       suggestedNext: 'planning',
       reason: 'Spec approved',
       artifacts: ['docs/changes/auth/proposal.md'],
       requiresConfirmation: true,
       summary: 'Auth pipeline — 5 decisions, 8 success criteria.',
     });
     expect(result.success).toBe(true);
   });

   it('rejects transition missing requiresConfirmation', () => {
     const result = TransitionSchema.safeParse({
       completedPhase: 'brainstorming',
       suggestedNext: 'planning',
       reason: 'Spec approved',
       artifacts: ['spec.md'],
       summary: 'Summary here.',
     });
     expect(result.success).toBe(false);
   });

   it('rejects transition missing summary', () => {
     const result = TransitionSchema.safeParse({
       completedPhase: 'brainstorming',
       suggestedNext: 'planning',
       reason: 'Spec approved',
       artifacts: ['spec.md'],
       requiresConfirmation: true,
     });
     expect(result.success).toBe(false);
   });

   it('validates auto-transition with requiresConfirmation false', () => {
     const result = TransitionSchema.safeParse({
       completedPhase: 'execution',
       suggestedNext: 'verification',
       reason: 'All tasks complete',
       artifacts: ['src/service.ts'],
       requiresConfirmation: false,
       summary: 'Completed 5 tasks. 3 files created.',
     });
     expect(result.success).toBe(true);
   });
   ```

2. Run test: `npx vitest run packages/core/tests/interaction/types.test.ts` — observe failures (new fields not in schema).
3. Modify `packages/core/src/interaction/types.ts` — update `TransitionSchema`:
   ```typescript
   export const TransitionSchema = z.object({
     completedPhase: z.string(),
     suggestedNext: z.string(),
     reason: z.string(),
     artifacts: z.array(z.string()),
     requiresConfirmation: z.boolean(),
     summary: z.string(),
   });
   ```
4. Run test: `npx vitest run packages/core/tests/interaction/types.test.ts` — observe all pass.
5. **Note:** The existing test `'validates a transition'` from the interaction surface abstraction plan will now fail because it does not include the new required fields. Update that test to include `requiresConfirmation: true` and `summary: 'All must-haves derived from goals.'` so it passes.
6. Run full test suite for this file to confirm: `npx vitest run packages/core/tests/interaction/types.test.ts`
7. Run: `harness validate`
8. Commit: `feat(core): add requiresConfirmation and summary to TransitionSchema`

---

### Task 2: Extend emit_interaction handler for auto-transition responses (TDD)

**Depends on:** Task 1
**Files:** `packages/mcp-server/src/tools/interaction.ts`, `packages/mcp-server/tests/tools/interaction.test.ts`

1. Add tests to `packages/mcp-server/tests/tools/interaction.test.ts` in the existing `transition type` describe block:

   ```typescript
   it('returns autoTransition and nextAction for auto-transitions', async () => {
     const response = await handleEmitInteraction({
       path: '/tmp/test-interaction',
       type: 'transition',
       transition: {
         completedPhase: 'execution',
         suggestedNext: 'verification',
         reason: 'All tasks complete',
         artifacts: ['src/service.ts'],
         requiresConfirmation: false,
         summary: 'Completed 5 tasks. 3 files created.',
       },
     });
     expect(response.isError).toBeFalsy();
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.autoTransition).toBe(true);
     expect(parsed.nextAction).toContain('verification');
     expect(parsed.handoffWritten).toBe(true);
   });

   it('does not include autoTransition for confirmed transitions', async () => {
     const response = await handleEmitInteraction({
       path: '/tmp/test-interaction',
       type: 'transition',
       transition: {
         completedPhase: 'brainstorming',
         suggestedNext: 'planning',
         reason: 'Spec approved',
         artifacts: ['docs/spec.md'],
         requiresConfirmation: true,
         summary: 'Auth spec approved with 5 decisions.',
       },
     });
     expect(response.isError).toBeFalsy();
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.autoTransition).toBeUndefined();
     expect(parsed.nextAction).toBeUndefined();
     expect(parsed.handoffWritten).toBe(true);
   });

   it('includes summary in transition prompt', async () => {
     const response = await handleEmitInteraction({
       path: '/tmp/test-interaction',
       type: 'transition',
       transition: {
         completedPhase: 'planning',
         suggestedNext: 'execution',
         reason: 'Plan approved',
         artifacts: ['docs/plans/plan.md'],
         requiresConfirmation: true,
         summary: 'Notification system — 8 tasks, 30 min estimate.',
       },
     });
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.prompt).toContain('Notification system');
   });
   ```

2. Run test: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` — observe failures.
3. Modify `packages/mcp-server/src/tools/interaction.ts`:
   - Update the `transition` property in `emitInteractionDefinition.inputSchema.properties` to add:
     ```typescript
     requiresConfirmation: {
       type: 'boolean',
       description: 'true = wait for user confirmation, false = proceed immediately',
     },
     summary: {
       type: 'string',
       description: '1-2 sentence rich summary with key metrics',
     },
     ```
   - Add `requiresConfirmation` and `summary` to the `required` array for the transition property (alongside `completedPhase`, `suggestedNext`, `reason`, `artifacts`).
   - Update the `EmitInteractionInput` interface's `transition` field:
     ```typescript
     transition?: {
       completedPhase: string;
       suggestedNext: string;
       reason: string;
       artifacts: string[];
       requiresConfirmation: boolean;
       summary: string;
     };
     ```
   - In the `case 'transition':` handler, update the prompt construction and response:

     ```typescript
     case 'transition': {
       if (!input.transition) {
         return {
           content: [
             {
               type: 'text' as const,
               text: 'Error: transition payload is required when type is transition',
             },
           ],
           isError: true,
         };
       }
       const { completedPhase, suggestedNext, reason, artifacts, requiresConfirmation, summary } = input.transition;
       const prompt =
         `Phase "${completedPhase}" complete. ${reason}\n\n` +
         `${summary}\n\n` +
         `Artifacts produced:\n${artifacts.map((a) => '  - ' + a).join('\n')}\n\n` +
         (requiresConfirmation
           ? `Suggested next: "${suggestedNext}". Proceed?`
           : `Proceeding to ${suggestedNext}...`);

       // Write handoff (existing code)
       try {
         const { saveHandoff } = await import('@harness-engineering/core');
         await saveHandoff(projectPath, {
           timestamp: new Date().toISOString(),
           fromSkill: 'emit_interaction',
           phase: completedPhase,
           summary: reason,
           completed: [completedPhase],
           pending: [suggestedNext],
           concerns: [],
           decisions: [],
           blockers: [],
           contextKeywords: [],
         }, input.stream);
       } catch {
         // Handoff write failure is non-fatal
       }

       await recordInteraction(projectPath, id, 'transition', `${completedPhase} -> ${suggestedNext}`, input.stream);

       const responsePayload: Record<string, unknown> = { id, prompt, handoffWritten: true };
       if (!requiresConfirmation) {
         responsePayload.autoTransition = true;
         responsePayload.nextAction = `Invoke harness-${suggestedNext} skill now`;
       }

       return {
         content: [
           {
             type: 'text' as const,
             text: JSON.stringify(responsePayload),
           },
         ],
       };
     }
     ```

4. **Note:** Update the existing transition test (from the interaction surface plan) to include the new required fields `requiresConfirmation: true` and `summary: 'All must-haves derived'` so it continues to pass.
5. Run test: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts` — observe all pass.
6. Run: `harness validate`
7. Commit: `feat(mcp): extend transition handler with auto-transition support`

---

### Task 3: Add handoff write and confirmed transition to harness-brainstorming

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-brainstorming/SKILL.md`

1. Open `agents/skills/claude-code/harness-brainstorming/SKILL.md`.
2. Locate the end of Phase 4 (VALIDATE), after step 5 ("Ask for final sign-off..."). Insert a new section before the `---` separator that follows Phase 4:

   ````markdown
   6. **Write handoff and suggest transition.** After the human approves the spec:

      Write `.harness/handoff.json`:

      ```json
      {
        "fromSkill": "harness-brainstorming",
        "phase": "VALIDATE",
        "summary": "<1-sentence spec summary>",
        "artifacts": ["<spec file path>"],
        "decisions": [{ "what": "<decision>", "why": "<rationale>" }],
        "contextKeywords": ["<domain keywords from Phase 2>"]
      }
      ```
   ````

   Call `emit_interaction`:

   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "brainstorming",
       "suggestedNext": "planning",
       "reason": "Spec approved and written to docs/",
       "artifacts": ["<spec file path>"],
       "requiresConfirmation": true,
       "summary": "<Spec title> -- <key design choices>. <N> success criteria, <N> implementation phases."
     }
   }
   ```

   If the user confirms: invoke harness-planning with the spec path.
   If the user declines: stop. The handoff is written for future invocation.

   ```

   ```

3. In the Harness Integration section, add a bullet:
   ```markdown
   - **`emit_interaction`** -- Call at the end of Phase 4 to suggest transitioning to harness-planning. Uses confirmed transition (waits for user approval).
   ```
4. Verify no surface-specific language was introduced (no "terminal", "CLI" references).
5. Run: `harness validate`
6. Commit: `feat(brainstorming): add handoff write and confirmed transition to planning`

---

### Task 4: Add confirmed transition to harness-planning

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. Open `agents/skills/claude-code/harness-planning/SKILL.md`.
2. Locate Phase 4 (VALIDATE), step 9 ("Present the plan to the human for review..."). Insert a new step 10 after step 9:

   ````markdown
   10. **Suggest transition to execution.** After the human approves the plan:

       Call `emit_interaction`:

       ```json
       {
         "type": "transition",
         "transition": {
           "completedPhase": "planning",
           "suggestedNext": "execution",
           "reason": "Plan approved with all tasks defined",
           "artifacts": ["<plan file path>"],
           "requiresConfirmation": true,
           "summary": "<Plan title> -- <N> tasks, <N> checkpoints. Estimated <time>."
         }
       }
       ```

       If the user confirms: invoke harness-execution with the plan path.
       If the user declines: stop. The handoff is already written for future invocation.
   ````

3. In the Harness Integration section, add a bullet:
   ```markdown
   - **`emit_interaction`** -- Call at the end of Phase 4 to suggest transitioning to harness-execution. Uses confirmed transition (waits for user approval).
   ```
4. Verify no surface-specific language was introduced.
5. Run: `harness validate`
6. Commit: `feat(planning): add confirmed transition to execution`

---

### Task 5: Add auto-transition to harness-execution

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`.
2. Locate Phase 4 (PERSIST), step 4 ("Write `.harness/handoff.json`..."). Insert a new step 6 after step 5 (learnings are append-only):

   ````markdown
   6. **Auto-transition to verification.** When ALL tasks in the plan are complete (not when stopping mid-plan):

      Call `emit_interaction`:

      ```json
      {
        "type": "transition",
        "transition": {
          "completedPhase": "execution",
          "suggestedNext": "verification",
          "reason": "All tasks complete",
          "artifacts": ["<list of created/modified files>"],
          "requiresConfirmation": false,
          "summary": "Completed <N> tasks. <N> files created, <N> modified. All quick gates passed."
        }
      }
      ```
   ````

   The response will include `nextAction: "Invoke harness-verification skill now"`.
   Immediately invoke harness-verification without waiting for user input.

   **Important:** Only emit this transition when all tasks are complete. If execution stopped due to a blocker, checkpoint, or partial completion, do NOT emit a transition -- write the handoff and stop.

   ```

   ```

3. In the Harness Integration section, add a bullet:
   ```markdown
   - **`emit_interaction`** -- Call at plan completion to auto-transition to harness-verification. Uses auto-transition (proceeds immediately without user confirmation).
   ```
4. Verify no surface-specific language was introduced.
5. Run: `harness validate`
6. Commit: `feat(execution): add auto-transition to verification`

---

### Task 6: Add handoff write and conditional auto-transition to harness-verification

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-verification/SKILL.md`

1. Open `agents/skills/claude-code/harness-verification/SKILL.md`.
2. Locate the Gap Identification section (after Level 3: WIRED). After the "Verdict" line in the gap report template, add a new section:

   ````markdown
   ### Handoff and Transition

   After producing the verification report, write the handoff and conditionally transition:

   Write `.harness/handoff.json`:

   ```json
   {
     "fromSkill": "harness-verification",
     "phase": "COMPLETE",
     "summary": "<verdict summary>",
     "artifacts": ["<verified file paths>"],
     "verdict": "pass | fail",
     "gaps": ["<gap descriptions if any>"]
   }
   ```
   ````

   **If verdict is PASS (all levels passed, no gaps):**

   Call `emit_interaction`:

   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "verification",
       "suggestedNext": "review",
       "reason": "Verification passed at all 3 levels",
       "artifacts": ["<verified file paths>"],
       "requiresConfirmation": false,
       "summary": "Verification passed: <N> artifacts checked. EXISTS, SUBSTANTIVE, WIRED all passed."
     }
   }
   ```

   The response will include `nextAction: "Invoke harness-code-review skill now"`.
   Immediately invoke harness-code-review without waiting for user input.

   **If verdict is FAIL or INCOMPLETE:**

   Do NOT emit a transition. Surface gaps to the user for resolution. The handoff is written with the gaps recorded for future reference.

   ```

   ```

3. In the Harness Integration section, add a bullet:
   ```markdown
   - **`emit_interaction`** -- Call after verification passes to auto-transition to harness-code-review. Only emitted on PASS verdict. Uses auto-transition (proceeds immediately).
   ```
4. Verify no surface-specific language was introduced.
5. Run: `harness validate`
6. Commit: `feat(verification): add handoff write and conditional auto-transition to review`

---

### Task 7: Add handoff write and conditional confirmed transition to harness-code-review

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-code-review/SKILL.md`

1. Open `agents/skills/claude-code/harness-code-review/SKILL.md`.
2. Locate Phase 7 (OUTPUT), after the Terminal Output and Inline GitHub Comments subsections. Add a new subsection before the `---` separator:

   ````markdown
   #### Handoff and Transition

   After delivering the review output, write the handoff and conditionally transition:

   Write `.harness/handoff.json`:

   ```json
   {
     "fromSkill": "harness-code-review",
     "phase": "OUTPUT",
     "summary": "<assessment summary>",
     "assessment": "approve | request-changes | comment",
     "findingCount": { "critical": 0, "important": 0, "suggestion": 0 },
     "artifacts": ["<reviewed files>"]
   }
   ```
   ````

   **If assessment is "approve":**

   Call `emit_interaction`:

   ```json
   {
     "type": "transition",
     "transition": {
       "completedPhase": "review",
       "suggestedNext": "merge",
       "reason": "Review approved with no blocking issues",
       "artifacts": ["<reviewed files>"],
       "requiresConfirmation": true,
       "summary": "Review approved. <N> suggestions noted. Ready to create PR or merge."
     }
   }
   ```

   If the user confirms: proceed to create PR or merge.
   If the user declines: stop. The handoff is written for future invocation.

   **If assessment is "request-changes":**

   Do NOT emit a transition. Surface the critical and important findings to the user for resolution. After fixes are applied, re-run the review pipeline.

   **If assessment is "comment":**

   Do NOT emit a transition. Observations have been delivered. No further action is implied.

   ```

   ```

3. In the Harness Integration section, add a bullet:
   ```markdown
   - **`emit_interaction`** -- Call after review approval to suggest transitioning to merge/PR creation. Only emitted on APPROVE assessment. Uses confirmed transition (waits for user approval).
   ```
4. Verify no surface-specific language was introduced.
5. Run: `harness validate`
6. Commit: `feat(code-review): add handoff write and conditional confirmed transition to merge`

---

### Task 8: Update existing interaction surface tests for backward compatibility

[checkpoint:human-verify] -- Verify Tasks 1-7 are correct before running compatibility fixes

**Depends on:** Tasks 1-2
**Files:** `packages/core/tests/interaction/types.test.ts`, `packages/mcp-server/tests/tools/interaction.test.ts`

1. Review all existing tests in `packages/core/tests/interaction/types.test.ts` that reference `TransitionSchema`. Any test that creates a transition object WITHOUT `requiresConfirmation` and `summary` will now fail. Update each such test to include the new required fields.

   Specifically, update the existing test from the interaction surface plan:

   ```typescript
   it('validates a transition', () => {
     const result = TransitionSchema.safeParse({
       completedPhase: 'SCOPE',
       suggestedNext: 'DECOMPOSE',
       reason: 'All must-haves derived',
       artifacts: ['docs/plans/plan.md'],
       requiresConfirmation: true,
       summary: 'All must-haves derived from goals.',
     });
     expect(result.success).toBe(true);
   });
   ```

2. Review all existing tests in `packages/mcp-server/tests/tools/interaction.test.ts` that call `handleEmitInteraction` with `type: 'transition'`. Update each to include `requiresConfirmation` and `summary` in the transition payload.

   Specifically, update the existing test:

   ```typescript
   it('returns id, prompt, and handoffWritten for a transition', async () => {
     const response = await handleEmitInteraction({
       path: '/tmp/test-interaction',
       type: 'transition',
       transition: {
         completedPhase: 'SCOPE',
         suggestedNext: 'DECOMPOSE',
         reason: 'All must-haves derived',
         artifacts: ['docs/plans/plan.md'],
         requiresConfirmation: true,
         summary: 'All must-haves derived from goals.',
       },
     });
     expect(response.isError).toBeFalsy();
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.id).toBeDefined();
     expect(parsed.prompt).toContain('SCOPE');
     expect(parsed.prompt).toContain('DECOMPOSE');
     expect(parsed.handoffWritten).toBe(true);
   });
   ```

   Also update the `EmitInteractionInputSchema` test for transition:

   ```typescript
   it('validates a transition input', () => {
     const result = EmitInteractionInputSchema.safeParse({
       path: '/project',
       type: 'transition',
       transition: {
         completedPhase: 'EXPLORE',
         suggestedNext: 'EVALUATE',
         reason: 'Context gathered',
         artifacts: ['notes.md'],
         requiresConfirmation: true,
         summary: 'Context gathered from 5 sources.',
       },
     });
     expect(result.success).toBe(true);
   });
   ```

3. Run: `npx vitest run packages/core/tests/interaction/types.test.ts`
4. Run: `npx vitest run packages/mcp-server/tests/tools/interaction.test.ts`
5. Observe: all tests pass.
6. Run: `harness validate`
7. Commit: `test: update existing transition tests for new required fields`

---

### Task 9: End-to-end validation of all SKILL.md changes

[checkpoint:human-verify] -- Review all 5 SKILL.md files for correctness before marking complete

**Depends on:** Tasks 3-7
**Files:** all 5 SKILL.md files (read-only verification)

1. Read each of the 5 SKILL.md files and verify:
   - `harness-brainstorming/SKILL.md`: Contains handoff.json write at end of Phase 4. Contains `emit_interaction` call with `requiresConfirmation: true` and `summary`. Contains "if user confirms/declines" instructions.
   - `harness-planning/SKILL.md`: Contains `emit_interaction` call with `requiresConfirmation: true` at end of Phase 4. Does NOT duplicate the existing handoff write (it was already there).
   - `harness-execution/SKILL.md`: Contains `emit_interaction` call with `requiresConfirmation: false` in Phase 4. Contains "immediately invoke harness-verification" instruction. Contains guard: only when ALL tasks complete.
   - `harness-verification/SKILL.md`: Contains handoff.json write. Contains conditional `emit_interaction` (only on PASS). Contains "immediately invoke harness-code-review" instruction. Contains guard: do NOT transition on FAIL.
   - `harness-code-review/SKILL.md`: Contains handoff.json write in Phase 7. Contains conditional `emit_interaction` (only on APPROVE). Contains `requiresConfirmation: true`. Contains guard: do NOT transition on REQUEST_CHANGES.
2. Verify no SKILL.md file contains surface-specific language ("terminal", "CLI" as interaction targets).
3. Verify all 5 files reference `emit_interaction` for transitions.
4. Run: `harness validate`
5. Commit: (no commit -- this is a verification-only task)

## Traceability Matrix

| Observable Truth                                                 | Delivered By                  |
| ---------------------------------------------------------------- | ----------------------------- |
| 1. TransitionSchema accepts requiresConfirmation + summary       | Task 1                        |
| 2. TransitionSchema rejects missing requiresConfirmation         | Task 1                        |
| 3. TransitionSchema rejects missing summary                      | Task 1                        |
| 4. Auto-transition response includes autoTransition + nextAction | Task 2                        |
| 5. Confirmed transition response excludes autoTransition         | Task 2                        |
| 6. Brainstorming handoff + confirmed transition                  | Task 3                        |
| 7. Planning confirmed transition                                 | Task 4                        |
| 8. Execution auto-transition                                     | Task 5                        |
| 9. Verification handoff + conditional auto-transition            | Task 6                        |
| 10. Code review handoff + conditional confirmed transition       | Task 7                        |
| 11. Verification FAIL does not transition                        | Task 6                        |
| 12. Review REQUEST_CHANGES does not transition                   | Task 7                        |
| 13. All 5 SKILL.md files use emit_interaction                    | Tasks 3-7, verified in Task 9 |
| 14. Core types tests pass                                        | Tasks 1, 8                    |
| 15. MCP handler tests pass                                       | Tasks 2, 8                    |
| 16. harness validate passes                                      | All tasks                     |

## Parallel Opportunities

- Tasks 3, 4, 5, 6, 7 (all SKILL.md modifications) are independent of each other and can be executed in parallel. They all depend on Task 2 but touch different files.
- Task 8 can run in parallel with Tasks 3-7 (it modifies test files, they modify SKILL.md files).

## Change Specification

### Changes to `packages/core/src/interaction/types.ts`

- [MODIFIED] `TransitionSchema` gains two new required fields: `requiresConfirmation: z.boolean()` and `summary: z.string()`
- [MODIFIED] `Transition` TypeScript type (inferred from schema) gains `requiresConfirmation: boolean` and `summary: string`

### Changes to `packages/mcp-server/src/tools/interaction.ts`

- [MODIFIED] `emitInteractionDefinition` transition schema gains `requiresConfirmation` and `summary` properties and adds them to `required`
- [MODIFIED] `EmitInteractionInput` interface's `transition` field gains `requiresConfirmation: boolean` and `summary: string`
- [MODIFIED] Transition handler includes `summary` in the prompt text
- [ADDED] Transition handler returns `autoTransition: true` and `nextAction` string when `requiresConfirmation` is `false`

### Changes to harness-brainstorming SKILL.md

- [ADDED] Handoff.json write at end of Phase 4 (after spec sign-off)
- [ADDED] `emit_interaction` call with confirmed transition to planning
- [ADDED] "If user confirms/declines" branching instructions

### Changes to harness-planning SKILL.md

- [ADDED] `emit_interaction` call with confirmed transition to execution at end of Phase 4

### Changes to harness-execution SKILL.md

- [ADDED] `emit_interaction` call with auto-transition to verification at plan completion
- [ADDED] "Immediately invoke harness-verification" instruction
- [ADDED] Guard: only transition when all tasks complete

### Changes to harness-verification SKILL.md

- [ADDED] Handoff.json write at verification completion
- [ADDED] Conditional `emit_interaction` call with auto-transition to review (on PASS only)
- [ADDED] "Immediately invoke harness-code-review" instruction (on PASS only)
- [ADDED] Guard: do not transition on FAIL

### Changes to harness-code-review SKILL.md

- [ADDED] Handoff.json write at review completion (Phase 7)
- [ADDED] Conditional `emit_interaction` call with confirmed transition to merge (on APPROVE only)
- [ADDED] Guard: do not transition on REQUEST_CHANGES
