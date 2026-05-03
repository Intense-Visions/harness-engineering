# Plan: Update Checker Core Module

**Date:** 2026-03-20
**Spec:** docs/changes/update-check-notification/proposal.md
**Phase:** 1 of 5 (Core module)
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Create `packages/core/src/update-checker.ts` exporting five functions (`isUpdateCheckEnabled`, `shouldRunCheck`, `readCheckState`, `spawnBackgroundCheck`, `getUpdateNotification`) and re-export from `packages/core/src/index.ts`, with comprehensive unit tests.

## Observable Truths (Acceptance Criteria)

1. When `HARNESS_NO_UPDATE_CHECK=1` is set, `isUpdateCheckEnabled()` shall return `false`.
2. When `updateCheckInterval` is `0`, `isUpdateCheckEnabled({ updateCheckInterval: 0 })` shall return `false`.
3. When neither env var nor zero-interval config is present, `isUpdateCheckEnabled()` shall return `true`.
4. When `lastCheckTime + intervalMs > Date.now()`, `shouldRunCheck(state, intervalMs)` shall return `false`.
5. When `lastCheckTime + intervalMs <= Date.now()`, `shouldRunCheck(state, intervalMs)` shall return `true`.
6. When `state` is `null`, `shouldRunCheck(null, intervalMs)` shall return `true` (never checked before).
7. When `~/.harness/update-check.json` exists with valid JSON, `readCheckState()` shall return the parsed `UpdateCheckState`.
8. When `~/.harness/update-check.json` is missing, `readCheckState()` shall return `null`.
9. When `~/.harness/update-check.json` contains corrupt JSON, `readCheckState()` shall return `null` (no throw).
10. `spawnBackgroundCheck()` shall call `child_process.spawn` with `node` and a `-e` inline script, with `detached: true` and `stdio: 'ignore'`, and call `child.unref()`.
11. When `latestVersion` is strictly greater than `currentVersion`, `getUpdateNotification()` shall return a string containing both versions and `"harness update"`.
12. When `latestVersion` equals `currentVersion`, `getUpdateNotification()` shall return `null`.
13. When `latestVersion` is less than `currentVersion`, `getUpdateNotification()` shall return `null`.
14. When state file is missing or corrupt, `getUpdateNotification()` shall return `null`.
15. `packages/core/src/index.ts` shall re-export from `./update-checker`.
16. `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts` shall pass with all tests green.
17. `cd packages/core && npx tsc --noEmit` shall pass.
18. `harness validate` shall pass.

## File Map

- CREATE `packages/core/src/update-checker.ts`
- CREATE `packages/core/tests/update-checker/update-checker.test.ts`
- MODIFY `packages/core/src/index.ts` (add re-export)

## Tasks

### Task 1: Define UpdateCheckState interface and pure functions (isUpdateCheckEnabled, shouldRunCheck)

**Depends on:** none
**Files:** `packages/core/src/update-checker.ts`, `packages/core/tests/update-checker/update-checker.test.ts`

1. Create test file `packages/core/tests/update-checker/update-checker.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  type UpdateCheckState,
} from '../../src/update-checker';

describe('isUpdateCheckEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false when HARNESS_NO_UPDATE_CHECK=1', () => {
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    expect(isUpdateCheckEnabled()).toBe(false);
  });

  it('returns false when configInterval is 0', () => {
    expect(isUpdateCheckEnabled(0)).toBe(false);
  });

  it('returns true when env var is not set and interval is positive', () => {
    delete process.env['HARNESS_NO_UPDATE_CHECK'];
    expect(isUpdateCheckEnabled(86400000)).toBe(true);
  });

  it('returns true when env var is not set and no interval provided', () => {
    delete process.env['HARNESS_NO_UPDATE_CHECK'];
    expect(isUpdateCheckEnabled()).toBe(true);
  });

  it('returns false when env var is set even if interval is positive', () => {
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    expect(isUpdateCheckEnabled(86400000)).toBe(false);
  });
});

describe('shouldRunCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when state is null (never checked)', () => {
    expect(shouldRunCheck(null, 86400000)).toBe(true);
  });

  it('returns false when interval has not elapsed', () => {
    vi.setSystemTime(new Date(100_000));
    const state: UpdateCheckState = {
      lastCheckTime: 50_000,
      latestVersion: '1.0.0',
      currentVersion: '1.0.0',
    };
    // 50_000 + 86400000 > 100_000 => not elapsed
    expect(shouldRunCheck(state, 86400000)).toBe(false);
  });

  it('returns true when interval has elapsed', () => {
    vi.setSystemTime(new Date(100_000_000));
    const state: UpdateCheckState = {
      lastCheckTime: 1_000,
      latestVersion: '1.0.0',
      currentVersion: '1.0.0',
    };
    // 1_000 + 86400000 < 100_000_000 => elapsed
    expect(shouldRunCheck(state, 86400000)).toBe(true);
  });

  it('returns true when interval has exactly elapsed', () => {
    vi.setSystemTime(new Date(86401000));
    const state: UpdateCheckState = {
      lastCheckTime: 1000,
      latestVersion: '1.0.0',
      currentVersion: '1.0.0',
    };
    // 1000 + 86400000 = 86401000 = Date.now() => elapsed (<=)
    expect(shouldRunCheck(state, 86400000)).toBe(true);
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts`
3. Observe failure: `isUpdateCheckEnabled` and `shouldRunCheck` are not exported

