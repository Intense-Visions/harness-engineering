# Plan: First-Run Detection (Onboarding Phase 1)

**Date:** 2026-03-28
**Spec:** docs/changes/onboarding-funnel/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

When any `harness` command runs for the first time (no `~/.harness/.setup-complete` marker), a welcome message appears on stderr directing users to `harness setup`. The message is suppressed in CI and with `--quiet`.

## Observable Truths (Acceptance Criteria)

1. When `~/.harness/.setup-complete` does not exist and `CI` is unset and `--quiet` is not passed, the system shall write `Welcome to harness! Run \`harness setup\` to get started.\n` to stderr.
2. When `~/.harness/.setup-complete` exists, the system shall not print the welcome message.
3. When `CI` environment variable is set (any truthy value), the system shall not print the welcome message.
4. When `--quiet` is present in `process.argv`, the system shall not print the welcome message.
5. When `markSetupComplete()` is called, the system shall create `~/.harness/.setup-complete` (and the `~/.harness/` directory if absent).
6. When `markSetupComplete()` is called twice, the second call shall succeed without error (idempotent).
7. `pnpm run test --filter @harness-engineering/cli` passes with all existing tests plus new first-run tests.

## File Map

- CREATE `packages/cli/src/utils/first-run.ts`
- CREATE `packages/cli/tests/utils/first-run.test.ts`
- MODIFY `packages/cli/src/bin/harness.ts` (add `printFirstRunWelcome()` call)

## Tasks

### Task 1: Create first-run utility with tests (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/utils/first-run.test.ts`, `packages/cli/src/utils/first-run.ts`

1. Create test file `packages/cli/tests/utils/first-run.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock fs and os before importing the module
vi.mock('fs');
vi.mock('os');

const mockExistsSync = vi.mocked(fs.existsSync);
const mockWriteFileSync = vi.mocked(fs.writeFileSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockHomedir = vi.mocked(os.homedir);

describe('first-run', () => {
  let stderrWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue('/home/testuser');
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Clear CI and quiet by default
    delete process.env.CI;
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
  });

  describe('isFirstRun', () => {
    it('returns true when marker file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      const { isFirstRun } = await import('../../src/utils/first-run');
      expect(isFirstRun()).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith(
        path.join('/home/testuser', '.harness', '.setup-complete')
      );
    });

    it('returns false when marker file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const { isFirstRun } = await import('../../src/utils/first-run');
      expect(isFirstRun()).toBe(false);
    });
  });

  describe('markSetupComplete', () => {
    it('creates directory and writes marker file', async () => {
      const { markSetupComplete } = await import('../../src/utils/first-run');
      markSetupComplete();
      expect(mockMkdirSync).toHaveBeenCalledWith(path.join('/home/testuser', '.harness'), {
        recursive: true,
      });
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        path.join('/home/testuser', '.harness', '.setup-complete'),
        '',
        'utf-8'
      );
    });
  });

  describe('printFirstRunWelcome', () => {
    it('prints welcome when first run and not CI and not quiet', async () => {
      mockExistsSync.mockReturnValue(false);
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        'Welcome to harness! Run `harness setup` to get started.\n'
      );
    });

    it('does not print when marker exists', async () => {
      mockExistsSync.mockReturnValue(true);
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('does not print when CI env is set', async () => {
      mockExistsSync.mockReturnValue(false);
      process.env.CI = 'true';
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
      delete process.env.CI;
    });

    it('does not print when --quiet is in argv', async () => {
      mockExistsSync.mockReturnValue(false);
      const originalArgv = process.argv;
      process.argv = ['node', 'harness', '--quiet', 'validate'];
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      printFirstRunWelcome();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
      process.argv = originalArgv;
    });

    it('never throws even if fs operations fail', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('EACCES');
      });
      const { printFirstRunWelcome } = await import('../../src/utils/first-run');
      expect(() => printFirstRunWelcome()).not.toThrow();
    });
  });
});
```

Note: Because vitest caches modules, each test imports via `await import()` after mocks are set. If module caching is an issue, use `vi.resetModules()` in `beforeEach`. Adjust based on how the test runner behaves -- the key invariant is that each test controls its own mock state.

2. Run test: `cd packages/cli && pnpm vitest run tests/utils/first-run.test.ts`
3. Observe failure: module `../../src/utils/first-run` does not exist.
4. Create implementation `packages/cli/src/utils/first-run.ts`:

