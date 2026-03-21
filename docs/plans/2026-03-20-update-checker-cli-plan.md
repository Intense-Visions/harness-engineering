# Plan: Update Checker CLI Integration (Phase 2)

**Date:** 2026-03-20
**Spec:** docs/changes/update-check-notification/proposal.md
**Phase:** 2 of 5 (CLI integration)
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Wire `spawnBackgroundCheck()` and `getUpdateNotification()` from `@harness-engineering/core` into the CLI entry point (`packages/cli/src/bin/harness.ts`) so that users see update notifications on stderr and background version checks run automatically.

## Observable Truths (Acceptance Criteria)

1. When a cached update-check state file exists with `latestVersion` strictly greater than the current `VERSION`, the CLI shall print the update notification to stderr after command execution completes.
2. When `shouldRunCheck()` returns true at startup, the CLI shall call `spawnBackgroundCheck(VERSION)` before `program.parseAsync()`.
3. When `HARNESS_NO_UPDATE_CHECK=1` is set, the CLI shall not call `spawnBackgroundCheck()` and shall not print any update notification.
4. When `getUpdateNotification()` returns null (no update, missing state, equal versions), the CLI shall not print anything extra to stderr.
5. The update notification shall go to stderr (not stdout), so piped output (e.g. `harness validate --json | jq .`) is not polluted.
6. The background check shall be fire-and-forget -- it shall not delay CLI startup or exit.
7. If any update-check function throws unexpectedly, the CLI shall not crash -- errors are caught silently.
8. `cd packages/cli && pnpm exec vitest run tests/bin/harness-update-check.test.ts` shall pass with all tests green.
9. `cd packages/cli && pnpm exec tsc --noEmit` shall pass.
10. `harness validate` shall pass.

## File Map

- MODIFY `packages/cli/src/bin/harness.ts` (add update check logic)
- CREATE `packages/cli/tests/bin/harness-update-check.test.ts` (unit tests for the wired behavior)

## Tasks

### Task 1: Write unit tests for update-check integration in CLI entry point

**Depends on:** none (Phase 1 complete)
**Files:** `packages/cli/tests/bin/harness-update-check.test.ts`

The test strategy: We test the `main()` function behavior by extracting the update-check logic into a testable helper. However, since `harness.ts` is a thin entry point, we instead test the wiring at the unit level by mocking the core module functions and verifying they are called correctly. We use `vi.mock` to mock `@harness-engineering/core` exports.

1. Create test file `packages/cli/tests/bin/harness-update-check.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the core module before importing the function under test
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    isUpdateCheckEnabled: vi.fn(() => true),
    shouldRunCheck: vi.fn(() => false),
    readCheckState: vi.fn(() => null),
    spawnBackgroundCheck: vi.fn(),
    getUpdateNotification: vi.fn(() => null),
    VERSION: '1.7.0',
  };
});

import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
  VERSION,
} from '@harness-engineering/core';
import { runUpdateCheckAtStartup, printUpdateNotification } from '../../src/bin/update-check-hooks';

describe('update-check CLI hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runUpdateCheckAtStartup', () => {
    it('calls spawnBackgroundCheck when enabled and shouldRunCheck is true', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(readCheckState).mockReturnValue(null);
      vi.mocked(shouldRunCheck).mockReturnValue(true);

      runUpdateCheckAtStartup();

      expect(isUpdateCheckEnabled).toHaveBeenCalled();
      expect(readCheckState).toHaveBeenCalled();
      expect(shouldRunCheck).toHaveBeenCalled();
      expect(spawnBackgroundCheck).toHaveBeenCalledWith(VERSION);
    });

    it('does not call spawnBackgroundCheck when isUpdateCheckEnabled returns false', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(false);

      runUpdateCheckAtStartup();

      expect(spawnBackgroundCheck).not.toHaveBeenCalled();
    });

    it('does not call spawnBackgroundCheck when shouldRunCheck returns false', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(readCheckState).mockReturnValue({
        lastCheckTime: Date.now(),
        latestVersion: '1.7.0',
        currentVersion: '1.7.0',
      });
      vi.mocked(shouldRunCheck).mockReturnValue(false);

      runUpdateCheckAtStartup();

      expect(spawnBackgroundCheck).not.toHaveBeenCalled();
    });

    it('does not crash if readCheckState throws unexpectedly', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(readCheckState).mockImplementation(() => {
        throw new Error('unexpected');
      });

      expect(() => runUpdateCheckAtStartup()).not.toThrow();
      expect(spawnBackgroundCheck).not.toHaveBeenCalled();
    });
  });

  describe('printUpdateNotification', () => {
    let stderrSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stderrSpy.mockRestore();
    });

    it('prints notification to stderr when getUpdateNotification returns a message', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(getUpdateNotification).mockReturnValue(
        'Update available: v1.7.0 \u2192 v1.8.0\nRun "harness update" to upgrade.'
      );

      printUpdateNotification();

      expect(stderrSpy).toHaveBeenCalledWith(
        '\nUpdate available: v1.7.0 \u2192 v1.8.0\nRun "harness update" to upgrade.\n'
      );
    });

    it('does not print when getUpdateNotification returns null', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(getUpdateNotification).mockReturnValue(null);

      printUpdateNotification();

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('does not print when isUpdateCheckEnabled returns false', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(false);

      printUpdateNotification();

      expect(stderrSpy).not.toHaveBeenCalled();
      expect(getUpdateNotification).not.toHaveBeenCalled();
    });

    it('does not crash if getUpdateNotification throws unexpectedly', () => {
      vi.mocked(isUpdateCheckEnabled).mockReturnValue(true);
      vi.mocked(getUpdateNotification).mockImplementation(() => {
        throw new Error('unexpected');
      });

      expect(() => printUpdateNotification()).not.toThrow();
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });
});
```

