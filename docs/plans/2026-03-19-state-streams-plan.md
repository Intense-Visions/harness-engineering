# Plan: State Streams — Multi-Session Isolation

**Date:** 2026-03-19
**Spec:** docs/changes/state-streams/proposal.md
**Estimated tasks:** 11
**Estimated time:** ~44 minutes

## Goal

Multiple independent work streams maintain separate state, handoff, learnings, and failures in isolated directories under `.harness/streams/<name>/`, with automatic stream resolution from git branches and explicit overrides.

## Observable Truths (Acceptance Criteria)

1. When `resolveStreamPath(projectPath, { stream: 'auth-rework' })` is called, the system shall return the path `.harness/streams/auth-rework/`
2. When on git branch `feature/auth-rework` and a stream with that branch association exists, `resolveStreamPath(projectPath)` shall return the `auth-rework` stream path without explicit flags
3. When on `main` with an active stream set, `resolveStreamPath(projectPath)` shall return the active stream's path
4. When no stream can be resolved, `resolveStreamPath` shall return an `Err` result (not silently default)
5. When `migrateToStreams(projectPath)` is called on a project with old-layout `.harness/state.json`, the system shall move all state files to `.harness/streams/default/` and create `index.json`
6. When `migrateToStreams` is called on an already-migrated project, the system shall no-op
7. When `manage_state` is called with `stream: 'auth-rework'`, the system shall read/write state from that stream's directory
8. When `harness state show --stream auth-rework` is run, the system shall display that stream's state
9. `npx vitest run packages/core/tests/state/` passes with all new and existing tests
10. `npx vitest run packages/mcp-server/tests/tools/state.test.ts` passes

## File Map

```
CREATE packages/core/src/state/stream-types.ts
CREATE packages/core/src/state/stream-resolver.ts
MODIFY packages/core/src/state/state-manager.ts (add getStateDir helper, optional stream param)
MODIFY packages/core/src/state/index.ts (add stream exports)
CREATE packages/core/tests/state/stream-resolver.test.ts
CREATE packages/core/tests/state/migration.test.ts
MODIFY packages/mcp-server/src/tools/state.ts (add stream param to tools, add list_streams)
MODIFY packages/mcp-server/src/resources/state.ts (stream-aware)
MODIFY packages/cli/src/commands/state/show.ts (add --stream flag)
MODIFY packages/cli/src/commands/state/learn.ts (add --stream flag)
MODIFY packages/cli/src/commands/state/reset.ts (add --stream flag)
MODIFY packages/cli/src/commands/state/index.ts (add streams subcommand)
CREATE packages/cli/src/commands/state/streams.ts
MODIFY agents/skills/claude-code/harness-state-management/SKILL.md (stream resolution in Phase 1)
```

## Tasks

### Task 1: Define stream types and schemas

**Depends on:** none
**Files:** `packages/core/src/state/stream-types.ts`

1. Create `packages/core/src/state/stream-types.ts`:

   ```typescript
   import { z } from 'zod';

   export const StreamInfoSchema = z.object({
     name: z.string(),
     branch: z.string().optional(),
     createdAt: z.string(),
     lastActiveAt: z.string(),
   });

   export type StreamInfo = z.infer<typeof StreamInfoSchema>;

   export const StreamIndexSchema = z.object({
     schemaVersion: z.literal(1),
     activeStream: z.string().nullable(),
     streams: z.record(StreamInfoSchema),
   });

   export type StreamIndex = z.infer<typeof StreamIndexSchema>;

   export const DEFAULT_STREAM_INDEX: StreamIndex = {
     schemaVersion: 1,
     activeStream: null,
     streams: {},
   };
   ```

2. Run: `npx vitest run packages/core/tests/state/types.test.ts`
3. Run: `harness validate`
4. Commit: `feat(state): define stream types and schemas`

---

### Task 2: Implement stream resolver core — index CRUD and path resolution

**Depends on:** Task 1
**Files:** `packages/core/src/state/stream-resolver.ts`, `packages/core/tests/state/stream-resolver.test.ts`

