# Plan: Wave 1.2 — Core State Engine

**Date:** 2026-03-27
**Spec:** docs/changes/ai-foundations-integration/proposal.md
**Depends on:** Wave 1.1 (Schema & Types) — complete
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Extend `state-persistence.ts` with section-scoped append operations, read-before-write semantics, and session archival so that skills can accumulate shared context across a workflow session without overwriting each other.

## Observable Truths (Acceptance Criteria)

1. When a skill calls `appendSessionEntry("decisions", entry)`, the system shall append the entry to the `decisions` array in `state.json` without modifying other sections or existing entries.
2. When a skill calls `readSessionSection("terminology")`, the system shall return the current array of `SessionEntry` objects for that section (empty array if none exist).
3. When a skill calls `readSessionSections()`, the system shall return the full `SessionSections` object with all six sections.
4. When a skill calls `updateSessionEntryStatus(sectionName, entryId, "resolved")`, the system shall update only that entry's status field without affecting other entries.
5. When `archiveSession(projectPath, sessionSlug)` is called, the system shall move the session directory to `.harness/archive/sessions/<slug>-<date>` and the original directory shall no longer exist.
6. If `archiveSession` is called for a session that does not exist, then the system shall return an `Err` result with a descriptive error message.
7. The system shall preserve backward compatibility: `loadState` and `saveState` continue to work unchanged for existing `HarnessState` key-value operations.
8. `npx vitest run packages/core/tests/state/session-sections.test.ts` passes with all tests green.
9. `npx vitest run packages/core/tests/state/session-archive.test.ts` passes with all tests green.
10. `harness validate` passes.

## File Map

- CREATE `packages/core/src/state/session-sections.ts`
- CREATE `packages/core/tests/state/session-sections.test.ts`
- CREATE `packages/core/src/state/session-archive.ts`
- CREATE `packages/core/tests/state/session-archive.test.ts`
- MODIFY `packages/core/src/state/constants.ts` (add SESSION_STATE_FILE, ARCHIVE_DIR)
- MODIFY `packages/core/src/state/index.ts` (add exports)
- MODIFY `packages/core/src/state/state-manager.ts` (add re-exports)

## Tasks

### Task 1: Add constants for session state file and archive directory

**Depends on:** none
**Files:** `packages/core/src/state/constants.ts`

1. Open `packages/core/src/state/constants.ts` and add two new constants:
   ```typescript
   export const SESSION_STATE_FILE = 'session-state.json';
   export const ARCHIVE_DIR = 'archive';
   ```
2. Run: `harness validate`
3. Commit: `feat(state): add session state file and archive directory constants`

---

### Task 2: Create session-sections module with read operations (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/state/session-sections.test.ts`, `packages/core/src/state/session-sections.ts`

