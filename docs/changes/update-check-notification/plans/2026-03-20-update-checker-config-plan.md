# Plan: Update Checker Config Support (Phase 4)

**Date:** 2026-03-20
**Spec:** docs/changes/update-check-notification/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Read `updateCheckInterval` from `harness.config.json` so the hardcoded 24h default can be overridden, and pass the config value through to both CLI and MCP entry points.

## Observable Truths (Acceptance Criteria)

1. When `harness.config.json` contains `"updateCheckInterval": 3600000`, the CLI uses 3600000ms as the interval passed to `shouldRunCheck()` instead of the hardcoded 86400000.
2. When `harness.config.json` contains `"updateCheckInterval": 0`, the system shall disable update checking entirely (both `isUpdateCheckEnabled()` returns false and no background check is spawned).
3. When `harness.config.json` does not contain `updateCheckInterval`, the system shall use the default 86400000ms interval.
4. When `harness.config.json` is missing or unreadable, the system shall use the default interval and not crash.
5. The MCP server reads `updateCheckInterval` from `harness.config.json` at `resolvedRoot` and passes it to `isUpdateCheckEnabled()` and `shouldRunCheck()`.
6. `npx vitest run` in `packages/cli` passes all update-check-hooks tests.
7. `npx vitest run` in `packages/mcp-server` passes all update-check-hook tests.
8. `harness validate` passes.

## File Map

- MODIFY `packages/cli/src/config/schema.ts` (add `updateCheckInterval` to `HarnessConfigSchema`)
- MODIFY `packages/cli/src/bin/update-check-hooks.ts` (read config, pass interval)
- CREATE `packages/cli/tests/bin/update-check-hooks.test.ts` (unit tests for config integration)
- MODIFY `packages/mcp-server/src/server.ts` (read config, pass interval to update check)
- MODIFY `packages/mcp-server/tests/update-check-hook.test.ts` (add config-aware test cases)

## Tasks

### Task 1: Add `updateCheckInterval` to the config schema

**Depends on:** none
**Files:** `packages/cli/src/config/schema.ts`

1. Open `packages/cli/src/config/schema.ts`.
2. In `HarnessConfigSchema` (line 67), add a new optional field after `design`:
   ```typescript
   updateCheckInterval: z.number().int().min(0).optional(),
   ```
   This allows `undefined` (use default), `0` (disabled), or any positive integer (custom interval in ms).
3. Run: `cd packages/cli && npx vitest run tests/config/loader.test.ts`
4. Observe: all existing tests pass (the field is optional, so no existing configs break).
5. Run: `harness validate`
6. Commit: `feat(config): add updateCheckInterval to HarnessConfigSchema`

### Task 2: Wire config into CLI update-check-hooks (TDD)

**Depends on:** Task 1
**Files:** `packages/cli/src/bin/update-check-hooks.ts`, `packages/cli/tests/bin/update-check-hooks.test.ts`

