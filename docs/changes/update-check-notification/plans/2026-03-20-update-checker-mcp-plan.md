# Plan: Update Check Notification — MCP Server Integration (Phase 3)

**Date:** 2026-03-20
**Spec:** docs/changes/update-check-notification/proposal.md
**Phase:** 3 of 5 (MCP integration)
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

MCP server appends an update-available notification to the first tool response per session, and triggers a background version check when the cooldown has elapsed.

## Observable Truths (Acceptance Criteria)

1. When `getUpdateNotification()` returns a non-null string, the first `CallToolRequest` response in a session has the notification appended as a second text content block.
2. When `getUpdateNotification()` returns null, tool responses are unchanged (no extra content blocks).
3. When `shouldRunCheck()` returns true and `isUpdateCheckEnabled()` returns true, `spawnBackgroundCheck()` is called exactly once on the first tool invocation of the session.
4. If `shouldRunCheck()` returns false, `spawnBackgroundCheck()` is not called.
5. The second and subsequent tool invocations in the same session never trigger the update check logic and never append notification text.
6. While `HARNESS_NO_UPDATE_CHECK=1` is set, neither notification nor background check occurs.
7. If any update-checker function throws, the tool response is returned normally without the notification (graceful degradation).
8. `cd packages/mcp-server && pnpm exec vitest run` passes all tests.
9. `cd packages/mcp-server && pnpm exec tsc --noEmit` passes.
10. `harness validate` passes.

## File Map

- MODIFY `packages/mcp-server/src/server.ts` (add update check hook to CallToolRequestSchema handler)
- CREATE `packages/mcp-server/tests/update-check-hook.test.ts` (unit tests for the update check integration)

## Design Decision

The update check logic is injected directly into the `CallToolRequestSchema` handler in `server.ts`. A module-level `let sessionChecked = false` flag tracks whether the first-invocation logic has run. This is simple and correct because:

- Each MCP server process is one session (started per editor/client connection)
- The flag resets naturally when the process restarts
- No new files or abstractions needed — the hook is ~20 lines

The core functions (`getUpdateNotification`, `shouldRunCheck`, `readCheckState`, `spawnBackgroundCheck`, `isUpdateCheckEnabled`, `VERSION`) are imported from `@harness-engineering/core` via dynamic `await import()` (consistent with existing patterns in the codebase) to avoid eager loading.

## Tasks

### Task 1: Create update check hook tests (TDD)

**Depends on:** none
**Files:** `packages/mcp-server/tests/update-check-hook.test.ts`

1. Create test file `packages/mcp-server/tests/update-check-hook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @harness-engineering/core before importing server
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    VERSION: '1.0.0',
    getUpdateNotification: vi.fn(),
    isUpdateCheckEnabled: vi.fn(),
    shouldRunCheck: vi.fn(),
    readCheckState: vi.fn(),
    spawnBackgroundCheck: vi.fn(),
  };
});

import {
  getUpdateNotification,
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  VERSION,
} from '@harness-engineering/core';
import { createHarnessServer } from '../src/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const mockGetUpdateNotification = vi.mocked(getUpdateNotification);
const mockIsUpdateCheckEnabled = vi.mocked(isUpdateCheckEnabled);
const mockShouldRunCheck = vi.mocked(shouldRunCheck);
const mockReadCheckState = vi.mocked(readCheckState);
const mockSpawnBackgroundCheck = vi.mocked(spawnBackgroundCheck);

async function createConnectedClient() {
  const server = createHarnessServer('/tmp/test-project');
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

describe('MCP Update Check Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: update check enabled, cooldown elapsed, notification available
    mockIsUpdateCheckEnabled.mockReturnValue(true);
    mockShouldRunCheck.mockReturnValue(true);
    mockReadCheckState.mockReturnValue(null);
    mockGetUpdateNotification.mockReturnValue(
      'Update available: v1.0.0 \u2192 v1.1.0\nRun "harness update" to upgrade.'
    );
    mockSpawnBackgroundCheck.mockReturnValue(undefined);
  });

  it('appends update notification to first tool response', async () => {
    const { client } = await createConnectedClient();

    // Use validate_project since it exists — will fail but that is fine,
    // we are testing the notification append, not the tool logic
    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);

    // Last text block should be the update notification
    expect(texts[texts.length - 1]).toContain('Update available');
    expect(texts[texts.length - 1]).toContain('harness update');
  });

  it('does not append notification when getUpdateNotification returns null', async () => {
    mockGetUpdateNotification.mockReturnValue(null);
    const { client } = await createConnectedClient();

    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);

    for (const text of texts) {
      expect(text).not.toContain('Update available');
    }
  });

  it('calls spawnBackgroundCheck when shouldRunCheck is true', async () => {
    const { client } = await createConnectedClient();

    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).toHaveBeenCalledOnce();
    expect(mockSpawnBackgroundCheck).toHaveBeenCalledWith(VERSION);
  });

  it('does not call spawnBackgroundCheck when shouldRunCheck is false', async () => {
    mockShouldRunCheck.mockReturnValue(false);
    const { client } = await createConnectedClient();

    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
  });

  it('does not call spawnBackgroundCheck when update check is disabled', async () => {
    mockIsUpdateCheckEnabled.mockReturnValue(false);
    const { client } = await createConnectedClient();

    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
    // Should also not append notification when disabled
    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });
    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);
    for (const text of texts) {
      expect(text).not.toContain('Update available');
    }
  });

  it('only runs update check logic on first tool invocation per session', async () => {
    const { client } = await createConnectedClient();

    // First call — should trigger
    await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });
    expect(mockSpawnBackgroundCheck).toHaveBeenCalledOnce();
    expect(mockGetUpdateNotification).toHaveBeenCalledOnce();

    // Second call — should NOT trigger again
    vi.clearAllMocks();
    mockGetUpdateNotification.mockReturnValue(
      'Update available: v1.0.0 \u2192 v1.1.0\nRun "harness update" to upgrade.'
    );

    const result2 = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(mockSpawnBackgroundCheck).not.toHaveBeenCalled();
    expect(mockGetUpdateNotification).not.toHaveBeenCalled();

    const texts = (result2.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);
    for (const text of texts) {
      expect(text).not.toContain('Update available');
    }
  });

  it('returns normal response if update checker throws', async () => {
    mockGetUpdateNotification.mockImplementation(() => {
      throw new Error('fs read failed');
    });
    const { client } = await createConnectedClient();

    // Should not throw — tool result returned normally
    const result = await client.callTool({
      name: 'validate_project',
      arguments: { path: '/tmp/nonexistent' },
    });

    expect(result.content).toBeDefined();
    expect((result.content as Array<{ type: string; text: string }>).length).toBeGreaterThan(0);
  });
});
```

