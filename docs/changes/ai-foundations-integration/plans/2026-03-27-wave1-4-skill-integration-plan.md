# Plan: Wave 1.4 -- Skill Integration (Session Memory)

**Date:** 2026-03-27
**Spec:** docs/changes/ai-foundations-integration/proposal.md (Phase 1.4)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

`gather_context` returns session sections in its output when requested, and the three core workflow skills (brainstorming, planning, execution) document their session section read/write patterns in their SKILL.md files.

## Observable Truths (Acceptance Criteria)

1. When `gather_context` is called with `include: ["sessions"]` and a `session` parameter, the returned JSON includes a `sessionSections` field containing objects for all six sections (terminology, decisions, constraints, risks, openQuestions, evidence).
2. When `gather_context` is called without `"sessions"` in the include array, the output shall not contain a `sessionSections` field (it is null).
3. The `include` enum in `gatherContextDefinition.inputSchema` contains `"sessions"` as the sixth valid value.
4. If `"sessions"` is included but no `session` parameter is provided, `sessionSections` shall be null (graceful degradation, no error).
5. Existing calls without `"sessions"` in include continue to work identically (backward compatibility).
6. `agents/skills/claude-code/harness-brainstorming/SKILL.md` contains a "Session State" table documenting reads/writes to terminology, decisions, constraints, risks, openQuestions.
7. `agents/skills/claude-code/harness-planning/SKILL.md` contains a "Session State" table documenting reads/writes to decisions, constraints, risks, openQuestions.
8. `agents/skills/claude-code/harness-execution/SKILL.md` contains a "Session State" table documenting reads/writes to all six sections.
9. `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts tests/mcp/tools/gather-context-session.test.ts` passes with all tests green.
10. `harness validate` passes.

## File Map

```
MODIFY packages/cli/src/mcp/tools/gather-context.ts (add 'sessions' to IncludeKey, add sessionSections promise and output field)
MODIFY packages/cli/tests/mcp/tools/gather-context.test.ts (update include enum test, add sessionSections tests)
MODIFY packages/cli/tests/mcp/tools/gather-context-session.test.ts (add sessions-related schema test)
MODIFY agents/skills/claude-code/harness-brainstorming/SKILL.md (add Session State section)
MODIFY agents/skills/claude-code/harness-planning/SKILL.md (add Session State section)
MODIFY agents/skills/claude-code/harness-execution/SKILL.md (add Session State section)
```

## Tasks

### Task 1: Add `sessions` include key and sessionSections promise to gather-context (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/mcp/tools/gather-context.test.ts`, `packages/cli/tests/mcp/tools/gather-context-session.test.ts`, `packages/cli/src/mcp/tools/gather-context.ts`

1. Update tests in `packages/cli/tests/mcp/tools/gather-context.test.ts`:

   In the `include enum has all constituent names` test, change the expected array from:

   ```typescript
   expect(includeProp.items.enum).toEqual(['state', 'learnings', 'handoff', 'graph', 'validation']);
   ```

   to:

   ```typescript
   expect(includeProp.items.enum).toEqual([
     'state',
     'learnings',
     'handoff',
     'graph',
     'validation',
     'sessions',
   ]);
   ```

2. In the same file, in the `handler` describe block, after the existing `returns assembledIn > 0` test, add:

   ```typescript
   it('returns sessionSections as null when sessions not in include', async () => {
     const response = await handleGatherContext({
       path: '/nonexistent/project-gc-test',
       intent: 'test intent',
       include: ['state'],
     });
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.sessionSections).toBeNull();
   });

   it('returns sessionSections as null when sessions included but no session param', async () => {
     const response = await handleGatherContext({
       path: '/nonexistent/project-gc-test',
       intent: 'test intent',
       include: ['sessions'],
     });
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.sessionSections).toBeNull();
   });
   ```

3. In `packages/cli/tests/mcp/tools/gather-context-session.test.ts`, add a test:

   ```typescript
   it('include enum contains sessions value', () => {
     const includeProp = gatherContextDefinition.inputSchema.properties.include;
     expect(includeProp.items.enum).toContain('sessions');
   });
   ```

4. Run tests: `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts tests/mcp/tools/gather-context-session.test.ts`
5. Observe: failures (enum test fails because 'sessions' is not in the definition yet, new handler tests fail because sessionSections is not in output)