1. Create test file `packages/cli/tests/bin/update-check-hooks.test.ts`:

   ```typescript
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

   // Mock @harness-engineering/core
   vi.mock('@harness-engineering/core', async (importOriginal) => {
     const actual = await importOriginal<typeof import('@harness-engineering/core')>();
     return {
       ...actual,
       VERSION: '1.0.0',
       isUpdateCheckEnabled: vi.fn().mockReturnValue(true),
       shouldRunCheck: vi.fn().mockReturnValue(true),
       readCheckState: vi.fn().mockReturnValue(null),
       spawnBackgroundCheck: vi.fn(),
       getUpdateNotification: vi.fn().mockReturnValue(null),
     };
   });

   // Mock the config loader
   vi.mock('../../src/config/loader', () => ({
     findConfigFile: vi.fn(),
     loadConfig: vi.fn(),
   }));

   import {
     isUpdateCheckEnabled,
     shouldRunCheck,
     readCheckState,
     spawnBackgroundCheck,
     getUpdateNotification,
   } from '@harness-engineering/core';
   import { findConfigFile, loadConfig } from '../../src/config/loader';
   import {
     runUpdateCheckAtStartup,
     printUpdateNotification,
   } from '../../src/bin/update-check-hooks';

   const mockIsUpdateCheckEnabled = vi.mocked(isUpdateCheckEnabled);
   const mockShouldRunCheck = vi.mocked(shouldRunCheck);
   const mockSpawnBackgroundCheck = vi.mocked(spawnBackgroundCheck);
   const mockGetUpdateNotification = vi.mocked(getUpdateNotification);
   const mockFindConfigFile = vi.mocked(findConfigFile);
   const mockLoadConfig = vi.mocked(loadConfig);

   describe('runUpdateCheckAtStartup with config', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockIsUpdateCheckEnabled.mockReturnValue(true);
       mockShouldRunCheck.mockReturnValue(true);
       mockSpawnBackgroundCheck.mockReturnValue(undefined);
     });

     it('uses updateCheckInterval from config when present', () => {
       mockFindConfigFile.mockReturnValue({
         ok: true,
         value: '/project/harness.config.json',
       } as any);
       mockLoadConfig.mockReturnValue({
         ok: true,
         value: {
           version: 1 as const,
           rootDir: '.',
           agentsMapPath: './AGENTS.md',
           docsDir: './docs',
           updateCheckInterval: 3600000,
         },
       } as any);

       runUpdateCheckAtStartup();

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(3600000);
       expect(mockShouldRunCheck).toHaveBeenCalledWith(expect.anything(), 3600000);
     });

     it('uses default interval when config has no updateCheckInterval', () => {
       mockFindConfigFile.mockReturnValue({
         ok: true,
         value: '/project/harness.config.json',
       } as any);
       mockLoadConfig.mockReturnValue({
         ok: true,
         value: {
           version: 1 as const,
           rootDir: '.',
           agentsMapPath: './AGENTS.md',
           docsDir: './docs',
         },
       } as any);

       runUpdateCheckAtStartup();

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
       expect(mockShouldRunCheck).toHaveBeenCalledWith(expect.anything(), 86_400_000);
     });

     it('uses default interval when config file is not found', () => {
       mockFindConfigFile.mockReturnValue({ ok: false, error: new Error('not found') } as any);

       runUpdateCheckAtStartup();

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
       expect(mockShouldRunCheck).toHaveBeenCalledWith(expect.anything(), 86_400_000);
     });

     it('does not spawn check when isUpdateCheckEnabled returns false', () => {
       mockIsUpdateCheckEnabled.mockReturnValue(false);
       mockFindConfigFile.mockReturnValue({
         ok: true,
         value: '/project/harness.config.json',
       } as any);
       mockLoadConfig.mockReturnValue({
         ok: true,
         value: {
           version: 1 as const,
           rootDir: '.',
           agentsMapPath: './AGENTS.md',
           docsDir: './docs',
           updateCheckInterval: 0,
         },
       } as any);

       runUpdateCheckAtStartup();

       expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
     });
   });

   describe('printUpdateNotification with config', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockIsUpdateCheckEnabled.mockReturnValue(true);
       mockGetUpdateNotification.mockReturnValue(null);
     });

     it('passes config interval to isUpdateCheckEnabled', () => {
       mockFindConfigFile.mockReturnValue({
         ok: true,
         value: '/project/harness.config.json',
       } as any);
       mockLoadConfig.mockReturnValue({
         ok: true,
         value: {
           version: 1 as const,
           rootDir: '.',
           agentsMapPath: './AGENTS.md',
           docsDir: './docs',
           updateCheckInterval: 7200000,
         },
       } as any);

       printUpdateNotification();

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(7200000);
     });

     it('uses default when config is missing', () => {
       mockFindConfigFile.mockReturnValue({ ok: false, error: new Error('not found') } as any);

       printUpdateNotification();

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
     });
   });
   ```

2. Run test: `cd packages/cli && npx vitest run tests/bin/update-check-hooks.test.ts`
3. Observe failure: `runUpdateCheckAtStartup` does not pass config interval to `isUpdateCheckEnabled` or `shouldRunCheck`.

4. Modify `packages/cli/src/bin/update-check-hooks.ts` to:

   ```typescript
   import {
     isUpdateCheckEnabled,
     shouldRunCheck,
     readCheckState,
     spawnBackgroundCheck,
     getUpdateNotification,
     VERSION,
   } from '@harness-engineering/core';
   import { findConfigFile, loadConfig } from '../config/loader';

   const DEFAULT_INTERVAL_MS = 86_400_000; // 24 hours

   /**
    * Reads updateCheckInterval from harness.config.json.
    * Returns undefined if config is missing or does not contain the field.
    * Never throws.
    */
   function readConfigInterval(): number | undefined {
     try {
       const findResult = findConfigFile();
       if (!findResult.ok) return undefined;
       const configResult = loadConfig(findResult.value);
       if (!configResult.ok) return undefined;
       return (configResult.value as Record<string, unknown>).updateCheckInterval as
         | number
         | undefined;
     } catch {
       return undefined;
     }
   }

   /**
    * Called at CLI startup (before parseAsync).
    * Reads cached state, and if the cooldown has elapsed, spawns a
    * background process to query the npm registry for the latest version.
    *
    * All errors are caught silently -- this must never block or crash the CLI.
    */
   export function runUpdateCheckAtStartup(): void {
     try {
       const configInterval = readConfigInterval();
       if (!isUpdateCheckEnabled(configInterval)) return;
       const state = readCheckState();
       const interval = configInterval ?? DEFAULT_INTERVAL_MS;
       if (!shouldRunCheck(state, interval)) return;
       spawnBackgroundCheck(VERSION);
     } catch {
       // Silent -- update checks must never interfere with CLI operation
     }
   }

   /**
    * Called after parseAsync completes.
    * Reads cached state and prints an update notification to stderr if
    * a newer version is available.
    *
    * All errors are caught silently -- this must never block or crash the CLI.
    */
   export function printUpdateNotification(): void {
     try {
       const configInterval = readConfigInterval();
       if (!isUpdateCheckEnabled(configInterval)) return;
       const message = getUpdateNotification(VERSION);
       if (message) {
         process.stderr.write(`\n${message}\n`);
       }
     } catch {
       // Silent -- update checks must never interfere with CLI operation
     }
   }
   ```

