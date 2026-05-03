# Plan: Wave 1.3 -- MCP Tool Upgrade (manage_state session section operations)

**Date:** 2026-03-27
**Spec:** docs/changes/ai-foundations-integration/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Extend the `manage_state` MCP tool with five new actions (`append_entry`, `update_entry_status`, `read_section`, `read_sections`, `archive_session`) that delegate to the Phase 1.2 core functions, while keeping all existing actions unchanged.

## Observable Truths (Acceptance Criteria)

1. When `manage_state` is called with `action: "append_entry"`, `session`, `section`, `authorSkill`, and `content`, the system shall append an entry and return the created `SessionEntry` object with `id`, `timestamp`, `authorSkill`, `content`, and `status: "active"`.
2. When `manage_state` is called with `action: "append_entry"` but missing `session`, `section`, `authorSkill`, or `content`, the system shall return an `isError: true` response with a descriptive message.
3. When `manage_state` is called with `action: "update_entry_status"`, `session`, `section`, `entryId`, and `newStatus`, the system shall update the entry status and return the modified `SessionEntry`.
4. When `manage_state` is called with `action: "update_entry_status"` but missing required fields, the system shall return an `isError: true` response.
5. When `manage_state` is called with `action: "read_section"`, `session`, and `section`, the system shall return the array of entries for that section.
6. When `manage_state` is called with `action: "read_sections"` and `session`, the system shall return all six session sections (terminology, decisions, constraints, risks, openQuestions, evidence).
7. When `manage_state` is called with `action: "archive_session"` and `session`, the system shall archive the session directory and return `{ archived: true }`.
8. When `manage_state` is called with `action: "archive_session"` but missing `session`, the system shall return an `isError: true` response.
9. The existing actions (`show`, `learn`, `failure`, `archive`, `reset`, `gate`, `save-handoff`, `load-handoff`) shall continue to work unchanged -- no behavioral changes.
10. `npx vitest run packages/cli/tests/mcp/tools/state.test.ts` passes with all new and existing tests.
11. `harness validate` passes.

## File Map

- MODIFY `packages/cli/src/mcp/tools/state.ts` (add new actions to definition, type, handlers, action map)
- MODIFY `packages/cli/tests/mcp/tools/state.test.ts` (add tests for all five new actions)

## Tasks

### Task 1: Add new action definitions and input type to state.ts

**Depends on:** none
**Files:** `packages/cli/src/mcp/tools/state.ts`

1. Open `packages/cli/src/mcp/tools/state.ts`.

2. Add the five new actions to the `manageStateDefinition.inputSchema.properties.action.enum` array:

   ```typescript
   enum: [
     'show',
     'learn',
     'failure',
     'archive',
     'reset',
     'gate',
     'save-handoff',
     'load-handoff',
     'append_entry',
     'update_entry_status',
     'read_section',
     'read_sections',
     'archive_session',
   ],
   ```

3. Add new input schema properties for session section operations:

   ```typescript
   section: {
     type: 'string',
     description:
       'Session section name (terminology, decisions, constraints, risks, openQuestions, evidence)',
   },
   authorSkill: {
     type: 'string',
     description: 'Name of the skill authoring the entry (required for append_entry)',
   },
   content: {
     type: 'string',
     description: 'Entry content text (required for append_entry)',
   },
   entryId: {
     type: 'string',
     description: 'ID of the entry to update (required for update_entry_status)',
   },
   newStatus: {
     type: 'string',
     description: 'New status for the entry: active, resolved, or superseded (required for update_entry_status)',
   },
   ```

4. Extend the `StateInput` type with the new optional fields:

   ```typescript
   section?: string;
   authorSkill?: string;
   content?: string;
   entryId?: string;
   newStatus?: string;
   ```

5. Run: `npx vitest run packages/cli/tests/mcp/tools/state.test.ts`
6. Observe: existing tests still pass (no behavioral changes yet).
7. Run: `harness validate`
8. Commit: `feat(state): add session section action definitions to manage_state schema`

---

### Task 2: Implement handler functions for the five new actions

**Depends on:** Task 1
**Files:** `packages/cli/src/mcp/tools/state.ts`