4. Create implementation file `packages/core/src/update-checker.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateCheckState {
  lastCheckTime: number;
  latestVersion: string | null;
  currentVersion: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_DIR = path.join(os.homedir(), '.harness');
const STATE_FILE = path.join(STATE_DIR, 'update-check.json');
const DEFAULT_INTERVAL_MS = 86_400_000; // 24 hours

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Returns false if the HARNESS_NO_UPDATE_CHECK env var is set to "1"
 * or the configured interval is 0 (disabled).
 */
export function isUpdateCheckEnabled(configInterval?: number): boolean {
  if (process.env['HARNESS_NO_UPDATE_CHECK'] === '1') return false;
  if (configInterval === 0) return false;
  return true;
}

/**
 * Returns true when enough time has passed since the last check.
 * If state is null (never checked), returns true.
 */
export function shouldRunCheck(state: UpdateCheckState | null, intervalMs: number): boolean {
  if (state === null) return true;
  return state.lastCheckTime + intervalMs <= Date.now();
}
```

(Leave the file with only these two functions for now; remaining functions will be added in subsequent tasks.)

5. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts`
6. Observe: all tests pass
7. Run: `cd packages/core && npx tsc --noEmit`
8. Run: `harness validate`
9. Commit: `feat(core): add UpdateCheckState type, isUpdateCheckEnabled, shouldRunCheck`

---

### Task 2: Implement readCheckState with filesystem tests

**Depends on:** Task 1
**Files:** `packages/core/src/update-checker.ts`, `packages/core/tests/update-checker/update-checker.test.ts`

1. Append tests to `packages/core/tests/update-checker/update-checker.test.ts`:

```typescript
import {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  type UpdateCheckState,
} from '../../src/update-checker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ... (keep existing describe blocks, add new ones below)

describe('readCheckState', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-update-'));
    originalHome = os.homedir();
    // We need to override the state file path used by readCheckState.
    // The module reads from ~/.harness/update-check.json.
    // We override HOME so os.homedir() returns our tmp dir.
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null when state file does not exist', () => {
    expect(readCheckState()).toBeNull();
  });

  it('returns parsed state when file is valid', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const state: UpdateCheckState = {
      lastCheckTime: 1000,
      latestVersion: '1.8.0',
      currentVersion: '1.7.0',
    };
    fs.writeFileSync(path.join(harnessDir, 'update-check.json'), JSON.stringify(state));
    expect(readCheckState()).toEqual(state);
  });

  it('returns null when file contains invalid JSON', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'update-check.json'), 'not-json{{{');
    expect(readCheckState()).toBeNull();
  });

  it('returns null when file has wrong shape', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({ unrelated: true })
    );
    // Missing required fields; readCheckState should treat as corrupt
    expect(readCheckState()).toBeNull();
  });
});
```

**Important implementation note:** Because `readCheckState` reads from `os.homedir()` and we override `HOME` in the test, the function must compute the path at call time, not at module load time. Refactor `STATE_DIR` and `STATE_FILE` from module-level constants into a helper function:

2. Modify `packages/core/src/update-checker.ts` to add `readCheckState`:
   - Replace the module-level `STATE_DIR` / `STATE_FILE` constants with a helper:

     ```typescript
     function getStatePath(): string {
       return path.join(os.homedir(), '.harness', 'update-check.json');
     }
     ```

   - Add `readCheckState`:
     ```typescript
     /**
      * Reads the update check state from ~/.harness/update-check.json.
      * Returns null if the file is missing, unreadable, or has invalid content.
      */
     export function readCheckState(): UpdateCheckState | null {
       try {
         const raw = fs.readFileSync(getStatePath(), 'utf-8');
         const parsed: unknown = JSON.parse(raw);
         if (
           typeof parsed === 'object' &&
           parsed !== null &&
           'lastCheckTime' in parsed &&
           typeof (parsed as UpdateCheckState).lastCheckTime === 'number' &&
           'currentVersion' in parsed &&
           typeof (parsed as UpdateCheckState).currentVersion === 'string'
         ) {
           const state = parsed as UpdateCheckState;
           return {
             lastCheckTime: state.lastCheckTime,
             latestVersion: typeof state.latestVersion === 'string' ? state.latestVersion : null,
             currentVersion: state.currentVersion,
           };
         }
         return null;
       } catch {
         return null;
       }
     }
     ```

3. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts`
4. Observe: all tests pass (including new readCheckState tests)
5. Run: `cd packages/core && npx tsc --noEmit`
6. Run: `harness validate`
7. Commit: `feat(core): add readCheckState with graceful error handling`