2. Run test: `cd packages/cli && pnpm exec vitest run tests/bin/harness-update-check.test.ts`
3. Observe failure: `update-check-hooks` module does not exist yet
4. Run: `harness validate`

---

### Task 2: Create the update-check-hooks module

**Depends on:** Task 1
**Files:** `packages/cli/src/bin/update-check-hooks.ts`

This module extracts the update-check wiring into two testable functions. The entry point (`harness.ts`) calls them, and tests mock the core module to verify behavior.

1. Create `packages/cli/src/bin/update-check-hooks.ts`:

```typescript
import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
  VERSION,
} from '@harness-engineering/core';

const DEFAULT_INTERVAL_MS = 86_400_000; // 24 hours

/**
 * Called at CLI startup (before parseAsync).
 * Reads cached state, and if the cooldown has elapsed, spawns a
 * background process to query the npm registry for the latest version.
 *
 * All errors are caught silently -- this must never block or crash the CLI.
 */
export function runUpdateCheckAtStartup(): void {
  try {
    if (!isUpdateCheckEnabled()) return;
    const state = readCheckState();
    if (!shouldRunCheck(state, DEFAULT_INTERVAL_MS)) return;
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
    if (!isUpdateCheckEnabled()) return;
    const message = getUpdateNotification(VERSION);
    if (message) {
      process.stderr.write(`\n${message}\n`);
    }
  } catch {
    // Silent -- update checks must never interfere with CLI operation
  }
}
```

2. Run test: `cd packages/cli && pnpm exec vitest run tests/bin/harness-update-check.test.ts`
3. Observe: all tests pass
4. Run: `cd packages/cli && pnpm exec tsc --noEmit`
5. Run: `harness validate`
6. Commit: `feat(cli): add update-check-hooks module with startup and notification helpers`

---

### Task 3: Wire hooks into harness.ts entry point

**Depends on:** Task 2
**Files:** `packages/cli/src/bin/harness.ts`

1. Modify `packages/cli/src/bin/harness.ts` to the following:

```typescript
#!/usr/bin/env node
import { createProgram, handleError } from '../index';
import { runUpdateCheckAtStartup, printUpdateNotification } from './update-check-hooks';

async function main(): Promise<void> {
  // Fire-and-forget: spawn background version check if cooldown elapsed
  runUpdateCheckAtStartup();

  const program = createProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    handleError(error);
  }

  // Show update notification from previous check's cached result
  printUpdateNotification();
}

void main();
```

2. Run: `cd packages/cli && pnpm exec vitest run tests/bin/harness-update-check.test.ts`
3. Run: `cd packages/cli && pnpm exec tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(cli): wire update-check hooks into CLI entry point`

---

### Task 4: Full integration verification

**Depends on:** Task 3

[checkpoint:human-verify] -- Verify all tests pass and typecheck succeeds before marking Phase 2 complete.

1. Run full CLI test suite: `cd packages/cli && pnpm exec vitest run`
2. Run typecheck: `cd packages/cli && pnpm exec tsc --noEmit`
3. Run: `harness validate`
4. Run: `harness check-deps`
5. Manually verify: Run `harness --version` to confirm CLI still works normally (no stderr output when no state file exists).
6. No commit needed; this is a verification task.

## Design Notes

### Why extract to `update-check-hooks.ts` instead of inlining in `harness.ts`

The entry point `harness.ts` is intentionally minimal (7 lines before this change). Extracting the update-check logic into a separate module (`update-check-hooks.ts`) provides:

- **Testability:** The hooks can be unit tested by mocking `@harness-engineering/core` without needing to spawn the actual CLI binary or mock Commander.
- **Separation of concerns:** `harness.ts` remains a thin orchestrator; the update-check logic is self-contained.
- **Reusability:** If the MCP server needs similar hooks (Phase 3), the pattern is established.

### Why stderr, not stdout

Per the spec: "CLI notification via stderr; MCP notification via inline text in tool result." Using `process.stderr.write()` instead of `console.error()` avoids the extra newline that `console.error` adds and gives precise control over formatting. This ensures that piped stdout (e.g., `harness validate --json | jq .`) is never polluted.

### Why `isUpdateCheckEnabled()` is called in both hooks

Both `runUpdateCheckAtStartup` and `printUpdateNotification` gate on `isUpdateCheckEnabled()` as an early exit. This means when `HARNESS_NO_UPDATE_CHECK=1` is set:

- No state file is read
- No background process is spawned
- No notification is printed
- Zero overhead

### Why `DEFAULT_INTERVAL_MS` is hardcoded (not from config)

Phase 4 of the spec adds `updateCheckInterval` to `harness.config.json`. In Phase 2, we use the default 24-hour interval. When Phase 4 is implemented, the hooks module will be updated to read the config value and pass it to `shouldRunCheck()` and `isUpdateCheckEnabled()`.

### Error resilience

Both hooks wrap their entire body in `try/catch` with empty catch blocks. This is intentional -- the spec states: "Background process failures are silent -- network errors, registry timeouts, or permission issues never surface to the user." If any core function throws an unexpected error (e.g., filesystem permission denied during `readCheckState`), the CLI continues normally.