1. Add `handleAppendEntry` handler function:

   ```typescript
   async function handleAppendEntry(projectPath: string, input: StateInput) {
     if (!input.session) return mcpError('Error: session is required for append_entry action');
     if (!input.section) return mcpError('Error: section is required for append_entry action');
     if (!input.authorSkill)
       return mcpError('Error: authorSkill is required for append_entry action');
     if (!input.content) return mcpError('Error: content is required for append_entry action');
     const { appendSessionEntry } = await import('@harness-engineering/core');
     const result = await appendSessionEntry(
       projectPath,
       input.session,
       input.section as import('@harness-engineering/types').SessionSectionName,
       input.authorSkill,
       input.content
     );
     return resultToMcpResponse(result);
   }
   ```

2. Add `handleUpdateEntryStatus` handler function:

   ```typescript
   async function handleUpdateEntryStatus(projectPath: string, input: StateInput) {
     if (!input.session)
       return mcpError('Error: session is required for update_entry_status action');
     if (!input.section)
       return mcpError('Error: section is required for update_entry_status action');
     if (!input.entryId)
       return mcpError('Error: entryId is required for update_entry_status action');
     if (!input.newStatus)
       return mcpError('Error: newStatus is required for update_entry_status action');
     const { updateSessionEntryStatus } = await import('@harness-engineering/core');
     const result = await updateSessionEntryStatus(
       projectPath,
       input.session,
       input.section as import('@harness-engineering/types').SessionSectionName,
       input.entryId,
       input.newStatus as import('@harness-engineering/types').SessionEntryStatus
     );
     return resultToMcpResponse(result);
   }
   ```

3. Add `handleReadSection` handler function:

   ```typescript
   async function handleReadSection(projectPath: string, input: StateInput) {
     if (!input.session) return mcpError('Error: session is required for read_section action');
     if (!input.section) return mcpError('Error: section is required for read_section action');
     const { readSessionSection } = await import('@harness-engineering/core');
     const result = await readSessionSection(
       projectPath,
       input.session,
       input.section as import('@harness-engineering/types').SessionSectionName
     );
     return resultToMcpResponse(result);
   }
   ```

4. Add `handleReadSections` handler function:

   ```typescript
   async function handleReadSections(projectPath: string, input: StateInput) {
     if (!input.session) return mcpError('Error: session is required for read_sections action');
     const { readSessionSections } = await import('@harness-engineering/core');
     const result = await readSessionSections(projectPath, input.session);
     return resultToMcpResponse(result);
   }
   ```

5. Add `handleArchiveSession` handler function:

   ```typescript
   async function handleArchiveSession(projectPath: string, input: StateInput) {
     if (!input.session) return mcpError('Error: session is required for archive_session action');
     const { archiveSession } = await import('@harness-engineering/core');
     const result = await archiveSession(projectPath, input.session);
     if (!result.ok) return resultToMcpResponse(result);
     return resultToMcpResponse(Ok({ archived: true }));
   }
   ```

6. Register all five handlers in `ACTION_HANDLERS`:

   ```typescript
   'append_entry': handleAppendEntry,
   'update_entry_status': handleUpdateEntryStatus,
   'read_section': handleReadSection,
   'read_sections': handleReadSections,
   'archive_session': handleArchiveSession,
   ```

7. Run: `npx vitest run packages/cli/tests/mcp/tools/state.test.ts`
8. Observe: existing tests pass, new handlers are wired but not yet tested.
9. Run: `harness validate`
10. Commit: `feat(state): implement session section handler functions in manage_state`

---

### Task 3: Add definition and validation tests for new actions

**Depends on:** Task 1
**Files:** `packages/cli/tests/mcp/tools/state.test.ts`

1. Add a test that verifies all new actions are in the enum:

   ```typescript
   it('has session section actions in enum', () => {
     const actionProp = manageStateDefinition.inputSchema.properties.action as {
       type: string;
       enum: string[];
     };
     expect(actionProp.enum).toContain('append_entry');
     expect(actionProp.enum).toContain('update_entry_status');
     expect(actionProp.enum).toContain('read_section');
     expect(actionProp.enum).toContain('read_sections');
     expect(actionProp.enum).toContain('archive_session');
   });
   ```

2. Add a test for new input schema properties:

   ```typescript
   it('has session section input properties', () => {
     const props = manageStateDefinition.inputSchema.properties;
     expect(props.section).toBeDefined();
     expect(props.authorSkill).toBeDefined();
     expect(props.content).toBeDefined();
     expect(props.entryId).toBeDefined();
     expect(props.newStatus).toBeDefined();
   });
   ```