1. Create test file `packages/core/tests/state/stream-resolver.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import {
     resolveStreamPath,
     createStream,
     listStreams,
     setActiveStream,
     loadStreamIndex,
     saveStreamIndex,
     archiveStream,
     getStreamForBranch,
   } from '../../src/state/stream-resolver';

   function makeTmp() {
     const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-test-'));
     fs.mkdirSync(path.join(dir, '.harness', 'streams'), { recursive: true });
     return dir;
   }

   describe('createStream', () => {
     it('creates stream directory and updates index', async () => {
       const tmp = makeTmp();
       const result = await createStream(tmp, 'auth-rework', 'feature/auth-rework');
       expect(result.ok).toBe(true);
       expect(fs.existsSync(path.join(tmp, '.harness', 'streams', 'auth-rework'))).toBe(true);
       const idx = await loadStreamIndex(tmp);
       expect(idx.ok && idx.value.streams['auth-rework']).toBeTruthy();
       fs.rmSync(tmp, { recursive: true });
     });

     it('rejects duplicate stream names', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'my-stream');
       const result = await createStream(tmp, 'my-stream');
       expect(result.ok).toBe(false);
       fs.rmSync(tmp, { recursive: true });
     });
   });

   describe('resolveStreamPath', () => {
     it('resolves explicit stream name', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'my-stream');
       const result = await resolveStreamPath(tmp, { stream: 'my-stream' });
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value).toBe(path.join(tmp, '.harness', 'streams', 'my-stream'));
       }
       fs.rmSync(tmp, { recursive: true });
     });

     it('returns error for unknown explicit stream', async () => {
       const tmp = makeTmp();
       const result = await resolveStreamPath(tmp, { stream: 'nonexistent' });
       expect(result.ok).toBe(false);
       fs.rmSync(tmp, { recursive: true });
     });

     it('resolves active stream when no explicit name', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'default');
       await setActiveStream(tmp, 'default');
       const result = await resolveStreamPath(tmp);
       expect(result.ok).toBe(true);
       if (result.ok) {
         expect(result.value).toContain('default');
       }
       fs.rmSync(tmp, { recursive: true });
     });

     it('returns error when no stream can be resolved', async () => {
       const tmp = makeTmp();
       const result = await resolveStreamPath(tmp);
       expect(result.ok).toBe(false);
       fs.rmSync(tmp, { recursive: true });
     });

     it('updates lastActiveAt on resolution', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'my-stream');
       const before = new Date().toISOString();
       await resolveStreamPath(tmp, { stream: 'my-stream' });
       const idx = await loadStreamIndex(tmp);
       expect(idx.ok).toBe(true);
       if (idx.ok) {
         expect(idx.value.streams['my-stream']!.lastActiveAt >= before).toBe(true);
       }
       fs.rmSync(tmp, { recursive: true });
     });
   });

   describe('listStreams', () => {
     it('returns all known streams', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'stream-a');
       await createStream(tmp, 'stream-b');
       const result = await listStreams(tmp);
       expect(result.ok).toBe(true);
       if (result.ok) expect(result.value).toHaveLength(2);
       fs.rmSync(tmp, { recursive: true });
     });

     it('returns empty array when no streams', async () => {
       const tmp = makeTmp();
       const result = await listStreams(tmp);
       expect(result.ok).toBe(true);
       if (result.ok) expect(result.value).toHaveLength(0);
       fs.rmSync(tmp, { recursive: true });
     });
   });

   describe('setActiveStream', () => {
     it('updates activeStream in index', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'my-stream');
       await setActiveStream(tmp, 'my-stream');
       const idx = await loadStreamIndex(tmp);
       expect(idx.ok && idx.value.activeStream).toBe('my-stream');
       fs.rmSync(tmp, { recursive: true });
     });

     it('rejects unknown stream name', async () => {
       const tmp = makeTmp();
       const result = await setActiveStream(tmp, 'nonexistent');
       expect(result.ok).toBe(false);
       fs.rmSync(tmp, { recursive: true });
     });
   });

   describe('archiveStream', () => {
     it('moves stream to archive and removes from index', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'old-stream');
       const result = await archiveStream(tmp, 'old-stream');
       expect(result.ok).toBe(true);
       expect(fs.existsSync(path.join(tmp, '.harness', 'streams', 'old-stream'))).toBe(false);
       const idx = await loadStreamIndex(tmp);
       expect(idx.ok && idx.value.streams['old-stream']).toBeFalsy();
       fs.rmSync(tmp, { recursive: true });
     });

     it('clears activeStream if archived stream was active', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'active-stream');
       await setActiveStream(tmp, 'active-stream');
       await archiveStream(tmp, 'active-stream');
       const idx = await loadStreamIndex(tmp);
       expect(idx.ok && idx.value.activeStream).toBeNull();
       fs.rmSync(tmp, { recursive: true });
     });
   });

   describe('getStreamForBranch', () => {
     it('finds stream by branch association', async () => {
       const tmp = makeTmp();
       await createStream(tmp, 'auth', 'feature/auth');
       const idx = await loadStreamIndex(tmp);
       if (idx.ok) {
         expect(getStreamForBranch(idx.value, 'feature/auth')).toBe('auth');
         expect(getStreamForBranch(idx.value, 'other-branch')).toBeNull();
       }
       fs.rmSync(tmp, { recursive: true });
     });
   });
   ```