5. Run test: `cd packages/cli && npx vitest run tests/bin/update-check-hooks.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(cli): read updateCheckInterval from config in update-check hooks`

### Task 3: Wire config into MCP server update check (TDD)

**Depends on:** Task 1
**Files:** `packages/mcp-server/src/server.ts`, `packages/mcp-server/tests/update-check-hook.test.ts`

1. Add test cases to `packages/mcp-server/tests/update-check-hook.test.ts`. Before the existing `describe` block, add a mock for `fs` and inside the describe block add new tests:

   In the **existing** `beforeEach`, add setup for the config file mock. The MCP server uses `resolveProjectConfig` internally -- but the update check code in `server.ts` currently does not read config. We need to add inline config reading to the update check block. The simplest approach: in the update check block inside `server.ts`, read `harness.config.json` from `resolvedRoot` using the existing `resolveProjectConfig` and extract `updateCheckInterval`.

   Add these test cases at the end of the existing `describe('MCP Update Check Hook', ...)`:

   ```typescript
   it('passes updateCheckInterval from config to isUpdateCheckEnabled and shouldRunCheck', async () => {
     // This test validates that when harness.config.json contains updateCheckInterval,
     // the server passes it through. Since the server reads config internally using
     // resolveProjectConfig, we need to set up a real config file in the temp project path.
     // For simplicity, we verify the mock calls receive the config interval.
     // The actual config reading is tested by verifying the mock call args change
     // when the server has access to a config with updateCheckInterval.

     // Default behavior (no config file at /tmp/test-project) — uses undefined
     const { client } = await createConnectedClient();
     await client.callTool({ name: 'validate_project', arguments: { path: '/tmp/nonexistent' } });

     // isUpdateCheckEnabled should be called with undefined (no config found)
     expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
   });
   ```

   The full approach for MCP: modify the `server.ts` update check block (lines 291-318) to:
   - Import and call `resolveProjectConfig(resolvedRoot)` to get the config
   - Extract `updateCheckInterval` from the config (using index signature `[key: string]: unknown`)
   - Pass it to `isUpdateCheckEnabled(configInterval)` and `shouldRunCheck(state, configInterval ?? DEFAULT_INTERVAL)`

2. Modify `packages/mcp-server/src/server.ts`, in the update check block (around line 291). Replace the current update check block:

   Change **from** (lines 291-318):

   ```typescript
   // On first tool invocation per session, check for updates
   if (!sessionChecked) {
     sessionChecked = true;
     try {
       const {
         getUpdateNotification,
         isUpdateCheckEnabled,
         shouldRunCheck,
         readCheckState,
         spawnBackgroundCheck,
         VERSION,
       } = await import('@harness-engineering/core');

       if (isUpdateCheckEnabled()) {
         const state = readCheckState();
         const DEFAULT_INTERVAL = 86_400_000; // 24 hours
         if (shouldRunCheck(state, DEFAULT_INTERVAL)) {
           spawnBackgroundCheck(VERSION);
         }

         const notification = getUpdateNotification(VERSION);
         if (notification) {
           result.content.push({ type: 'text', text: `\n---\n${notification}` });
         }
       }
     } catch {
       // Graceful degradation — update check failures must never break tool responses
     }
   }
   ```

   Change **to**:

   ```typescript
   // On first tool invocation per session, check for updates
   if (!sessionChecked) {
     sessionChecked = true;
     try {
       const {
         getUpdateNotification,
         isUpdateCheckEnabled,
         shouldRunCheck,
         readCheckState,
         spawnBackgroundCheck,
         VERSION,
       } = await import('@harness-engineering/core');

       // Read updateCheckInterval from project config (if available)
       let configInterval: number | undefined;
       try {
         const configResult = resolveProjectConfig(resolvedRoot);
         if (configResult.ok) {
           const raw = configResult.value.updateCheckInterval;
           if (typeof raw === 'number') {
             configInterval = raw;
           }
         }
       } catch {
         // Config read failure is non-fatal for update checks
       }

       const DEFAULT_INTERVAL = 86_400_000; // 24 hours

       if (isUpdateCheckEnabled(configInterval)) {
         const state = readCheckState();
         if (shouldRunCheck(state, configInterval ?? DEFAULT_INTERVAL)) {
           spawnBackgroundCheck(VERSION);
         }

         const notification = getUpdateNotification(VERSION);
         if (notification) {
           result.content.push({ type: 'text', text: `\n---\n${notification}` });
         }
       }
     } catch {
       // Graceful degradation — update check failures must never break tool responses
     }
   }
   ```

   Note: `resolveProjectConfig` is already imported at the top of server.ts (used by other tools). The `ProjectConfig` interface has `[key: string]: unknown` so accessing `.updateCheckInterval` is valid via the index signature.