---

### Task 3: Implement spawnBackgroundCheck with mocked child_process

**Depends on:** Task 2
**Files:** `packages/core/src/update-checker.ts`, `packages/core/tests/update-checker/update-checker.test.ts`

1. Append tests to the test file:

```typescript
import { spawnBackgroundCheck } from '../../src/update-checker';
import * as child_process from 'child_process';

// ... add to test file

describe('spawnBackgroundCheck', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spawn-'));
    originalHome = os.homedir();
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('spawns a detached node process with unref', () => {
    const unrefMock = vi.fn();
    const spawnSpy = vi.spyOn(child_process, 'spawn').mockReturnValue({
      unref: unrefMock,
      pid: 12345,
      stdin: null,
      stdout: null,
      stderr: null,
    } as unknown as child_process.ChildProcess);

    spawnBackgroundCheck('1.7.0');

    expect(spawnSpy).toHaveBeenCalledOnce();
    const [cmd, args, opts] = spawnSpy.mock.calls[0]!;
    expect(cmd).toBe(process.execPath);
    expect(args![0]).toBe('-e');
    expect(typeof args![1]).toBe('string');
    expect(opts).toMatchObject({
      detached: true,
      stdio: 'ignore',
    });
    expect(unrefMock).toHaveBeenCalledOnce();

    spawnSpy.mockRestore();
  });

  it('inline script references npm view and the state file path', () => {
    const unrefMock = vi.fn();
    const spawnSpy = vi.spyOn(child_process, 'spawn').mockReturnValue({
      unref: unrefMock,
      pid: 12345,
      stdin: null,
      stdout: null,
      stderr: null,
    } as unknown as child_process.ChildProcess);

    spawnBackgroundCheck('1.7.0');

    const script = spawnSpy.mock.calls[0]![1]![1] as string;
    expect(script).toContain('npm');
    expect(script).toContain('@harness-engineering/cli');
    expect(script).toContain('update-check.json');

    spawnSpy.mockRestore();
  });
});
```

2. Add `spawnBackgroundCheck` to `packages/core/src/update-checker.ts`:

```typescript
/**
 * Spawns a detached background Node process that:
 * 1. Queries npm registry for the latest version of @harness-engineering/cli
 * 2. Writes the result to ~/.harness/update-check.json
 * 3. Exits silently on any failure
 *
 * The parent calls child.unref() so the child does not block process exit.
 */
export function spawnBackgroundCheck(currentVersion: string): void {
  const statePath = getStatePath();
  const stateDir = path.dirname(statePath);

  // The inline script is a self-contained Node program.
  // It must handle all errors internally so the user never sees failures.
  const script = `
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
try {
  const latest = execSync('npm view @harness-engineering/cli dist-tags.latest', {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const stateDir = ${JSON.stringify(stateDir)};
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    ${JSON.stringify(statePath)},
    JSON.stringify({
      lastCheckTime: Date.now(),
      latestVersion: latest || null,
      currentVersion: ${JSON.stringify(currentVersion)},
    })
  );
} catch (_) {}
`.trim();

  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
```

**Important design note:** `spawnBackgroundCheck` takes `currentVersion` as a parameter rather than importing `VERSION` directly. This keeps the function pure and testable; the caller (CLI/MCP integration in Phase 2) passes `VERSION`.

3. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts`
4. Observe: all tests pass
5. Run: `cd packages/core && npx tsc --noEmit`
6. Run: `harness validate`
7. Commit: `feat(core): add spawnBackgroundCheck with detached child process`

---

### Task 4: Implement getUpdateNotification with semver comparison

**Depends on:** Task 2
**Files:** `packages/core/src/update-checker.ts`, `packages/core/tests/update-checker/update-checker.test.ts`

**Design decision:** Rather than adding a `semver` dependency, implement a minimal `compareVersions(a, b)` helper that splits on `.` and compares numeric segments. The versions from npm are always `MAJOR.MINOR.PATCH` (no pre-release in scope per spec non-goals). This avoids adding a new dependency to core.

1. Append tests to the test file:

```typescript
import { getUpdateNotification } from '../../src/update-checker';

describe('getUpdateNotification', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-notif-'));
    originalHome = os.homedir();
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns formatted message when latestVersion > currentVersion', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.8.0',
        currentVersion: '1.7.0',
      })
    );

    const msg = getUpdateNotification('1.7.0');
    expect(msg).toContain('1.7.0');
    expect(msg).toContain('1.8.0');
    expect(msg).toContain('harness update');
  });

  it('returns null when versions are equal', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.7.0',
        currentVersion: '1.7.0',
      })
    );

    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('returns null when current is newer than latest (downgrade)', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.6.0',
        currentVersion: '1.7.0',
      })
    );

    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('returns null when latestVersion is null', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: null,
        currentVersion: '1.7.0',
      })
    );

    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('returns null when state file is missing', () => {
    expect(getUpdateNotification('1.7.0')).toBeNull();
  });

  it('handles major version bump', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '2.0.0',
        currentVersion: '1.9.9',
      })
    );

    const msg = getUpdateNotification('1.9.9');
    expect(msg).toContain('2.0.0');
    expect(msg).toContain('1.9.9');
  });

  it('handles patch version bump', () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'update-check.json'),
      JSON.stringify({
        lastCheckTime: Date.now(),
        latestVersion: '1.7.1',
        currentVersion: '1.7.0',
      })
    );

    const msg = getUpdateNotification('1.7.0');
    expect(msg).not.toBeNull();
    expect(msg).toContain('1.7.1');
  });
});
```

2. Add the helper and function to `packages/core/src/update-checker.ts`:

```typescript
/**
 * Compares two semver strings (MAJOR.MINOR.PATCH).
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * Reads the cached update check state and returns a formatted notification
 * string if a newer version is available. Returns null otherwise.
 *
 * @param currentVersion - The currently running version (e.g. VERSION from index.ts)
 */