2. Run test: `cd packages/mcp-server && pnpm exec vitest run tests/update-check-hook.test.ts`
3. Observe: tests fail because `server.ts` does not yet have the update check logic (notification not appended, spawnBackgroundCheck not called).
4. Run: `harness validate`
5. Commit: `test(mcp-server): add update check hook tests`

**Note:** The tests use `InMemoryTransport` from the MCP SDK to create a real client-server pair. If this import is not available, fall back to directly calling the handler. Check with `cd packages/mcp-server && node -e "import('@modelcontextprotocol/sdk/inMemory.js').then(m => console.log(Object.keys(m))).catch(e => console.error('NOT AVAILABLE:', e.message))"` first.

**Fallback:** If `InMemoryTransport` is not available, restructure tests to extract the handler logic into a testable function and test that directly, without the full client-server setup.

### Task 2: Implement update check hook in server.ts

**Depends on:** Task 1
**Files:** `packages/mcp-server/src/server.ts`

1. Add the update check logic to `server.ts`. The changes are:

   a. Add a `let sessionChecked = false;` module-level flag inside `createHarnessServer()` (scoped per server instance, not globally).

   b. Modify the `CallToolRequestSchema` handler to check-and-set the flag on first invocation.

   The modified `createHarnessServer` function should look like this (showing only the changed section):

```typescript
export function createHarnessServer(projectRoot?: string): Server {
  const resolvedRoot = projectRoot ?? process.cwd();
  let sessionChecked = false;

  const server = new Server(
    { name: 'harness-engineering', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = TOOL_HANDLERS[name];
    if (!handler) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    const result = await handler(args ?? {});

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

    return result as Promise<never>;
  });

  // ... rest of handler registrations unchanged
```

2. Run test: `cd packages/mcp-server && pnpm exec vitest run tests/update-check-hook.test.ts`
3. Observe: all 7 tests pass.
4. Run: `harness validate`
5. Commit: `feat(mcp-server): add update notification to first tool response per session`

### Task 3: Verify full test suite and typecheck

**Depends on:** Task 2
**Files:** none (verification only)

[checkpoint:human-verify] — Verify all tests pass and no regressions.

1. Rebuild core if needed: `cd packages/core && pnpm run build`
2. Run typecheck: `cd packages/mcp-server && pnpm exec tsc --noEmit`
3. Observe: no type errors.
4. Run full test suite: `cd packages/mcp-server && pnpm exec vitest run`
5. Observe: all tests pass (existing + 7 new).
6. Run: `harness validate`
7. Run: `harness check-deps`
8. Observe: all pass.
9. Commit (if any fixes were needed): `fix(mcp-server): address typecheck/test issues from update check hook`

### Task 4: End-to-end smoke test

**Depends on:** Task 3
**Files:** none (manual verification)

[checkpoint:human-verify] — Manual smoke test to confirm MCP notification works.

1. Build the MCP server: `cd packages/mcp-server && pnpm run build`
2. Create a fake update-check.json to simulate an available update:
   ```bash
   mkdir -p ~/.harness
   echo '{"lastCheckTime":0,"latestVersion":"99.0.0","currentVersion":"0.8.0"}' > ~/.harness/update-check.json
   ```
3. Start the MCP server and send a tool call (via stdio or test client). The first tool response should include the notification text `Update available: v0.8.0 -> v99.0.0`.
4. Send a second tool call. It should NOT include the notification.
5. Clean up: `rm ~/.harness/update-check.json`
6. Run: `harness validate`

## Traceability

| Observable Truth                                        | Delivered by                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. First response has notification appended             | Task 2 implementation, Task 1 test "appends update notification" |
| 2. No notification when null                            | Task 1 test "does not append notification when null"             |
| 3. spawnBackgroundCheck called when shouldRunCheck true | Task 1 test "calls spawnBackgroundCheck"                         |
| 4. No spawn when shouldRunCheck false                   | Task 1 test "does not call spawnBackgroundCheck when false"      |
| 5. Only first invocation triggers                       | Task 1 test "only runs on first tool invocation"                 |
| 6. HARNESS_NO_UPDATE_CHECK suppresses all               | Task 1 test "disabled"                                           |
| 7. Graceful degradation on throw                        | Task 1 test "returns normal response if checker throws"          |
| 8. vitest passes                                        | Task 3 full suite run                                            |
| 9. tsc passes                                           | Task 3 typecheck                                                 |
| 10. harness validate passes                             | Every task                                                       |