```typescript
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HARNESS_DIR = path.join(os.homedir(), '.harness');
const MARKER_FILE = path.join(HARNESS_DIR, '.setup-complete');

/**
 * Returns true if this is the first run (marker file absent).
 */
export function isFirstRun(): boolean {
  return !fs.existsSync(MARKER_FILE);
}

/**
 * Writes the setup-complete marker file.
 * Creates ~/.harness/ if it does not exist.
 * Idempotent -- safe to call multiple times.
 */
export function markSetupComplete(): void {
  fs.mkdirSync(HARNESS_DIR, { recursive: true });
  fs.writeFileSync(MARKER_FILE, '', 'utf-8');
}

/**
 * Prints a one-line welcome message to stderr if:
 * - The setup-complete marker is absent (first run)
 * - The CI environment variable is not set
 * - --quiet is not in process.argv
 *
 * Never throws -- this must not interfere with CLI operation.
 */
export function printFirstRunWelcome(): void {
  try {
    if (!isFirstRun()) return;
    if (process.env.CI) return;
    if (process.argv.includes('--quiet')) return;
    process.stderr.write('Welcome to harness! Run `harness setup` to get started.\n');
  } catch {
    // Silent -- first-run check must never interfere with CLI operation
  }
}
```

5. Run test: `cd packages/cli && pnpm vitest run tests/utils/first-run.test.ts`
6. Observe: all tests pass.
7. Run: `pnpm run test --filter @harness-engineering/cli` (full suite, no regressions).
8. Commit: `feat(cli): add first-run detection utility`

### Task 2: Wire first-run check into CLI entry point

**Depends on:** Task 1
**Files:** `packages/cli/src/bin/harness.ts`

1. Modify `packages/cli/src/bin/harness.ts` to add the import and call. The file should become:

```typescript
#!/usr/bin/env node
import { createProgram, handleError } from '../index';
import { runUpdateCheckAtStartup, printUpdateNotification } from './update-check-hooks';
import { printFirstRunWelcome } from '../utils/first-run';

async function main(): Promise<void> {
  // Show welcome message on first run (before any other output)
  printFirstRunWelcome();

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

Key: `printFirstRunWelcome()` goes before `runUpdateCheckAtStartup()` so the welcome is the very first thing a new user sees.

2. Run: `pnpm run test --filter @harness-engineering/cli` (full suite, no regressions).
3. Commit: `feat(cli): wire first-run welcome into CLI entry point`

### Task 3: Add integration-style test for the entry point wiring

**Depends on:** Task 2
**Files:** `packages/cli/tests/bin/first-run-integration.test.ts`

1. Create `packages/cli/tests/bin/first-run-integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the first-run module to verify it is called from harness.ts
vi.mock('../../src/utils/first-run', () => ({
  printFirstRunWelcome: vi.fn(),
}));

// Mock update-check-hooks to prevent side effects
vi.mock('../../src/bin/update-check-hooks', () => ({
  runUpdateCheckAtStartup: vi.fn(),
  printUpdateNotification: vi.fn(),
}));

// Mock the index module to prevent Commander from parsing real argv
vi.mock('../../src/index', () => ({
  createProgram: vi.fn(() => ({
    parseAsync: vi.fn().mockResolvedValue(undefined),
  })),
  handleError: vi.fn(),
}));

import { printFirstRunWelcome } from '../../src/utils/first-run';
import { runUpdateCheckAtStartup } from '../../src/bin/update-check-hooks';

const mockPrintFirstRunWelcome = vi.mocked(printFirstRunWelcome);
const mockRunUpdateCheckAtStartup = vi.mocked(runUpdateCheckAtStartup);

describe('harness.ts entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls printFirstRunWelcome before runUpdateCheckAtStartup', async () => {
    const callOrder: string[] = [];
    mockPrintFirstRunWelcome.mockImplementation(() => {
      callOrder.push('firstRun');
    });
    mockRunUpdateCheckAtStartup.mockImplementation(() => {
      callOrder.push('updateCheck');
    });

    // Dynamically import to trigger main()
    await import('../../src/bin/harness');

    // Wait for the void main() promise to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockPrintFirstRunWelcome).toHaveBeenCalledTimes(1);
    expect(callOrder[0]).toBe('firstRun');
    expect(callOrder[1]).toBe('updateCheck');
  });
});
```

Note: This test verifies the wiring and call order. The dynamic import of `harness.ts` triggers `void main()`. The 50ms timeout allows the async `main()` to settle. If this approach causes flakiness, an alternative is to refactor `main()` as an exported function and test it directly -- but match the existing pattern first.

2. Run: `cd packages/cli && pnpm vitest run tests/bin/first-run-integration.test.ts`
3. Observe: test passes.
4. Run: `pnpm run test --filter @harness-engineering/cli` (full suite, no regressions).
5. Commit: `test(cli): add integration test for first-run wiring`
