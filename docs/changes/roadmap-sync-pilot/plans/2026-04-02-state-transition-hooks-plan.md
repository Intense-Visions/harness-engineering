# Plan: State Transition Hooks (Phase 3)

**Date:** 2026-04-02
**Spec:** docs/changes/roadmap-sync-pilot/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

When a state transition occurs and tracker config is present in harness.config.json, `fullSync` runs automatically as fire-and-forget from the caller's perspective, with errors logged but never blocking the local operation.

## Observable Truths (Acceptance Criteria)

1. When `harness.config.json` contains a `roadmap.tracker` object, `autoSyncRoadmap` shall detect it and call `fullSync` after the local sync completes.
2. When `harness.config.json` does not contain `roadmap.tracker`, `autoSyncRoadmap` shall skip external sync and behave exactly as before.
3. When a state transition occurs via `save-handoff`, `archive_session`, `task-start`, `task-complete`, `phase-start`, or `phase-complete` actions, and tracker config is present, `fullSync` shall run automatically.
4. If the external service API fails during sync, the system shall log the error to stderr and shall not block the local operation (the MCP response returns success).
5. When multiple `autoSyncRoadmap` calls overlap, the in-process mutex in `fullSync` shall serialize the external sync writes.
6. The `HarnessConfigSchema` in `packages/cli/src/config/schema.ts` shall accept an optional `roadmap.tracker` field matching `TrackerSyncConfig`.
7. `cd packages/cli && npx vitest run tests/mcp/tools/roadmap-auto-sync.test.ts` passes with 8+ tests.
8. `cd packages/cli && npx vitest run tests/mcp/tools/state.test.ts` passes (existing tests unbroken).
9. `harness validate` passes.

## File Map

```
MODIFY packages/cli/src/config/schema.ts                  (add roadmap.tracker schema)
MODIFY packages/cli/src/mcp/tools/roadmap-auto-sync.ts    (add external sync + tracker config detection)
MODIFY packages/cli/src/mcp/tools/state.ts                (add 4 new action handlers with autoSyncRoadmap calls)
CREATE packages/cli/tests/mcp/tools/roadmap-auto-sync.test.ts (unit + integration tests)
MODIFY packages/cli/tests/mcp/tools/state.test.ts         (add tests for new actions)
```

## Tasks

### Task 1: Add roadmap.tracker to HarnessConfigSchema

**Depends on:** none
**Files:** `packages/cli/src/config/schema.ts`

1. Open `packages/cli/src/config/schema.ts`.
2. Add a `TrackerConfigSchema` definition before `HarnessConfigSchema`:

   ```typescript
   /**
    * Schema for external tracker sync configuration (roadmap <-> GitHub Issues etc.)
    */
   export const TrackerConfigSchema = z.object({
     /** Adapter kind -- currently GitHub-only */
     kind: z.literal('github'),
     /** Repository in "owner/repo" format */
     repo: z.string().optional(),
     /** Labels auto-applied for filtering + identification */
     labels: z.array(z.string()).optional(),
     /** Maps roadmap status -> external status string */
     statusMap: z.record(z.string(), z.string()),
     /** Maps external status (+ optional label) -> roadmap status */
     reverseStatusMap: z.record(z.string(), z.string()),
   });

   /**
    * Schema for roadmap-specific configuration.
    */
   export const RoadmapConfigSchema = z.object({
     /** External tracker sync settings */
     tracker: TrackerConfigSchema.optional(),
   });
   ```

3. Add `roadmap: RoadmapConfigSchema.optional()` to the `HarnessConfigSchema` object, after the `skills` field:
   ```typescript
   /** Roadmap sync and tracker settings */
   roadmap: RoadmapConfigSchema.optional(),
   ```
4. Run: `harness validate`
5. Commit: `feat(config): add roadmap.tracker schema to HarnessConfigSchema`

---

### Task 2: Extend autoSyncRoadmap with external sync and config detection

**Depends on:** Task 1
**Files:** `packages/cli/src/mcp/tools/roadmap-auto-sync.ts`