3. Add validation error tests for `append_entry`:

   ```typescript
   it('append_entry returns error when session is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'append_entry',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('session is required');
   });

   it('append_entry returns error when section is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'append_entry',
       session: 'test-session',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('section is required');
   });

   it('append_entry returns error when authorSkill is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'append_entry',
       session: 'test-session',
       section: 'decisions',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('authorSkill is required');
   });

   it('append_entry returns error when content is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'append_entry',
       session: 'test-session',
       section: 'decisions',
       authorSkill: 'harness-planning',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('content is required');
   });
   ```

4. Add validation error tests for `update_entry_status`:

   ```typescript
   it('update_entry_status returns error when session is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'update_entry_status',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('session is required');
   });

   it('update_entry_status returns error when entryId is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'update_entry_status',
       session: 'test-session',
       section: 'decisions',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('entryId is required');
   });

   it('update_entry_status returns error when newStatus is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'update_entry_status',
       session: 'test-session',
       section: 'decisions',
       entryId: 'abc123',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('newStatus is required');
   });
   ```

5. Add validation error tests for `read_section`, `read_sections`, and `archive_session`:

   ```typescript
   it('read_section returns error when session is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'read_section',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('session is required');
   });

   it('read_section returns error when section is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'read_section',
       session: 'test-session',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('section is required');
   });

   it('read_sections returns error when session is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'read_sections',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('session is required');
   });

   it('archive_session returns error when session is missing', async () => {
     const response = await handleManageState({
       path: '/tmp/test-project',
       action: 'archive_session',
     });
     expect(response.isError).toBe(true);
     expect(response.content[0].text).toContain('session is required');
   });
   ```

6. Run: `npx vitest run packages/cli/tests/mcp/tools/state.test.ts`
7. Observe: all new validation tests pass alongside existing tests.
8. Run: `harness validate`
9. Commit: `test(state): add definition and validation tests for session section actions`

---

### Task 4: Add integration tests with temp directory for happy paths

**Depends on:** Task 2, Task 3
**Files:** `packages/cli/tests/mcp/tools/state.test.ts`