2. Run tests — observe failures (module doesn't exist yet)

3. Create `packages/core/src/state/stream-resolver.ts`:

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import { execSync } from 'child_process';
   import type { Result } from '../shared/result';
   import { Ok, Err } from '../shared/result';
   import {
     StreamIndexSchema,
     DEFAULT_STREAM_INDEX,
     type StreamIndex,
     type StreamInfo,
   } from './stream-types';

   const HARNESS_DIR = '.harness';
   const STREAMS_DIR = 'streams';
   const INDEX_FILE = 'index.json';

   function streamsDir(projectPath: string): string {
     return path.join(projectPath, HARNESS_DIR, STREAMS_DIR);
   }

   function indexPath(projectPath: string): string {
     return path.join(streamsDir(projectPath), INDEX_FILE);
   }

   // ── Index persistence ──────────────────────────────────────────────

   export async function loadStreamIndex(projectPath: string): Promise<Result<StreamIndex, Error>> {
     const idxPath = indexPath(projectPath);
     if (!fs.existsSync(idxPath)) {
       return Ok({ ...DEFAULT_STREAM_INDEX, streams: {} });
     }
     try {
       const raw = fs.readFileSync(idxPath, 'utf-8');
       const parsed = JSON.parse(raw);
       const result = StreamIndexSchema.safeParse(parsed);
       if (!result.success) {
         return Err(new Error(`Invalid stream index: ${result.error.message}`));
       }
       return Ok(result.data);
     } catch (error) {
       return Err(
         new Error(
           `Failed to load stream index: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }

   export async function saveStreamIndex(
     projectPath: string,
     index: StreamIndex
   ): Promise<Result<void, Error>> {
     const dir = streamsDir(projectPath);
     try {
       fs.mkdirSync(dir, { recursive: true });
       fs.writeFileSync(indexPath(projectPath), JSON.stringify(index, null, 2));
       return Ok(undefined);
     } catch (error) {
       return Err(
         new Error(
           `Failed to save stream index: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }
   }

   // ── Git helpers ────────────────────────────────────────────────────

   function getCurrentBranch(projectPath: string): string | null {
     try {
       return execSync('git rev-parse --abbrev-ref HEAD', {
         cwd: projectPath,
         stdio: 'pipe',
       })
         .toString()
         .trim();
     } catch {
       return null;
     }
   }

   // ── Stream resolution ──────────────────────────────────────────────

   export async function resolveStreamPath(
     projectPath: string,
     options?: { stream?: string }
   ): Promise<Result<string, Error>> {
     const idxResult = await loadStreamIndex(projectPath);
     if (!idxResult.ok) return idxResult as Result<string, Error>;
     const index = idxResult.value;

     // 1. Explicit stream name
     if (options?.stream) {
       if (!index.streams[options.stream]) {
         return Err(
           new Error(
             `Stream '${options.stream}' not found. Known streams: ${Object.keys(index.streams).join(', ') || 'none'}`
           )
         );
       }
       const streamPath = path.join(streamsDir(projectPath), options.stream);
       index.streams[options.stream]!.lastActiveAt = new Date().toISOString();
       index.activeStream = options.stream;
       await saveStreamIndex(projectPath, index);
       return Ok(streamPath);
     }

     // 2. Infer from git branch
     const branch = getCurrentBranch(projectPath);
     if (branch && branch !== 'main' && branch !== 'master') {
       for (const [name, info] of Object.entries(index.streams)) {
         if (info.branch === branch) {
           const streamPath = path.join(streamsDir(projectPath), name);
           index.streams[name]!.lastActiveAt = new Date().toISOString();
           index.activeStream = name;
           await saveStreamIndex(projectPath, index);
           return Ok(streamPath);
         }
       }
     }

     // 3. Use active stream
     if (index.activeStream && index.streams[index.activeStream]) {
       const streamPath = path.join(streamsDir(projectPath), index.activeStream);
       index.streams[index.activeStream]!.lastActiveAt = new Date().toISOString();
       await saveStreamIndex(projectPath, index);
       return Ok(streamPath);
     }

     // 4. No resolution possible
     return Err(
       new Error(
         'Cannot resolve stream. Specify --stream <name> or create a stream. ' +
           `Known streams: ${Object.keys(index.streams).join(', ') || 'none'}`
       )
     );
   }

   // ── Stream lifecycle ───────────────────────────────────────────────

   export async function createStream(
     projectPath: string,
     name: string,
     branch?: string
   ): Promise<Result<string, Error>> {
     const idxResult = await loadStreamIndex(projectPath);
     if (!idxResult.ok) return idxResult as Result<string, Error>;
     const index = idxResult.value;

     if (index.streams[name]) {
       return Err(new Error(`Stream '${name}' already exists`));
     }

     const streamPath = path.join(streamsDir(projectPath), name);
     try {
       fs.mkdirSync(streamPath, { recursive: true });
     } catch (error) {
       return Err(
         new Error(
           `Failed to create stream directory: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }

     const now = new Date().toISOString();
     index.streams[name] = {
       name,
       branch,
       createdAt: now,
       lastActiveAt: now,
     };

     const saveResult = await saveStreamIndex(projectPath, index);
     if (!saveResult.ok) return saveResult as Result<string, Error>;

     return Ok(streamPath);
   }

   export async function listStreams(projectPath: string): Promise<Result<StreamInfo[], Error>> {
     const idxResult = await loadStreamIndex(projectPath);
     if (!idxResult.ok) return idxResult as Result<StreamInfo[], Error>;
     return Ok(Object.values(idxResult.value.streams));
   }

   export async function setActiveStream(
     projectPath: string,
     name: string
   ): Promise<Result<void, Error>> {
     const idxResult = await loadStreamIndex(projectPath);
     if (!idxResult.ok) return idxResult;
     const index = idxResult.value;

     if (!index.streams[name]) {
       return Err(new Error(`Stream '${name}' not found`));
     }

     index.activeStream = name;
     return saveStreamIndex(projectPath, index);
   }

   export async function archiveStream(
     projectPath: string,
     name: string
   ): Promise<Result<void, Error>> {
     const idxResult = await loadStreamIndex(projectPath);
     if (!idxResult.ok) return idxResult;
     const index = idxResult.value;

     if (!index.streams[name]) {
       return Err(new Error(`Stream '${name}' not found`));
     }

     const streamPath = path.join(streamsDir(projectPath), name);
     const archiveDir = path.join(projectPath, HARNESS_DIR, 'archive', 'streams');

     try {
       fs.mkdirSync(archiveDir, { recursive: true });
       const date = new Date().toISOString().split('T')[0];
       fs.renameSync(streamPath, path.join(archiveDir, `${name}-${date}`));
     } catch (error) {
       return Err(
         new Error(
           `Failed to archive stream: ${error instanceof Error ? error.message : String(error)}`
         )
       );
     }

     delete index.streams[name];
     if (index.activeStream === name) {
       index.activeStream = null;
     }

     return saveStreamIndex(projectPath, index);
   }

   export function getStreamForBranch(index: StreamIndex, branch: string): string | null {
     for (const [name, info] of Object.entries(index.streams)) {
       if (info.branch === branch) return name;
     }
     return null;
   }

   // ── Migration ──────────────────────────────────────────────────────

   const STATE_FILES = ['state.json', 'handoff.json', 'learnings.md', 'failures.md'];

   export async function migrateToStreams(projectPath: string): Promise<Result<void, Error>> {
     const harnessDir = path.join(projectPath, HARNESS_DIR);
     const sDir = streamsDir(projectPath);

     // Already migrated?
     if (fs.existsSync(indexPath(projectPath))) {
       return Ok(undefined);
     }

     // Any old-layout files to migrate?
     const filesToMove = STATE_FILES.filter((f) => fs.existsSync(path.join(harnessDir, f)));
     if (filesToMove.length === 0) {
       return Ok(undefined);
     }

     // Create default stream dir
     const defaultDir = path.join(sDir, 'default');
     try {
       fs.mkdirSync(defaultDir, { recursive: true });

       for (const file of filesToMove) {
         fs.renameSync(path.join(harnessDir, file), path.join(defaultDir, file));
       }
     } catch (error) {
       return Err(
         new Error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`)
       );
     }

     // Create index
     const now = new Date().toISOString();
     const index: StreamIndex = {
       schemaVersion: 1,
       activeStream: 'default',
       streams: {
         default: {
           name: 'default',
           createdAt: now,
           lastActiveAt: now,
         },
       },
     };

     return saveStreamIndex(projectPath, index);
   }
   ```

4. Run: `npx vitest run packages/core/tests/state/stream-resolver.test.ts`
5. Observe: all tests pass
6. Run: `harness validate`
7. Commit: `feat(state): implement stream resolver with index CRUD and path resolution`

---

### Task 3: Implement migration function tests

**Depends on:** Task 2
**Files:** `packages/core/tests/state/migration.test.ts`

1. Create test file `packages/core/tests/state/migration.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   import { migrateToStreams, loadStreamIndex } from '../../src/state/stream-resolver';

   describe('migrateToStreams', () => {
     it('moves old-layout files to streams/default/', async () => {
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
       const hDir = path.join(tmp, '.harness');
       fs.mkdirSync(hDir, { recursive: true });
       fs.writeFileSync(path.join(hDir, 'state.json'), '{"schemaVersion":1}');
       fs.writeFileSync(path.join(hDir, 'handoff.json'), '{}');
       fs.writeFileSync(path.join(hDir, 'learnings.md'), '# Learnings');
       fs.writeFileSync(path.join(hDir, 'failures.md'), '# Failures');

       const result = await migrateToStreams(tmp);
       expect(result.ok).toBe(true);

       const defaultDir = path.join(hDir, 'streams', 'default');
       expect(fs.existsSync(path.join(defaultDir, 'state.json'))).toBe(true);
       expect(fs.existsSync(path.join(defaultDir, 'handoff.json'))).toBe(true);
       expect(fs.existsSync(path.join(defaultDir, 'learnings.md'))).toBe(true);
       expect(fs.existsSync(path.join(defaultDir, 'failures.md'))).toBe(true);

       // Old files should be gone
       expect(fs.existsSync(path.join(hDir, 'state.json'))).toBe(false);
       expect(fs.existsSync(path.join(hDir, 'handoff.json'))).toBe(false);

       // Index should exist with default stream
       const idx = await loadStreamIndex(tmp);
       expect(idx.ok).toBe(true);
       if (idx.ok) {
         expect(idx.value.streams['default']).toBeTruthy();
         expect(idx.value.activeStream).toBe('default');
       }

       fs.rmSync(tmp, { recursive: true });
     });

     it('is idempotent — no-ops when already migrated', async () => {
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
       const hDir = path.join(tmp, '.harness');
       fs.mkdirSync(hDir, { recursive: true });
       fs.writeFileSync(path.join(hDir, 'state.json'), '{"schemaVersion":1}');

       await migrateToStreams(tmp);
       const result = await migrateToStreams(tmp);
       expect(result.ok).toBe(true);

       fs.rmSync(tmp, { recursive: true });
     });

     it('no-ops when no old state files exist', async () => {
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
       const result = await migrateToStreams(tmp);
       expect(result.ok).toBe(true);
       fs.rmSync(tmp, { recursive: true });
     });

     it('handles partial old layout (only state.json)', async () => {
       const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
       const hDir = path.join(tmp, '.harness');
       fs.mkdirSync(hDir, { recursive: true });
       fs.writeFileSync(path.join(hDir, 'state.json'), '{"schemaVersion":1}');

       const result = await migrateToStreams(tmp);
       expect(result.ok).toBe(true);

       expect(fs.existsSync(path.join(hDir, 'streams', 'default', 'state.json'))).toBe(true);
       expect(fs.existsSync(path.join(hDir, 'state.json'))).toBe(false);

       fs.rmSync(tmp, { recursive: true });
     });
   });
   ```

2. Run: `npx vitest run packages/core/tests/state/migration.test.ts`
3. Observe: all tests pass
4. Commit: `test(state): add migration test coverage`

---

### Task 4: Wire state-manager functions to support streams

**Depends on:** Task 3
**Files:** `packages/core/src/state/state-manager.ts`

[checkpoint:human-verify] — This is the critical refactor. Verify existing tests pass after this change.

1. Modify `packages/core/src/state/state-manager.ts`:

   Add imports at top:

   ```typescript
   import { resolveStreamPath, migrateToStreams } from './stream-resolver';
   ```

   Add helper function:

   ```typescript
   async function getStateDir(projectPath: string, stream?: string): Promise<string> {
     // Auto-migrate if needed
     await migrateToStreams(projectPath);

     const result = await resolveStreamPath(projectPath, stream ? { stream } : undefined);
     if (result.ok) {
       return result.value;
     }

     // Fallback: if no streams exist, use legacy .harness/ path
     const legacyDir = path.join(projectPath, HARNESS_DIR);
     if (fs.existsSync(path.join(legacyDir, STATE_FILE))) {
       return legacyDir;
     }

     // No legacy files either — return legacy dir for new writes
     return legacyDir;
   }
   ```

   Update function signatures (add optional `stream?: string` as last param):
   - `loadState(projectPath: string, stream?: string)`
   - `saveState(projectPath: string, state: HarnessState, stream?: string)`
   - `appendLearning(projectPath: string, learning: string, skillName?: string, outcome?: string, stream?: string)`
   - `loadRelevantLearnings(projectPath: string, skillName?: string, stream?: string)`
   - `appendFailure(projectPath: string, description: string, skillName: string, type: string, stream?: string)`
   - `loadFailures(projectPath: string, stream?: string)`
   - `archiveFailures(projectPath: string, stream?: string)`
   - `saveHandoff(projectPath: string, handoff: Handoff, stream?: string)`
   - `loadHandoff(projectPath: string, stream?: string)`

   In each function body, replace:

   ```typescript
   const harnessDir = path.join(projectPath, HARNESS_DIR);
   ```

   with:

   ```typescript
   const harnessDir = await getStateDir(projectPath, stream);
   ```

   And replace:

   ```typescript
   const statePath = path.join(projectPath, HARNESS_DIR, STATE_FILE);
   ```

   with:

   ```typescript
   const stateDir = await getStateDir(projectPath, stream);
   const statePath = path.join(stateDir, STATE_FILE);
   ```

   `runMechanicalGate` stays unchanged (project-level, not stream-level).

2. Run: `npx vitest run packages/core/tests/state/`
3. Observe: all existing tests still pass
4. Run: `harness validate`
5. Commit: `feat(state): wire state-manager functions to support optional stream parameter`

---

### Task 5: Update core exports

**Depends on:** Task 4
**Files:** `packages/core/src/state/index.ts`

1. Add to `packages/core/src/state/index.ts`:

   ```typescript
   export { StreamInfoSchema, StreamIndexSchema, DEFAULT_STREAM_INDEX } from './stream-types';
   export type { StreamInfo, StreamIndex } from './stream-types';
   export {
     resolveStreamPath,
     createStream,
     listStreams,
     setActiveStream,
     archiveStream,
     loadStreamIndex,
     saveStreamIndex,
     migrateToStreams,
     getStreamForBranch,
   } from './stream-resolver';
   ```

2. Run: `npx vitest run packages/core/tests/state/`
3. Run: `harness validate`
4. Commit: `feat(state): export stream types and resolver from core`

---

### Task 6: Add stream param to MCP state tools

**Depends on:** Task 5
**Files:** `packages/mcp-server/src/tools/state.ts`

1. Add `stream` property to `manageStateDefinition.inputSchema.properties`:

   ```typescript
   stream: { type: 'string', description: 'Stream name to target (auto-resolves from branch if omitted)' },
   ```

2. Add `stream?: string` to `handleManageState` input type

3. Pass `input.stream` to core functions in each case:
   - `loadState(projectPath, input.stream)`
   - `appendLearning(projectPath, input.learning, input.skillName, input.outcome, input.stream)`
   - `appendFailure(projectPath, input.description, input.skillName ?? 'unknown', input.failureType, input.stream)`
   - `archiveFailures(projectPath, input.stream)`
   - `saveState(projectPath, { ...DEFAULT_STATE }, input.stream)` (reset case)

4. Add `stream` property to `manageHandoffDefinition.inputSchema.properties`

5. Add `stream?: string` to `handleManageHandoff` input type

6. Pass `input.stream` to `saveHandoff` and `loadHandoff`

7. Run: `npx vitest run packages/mcp-server/tests/tools/state.test.ts`
8. Run: `harness validate`
9. Commit: `feat(mcp): add stream parameter to manage_state and manage_handoff tools`

---

### Task 7: Add list_streams MCP tool

**Depends on:** Task 6
**Files:** `packages/mcp-server/src/tools/state.ts`

1. Add to `packages/mcp-server/src/tools/state.ts`:

   ```typescript
   export const listStreamsDefinition = {
     name: 'list_streams',
     description: 'List known state streams with branch associations and last-active timestamps',
     inputSchema: {
       type: 'object' as const,
       properties: {
         path: { type: 'string', description: 'Path to project root' },
       },
       required: ['path'],
     },
   };

   export async function handleListStreams(input: { path: string }) {
     try {
       const { listStreams, loadStreamIndex } = await import('@harness-engineering/core');
       const projectPath = path.resolve(input.path);
       const indexResult = await loadStreamIndex(projectPath);
       const streamsResult = await listStreams(projectPath);

       if (!streamsResult.ok) return resultToMcpResponse(streamsResult);

       return resultToMcpResponse(
         Ok({
           activeStream: indexResult.ok ? indexResult.value.activeStream : null,
           streams: streamsResult.value,
         })
       );
     } catch (error) {
       return {
         content: [
           {
             type: 'text' as const,
             text: `Error: ${error instanceof Error ? error.message : String(error)}`,
           },
         ],
         isError: true,
       };
     }
   }
   ```

2. Register `listStreamsDefinition` and `handleListStreams` in the MCP server's tool registry

3. Run: `npx vitest run packages/mcp-server/tests/tools/state.test.ts`
4. Run: `harness validate`
5. Commit: `feat(mcp): add list_streams tool`

---

### Task 8: Add --stream flag to CLI state commands

**Depends on:** Task 5
**Files:** `packages/cli/src/commands/state/show.ts`, `packages/cli/src/commands/state/learn.ts`, `packages/cli/src/commands/state/reset.ts`

1. Modify `show.ts`:
   - Add `.option('--stream <name>', 'Target a specific stream')`
   - Pass `opts.stream` to `loadState(projectPath, opts.stream)`
   - When not `--json`/`--quiet`, print `Stream: <name>` in header if stream is set

2. Modify `learn.ts`:
   - Add `.option('--stream <name>', 'Target a specific stream')`
   - Pass `opts.stream` as last param to `appendLearning`

3. Modify `reset.ts`:
   - Add `.option('--stream <name>', 'Target a specific stream')`
   - Resolve the stream path and delete the appropriate `state.json`

4. Run: `npx vitest run packages/core/tests/state/`
5. Run: `harness validate`
6. Commit: `feat(cli): add --stream flag to state show, learn, and reset commands`

---

### Task 9: Add CLI streams subcommands

**Depends on:** Task 8
**Files:** `packages/cli/src/commands/state/streams.ts`, `packages/cli/src/commands/state/index.ts`

1. Create `packages/cli/src/commands/state/streams.ts`:

   ```typescript
   import { Command } from 'commander';
   import * as path from 'path';
   import {
     createStream,
     listStreams,
     archiveStream,
     setActiveStream,
     loadStreamIndex,
   } from '@harness-engineering/core';
   import { logger } from '../../output/logger';
   import { ExitCode } from '../../utils/errors';

   export function createStreamsCommand(): Command {
     const command = new Command('streams').description('Manage state streams');

     command
       .command('list')
       .description('List all known streams')
       .option('--path <path>', 'Project root path', '.')
       .action(async (opts, cmd) => {
         const globalOpts = cmd.optsWithGlobals();
         const projectPath = path.resolve(opts.path);
         const indexResult = await loadStreamIndex(projectPath);
         const result = await listStreams(projectPath);
         if (!result.ok) {
           logger.error(result.error.message);
           process.exit(ExitCode.ERROR);
           return;
         }
         const active = indexResult.ok ? indexResult.value.activeStream : null;
         if (globalOpts.json) {
           logger.raw({ activeStream: active, streams: result.value });
         } else {
           if (result.value.length === 0) {
             console.log('No streams found.');
           }
           for (const s of result.value) {
             const marker = s.name === active ? ' (active)' : '';
             const branch = s.branch ? ` [${s.branch}]` : '';
             console.log(`  ${s.name}${marker}${branch} — last active: ${s.lastActiveAt}`);
           }
         }
         process.exit(ExitCode.SUCCESS);
       });

     command
       .command('create <name>')
       .description('Create a new stream')
       .option('--path <path>', 'Project root path', '.')
       .option('--branch <branch>', 'Associate with a git branch')
       .action(async (name, opts) => {
         const projectPath = path.resolve(opts.path);
         const result = await createStream(projectPath, name, opts.branch);
         if (!result.ok) {
           logger.error(result.error.message);
           process.exit(ExitCode.ERROR);
           return;
         }
         logger.success(`Stream '${name}' created.`);
         process.exit(ExitCode.SUCCESS);
       });

     command
       .command('archive <name>')
       .description('Archive a stream')
       .option('--path <path>', 'Project root path', '.')
       .action(async (name, opts) => {
         const projectPath = path.resolve(opts.path);
         const result = await archiveStream(projectPath, name);
         if (!result.ok) {
           logger.error(result.error.message);
           process.exit(ExitCode.ERROR);
           return;
         }
         logger.success(`Stream '${name}' archived.`);
         process.exit(ExitCode.SUCCESS);
       });

     command
       .command('activate <name>')
       .description('Set the active stream')
       .option('--path <path>', 'Project root path', '.')
       .action(async (name, opts) => {
         const projectPath = path.resolve(opts.path);
         const result = await setActiveStream(projectPath, name);
         if (!result.ok) {
           logger.error(result.error.message);
           process.exit(ExitCode.ERROR);
           return;
         }
         logger.success(`Active stream set to '${name}'.`);
         process.exit(ExitCode.SUCCESS);
       });

     return command;
   }
   ```

2. Modify `packages/cli/src/commands/state/index.ts` — add import and register:

   ```typescript
   import { createStreamsCommand } from './streams';
   // In createStateCommand():
   command.addCommand(createStreamsCommand());
   ```

3. Run: `harness validate`
4. Commit: `feat(cli): add harness state streams list/create/archive/activate subcommands`

---

### Task 10: Update MCP state resource to be stream-aware

**Depends on:** Task 5
**Files:** `packages/mcp-server/src/resources/state.ts`

1. Modify `getStateResource`:

   ```typescript
   export async function getStateResource(projectRoot: string): Promise<string> {
     try {
       const { loadState, migrateToStreams } = await import('@harness-engineering/core');
       await migrateToStreams(projectRoot);
       const result = await loadState(projectRoot);
       if (result.ok) {
         return JSON.stringify(result.value, null, 2);
       }
       return JSON.stringify({
         schemaVersion: 1,
         position: {},
         decisions: [],
         blockers: [],
         progress: {},
       });
     } catch {
       return JSON.stringify({
         schemaVersion: 1,
         position: {},
         decisions: [],
         blockers: [],
         progress: {},
       });
     }
   }
   ```

2. Run: `npx vitest run packages/mcp-server/tests/resources/state.test.ts`
3. Run: `harness validate`
4. Commit: `feat(mcp): make state resource stream-aware with auto-migration`

---

### Task 11: Update harness-state-management SKILL.md

**Depends on:** Task 9
**Files:** `agents/skills/claude-code/harness-state-management/SKILL.md`

1. In Phase 1 (LOAD), add stream resolution step before loading state:
   - Call `manage_state` with `stream` param or let it auto-resolve from branch
   - If resolution fails, prompt the user: "Which stream should I use? Known streams: ..."
   - Announce the resolved stream name alongside loaded state

2. In Phase 4 (SAVE), add guidance:
   - State is saved to the active stream
   - When starting new work on a new branch, create a new stream with `harness state streams create`

3. Run: `harness validate`
4. Commit: `docs(skills): update state-management skill for stream-based state`

---

## Dependency Graph

```
Task 1 (types)
  └─ Task 2 (resolver + lifecycle)
       └─ Task 3 (migration tests)
            └─ Task 4 (wire state-manager) [checkpoint:human-verify]
                 └─ Task 5 (exports)
                      ├─ Task 6 (MCP stream param)
                      │    └─ Task 7 (list_streams tool)
                      ├─ Task 8 (CLI --stream flag)
                      │    └─ Task 9 (CLI streams subcommands)
                      │         └─ Task 11 (SKILL.md update)
                      └─ Task 10 (MCP resource)
```

**Parallel opportunities:** After Task 5, Tasks 6/7 (MCP), 8/9 (CLI), and 10 (resource) can run in parallel.