1. Create test file `packages/core/tests/state/session-sections.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { readSessionSection, readSessionSections } from '../../src/state/session-sections';
   import type { SessionSections } from '@harness-engineering/types';

   describe('readSessionSections', () => {
     let tmpDir: string;
     let sessionDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sections-test-'));
       sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
       fs.mkdirSync(sessionDir, { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('returns empty sections when session-state.json does not exist', async () => {
       const result = await readSessionSections(tmpDir, 'test-session');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.terminology).toEqual([]);
         expect(result.value.decisions).toEqual([]);
         expect(result.value.constraints).toEqual([]);
         expect(result.value.risks).toEqual([]);
         expect(result.value.openQuestions).toEqual([]);
         expect(result.value.evidence).toEqual([]);
       }
     });

     it('loads existing session sections from file', async () => {
       const sections: SessionSections = {
         terminology: [
           {
             id: 'entry-1',
             timestamp: '2026-03-27T14:00:00Z',
             authorSkill: 'harness-brainstorming',
             content: 'Term A means X',
             status: 'active',
           },
         ],
         decisions: [],
         constraints: [],
         risks: [],
         openQuestions: [],
         evidence: [],
       };
       fs.writeFileSync(
         path.join(sessionDir, 'session-state.json'),
         JSON.stringify(sections, null, 2)
       );
       const result = await readSessionSections(tmpDir, 'test-session');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.terminology).toHaveLength(1);
         expect(result.value.terminology[0].content).toBe('Term A means X');
       }
     });

     it('returns error for corrupted JSON', async () => {
       fs.writeFileSync(path.join(sessionDir, 'session-state.json'), 'not valid json{{');
       const result = await readSessionSections(tmpDir, 'test-session');
       expect(result.ok).toBe(false);
     });
   });

   describe('readSessionSection', () => {
     let tmpDir: string;
     let sessionDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-section-test-'));
       sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
       fs.mkdirSync(sessionDir, { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('returns empty array for nonexistent section file', async () => {
       const result = await readSessionSection(tmpDir, 'test-session', 'decisions');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value).toEqual([]);
       }
     });

     it('returns entries for a populated section', async () => {
       const sections: SessionSections = {
         terminology: [],
         decisions: [
           {
             id: 'dec-1',
             timestamp: '2026-03-27T14:00:00Z',
             authorSkill: 'harness-planning',
             content: 'Use Result type',
             status: 'active',
           },
         ],
         constraints: [],
         risks: [],
         openQuestions: [],
         evidence: [],
       };
       fs.writeFileSync(
         path.join(sessionDir, 'session-state.json'),
         JSON.stringify(sections, null, 2)
       );
       const result = await readSessionSection(tmpDir, 'test-session', 'decisions');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value).toHaveLength(1);
         expect(result.value[0].content).toBe('Use Result type');
       }
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/state/session-sections.test.ts`
3. Observe failure: `readSessionSection` and `readSessionSections` are not defined.
4. Create implementation `packages/core/src/state/session-sections.ts`:

   ```typescript
   // packages/core/src/state/session-sections.ts
   import * as fs from 'fs';
   import * as path from 'path';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import type {
     SessionEntry,
     SessionSectionName,
     SessionSections,
   } from '@harness-engineering/types';
   import { SESSION_SECTION_NAMES } from '@harness-engineering/types';
   import { resolveSessionDir } from './session-resolver';
   import { SESSION_STATE_FILE } from './constants';

   /** Returns an empty SessionSections object with all sections initialized. */
   function emptySections(): SessionSections {
     const sections = {} as SessionSections;
     for (const name of SESSION_SECTION_NAMES) {
       sections[name] = [];
     }
     return sections;
   }

   /** Loads session-state.json from the session directory; returns empty sections if missing. */
   async function loadSessionState(
     projectPath: string,
     sessionSlug: string
   ): Promise<Result<SessionSections, Error>> {
     const dirResult = resolveSessionDir(projectPath, sessionSlug);
     if (!dirResult.ok) return dirResult;
     const sessionDir = dirResult.value;
     const filePath = path.join(sessionDir, SESSION_STATE_FILE);

     if (!fs.existsSync(filePath)) {
       return Ok(emptySections());
     }

     try {
       const raw = fs.readFileSync(filePath, 'utf-8');
       const parsed = JSON.parse(raw) as SessionSections;
       // Ensure all sections exist (forward compat if new sections are added later)
       const sections = emptySections();
       for (const name of SESSION_SECTION_NAMES) {
         if (Array.isArray(parsed[name])) {
           sections[name] = parsed[name];
         }
       }
       return Ok(sections);
     } catch (error) {
       return Err(
         new Error(
           `Failed to load session state: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }

   /** Saves session-state.json to the session directory. */
   async function saveSessionState(
     projectPath: string,
     sessionSlug: string,
     sections: SessionSections
   ): Promise<Result<void, Error>> {
     const dirResult = resolveSessionDir(projectPath, sessionSlug, { create: true });
     if (!dirResult.ok) return dirResult;
     const sessionDir = dirResult.value;
     const filePath = path.join(sessionDir, SESSION_STATE_FILE);

     try {
       fs.writeFileSync(filePath, JSON.stringify(sections, null, 2));
       return Ok(undefined);
     } catch (error) {
       return Err(
         new Error(
           `Failed to save session state: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }

   /**
    * Reads all session sections. Returns empty sections if no session state exists.
    */
   export async function readSessionSections(
     projectPath: string,
     sessionSlug: string
   ): Promise<Result<SessionSections, Error>> {
     return loadSessionState(projectPath, sessionSlug);
   }

   /**
    * Reads a single session section by name. Returns empty array if section has no entries.
    */
   export async function readSessionSection(
     projectPath: string,
     sessionSlug: string,
     section: SessionSectionName
   ): Promise<Result<SessionEntry[], Error>> {
     const result = await loadSessionState(projectPath, sessionSlug);
     if (!result.ok) return result;
     return Ok(result.value[section]);
   }

   /**
    * Appends an entry to a session section (read-before-write).
    * Generates a unique ID and timestamp for the entry.
    */
   export async function appendSessionEntry(
     projectPath: string,
     sessionSlug: string,
     section: SessionSectionName,
     authorSkill: string,
     content: string
   ): Promise<Result<SessionEntry, Error>> {
     // Read-before-write: load current state first
     const loadResult = await loadSessionState(projectPath, sessionSlug);
     if (!loadResult.ok) return loadResult;
     const sections = loadResult.value;

     const entry: SessionEntry = {
       id: generateEntryId(),
       timestamp: new Date().toISOString(),
       authorSkill,
       content,
       status: 'active',
     };

     sections[section].push(entry);

     const saveResult = await saveSessionState(projectPath, sessionSlug, sections);
     if (!saveResult.ok) return saveResult;

     return Ok(entry);
   }

   /**
    * Updates the status of an existing entry in a session section.
    * Returns Err if the entry is not found.
    */
   export async function updateSessionEntryStatus(
     projectPath: string,
     sessionSlug: string,
     section: SessionSectionName,
     entryId: string,
     newStatus: SessionEntry['status']
   ): Promise<Result<SessionEntry, Error>> {
     const loadResult = await loadSessionState(projectPath, sessionSlug);
     if (!loadResult.ok) return loadResult;
     const sections = loadResult.value;

     const entry = sections[section].find((e) => e.id === entryId);
     if (!entry) {
       return Err(new Error(`Entry '${entryId}' not found in section '${section}'`));
     }

     entry.status = newStatus;

     const saveResult = await saveSessionState(projectPath, sessionSlug, sections);
     if (!saveResult.ok) return saveResult;

     return Ok(entry);
   }

   /** Generates a short unique ID for session entries. */
   function generateEntryId(): string {
     const timestamp = Date.now().toString(36);
     const random = Math.random().toString(36).substring(2, 8);
     return `${timestamp}-${random}`;
   }
   ```

5. Run test: `npx vitest run packages/core/tests/state/session-sections.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(state): add session section read operations with read-before-write`

---

### Task 3: Add append and status update tests (TDD)

**Depends on:** Task 2
**Files:** `packages/core/tests/state/session-sections.test.ts`

1. Add the following test blocks to the existing test file `packages/core/tests/state/session-sections.test.ts`:

   ```typescript
   import {
     readSessionSection,
     readSessionSections,
     appendSessionEntry,
     updateSessionEntryStatus,
   } from '../../src/state/session-sections';

   // ... existing describe blocks ...

   describe('appendSessionEntry', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-append-test-'));
       const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
       fs.mkdirSync(sessionDir, { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('appends entry to empty section and returns it with generated id and timestamp', async () => {
       const result = await appendSessionEntry(
         tmpDir,
         'test-session',
         'decisions',
         'harness-brainstorming',
         'We chose TypeScript'
       );
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.id).toBeTruthy();
         expect(result.value.timestamp).toBeTruthy();
         expect(result.value.authorSkill).toBe('harness-brainstorming');
         expect(result.value.content).toBe('We chose TypeScript');
         expect(result.value.status).toBe('active');
       }
     });

     it('appends without overwriting existing entries', async () => {
       await appendSessionEntry(tmpDir, 'test-session', 'risks', 'skill-a', 'Risk 1');
       await appendSessionEntry(tmpDir, 'test-session', 'risks', 'skill-b', 'Risk 2');

       const result = await readSessionSection(tmpDir, 'test-session', 'risks');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value).toHaveLength(2);
         expect(result.value[0].content).toBe('Risk 1');
         expect(result.value[1].content).toBe('Risk 2');
       }
     });

     it('does not affect other sections when appending', async () => {
       await appendSessionEntry(tmpDir, 'test-session', 'terminology', 'skill-a', 'Term A');

       const result = await readSessionSections(tmpDir, 'test-session');
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value.terminology).toHaveLength(1);
         expect(result.value.decisions).toHaveLength(0);
         expect(result.value.constraints).toHaveLength(0);
         expect(result.value.risks).toHaveLength(0);
         expect(result.value.openQuestions).toHaveLength(0);
         expect(result.value.evidence).toHaveLength(0);
       }
     });

     it('persists entries to disk (read-before-write verified)', async () => {
       await appendSessionEntry(tmpDir, 'test-session', 'evidence', 'skill-a', 'Evidence 1');

       // Read directly from file to verify persistence
       const filePath = path.join(
         tmpDir,
         '.harness',
         'sessions',
         'test-session',
         'session-state.json'
       );
       expect(fs.existsSync(filePath)).toBe(true);
       const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
       expect(raw.evidence).toHaveLength(1);
       expect(raw.evidence[0].content).toBe('Evidence 1');
     });
   });

   describe('updateSessionEntryStatus', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-status-test-'));
       const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
       fs.mkdirSync(sessionDir, { recursive: true });
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('updates entry status from active to resolved', async () => {
       const appendResult = await appendSessionEntry(
         tmpDir,
         'test-session',
         'openQuestions',
         'skill-a',
         'What about X?'
       );
       expect(appendResult.ok).toBe(true);
       if (!appendResult.ok) return;

       const entryId = appendResult.value.id;
       const updateResult = await updateSessionEntryStatus(
         tmpDir,
         'test-session',
         'openQuestions',
         entryId,
         'resolved'
       );
       expect(updateResult.ok).toBe(true);
       if (updateResult.ok) {
         expect(updateResult.value.status).toBe('resolved');
         expect(updateResult.value.id).toBe(entryId);
       }
     });

     it('returns error when entry id does not exist', async () => {
       const result = await updateSessionEntryStatus(
         tmpDir,
         'test-session',
         'decisions',
         'nonexistent-id',
         'superseded'
       );
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.message).toContain('nonexistent-id');
         expect(result.error.message).toContain('not found');
       }
     });

     it('does not affect other entries in the same section', async () => {
       await appendSessionEntry(tmpDir, 'test-session', 'constraints', 'skill-a', 'Constraint 1');
       const second = await appendSessionEntry(
         tmpDir,
         'test-session',
         'constraints',
         'skill-b',
         'Constraint 2'
       );
       expect(second.ok).toBe(true);
       if (!second.ok) return;

       await updateSessionEntryStatus(
         tmpDir,
         'test-session',
         'constraints',
         second.value.id,
         'superseded'
       );

       const allResult = await readSessionSection(tmpDir, 'test-session', 'constraints');
       expect(allResult.ok).toBe(true);
       if (allResult.ok) {
         expect(allResult.value[0].status).toBe('active');
         expect(allResult.value[1].status).toBe('superseded');
       }
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/state/session-sections.test.ts`
3. Observe: all tests pass (implementation was completed in Task 2).
4. Run: `harness validate`
5. Commit: `test(state): add append and status update tests for session sections`

---

### Task 4: Create session archival module (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/state/session-archive.test.ts`, `packages/core/src/state/session-archive.ts`

1. Create test file `packages/core/tests/state/session-archive.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { archiveSession } from '../../src/state/session-archive';

   describe('archiveSession', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-archive-test-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('moves session directory to archive with date suffix', async () => {
       // Set up a session directory with a state file
       const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'my-session');
       fs.mkdirSync(sessionDir, { recursive: true });
       fs.writeFileSync(path.join(sessionDir, 'state.json'), '{"schemaVersion":1}');
       fs.writeFileSync(path.join(sessionDir, 'session-state.json'), '{}');

       const result = await archiveSession(tmpDir, 'my-session');
       expect(result.ok).toBe(true);

       // Original directory should no longer exist
       expect(fs.existsSync(sessionDir)).toBe(false);

       // Archive directory should exist
       const archiveDir = path.join(tmpDir, '.harness', 'archive', 'sessions');
       expect(fs.existsSync(archiveDir)).toBe(true);

       // Should contain the archived session with date suffix
       const entries = fs.readdirSync(archiveDir);
       expect(entries.length).toBe(1);
       expect(entries[0]).toMatch(/^my-session-\d{4}-\d{2}-\d{2}$/);

       // Archived files should be preserved
       const archivedDir = path.join(archiveDir, entries[0]);
       expect(fs.existsSync(path.join(archivedDir, 'state.json'))).toBe(true);
       expect(fs.existsSync(path.join(archivedDir, 'session-state.json'))).toBe(true);
     });

     it('returns error when session directory does not exist', async () => {
       const result = await archiveSession(tmpDir, 'nonexistent-session');
       expect(result.ok).toBe(false);
       if (!result.ok) {
         expect(result.error.message).toContain('nonexistent-session');
       }
     });

     it('handles duplicate archive names with counter suffix', async () => {
       const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'my-session');

       // Create a pre-existing archive entry for today's date
       const date = new Date().toISOString().split('T')[0];
       const existingArchive = path.join(
         tmpDir,
         '.harness',
         'archive',
         'sessions',
         `my-session-${date}`
       );
       fs.mkdirSync(existingArchive, { recursive: true });

       // Create the session to archive
       fs.mkdirSync(sessionDir, { recursive: true });
       fs.writeFileSync(path.join(sessionDir, 'state.json'), '{}');

       const result = await archiveSession(tmpDir, 'my-session');
       expect(result.ok).toBe(true);

       const archiveDir = path.join(tmpDir, '.harness', 'archive', 'sessions');
       const entries = fs.readdirSync(archiveDir).sort();
       expect(entries.length).toBe(2);
       // Second entry should have a counter
       expect(entries[1]).toMatch(/^my-session-\d{4}-\d{2}-\d{2}-\d+$/);
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/state/session-archive.test.ts`
3. Observe failure: `archiveSession` is not defined.
4. Create implementation `packages/core/src/state/session-archive.ts`:

   ```typescript
   // packages/core/src/state/session-archive.ts
   import * as fs from 'fs';
   import * as path from 'path';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import { resolveSessionDir } from './session-resolver';
   import { HARNESS_DIR, ARCHIVE_DIR } from './constants';

   /**
    * Archives a session by moving its directory to
    * `.harness/archive/sessions/<slug>-<date>`.
    *
    * The original session directory is removed. If an archive with the same
    * date already exists, a numeric counter is appended.
    */
   export async function archiveSession(
     projectPath: string,
     sessionSlug: string
   ): Promise<Result<void, Error>> {
     const dirResult = resolveSessionDir(projectPath, sessionSlug);
     if (!dirResult.ok) return dirResult;
     const sessionDir = dirResult.value;

     if (!fs.existsSync(sessionDir)) {
       return Err(new Error(`Session '${sessionSlug}' not found at ${sessionDir}`));
     }

     const archiveBase = path.join(projectPath, HARNESS_DIR, ARCHIVE_DIR, 'sessions');

     try {
       fs.mkdirSync(archiveBase, { recursive: true });

       const date = new Date().toISOString().split('T')[0];
       let archiveName = `${sessionSlug}-${date}`;
       let counter = 1;

       while (fs.existsSync(path.join(archiveBase, archiveName))) {
         archiveName = `${sessionSlug}-${date}-${counter}`;
         counter++;
       }

       fs.renameSync(sessionDir, path.join(archiveBase, archiveName));
       return Ok(undefined);
     } catch (error) {
       return Err(
         new Error(
           `Failed to archive session: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }
   ```

5. Run test: `npx vitest run packages/core/tests/state/session-archive.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(state): add session archival with date-suffixed directory move`

---

### Task 5: Add exports to barrel files

**Depends on:** Task 2, Task 4
**Files:** `packages/core/src/state/index.ts`, `packages/core/src/state/state-manager.ts`

1. Add to `packages/core/src/state/constants.ts` the re-exports needed (already done in Task 1).
2. Add to `packages/core/src/state/index.ts` after the session summary exports:

   ```typescript
   /**
    * Session section persistence for accumulative cross-skill state.
    */
   export {
     readSessionSections,
     readSessionSection,
     appendSessionEntry,
     updateSessionEntryStatus,
   } from './session-sections';

   /**
    * Session archival for preserving previous session state.
    */
   export { archiveSession } from './session-archive';
   ```

3. Add to `packages/core/src/state/state-manager.ts` (backward compat barrel):
   ```typescript
   export {
     readSessionSections,
     readSessionSection,
     appendSessionEntry,
     updateSessionEntryStatus,
   } from './session-sections';
   export { archiveSession } from './session-archive';
   ```
4. Run: `npx vitest run packages/core/tests/state/`
5. Observe: all state tests pass.
6. Run: `harness validate`
7. Commit: `feat(state): export session section and archive functions from barrel files`

---

### Task 6: Backward compatibility verification test

**Depends on:** Task 5
**Files:** `packages/core/tests/state/session-sections.test.ts`

1. Add a `describe('backward compatibility')` block to `packages/core/tests/state/session-sections.test.ts`:

   ```typescript
   import { loadState, saveState } from '../../src/state/state-persistence';

   describe('backward compatibility', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-compat-test-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true });
     });

     it('loadState and saveState work unchanged alongside session sections', async () => {
       // Save traditional state
       const state = {
         schemaVersion: 1 as const,
         position: { phase: 'planning' },
         decisions: [],
         blockers: [],
         progress: { 'task-1': 'complete' as const },
       };
       const saveResult = await saveState(tmpDir, state, undefined, 'test-session');
       expect(saveResult.ok).toBe(true);

       // Append session section entry in the same session
       await appendSessionEntry(
         tmpDir,
         'test-session',
         'decisions',
         'harness-planning',
         'Session decision'
       );

       // Verify traditional state is untouched
       const loadResult = await loadState(tmpDir, undefined, 'test-session');
       expect(loadResult.ok).toBe(true);
       if (loadResult.ok) {
         expect(loadResult.value.progress['task-1']).toBe('complete');
       }

       // Verify session sections work independently
       const sectionsResult = await readSessionSections(tmpDir, 'test-session');
       expect(sectionsResult.ok).toBe(true);
       if (sectionsResult.ok) {
         expect(sectionsResult.value.decisions).toHaveLength(1);
       }
     });
   });
   ```

2. Run test: `npx vitest run packages/core/tests/state/session-sections.test.ts`
3. Observe: all tests pass, confirming backward compatibility.
4. Run: `harness validate`
5. Commit: `test(state): verify backward compatibility of session sections with existing state`

---

### Task 7: Full integration test run and validation

[checkpoint:human-verify]

**Depends on:** Task 6
**Files:** none (validation only)

1. Run full state test suite: `npx vitest run packages/core/tests/state/`
2. Observe: all tests pass (existing tests + new session tests).
3. Run full project tests: `npx vitest run`
4. Observe: no regressions.
5. Run: `harness validate`
6. Run: `harness check-deps`
7. Verify observable truths:
   - OT1: `appendSessionEntry` appends without overwriting (Task 3 tests prove this)
   - OT2: `readSessionSection` returns entries for a section (Task 2 tests prove this)
   - OT3: `readSessionSections` returns full SessionSections object (Task 2 tests prove this)
   - OT4: `updateSessionEntryStatus` updates single entry (Task 3 tests prove this)
   - OT5: `archiveSession` moves directory to archive (Task 4 tests prove this)
   - OT6: `archiveSession` returns Err for nonexistent session (Task 4 tests prove this)
   - OT7: `loadState`/`saveState` unchanged alongside session sections (Task 6 tests prove this)
   - OT8-9: Test files pass green (verified in this task)
   - OT10: `harness validate` passes (verified in this task)
8. No commit (validation only).
