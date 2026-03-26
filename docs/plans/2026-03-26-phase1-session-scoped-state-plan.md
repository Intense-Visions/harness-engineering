# Plan: Phase 1 — Universal Session-Scoped State

**Date:** 2026-03-26
**Spec:** docs/changes/efficient-context-pipeline/proposal.md
**Estimated tasks:** 9
**Estimated time:** 35 minutes

## Goal

All state files (state.json, handoff.json, learnings.md, failures.md) are read from and written to session-scoped directories under `.harness/sessions/<slug>/`, with `gather_context` accepting a `session` parameter, and backwards-compatible fallback to global files when no session is specified.

## Observable Truths (Acceptance Criteria)

1. When `gather_context({ path, intent, session: "my-session" })` is called, the system shall load state, learnings, handoff, and failures from `.harness/sessions/my-session/` instead of `.harness/`.
2. When `gather_context({ path, intent })` is called without a `session` parameter, the system shall fall back to global files at `.harness/` (backwards compatible).
3. When `appendLearning(projectPath, learning, skill, outcome, undefined, "my-session")` is called, the system shall write to `.harness/sessions/my-session/learnings.md`.
4. When `saveState(projectPath, state, undefined, "my-session")` is called, the system shall write to `.harness/sessions/my-session/state.json`.
5. When `saveHandoff(projectPath, handoff, undefined, "my-session")` is called, the system shall write to `.harness/sessions/my-session/handoff.json`.
6. When `appendFailure(projectPath, desc, skill, type, undefined, "my-session")` is called, the system shall write to `.harness/sessions/my-session/failures.md`.
7. The `sessions/index.md` file shall be created/updated when session directories are used, listing active sessions.
8. The harness-execution SKILL.md shall instruct agents to pass a `session` parameter to `gather_context` when a session directory is known.
9. The harness-autopilot SKILL.md shall pass the session slug to `gather_context` in its INIT phase.
10. `npx vitest run packages/core/tests/state/session-resolution.test.ts` passes with all tests green.
11. `npx vitest run packages/cli/tests/mcp/tools/gather-context-session.test.ts` passes with all tests green.
12. `harness validate` passes.

## File Map

```
CREATE packages/core/src/state/session-resolver.ts
CREATE packages/core/tests/state/session-resolution.test.ts
MODIFY packages/core/src/state/state-shared.ts (add getSessionDir, update getStateDir)
MODIFY packages/core/src/state/constants.ts (add SESSIONS_DIR, SESSION_INDEX_FILE)
MODIFY packages/core/src/state/index.ts (export session functions)
MODIFY packages/core/src/state/state-manager.ts (re-export session functions)
MODIFY packages/cli/src/mcp/tools/gather-context.ts (add session parameter, thread to core)
CREATE packages/cli/tests/mcp/tools/gather-context-session.test.ts
MODIFY agents/skills/claude-code/harness-execution/SKILL.md (add session parameter to gather_context calls)
MODIFY agents/skills/claude-code/harness-autopilot/SKILL.md (add session parameter to gather_context call)
```

## Tasks

### Task 1: Add session constants

**Depends on:** none
**Files:** `packages/core/src/state/constants.ts`

1. Read `packages/core/src/state/constants.ts`.
2. Add two new constants after the existing ones:
   ```typescript
   export const SESSIONS_DIR = 'sessions';
   export const SESSION_INDEX_FILE = 'index.md';
   ```
3. Run: `harness validate`
4. Commit: `feat(state): add session directory constants`

---

### Task 2: Create session resolver with TDD

**Depends on:** Task 1
**Files:** `packages/core/src/state/session-resolver.ts`, `packages/core/tests/state/session-resolution.test.ts`