1. Add a new `describe('manage_state session section actions', ...)` block with `beforeEach`/`afterEach` for temp directory setup (following the pattern in `packages/core/tests/state/session-sections.test.ts`):

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';

   describe('manage_state session section actions', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-tool-session-test-'));
       const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
       fs.mkdirSync(sessionDir, { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });
   ```

   Note: Add `beforeEach` and `afterEach` imports to the existing vitest import line.

2. Add happy-path test for `read_sections`:

   ```typescript
   it('read_sections returns empty sections for new session', async () => {
     const response = await handleManageState({
       path: tmpDir,
       action: 'read_sections',
       session: 'test-session',
     });
     expect(response.isError).toBeFalsy();
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.terminology).toEqual([]);
     expect(parsed.decisions).toEqual([]);
     expect(parsed.constraints).toEqual([]);
     expect(parsed.risks).toEqual([]);
     expect(parsed.openQuestions).toEqual([]);
     expect(parsed.evidence).toEqual([]);
   });
   ```

3. Add happy-path test for `append_entry`:

   ```typescript
   it('append_entry creates entry and returns it', async () => {
     const response = await handleManageState({
       path: tmpDir,
       action: 'append_entry',
       session: 'test-session',
       section: 'decisions',
       authorSkill: 'harness-planning',
       content: 'Chose TypeScript for implementation',
     });
     expect(response.isError).toBeFalsy();
     const entry = JSON.parse(response.content[0].text);
     expect(entry.id).toBeDefined();
     expect(entry.timestamp).toBeDefined();
     expect(entry.authorSkill).toBe('harness-planning');
     expect(entry.content).toBe('Chose TypeScript for implementation');
     expect(entry.status).toBe('active');
   });
   ```

4. Add happy-path test for `read_section` after append:

   ```typescript
   it('read_section returns entries after append', async () => {
     await handleManageState({
       path: tmpDir,
       action: 'append_entry',
       session: 'test-session',
       section: 'risks',
       authorSkill: 'harness-brainstorming',
       content: 'Concurrent writes not protected',
     });
     const response = await handleManageState({
       path: tmpDir,
       action: 'read_section',
       session: 'test-session',
       section: 'risks',
     });
     expect(response.isError).toBeFalsy();
     const entries = JSON.parse(response.content[0].text);
     expect(entries).toHaveLength(1);
     expect(entries[0].content).toBe('Concurrent writes not protected');
   });
   ```

5. Add happy-path test for `update_entry_status`:

   ```typescript
   it('update_entry_status changes entry status', async () => {
     const appendResponse = await handleManageState({
       path: tmpDir,
       action: 'append_entry',
       session: 'test-session',
       section: 'openQuestions',
       authorSkill: 'harness-brainstorming',
       content: 'Should we use Redis?',
     });
     const appendedEntry = JSON.parse(appendResponse.content[0].text);

     const response = await handleManageState({
       path: tmpDir,
       action: 'update_entry_status',
       session: 'test-session',
       section: 'openQuestions',
       entryId: appendedEntry.id,
       newStatus: 'resolved',
     });
     expect(response.isError).toBeFalsy();
     const updated = JSON.parse(response.content[0].text);
     expect(updated.id).toBe(appendedEntry.id);
     expect(updated.status).toBe('resolved');
   });
   ```

6. Add happy-path test for `archive_session`:

   ```typescript
   it('archive_session archives the session directory', async () => {
     // Ensure session has content
     await handleManageState({
       path: tmpDir,
       action: 'append_entry',
       session: 'test-session',
       section: 'terminology',
       authorSkill: 'harness-brainstorming',
       content: 'Widget: a UI component',
     });
     const response = await handleManageState({
       path: tmpDir,
       action: 'archive_session',
       session: 'test-session',
     });
     expect(response.isError).toBeFalsy();
     const parsed = JSON.parse(response.content[0].text);
     expect(parsed.archived).toBe(true);
     // Original session dir should no longer exist
     const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
     expect(fs.existsSync(sessionDir)).toBe(false);
     // Archive dir should exist
     const archiveBase = path.join(tmpDir, '.harness', 'archive', 'sessions');
     expect(fs.existsSync(archiveBase)).toBe(true);
   });
   ```

7. Close the describe block:

   ```typescript
   });
   ```

8. Run: `npx vitest run packages/cli/tests/mcp/tools/state.test.ts`
9. Observe: all tests pass (existing + new validation + new integration).
10. Run: `harness validate`
11. Commit: `test(state): add integration tests for session section happy paths`

---

### Task 5: Backward compatibility verification and final validation

**Depends on:** Task 4
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run the full test suite for the state tool:

   ```bash
   npx vitest run packages/cli/tests/mcp/tools/state.test.ts
   ```

   Observe: all tests pass.

2. Run the core session-sections tests to confirm no regressions:

   ```bash
   npx vitest run packages/core/tests/state/session-sections.test.ts
   ```

   Observe: all tests pass.

3. Run the core session-archive tests:

   ```bash
   npx vitest run packages/core/tests/state/session-archive.test.ts
   ```

   Observe: all tests pass.

4. Run full project validation:

   ```bash
   harness validate
   ```

   Observe: validation passes.

5. Run typecheck on the CLI package:

   ```bash
   cd packages/cli && npx tsc --noEmit
   ```

   Observe: no type errors.

6. Verify backward compatibility manually: confirm the `show` action still returns default state:

   ```bash
   npx vitest run packages/cli/tests/mcp/tools/state.test.ts -t "show action returns state"
   ```

   Observe: passes.

7. Commit: `test(state): verify backward compatibility for manage_state session section upgrade`

## Traceability Matrix

| Observable Truth                          | Delivered by                                |
| ----------------------------------------- | ------------------------------------------- |
| 1. append_entry creates entry             | Task 2 (handler), Task 4 (test)             |
| 2. append_entry validates required fields | Task 2 (handler), Task 3 (test)             |
| 3. update_entry_status updates entry      | Task 2 (handler), Task 4 (test)             |
| 4. update_entry_status validates fields   | Task 2 (handler), Task 3 (test)             |
| 5. read_section returns entries           | Task 2 (handler), Task 4 (test)             |
| 6. read_sections returns all sections     | Task 2 (handler), Task 4 (test)             |
| 7. archive_session archives directory     | Task 2 (handler), Task 4 (test)             |
| 8. archive_session validates session      | Task 2 (handler), Task 3 (test)             |
| 9. Existing actions unchanged             | Task 1 (no removals), Task 5 (verification) |
| 10. All tests pass                        | Task 5 (full run)                           |
| 11. harness validate passes               | Task 5 (validation)                         |