export function getUpdateNotification(currentVersion: string): string | null {
  const state = readCheckState();
  if (!state) return null;
  if (!state.latestVersion) return null;
  if (compareVersions(state.latestVersion, currentVersion) <= 0) return null;

  return (
    `Update available: v${currentVersion} \u2192 v${state.latestVersion}\n` +
    `Run "harness update" to upgrade.`
  );
}
```

3. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts`
4. Observe: all tests pass
5. Run: `cd packages/core && npx tsc --noEmit`
6. Run: `harness validate`
7. Commit: `feat(core): add getUpdateNotification with semver comparison`

---

### Task 5: Wire re-export from core index.ts

**Depends on:** Task 4
**Files:** `packages/core/src/index.ts`

1. Add re-export to `packages/core/src/index.ts`, before the `VERSION` constant:

```typescript
// Update checker
export {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
} from './update-checker';
export type { UpdateCheckState } from './update-checker';
```

2. Run: `cd packages/core && npx tsc --noEmit`
3. Run: `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts`
4. Run: `harness validate`
5. Commit: `feat(core): re-export update-checker module from index`

---

### Task 6: Full integration verification

**Depends on:** Task 5

[checkpoint:human-verify] -- Verify all tests pass and typecheck succeeds before moving to Phase 2.

1. Run full test suite: `cd packages/core && npx vitest run`
2. Run typecheck: `cd packages/core && npx tsc --noEmit`
3. Run: `harness validate`
4. Verify the following exports are accessible from `@harness-engineering/core`:
   - `isUpdateCheckEnabled`
   - `shouldRunCheck`
   - `readCheckState`
   - `spawnBackgroundCheck`
   - `getUpdateNotification`
   - `UpdateCheckState` (type)
5. No commit needed; this is a verification task.

## Design Notes

### Why no `semver` dependency

The spec explicitly states pre-release versions are a non-goal. All versions from the npm registry `dist-tags.latest` are `MAJOR.MINOR.PATCH` format. A simple numeric segment comparison is sufficient and avoids adding a dependency to the core package.

### Why `getStatePath()` is a function, not a constant

The test strategy uses real temp directories (per project learnings: "use real temp directories instead of mocking fs module"). Tests override `process.env.HOME` to redirect `os.homedir()` to a temp directory. If the path were computed at module load time, it would not reflect the overridden HOME. Computing at call time makes the function testable without mocking `fs`.

### Why `spawnBackgroundCheck` takes `currentVersion` as a parameter

Keeps the function pure. The caller (CLI entry point, MCP server) passes `VERSION` from the core package. This avoids a circular reference and makes the function independently testable.

### Why inline script uses `require()` not `import`

The spawned child is a one-shot Node script invoked via `node -e "..."`. It runs outside the bundle, so it uses CommonJS `require()` which is always available in Node 22+.