6. Now implement in `packages/cli/src/mcp/tools/gather-context.ts`:

   a. Change the `IncludeKey` type from:

   ```typescript
   type IncludeKey = 'state' | 'learnings' | 'handoff' | 'graph' | 'validation';
   ```

   to:

   ```typescript
   type IncludeKey = 'state' | 'learnings' | 'handoff' | 'graph' | 'validation' | 'sessions';
   ```

   b. In the `inputSchema.properties.include.items.enum` array, add `'sessions'` as the last element:

   ```typescript
   enum: ['state', 'learnings', 'handoff', 'graph', 'validation', 'sessions'],
   ```

   c. After the `validationPromise` declaration (around line 166), add the sessions promise:

   ```typescript
   const sessionsPromise =
     includeSet.has('sessions') && input.session
       ? import('@harness-engineering/core').then((core) =>
           core.readSessionSections(projectPath, input.session!)
         )
       : Promise.resolve(null);
   ```

   d. Update the `Promise.allSettled` call to include the new promise. Change:

   ```typescript
   const [stateResult, learningsResult, handoffResult, graphResult, validationResult] =
     await Promise.allSettled([
       statePromise,
       learningsPromise,
       handoffPromise,
       graphPromise,
       validationPromise,
     ]);
   ```

   to:

   ```typescript
   const [
     stateResult,
     learningsResult,
     handoffResult,
     graphResult,
     validationResult,
     sessionsResult,
   ] = await Promise.allSettled([
     statePromise,
     learningsPromise,
     handoffPromise,
     graphPromise,
     validationPromise,
     sessionsPromise,
   ]);
   ```

   e. After `const validationRaw = extract(validationResult, 'validation');` add:

   ```typescript
   const sessionsRaw = extract(sessionsResult, 'sessions');
   ```

   f. After the `const validation = validationRaw;` line, add unwrapping for the Result type:

   ```typescript
   const sessionSections =
     sessionsRaw && typeof sessionsRaw === 'object' && 'ok' in sessionsRaw
       ? (sessionsRaw as { ok: boolean; value?: unknown }).ok
         ? (sessionsRaw as { value: unknown }).value
         : (() => {
             errors.push(
               `sessions: ${(sessionsRaw as { error: { message: string } }).error.message}`
             );
             return null;
           })()
       : sessionsRaw;
   ```

   g. In the `output` object (around line 272), add `sessionSections` after `validation`:

   ```typescript
   const output = {
     state: outputState,
     learnings: outputLearnings,
     handoff: outputHandoff,
     graphContext: outputGraphContext,
     validation: outputValidation,
     sessionSections: sessionSections ?? null,
     meta: {
       assembledIn,
       graphAvailable: graphContext !== null,
       tokenEstimate: 0,
       errors,
     },
   };
   ```

7. Run tests: `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts tests/mcp/tools/gather-context-session.test.ts`
8. Observe: all tests pass.
9. Run: `harness validate`
10. Commit: `feat(gather-context): add sessions include key for session section retrieval`

### Task 2: Add sessionSections integration test with real session data

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/tools/gather-context.test.ts`

1. In the `gather_context snapshot parity` describe block in `packages/cli/tests/mcp/tools/gather-context.test.ts`, add the following test after the existing `validation field matches handleValidateProject output` test:

   ```typescript
   it('sessionSections field matches readSessionSections output when session exists', async () => {
     const { appendSessionEntry, readSessionSections } = await import('@harness-engineering/core');

     // Create a session with some data
     const sessionSlug = 'test-gc-session';
     const sessionDir = path.join(tmpDir, '.harness', 'sessions', sessionSlug);
     fs.mkdirSync(sessionDir, { recursive: true });

     await appendSessionEntry(
       tmpDir,
       sessionSlug,
       'decisions',
       'test-skill',
       'Use approach A for auth'
     );

     const compositeResponse = await handleGatherContext({
       path: tmpDir,
       intent: 'parity test',
       session: sessionSlug,
       include: ['sessions'],
     });
     const compositeData = JSON.parse(compositeResponse.content[0].text);

     const directResult = await readSessionSections(tmpDir, sessionSlug);
     const directSections = directResult.ok ? directResult.value : null;

     expect(compositeData.sessionSections).toEqual(directSections);
     // Verify the appended entry is present
     expect(compositeData.sessionSections.decisions).toHaveLength(1);
     expect(compositeData.sessionSections.decisions[0].content).toBe('Use approach A for auth');
   });
   ```

2. Also add a test for the `handler` describe block to verify `sessionSections` is present in the default output shape:

   In the `returns all fields with nulls for nonexistent project` test, add an assertion:

   ```typescript
   expect(parsed).toHaveProperty('sessionSections');
   ```

3. Run tests: `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts`
4. Observe: all tests pass.
5. Run: `harness validate`
6. Commit: `test(gather-context): add sessionSections parity and shape integration tests`

### Task 3: Add Session State section to harness-brainstorming SKILL.md

**Depends on:** none (parallelizable with Tasks 1-2)
**Files:** `agents/skills/claude-code/harness-brainstorming/SKILL.md`

1. In `agents/skills/claude-code/harness-brainstorming/SKILL.md`, locate the `## Harness Integration` section (around line 262). Insert the following new section immediately BEFORE `## Harness Integration`:

   ```markdown
   ## Session State

   This skill reads and writes to the following session sections via `manage_state`:

   | Section       | Read | Write | Purpose                                               |
   | ------------- | ---- | ----- | ----------------------------------------------------- |
   | terminology   | yes  | yes   | Captures domain terms discovered during brainstorming |
   | decisions     | no   | yes   | Records design decisions made during exploration      |
   | constraints   | yes  | no    | Reads constraints to scope brainstorming              |
   | risks         | no   | yes   | Captures risks identified during brainstorming        |
   | openQuestions | yes  | yes   | Adds new questions, resolves answered ones            |
   | evidence      | no   | no    | Not used by this skill                                |

   **When to write:** After each phase transition (EXPLORE -> EVALUATE -> PRIORITIZE -> VALIDATE), append relevant entries to the appropriate sections. This ensures downstream skills (planning, execution) inherit accumulated context without re-discovery.

   **When to read:** At the start of Phase 1 (EXPLORE), read `terminology` and `constraints` from the session to inherit context from prior skills or previous brainstorming sessions on the same feature.
   ```