1. Replace the contents of `packages/cli/src/mcp/tools/roadmap-auto-sync.ts` with:

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import type { TrackerSyncConfig } from '@harness-engineering/types';

   /**
    * Automatically sync the roadmap after state transitions.
    *
    * This is the mechanical enforcement layer — it runs syncRoadmap with apply=true
    * as a side effect of state transitions, removing the dependency on agents
    * remembering to call manage_roadmap manually.
    *
    * If tracker config is present in harness.config.json, also fires fullSync
    * to keep the external tracker in sync. External sync is fire-and-forget from
    * the caller's perspective: errors are logged but never block the state transition.
    *
    * Failures are swallowed: roadmap sync is best-effort and must never break
    * the primary state operation.
    */
   export async function autoSyncRoadmap(projectPath: string): Promise<void> {
     try {
       const roadmapFile = path.join(projectPath, 'docs', 'roadmap.md');
       if (!fs.existsSync(roadmapFile)) return; // no roadmap — nothing to sync

       const { parseRoadmap, serializeRoadmap, syncRoadmap, applySyncChanges } =
         await import('@harness-engineering/core');

       const raw = fs.readFileSync(roadmapFile, 'utf-8');
       const parseResult = parseRoadmap(raw);
       if (!parseResult.ok) return;

       const roadmap = parseResult.value;
       const syncResult = syncRoadmap({ projectPath, roadmap });
       if (!syncResult.ok || syncResult.value.length === 0) {
         // Even if no local changes, still attempt external sync
         await triggerExternalSync(projectPath, roadmapFile);
         return;
       }

       applySyncChanges(roadmap, syncResult.value);
       fs.writeFileSync(roadmapFile, serializeRoadmap(roadmap), 'utf-8');

       // Fire external sync after local sync completes
       await triggerExternalSync(projectPath, roadmapFile);
     } catch {
       // Best-effort: never let roadmap sync failures break state operations
     }
   }

   /**
    * Detect tracker config in harness.config.json and fire fullSync if present.
    * Fire-and-forget: errors are logged to stderr but never propagated.
    */
   async function triggerExternalSync(projectPath: string, roadmapFile: string): Promise<void> {
     try {
       const trackerConfig = loadTrackerConfig(projectPath);
       if (!trackerConfig) return;

       const token = process.env.GITHUB_TOKEN;
       if (!token) return; // No token — cannot sync

       const { fullSync } = await import('@harness-engineering/core');
       const { GitHubIssuesSyncAdapter } = await import('@harness-engineering/core');

       const adapter = new GitHubIssuesSyncAdapter({
         token,
         config: trackerConfig,
       });

       const result = await fullSync(roadmapFile, adapter, trackerConfig);

       if (result.errors.length > 0) {
         for (const err of result.errors) {
           console.error(
             `[roadmap-sync] External sync error for ${err.featureOrId}: ${err.error.message}`
           );
         }
       }
     } catch (error) {
       console.error(
         `[roadmap-sync] External sync failed: ${error instanceof Error ? error.message : String(error)}`
       );
     }
   }

   /**
    * Load tracker config from harness.config.json.
    * Returns null if no config file, no roadmap section, or no tracker section.
    */
   export function loadTrackerConfig(projectPath: string): TrackerSyncConfig | null {
     try {
       const configPath = path.join(projectPath, 'harness.config.json');
       if (!fs.existsSync(configPath)) return null;

       const raw = fs.readFileSync(configPath, 'utf-8');
       const config = JSON.parse(raw) as { roadmap?: { tracker?: TrackerSyncConfig } };

       return config.roadmap?.tracker ?? null;
     } catch {
       return null;
     }
   }
   ```

2. Run: `harness validate`
3. Commit: `feat(roadmap): wire external sync into autoSyncRoadmap with tracker config detection`

---

### Task 3: Add new state transition actions (task-start, task-complete, phase-start, phase-complete)

**Depends on:** Task 2
**Files:** `packages/cli/src/mcp/tools/state.ts`

1. Add the 4 new actions to the `action` enum in `manageStateDefinition.inputSchema.properties.action`:
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
     'task-start',
     'task-complete',
     'phase-start',
     'phase-complete',
   ],
   ```