1. Create test file `packages/core/tests/state/session-resolution.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { resolveSessionDir, updateSessionIndex } from '../../src/state/session-resolver';

   function makeTmp() {
     return fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
   }

   describe('resolveSessionDir', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = makeTmp();
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('returns session directory path under .harness/sessions/<slug>', () => {
       const result = resolveSessionDir(tmpDir, 'my-feature--spec');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value).toBe(path.join(tmpDir, '.harness', 'sessions', 'my-feature--spec'));
       }
     });

     it('creates the session directory if it does not exist', () => {
       const result = resolveSessionDir(tmpDir, 'new-session', { create: true });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(fs.existsSync(result.value)).toBe(true);
       }
     });

     it('rejects empty session slug', () => {
       const result = resolveSessionDir(tmpDir, '');
       expect(result.ok).toBe(false);
     });

     it('rejects slugs with path traversal', () => {
       const result = resolveSessionDir(tmpDir, '../escape');
       expect(result.ok).toBe(false);
     });

     it('accepts valid session slugs with double-dashes', () => {
       const result = resolveSessionDir(tmpDir, 'changes--auth-system--proposal');
       expect(result.ok).toBe(true);
     });
   });

   describe('updateSessionIndex', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = makeTmp();
       fs.mkdirSync(path.join(tmpDir, '.harness', 'sessions'), { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('creates index.md if it does not exist', () => {
       updateSessionIndex(tmpDir, 'my-session', 'execution phase 1');
       const indexPath = path.join(tmpDir, '.harness', 'sessions', 'index.md');
       expect(fs.existsSync(indexPath)).toBe(true);
       const content = fs.readFileSync(indexPath, 'utf-8');
       expect(content).toContain('my-session');
       expect(content).toContain('execution phase 1');
     });

     it('updates existing entry without duplicating', () => {
       updateSessionIndex(tmpDir, 'my-session', 'phase 1');
       updateSessionIndex(tmpDir, 'my-session', 'phase 2');
       const indexPath = path.join(tmpDir, '.harness', 'sessions', 'index.md');
       const content = fs.readFileSync(indexPath, 'utf-8');
       const matches = content.match(/my-session/g);
       expect(matches).toHaveLength(1);
       expect(content).toContain('phase 2');
       expect(content).not.toContain('phase 1');
     });

     it('preserves other session entries when updating one', () => {
       updateSessionIndex(tmpDir, 'session-a', 'doing A');
       updateSessionIndex(tmpDir, 'session-b', 'doing B');
       updateSessionIndex(tmpDir, 'session-a', 'updated A');
       const indexPath = path.join(tmpDir, '.harness', 'sessions', 'index.md');
       const content = fs.readFileSync(indexPath, 'utf-8');
       expect(content).toContain('session-b');
       expect(content).toContain('doing B');
       expect(content).toContain('updated A');
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/state/session-resolution.test.ts`
3. Observe failure: `resolveSessionDir` and `updateSessionIndex` are not defined.