3. Add the import for `resolveProjectConfig` at the top of `server.ts`. It is NOT currently imported there (only in individual tool files). Add after the existing imports:

   ```typescript
   import { resolveProjectConfig } from './utils/config-resolver.js';
   ```

4. Run test: `cd packages/mcp-server && npx vitest run tests/update-check-hook.test.ts`
5. Observe: all tests pass (existing tests still pass because `/tmp/test-project` has no config file, so `configInterval` is `undefined`, matching previous behavior).
6. Run: `harness validate`
7. Commit: `feat(mcp): read updateCheckInterval from project config for update checks`

### Task 4: Add integration test for config-driven interval in MCP

**Depends on:** Task 3
**Files:** `packages/mcp-server/tests/update-check-hook.test.ts`

[checkpoint:human-verify] -- Verify Tasks 1-3 pass before adding integration-level config tests.

1. Add a new test to `packages/mcp-server/tests/update-check-hook.test.ts` that creates a real temp directory with a `harness.config.json` containing `updateCheckInterval`, creates a server pointed at that directory, and verifies the interval is passed through.

   Add at the top of the file (after existing imports):

   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';
   ```

   Add a new helper and test block after the existing `describe`:

   ```typescript
   async function createConnectedClientWithConfig(config: Record<string, unknown>) {
     const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-update-config-'));
     fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), JSON.stringify(config));
     const server = createHarnessServer(tmpDir);
     const client = new Client({ name: 'test-client', version: '1.0.0' });
     const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
     await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
     return { client, server, tmpDir };
   }

   describe('MCP Update Check with Config', () => {
     beforeEach(() => {
       vi.clearAllMocks();
       mockIsUpdateCheckEnabled.mockReturnValue(true);
       mockShouldRunCheck.mockReturnValue(true);
       mockReadCheckState.mockReturnValue(null);
       mockGetUpdateNotification.mockReturnValue(null);
       mockSpawnBackgroundCheck.mockReturnValue(undefined);
     });

     it('passes custom interval from config to isUpdateCheckEnabled and shouldRunCheck', async () => {
       const { client, tmpDir } = await createConnectedClientWithConfig({
         version: 1,
         updateCheckInterval: 7200000,
       });

       await client.callTool({ name: 'validate_project', arguments: { path: '/tmp/nonexistent' } });

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(7200000);
       expect(mockShouldRunCheck).toHaveBeenCalledWith(expect.anything(), 7200000);

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('passes 0 interval to disable update checks', async () => {
       mockIsUpdateCheckEnabled.mockReturnValue(false);
       const { client, tmpDir } = await createConnectedClientWithConfig({
         version: 1,
         updateCheckInterval: 0,
       });

       await client.callTool({ name: 'validate_project', arguments: { path: '/tmp/nonexistent' } });

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(0);
       expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();

       fs.rmSync(tmpDir, { recursive: true });
     });

     it('uses default interval when config has no updateCheckInterval', async () => {
       const { client, tmpDir } = await createConnectedClientWithConfig({
         version: 1,
       });

       await client.callTool({ name: 'validate_project', arguments: { path: '/tmp/nonexistent' } });

       expect(mockIsUpdateCheckEnabled).toHaveBeenCalledWith(undefined);
       expect(mockShouldRunCheck).toHaveBeenCalledWith(expect.anything(), 86_400_000);

       fs.rmSync(tmpDir, { recursive: true });
     });
   });
   ```

2. Run test: `cd packages/mcp-server && npx vitest run tests/update-check-hook.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(mcp): add config-driven update check interval tests`