2. Add 4 new handler functions after `handleArchiveSession`:

   ```typescript
   async function handleTaskStart(projectPath: string, _input: StateInput) {
     await autoSyncRoadmap(projectPath);
     return resultToMcpResponse(Ok({ synced: true, trigger: 'task-start' }));
   }

   async function handleTaskComplete(projectPath: string, _input: StateInput) {
     await autoSyncRoadmap(projectPath);
     return resultToMcpResponse(Ok({ synced: true, trigger: 'task-complete' }));
   }

   async function handlePhaseStart(projectPath: string, _input: StateInput) {
     await autoSyncRoadmap(projectPath);
     return resultToMcpResponse(Ok({ synced: true, trigger: 'phase-start' }));
   }

   async function handlePhaseComplete(projectPath: string, _input: StateInput) {
     await autoSyncRoadmap(projectPath);
     return resultToMcpResponse(Ok({ synced: true, trigger: 'phase-complete' }));
   }
   ```

3. Add the new handlers to `ACTION_HANDLERS`:
   ```typescript
   'task-start': handleTaskStart,
   'task-complete': handleTaskComplete,
   'phase-start': handlePhaseStart,
   'phase-complete': handlePhaseComplete,
   ```
4. Run: `harness validate`
5. Commit: `feat(state): add task-start, task-complete, phase-start, phase-complete actions with auto-sync`

---

### Task 4: Create autoSyncRoadmap unit tests (TDD)

**Depends on:** Task 2
**Files:** `packages/cli/tests/mcp/tools/roadmap-auto-sync.test.ts`

1. Create `packages/cli/tests/mcp/tools/roadmap-auto-sync.test.ts`:

   ```typescript
   import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { autoSyncRoadmap, loadTrackerConfig } from '../../../src/mcp/tools/roadmap-auto-sync';

   // Minimal valid roadmap
   const TEST_ROADMAP = `---
   project: test-project
   version: 1
   last_synced: 2026-01-01T00:00:00Z
   last_manual_edit: 2026-01-01T00:00:00Z
   ---
   
   # Project Roadmap
   
   ## Milestone: MVP
   
   ### Feature: Auth
   - **Status:** planned
   - **Spec:** —
   - **Plans:** —
   - **Blocked by:** —
   - **Summary:** Auth system
   `;

   const TRACKER_CONFIG = {
     kind: 'github' as const,
     repo: 'owner/repo',
     labels: ['harness-managed'],
     statusMap: {
       backlog: 'open',
       planned: 'open',
       'in-progress': 'open',
       done: 'closed',
       blocked: 'open',
     },
     reverseStatusMap: {
       closed: 'done',
       'open:in-progress': 'in-progress',
     },
   };

   describe('loadTrackerConfig()', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('returns null when no config file exists', () => {
       expect(loadTrackerConfig(tmpDir)).toBeNull();
     });

     it('returns null when config has no roadmap section', () => {
       fs.writeFileSync(
         path.join(tmpDir, 'harness.config.json'),
         JSON.stringify({ version: 1 }),
         'utf-8'
       );
       expect(loadTrackerConfig(tmpDir)).toBeNull();
     });

     it('returns null when config has roadmap but no tracker', () => {
       fs.writeFileSync(
         path.join(tmpDir, 'harness.config.json'),
         JSON.stringify({ version: 1, roadmap: {} }),
         'utf-8'
       );
       expect(loadTrackerConfig(tmpDir)).toBeNull();
     });

     it('returns TrackerSyncConfig when tracker is present', () => {
       fs.writeFileSync(
         path.join(tmpDir, 'harness.config.json'),
         JSON.stringify({ version: 1, roadmap: { tracker: TRACKER_CONFIG } }),
         'utf-8'
       );
       const result = loadTrackerConfig(tmpDir);
       expect(result).toEqual(TRACKER_CONFIG);
     });

     it('returns null on invalid JSON', () => {
       fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), 'not json', 'utf-8');
       expect(loadTrackerConfig(tmpDir)).toBeNull();
     });
   });

   describe('autoSyncRoadmap()', () => {
     let tmpDir: string;

     beforeEach(() => {
       tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autosync-'));
     });

     afterEach(() => {
       fs.rmSync(tmpDir, { recursive: true, force: true });
       vi.restoreAllMocks();
     });

     it('does nothing when no roadmap.md exists', async () => {
       await autoSyncRoadmap(tmpDir); // should not throw
     });

     it('completes without error when roadmap exists but no tracker config', async () => {
       const docsDir = path.join(tmpDir, 'docs');
       fs.mkdirSync(docsDir, { recursive: true });
       fs.writeFileSync(path.join(docsDir, 'roadmap.md'), TEST_ROADMAP, 'utf-8');
       await autoSyncRoadmap(tmpDir); // should not throw
     });

     it('does not attempt external sync when GITHUB_TOKEN is unset', async () => {
       const docsDir = path.join(tmpDir, 'docs');
       fs.mkdirSync(docsDir, { recursive: true });
       fs.writeFileSync(path.join(docsDir, 'roadmap.md'), TEST_ROADMAP, 'utf-8');
       fs.writeFileSync(
         path.join(tmpDir, 'harness.config.json'),
         JSON.stringify({ version: 1, roadmap: { tracker: TRACKER_CONFIG } }),
         'utf-8'
       );

       const origToken = process.env.GITHUB_TOKEN;
       delete process.env.GITHUB_TOKEN;

       try {
         await autoSyncRoadmap(tmpDir); // should not throw
       } finally {
         if (origToken) process.env.GITHUB_TOKEN = origToken;
       }
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/mcp/tools/roadmap-auto-sync.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(roadmap): add autoSyncRoadmap and loadTrackerConfig unit tests`