2. Run: `harness validate`
3. Commit: `docs(brainstorming): add session state section usage documentation`

### Task 4: Add Session State section to harness-planning SKILL.md

**Depends on:** none (parallelizable with Tasks 1-3)
**Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. In `agents/skills/claude-code/harness-planning/SKILL.md`, locate the `## Harness Integration` section. Insert the following new section immediately BEFORE `## Harness Integration`:

   ```markdown
   ## Session State

   This skill reads and writes to the following session sections via `manage_state`:

   | Section       | Read | Write | Purpose                                                                       |
   | ------------- | ---- | ----- | ----------------------------------------------------------------------------- |
   | terminology   | yes  | no    | Reads domain terms to use consistent language in plan                         |
   | decisions     | yes  | yes   | Reads brainstorming decisions; records planning-phase decisions               |
   | constraints   | yes  | yes   | Reads existing constraints; adds constraints discovered during decomposition  |
   | risks         | yes  | yes   | Reads existing risks; adds implementation risks identified during task design |
   | openQuestions | yes  | yes   | Reads unresolved questions; adds new questions, resolves answered ones        |
   | evidence      | no   | no    | Not used by this skill                                                        |

   **When to write:** During Phase 1 (SCOPE) write newly discovered constraints and risks. During Phase 2 (DECOMPOSE) write decisions about task structure and sequencing. Mark resolved questions during Phase 4 (VALIDATE).

   **When to read:** At the start of Phase 1 (SCOPE), read all sections via `gather_context` with `include: ["sessions"]` to inherit context from brainstorming. Use terminology for consistent naming in task descriptions.
   ```

2. Run: `harness validate`
3. Commit: `docs(planning): add session state section usage documentation`

### Task 5: Add Session State section to harness-execution SKILL.md

**Depends on:** none (parallelizable with Tasks 1-4)
**Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. In `agents/skills/claude-code/harness-execution/SKILL.md`, locate the `## Harness Integration` section (around line 348). Insert the following new section immediately BEFORE `## Harness Integration`:

   ```markdown
   ## Session State

   This skill reads and writes to the following session sections via `manage_state`:

   | Section       | Read | Write | Purpose                                                                               |
   | ------------- | ---- | ----- | ------------------------------------------------------------------------------------- |
   | terminology   | yes  | yes   | Reads domain terms for consistent naming; adds terms discovered during implementation |
   | decisions     | yes  | yes   | Reads planning decisions for context; records implementation decisions                |
   | constraints   | yes  | yes   | Reads constraints to respect boundaries; adds constraints discovered during coding    |
   | risks         | yes  | yes   | Reads risks for awareness; updates risk status as mitigated or realized               |
   | openQuestions | yes  | yes   | Reads questions for context; resolves questions answered by implementation            |
   | evidence      | yes  | yes   | Reads prior evidence; writes file:line citations, test outputs, and diff references   |

   **When to write:** After each task completion, append relevant entries. Evidence entries should be written for every significant technical assertion (test result, file reference, performance measurement). Mark openQuestions as resolved when implementation answers them.

   **When to read:** During Phase 1 (PREPARE), read all sections via `gather_context` with `include: ["sessions"]` to inherit full accumulated context from brainstorming and planning.
   ```

2. Run: `harness validate`
3. Commit: `docs(execution): add session state section usage documentation`

## Traceability

| Observable Truth                                        | Delivered By                                       |
| ------------------------------------------------------- | -------------------------------------------------- |
| 1. sessionSections returned when include has "sessions" | Task 1 (implementation), Task 2 (integration test) |
| 2. sessionSections null when not included               | Task 1 (test + implementation)                     |
| 3. "sessions" in include enum                           | Task 1                                             |
| 4. Graceful degradation without session param           | Task 1 (test + implementation)                     |
| 5. Backward compatibility                               | Task 1 (existing tests continue to pass)           |
| 6. Brainstorming SKILL.md session state docs            | Task 3                                             |
| 7. Planning SKILL.md session state docs                 | Task 4                                             |
| 8. Execution SKILL.md session state docs                | Task 5                                             |
| 9. All gather-context tests pass                        | Task 1, Task 2                                     |
| 10. harness validate passes                             | All tasks                                          |