4. Create implementation `packages/core/src/state/session-resolver.ts`:

   ```typescript
   // packages/core/src/state/session-resolver.ts
   import * as fs from 'fs';
   import * as path from 'path';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import { HARNESS_DIR, SESSIONS_DIR, SESSION_INDEX_FILE } from './constants';

   const SESSION_SLUG_REGEX = /^[a-z0-9][a-z0-9._-]*$/;

   /**
    * Resolves the directory path for a session.
    * Optionally creates the directory if it does not exist.
    */
   export function resolveSessionDir(
     projectPath: string,
     sessionSlug: string,
     options?: { create?: boolean }
   ): Result<string, Error> {
     if (!sessionSlug || sessionSlug.trim() === '') {
       return Err(new Error('Session slug must not be empty'));
     }

     if (sessionSlug.includes('..') || sessionSlug.includes('/')) {
       return Err(
         new Error(
           `Invalid session slug '${sessionSlug}': must not contain path traversal characters`
         )
       );
     }

     const sessionDir = path.join(projectPath, HARNESS_DIR, SESSIONS_DIR, sessionSlug);

     if (options?.create) {
       fs.mkdirSync(sessionDir, { recursive: true });
     }

     return Ok(sessionDir);
   }

   /**
    * Updates the session index.md file with an entry for the given session.
    * Creates the file if it does not exist.
    * Updates existing entries in-place (per-slug line ownership).
    */
   export function updateSessionIndex(
     projectPath: string,
     sessionSlug: string,
     description: string
   ): void {
     const sessionsDir = path.join(projectPath, HARNESS_DIR, SESSIONS_DIR);
     fs.mkdirSync(sessionsDir, { recursive: true });

     const indexPath = path.join(sessionsDir, SESSION_INDEX_FILE);
     const date = new Date().toISOString().split('T')[0];
     const newLine = `- [${sessionSlug}](${sessionSlug}/summary.md) — ${description} (${date})`;

     if (!fs.existsSync(indexPath)) {
       fs.writeFileSync(indexPath, `## Active Sessions\n\n${newLine}\n`);
       return;
     }

     const content = fs.readFileSync(indexPath, 'utf-8');
     const lines = content.split('\n');
     const slugPattern = `- [${sessionSlug}]`;
     const existingIdx = lines.findIndex((l) => l.startsWith(slugPattern));

     if (existingIdx >= 0) {
       lines[existingIdx] = newLine;
     } else {
       // Append after the last non-empty line
       const lastNonEmpty = lines.reduce((last, line, i) => (line.trim() !== '' ? i : last), 0);
       lines.splice(lastNonEmpty + 1, 0, newLine);
     }

     fs.writeFileSync(indexPath, lines.join('\n'));
   }
   ```

5. Run test: `npx vitest run packages/core/tests/state/session-resolution.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(state): add session resolver with directory and index management`

---

### Task 3: Wire session resolution into getStateDir

**Depends on:** Task 2
**Files:** `packages/core/src/state/state-shared.ts`

1. Read `packages/core/src/state/state-shared.ts`.
2. Modify `getStateDir` to accept a `session` parameter. When `session` is provided, resolve via `resolveSessionDir` instead of the streams path. The function signature becomes:
   ```typescript
   export async function getStateDir(
     projectPath: string,
     stream?: string,
     session?: string
   ): Promise<Result<string, Error>>;
   ```
3. Add the session branch at the top of the function body, before the stream check:
   ```typescript
   // Session-scoped directory takes priority
   if (session) {
     const sessionResult = resolveSessionDir(projectPath, session, { create: true });
     return sessionResult;
   }
   ```
4. Add the import for `resolveSessionDir`:
   ```typescript
   import { resolveSessionDir } from './session-resolver';
   ```
5. Run existing tests to verify no regression: `npx vitest run packages/core/tests/state/`
6. Run: `harness validate`
7. Commit: `feat(state): wire session resolution into getStateDir`

---

### Task 4: Thread session parameter through all core state functions

**Depends on:** Task 3
**Files:** `packages/core/src/state/state-persistence.ts`, `packages/core/src/state/learnings.ts`, `packages/core/src/state/failures.ts`, `packages/core/src/state/handoff.ts`

Each of these files already has functions that accept a `stream?: string` parameter and pass it to `getStateDir(projectPath, stream)`. Add a `session?: string` parameter after `stream` and thread it through to `getStateDir(projectPath, stream, session)`.

1. **`state-persistence.ts`** — Update `loadState` and `saveState`:
   - Add `session?: string` as the last parameter
   - Change `getStateDir(projectPath, stream)` calls to `getStateDir(projectPath, stream, session)`

2. **`learnings.ts`** — Update `appendLearning` and `loadRelevantLearnings`:
   - Add `session?: string` as the last parameter
   - Change `getStateDir(projectPath, stream)` calls to `getStateDir(projectPath, stream, session)`

3. **`failures.ts`** — Update `appendFailure`, `loadFailures`, and `archiveFailures`:
   - Add `session?: string` as the last parameter
   - Change `getStateDir(projectPath, stream)` calls to `getStateDir(projectPath, stream, session)`

4. **`handoff.ts`** — Update `saveHandoff` and `loadHandoff`:
   - Add `session?: string` as the last parameter
   - Change `getStateDir(projectPath, stream)` calls to `getStateDir(projectPath, stream, session)`

5. Run all existing state tests: `npx vitest run packages/core/tests/state/`
6. Verify no regression — existing callers pass `undefined` for `session`, which falls through to old behavior.
7. Run: `harness validate`
8. Commit: `feat(state): thread session parameter through all core state functions`

---

### Task 5: Add session parameter integration tests

**Depends on:** Task 4
**Files:** `packages/core/tests/state/session-resolution.test.ts` (extend)

1. Add integration tests to the existing test file that verify the full round-trip (core functions writing to session directories):

   ```typescript
   import { appendLearning, loadRelevantLearnings } from '../../src/state/state-manager';
   import { saveState, loadState } from '../../src/state/state-manager';
   import { saveHandoff, loadHandoff } from '../../src/state/state-manager';
   import { appendFailure, loadFailures } from '../../src/state/state-manager';

   describe('session-scoped state round-trip', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = makeTmp();
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('appendLearning writes to session directory', async () => {
       const result = await appendLearning(
         tmpDir,
         'session learning',
         'test-skill',
         'success',
         undefined,
         'my-session'
       );
       expect(result.ok).toBe(true);
       const learningsPath = path.join(
         tmpDir,
         '.harness',
         'sessions',
         'my-session',
         'learnings.md'
       );
       expect(fs.existsSync(learningsPath)).toBe(true);
       const content = fs.readFileSync(learningsPath, 'utf-8');
       expect(content).toContain('session learning');
     });

     it('loadRelevantLearnings reads from session directory', async () => {
       await appendLearning(
         tmpDir,
         'session learning',
         'test-skill',
         'success',
         undefined,
         'my-session'
       );
       const result = await loadRelevantLearnings(tmpDir, undefined, undefined, 'my-session');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.length).toBeGreaterThan(0);
         expect(result.value[0]).toContain('session learning');
       }
     });

     it('saveState and loadState use session directory', async () => {
       const state = {
         schemaVersion: 1 as const,
         position: { phase: 'execute', task: 'Task 1' },
         progress: {},
         lastSession: null,
       };
       const saveResult = await saveState(tmpDir, state, undefined, 'my-session');
       expect(saveResult.ok).toBe(true);

       const loadResult = await loadState(tmpDir, undefined, 'my-session');
       expect(loadResult.ok).toBe(true);
       if (loadResult.ok) {
         expect(loadResult.value.position?.task).toBe('Task 1');
       }
     });

     it('saveHandoff and loadHandoff use session directory', async () => {
       const handoff = {
         fromSkill: 'harness-execution',
         phase: 'VALIDATE',
         summary: 'test handoff',
         completed: [],
         pending: [],
         concerns: [],
         decisions: [],
         contextKeywords: [],
       };
       const saveResult = await saveHandoff(tmpDir, handoff, undefined, 'my-session');
       expect(saveResult.ok).toBe(true);

       const loadResult = await loadHandoff(tmpDir, undefined, 'my-session');
       expect(loadResult.ok).toBe(true);
       if (loadResult.ok) {
         expect(loadResult.value?.summary).toBe('test handoff');
       }
     });

     it('appendFailure writes to session directory', async () => {
       const result = await appendFailure(
         tmpDir,
         'session failure',
         'test-skill',
         'test-error',
         undefined,
         'my-session'
       );
       expect(result.ok).toBe(true);
       const failuresPath = path.join(tmpDir, '.harness', 'sessions', 'my-session', 'failures.md');
       expect(fs.existsSync(failuresPath)).toBe(true);
     });

     it('session and global state are isolated', async () => {
       await appendLearning(tmpDir, 'global learning', 'test-skill', 'success');
       await appendLearning(
         tmpDir,
         'session learning',
         'test-skill',
         'success',
         undefined,
         'my-session'
       );

       const globalResult = await loadRelevantLearnings(tmpDir);
       const sessionResult = await loadRelevantLearnings(
         tmpDir,
         undefined,
         undefined,
         'my-session'
       );

       expect(globalResult.ok).toBe(true);
       expect(sessionResult.ok).toBe(true);
       if (globalResult.ok && sessionResult.ok) {
         expect(globalResult.value.some((e) => e.includes('global learning'))).toBe(true);
         expect(globalResult.value.some((e) => e.includes('session learning'))).toBe(false);
         expect(sessionResult.value.some((e) => e.includes('session learning'))).toBe(true);
         expect(sessionResult.value.some((e) => e.includes('global learning'))).toBe(false);
       }
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/state/session-resolution.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(state): add session-scoped state round-trip integration tests`

---

### Task 6: Export session functions from core barrel files

**Depends on:** Task 2
**Files:** `packages/core/src/state/index.ts`, `packages/core/src/state/state-manager.ts`

1. Add exports to `packages/core/src/state/index.ts`:

   ```typescript
   /**
    * Session directory resolution and index management.
    */
   export { resolveSessionDir, updateSessionIndex } from './session-resolver';
   ```

2. Add re-exports to `packages/core/src/state/state-manager.ts`:

   ```typescript
   export { resolveSessionDir, updateSessionIndex } from './session-resolver';
   ```

3. Run: `npx vitest run packages/core/tests/state/`
4. Run: `harness validate`
5. Commit: `feat(state): export session resolver from core barrel files`

---

### Task 7: Add session parameter to gather_context MCP tool

**Depends on:** Task 4, Task 6
**Files:** `packages/cli/src/mcp/tools/gather-context.ts`, `packages/cli/tests/mcp/tools/gather-context-session.test.ts`

1. Create test file `packages/cli/tests/mcp/tools/gather-context-session.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import { gatherContextDefinition } from '../../../src/mcp/tools/gather-context';

   describe('gather_context session parameter', () => {
     it('input schema includes session property', () => {
       const props = gatherContextDefinition.inputSchema.properties;
       expect(props).toHaveProperty('session');
       expect(props.session.type).toBe('string');
     });

     it('session is not in required fields (backwards compatible)', () => {
       const required = gatherContextDefinition.inputSchema.required;
       expect(required).not.toContain('session');
     });
   });
   ```

2. Run test: `npx vitest run packages/cli/tests/mcp/tools/gather-context-session.test.ts`
3. Observe failure: `session` property not found in schema.

4. Modify `packages/cli/src/mcp/tools/gather-context.ts`:

   a. Add `session` to the input schema `properties`:

   ```typescript
   session: {
     type: 'string',
     description:
       'Session slug for session-scoped state. When provided, state/learnings/handoff/failures are read from .harness/sessions/<session>/ instead of .harness/. Omit for global fallback.',
   },
   ```

   b. Add `session?: string` to the `handleGatherContext` function input type.

   c. Thread `session` to the core function calls. Update each promise:

   For `statePromise`:

   ```typescript
   const statePromise = includeSet.has('state')
     ? import('@harness-engineering/core').then((core) =>
         core.loadState(projectPath, undefined, input.session)
       )
     : Promise.resolve(null);
   ```

   For `learningsPromise`:

   ```typescript
   const learningsPromise = includeSet.has('learnings')
     ? import('@harness-engineering/core').then((core) =>
         core.loadRelevantLearnings(projectPath, input.skill, undefined, input.session)
       )
     : Promise.resolve(null);
   ```

   For `handoffPromise`:

   ```typescript
   const handoffPromise = includeSet.has('handoff')
     ? import('@harness-engineering/core').then((core) =>
         core.loadHandoff(projectPath, undefined, input.session)
       )
     : Promise.resolve(null);
   ```

   d. After the output is assembled, if `input.session` is provided, update the session index:

   ```typescript
   if (input.session) {
     try {
       const core = await import('@harness-engineering/core');
       core.updateSessionIndex(
         projectPath,
         input.session,
         `${input.skill ?? 'unknown'} — ${input.intent}`
       );
     } catch {
       // Index update is best-effort, do not fail the gather
     }
   }
   ```

5. Run test: `npx vitest run packages/cli/tests/mcp/tools/gather-context-session.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(cli): add session parameter to gather_context MCP tool`

---

### Task 8: Update harness-execution SKILL.md for session-scoped state

**Depends on:** Task 7
**Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Read the file and make the following modifications:

   a. In Phase 1: PREPARE, update the `gather_context` call (around line 32-38) to include the session parameter:
   Change the JSON block from:

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Execute plan tasks starting from current position",
     skill: "harness-execution",
     include: ["state", "learnings", "handoff", "validation"]
   })
   ```

   To:

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Execute plan tasks starting from current position",
     skill: "harness-execution",
     session: "<session-slug-if-known>",
     include: ["state", "learnings", "handoff", "validation"]
   })
   ```

   b. Add a note after the gather_context call (after line 40):

   ```markdown
   **Session resolution:** If a session directory is known (passed via autopilot dispatch or available from a previous handoff), include the `session` parameter. This scopes all state reads/writes to `.harness/sessions/<slug>/`. If no session is known, omit it — `gather_context` falls back to global files at `.harness/`.
   ```

   c. In Phase 4: PERSIST (around line 223), update the state.json reference:
   Change: "Update `.harness/state.json`"
   To: "Update state (session-scoped `{sessionDir}/state.json` if session is known, otherwise `.harness/state.json`)"

   d. Update the learnings reference (around line 244):
   Change: "Append tagged learnings to `.harness/learnings.md`."
   To: "Append tagged learnings to the session-scoped learnings file (`{sessionDir}/learnings.md` if session is known, otherwise `.harness/learnings.md`)."

   e. Update the failures reference (around line 254):
   Change: "Record failures in `.harness/failures.md`"
   To: "Record failures in the session-scoped failures file (`{sessionDir}/failures.md` if session is known, otherwise `.harness/failures.md`)"

   f. Update the handoff reference (around line 256):
   Change: "Write `.harness/handoff.json`"
   To: "Write the session-scoped handoff (`{sessionDir}/handoff.json` if session is known, otherwise `.harness/handoff.json`)"

   g. In the Harness Integration section (around line 328-329), update the file references:
   Change:

   ```
   - **`.harness/state.json`** — Read at session start to resume position. Updated after every task.
   - **`.harness/learnings.md`** — Append-only knowledge capture. Read at session start for prior context.
   ```

   To:

   ```
   - **State file** — Session-scoped at `{sessionDir}/state.json` when session is known, otherwise `.harness/state.json`. Read at session start to resume position. Updated after every task.
   - **Learnings file** — Session-scoped at `{sessionDir}/learnings.md` when session is known, otherwise `.harness/learnings.md`. Append-only knowledge capture. Read at session start for prior context.
   ```

2. Run: `harness validate`
3. Commit: `docs(execution): update SKILL.md for session-scoped state paths`

---

### Task 9: Update harness-autopilot SKILL.md to pass session to gather_context

**Depends on:** Task 7
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Read the file and make the following modifications:

   a. In Phase 1: INIT, step 5, update the `gather_context` call (around line 101-106):
   Change:

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Autopilot phase execution for <spec name>",
     skill: "harness-autopilot",
     include: ["state", "learnings", "handoff", "validation"]
   })
   ```

   To:

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Autopilot phase execution for <spec name>",
     skill: "harness-autopilot",
     session: "<session-slug>",
     include: ["state", "learnings", "handoff", "validation"]
   })
   ```

   b. Update the note after the call (around line 109):
   Change:

   ```
   This loads learnings (including failure entries tagged `[outcome:failure]`), handoff context, state, and validation results in a single call. Note any relevant learnings or known dead ends for the current phase from the returned `learnings` array.
   ```

   To:

   ```
   This loads session-scoped learnings, handoff, state, and validation results in a single call. The `session` parameter ensures all reads come from the session directory (`.harness/sessions/<slug>/`), isolating this workstream from others. Note any relevant learnings or known dead ends for the current phase from the returned `learnings` array.
   ```

   c. In the EXECUTE state (around line 221-230), update the agent dispatch prompt to pass session slug to the executor:
   Change the `Learnings (global):` and `Failures (global):` lines to:

   ```
       Session slug: {sessionSlug}
   ```

   And remove the explicit global paths since the executor will use `gather_context` with the session parameter.

   d. In the PLAN state (around line 155-163), ensure the planner dispatch also includes session slug:
   Add `Session slug: {sessionSlug}` to the dispatch prompt (it already has `Session directory: {sessionDir}`).

2. Run: `harness validate`
3. Commit: `docs(autopilot): pass session slug to gather_context and agent dispatches`

---

## Dependency Graph

```
Task 1 (constants)
  └─> Task 2 (session resolver + tests)
        ├─> Task 3 (wire into getStateDir)
        │     └─> Task 4 (thread through core functions)
        │           ├─> Task 5 (integration tests)
        │           └─> Task 7 (gather_context MCP tool)
        │                 ├─> Task 8 (execution SKILL.md)
        │                 └─> Task 9 (autopilot SKILL.md)
        └─> Task 6 (barrel exports)
```

**Parallelizable pairs:** Tasks 5 and 7 can run in parallel (different files, no shared state). Tasks 8 and 9 can run in parallel (different SKILL.md files).

## Traceability

| Observable Truth                                       | Delivered By                           |
| ------------------------------------------------------ | -------------------------------------- |
| 1. gather_context with session loads from session dir  | Task 7                                 |
| 2. gather_context without session falls back to global | Task 7 (no change to default behavior) |
| 3. appendLearning writes to session dir                | Tasks 4, 5                             |
| 4. saveState writes to session dir                     | Tasks 4, 5                             |
| 5. saveHandoff writes to session dir                   | Tasks 4, 5                             |
| 6. appendFailure writes to session dir                 | Tasks 4, 5                             |
| 7. sessions/index.md managed                           | Tasks 2, 7                             |
| 8. execution SKILL.md updated                          | Task 8                                 |
| 9. autopilot SKILL.md updated                          | Task 9                                 |
| 10. session-resolution tests pass                      | Tasks 2, 5                             |
| 11. gather-context-session tests pass                  | Task 7                                 |
| 12. harness validate passes                            | All tasks                              |