---

### Task 5: Add state.ts integration tests for new actions

**Depends on:** Task 3
**Files:** `packages/cli/tests/mcp/tools/state.test.ts`

1. Add test cases to the existing `describe('manage_state tool', ...)` block in `packages/cli/tests/mcp/tools/state.test.ts`:

   ```typescript
   it('has task and phase lifecycle actions in enum', () => {
     const actionProp = manageStateDefinition.inputSchema.properties.action as {
       type: string;
       enum: string[];
     };
     expect(actionProp.enum).toContain('task-start');
     expect(actionProp.enum).toContain('task-complete');
     expect(actionProp.enum).toContain('phase-start');
     expect(actionProp.enum).toContain('phase-complete');
   });

   it('task-start action returns synced response', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
     try {
       const response = await handleManageState({ path: tmpDir, action: 'task-start' });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.synced).toBe(true);
       expect(parsed.trigger).toBe('task-start');
     } finally {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     }
   });

   it('task-complete action returns synced response', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
     try {
       const response = await handleManageState({ path: tmpDir, action: 'task-complete' });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.synced).toBe(true);
       expect(parsed.trigger).toBe('task-complete');
     } finally {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     }
   });

   it('phase-start action returns synced response', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
     try {
       const response = await handleManageState({ path: tmpDir, action: 'phase-start' });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.synced).toBe(true);
       expect(parsed.trigger).toBe('phase-start');
     } finally {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     }
   });

   it('phase-complete action returns synced response', async () => {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
     try {
       const response = await handleManageState({ path: tmpDir, action: 'phase-complete' });
       expect(response.isError).toBeFalsy();
       const parsed = JSON.parse(response.content[0].text);
       expect(parsed.synced).toBe(true);
       expect(parsed.trigger).toBe('phase-complete');
     } finally {
       fs.rmSync(tmpDir, { recursive: true, force: true });
     }
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/mcp/tools/state.test.ts`
3. Observe: all tests pass (new + existing).
4. Run: `harness validate`
5. Commit: `test(state): add integration tests for task and phase lifecycle actions`

---

### Task 6: Verify full test suite and final validation

[checkpoint:human-verify]

**Depends on:** Tasks 4, 5
**Files:** none (verification only)

1. Run full roadmap test suite: `cd /Users/cwarner/Projects/harness-engineering/packages/core && npx vitest run tests/roadmap/`
2. Observe: all existing tests pass (sync-engine, tracker-sync, github-issues, parse, serialize).
3. Run CLI test suite: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/mcp/tools/roadmap-auto-sync.test.ts tests/mcp/tools/state.test.ts tests/mcp/tools/roadmap.test.ts`
4. Observe: all pass.
5. Run: `harness validate`
6. Run: `harness check-deps`
7. Verify observable truths:
   - OT1: `autoSyncRoadmap` calls `loadTrackerConfig` and fires `fullSync` when config present
   - OT2: Without tracker config, behavior is unchanged
   - OT3: All 6 trigger points (`save-handoff`, `archive_session`, `task-start`, `task-complete`, `phase-start`, `phase-complete`) call `autoSyncRoadmap`
   - OT4: Errors in external sync are caught and logged, never propagated
   - OT5: `fullSync` mutex serializes concurrent calls (verified by existing sync-engine tests)
   - OT6: Schema accepts `roadmap.tracker` field
8. Commit: no commit needed (verification only)
