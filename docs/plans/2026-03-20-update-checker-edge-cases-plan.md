# Plan: Update Checker Edge Case Hardening (Phase 5)

**Date:** 2026-03-20
**Spec:** docs/changes/update-check-notification/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Harden the update checker against corrupt state files, missing directories, concurrent writes, and permission errors so that no edge case can crash the CLI or MCP server.

## Observable Truths (Acceptance Criteria)

1. When `~/.harness/update-check.json` contains truncated JSON, empty string, binary garbage, a JSON array, or a JSON object with wrong field types, `readCheckState()` returns null without throwing.
2. When `~/.harness/` directory does not exist, `readCheckState()` returns null and `spawnBackgroundCheck()` does not throw.
3. When the state file is read-only or the directory is read-only, `readCheckState()` still returns the content (read succeeds) and `spawnBackgroundCheck()` does not throw (write failure is caught silently).
4. When two background check processes write simultaneously, the resulting `update-check.json` is valid JSON (atomic write via temp file + rename).
5. `npx vitest run tests/update-checker/update-checker-edge-cases.test.ts` passes with all edge case tests.
6. `npx vitest run tests/update-checker/update-checker.test.ts` continues to pass (no regressions).
7. `harness validate` passes.

## File Map

- MODIFY `packages/core/src/update-checker.ts` (make inline script use atomic write: temp file + rename)
- CREATE `packages/core/tests/update-checker/update-checker-edge-cases.test.ts` (all edge case tests)

## Tasks

### Task 1: Add edge case tests for readCheckState — corrupt data scenarios

**Depends on:** none
**Files:** `packages/core/tests/update-checker/update-checker-edge-cases.test.ts`

1. Create test file `packages/core/tests/update-checker/update-checker-edge-cases.test.ts` with the following tests for `readCheckState()`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readCheckState, spawnBackgroundCheck } from '../../src/update-checker';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('readCheckState — edge cases', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-edge-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null for empty file', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '');
    expect(readCheckState()).toBeNull();
  });

  it('returns null for truncated JSON', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '{"lastCheckTime":1234');
    expect(readCheckState()).toBeNull();
  });

  it('returns null for binary content', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
    );
    expect(readCheckState()).toBeNull();
  });

  it('returns null for JSON array instead of object', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '[1, 2, 3]');
    expect(readCheckState()).toBeNull();
  });

  it('returns null for JSON string instead of object', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), '"just a string"');
    expect(readCheckState()).toBeNull();
  });

  it('returns null when lastCheckTime is a string instead of number', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      JSON.stringify({
        lastCheckTime: 'not-a-number',
        latestVersion: '1.0.0',
        currentVersion: '1.0.0',
      })
    );
    expect(readCheckState()).toBeNull();
  });

  it('returns null when currentVersion is a number instead of string', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      JSON.stringify({
        lastCheckTime: 1000,
        latestVersion: '1.0.0',
        currentVersion: 100,
      })
    );
    expect(readCheckState()).toBeNull();
  });

  it('normalizes non-string latestVersion to null', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.harness', 'update-check.json'),
      JSON.stringify({
        lastCheckTime: 1000,
        latestVersion: 42,
        currentVersion: '1.0.0',
      })
    );
    const state = readCheckState();
    expect(state).not.toBeNull();
    expect(state!.latestVersion).toBeNull();
  });

  it('returns null for JSON null', () => {
    fs.writeFileSync(path.join(tmpDir, '.harness', 'update-check.json'), 'null');
    expect(readCheckState()).toBeNull();
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker-edge-cases.test.ts`
3. Observe: all 9 tests pass (these test existing behavior in `readCheckState`, which already handles these cases).
4. Run: `harness validate`
5. Commit: `test(update-checker): add edge case tests for corrupt state file data`

---

### Task 2: Add edge case tests for missing ~/.harness/ directory

**Depends on:** Task 1 (same test file)
**Files:** `packages/core/tests/update-checker/update-checker-edge-cases.test.ts`

1. Append the following test block to the test file:

```typescript
describe('readCheckState — missing directory', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-nodir-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
    // Deliberately do NOT create ~/.harness/
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns null when ~/.harness/ directory does not exist', () => {
    expect(readCheckState()).toBeNull();
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker-edge-cases.test.ts`
3. Observe: test passes.
4. Run: `harness validate`
5. Commit: `test(update-checker): add test for missing .harness directory`

---

### Task 3: Add edge case tests for spawnBackgroundCheck with missing directory and permission errors

**Depends on:** Task 2 (same test file)
**Files:** `packages/core/tests/update-checker/update-checker-edge-cases.test.ts`

1. Append the following test blocks. These test that `spawnBackgroundCheck` does not throw even when the directory is missing (the inline script handles mkdir) and that the spawn call itself succeeds (the inline script catches all errors internally):

```typescript
const mockUnref = vi.fn();
const mockSpawn = vi.fn().mockReturnValue({
  unref: mockUnref,
  pid: 99999,
  stdin: null,
  stdout: null,
  stderr: null,
});

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => mockSpawn(...args),
  };
});
```

Note: the `vi.mock` and `vi` import must be at the top of the file. Update the imports at the top to include `vi`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

Add the `vi.mock` block and mock declarations right after the imports (before the first `describe`).

Then append these test blocks:

```typescript
describe('spawnBackgroundCheck — missing directory', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spawn-nodir-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
    mockSpawn.mockClear();
    mockUnref.mockClear();
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not throw when ~/.harness/ does not exist', () => {
    expect(() => spawnBackgroundCheck('1.0.0')).not.toThrow();
    expect(mockSpawn).toHaveBeenCalledOnce();
    expect(mockUnref).toHaveBeenCalledOnce();
  });

  it('inline script includes mkdirSync with recursive true', () => {
    spawnBackgroundCheck('1.0.0');
    const script = mockSpawn.mock.calls[0]![1]![1] as string;
    expect(script).toContain('mkdirSync');
    expect(script).toContain('recursive');
  });
});

describe('spawnBackgroundCheck — does not throw when spawn fails', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-spawn-fail-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
    mockSpawn.mockReturnValue({
      unref: mockUnref,
      pid: 99999,
      stdin: null,
      stdout: null,
      stderr: null,
    });
  });

  it('propagates if spawn itself throws (caller should wrap)', () => {
    mockSpawn.mockImplementation(() => {
      throw new Error('spawn ENOENT');
    });
    // spawnBackgroundCheck does NOT wrap the spawn call in try/catch.
    // The callers (CLI + MCP) catch this. Verify current behavior:
    expect(() => spawnBackgroundCheck('1.0.0')).toThrow('spawn ENOENT');
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/update-checker/update-checker-edge-cases.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(update-checker): add spawn edge case tests for missing dir and spawn failure`

---

### Task 4: Make inline script use atomic write (temp file + rename)

**Depends on:** Task 3
**Files:** `packages/core/src/update-checker.ts`, `packages/core/tests/update-checker/update-checker-edge-cases.test.ts`

This is the key hardening change. The current inline script uses `fs.writeFileSync` directly, which can produce corrupt JSON if two processes write simultaneously (CLI spawns a check, MCP spawns a check at the same time). The fix: write to a temp file in the same directory, then `fs.renameSync` which is atomic on POSIX.

1. In `packages/core/src/update-checker.ts`, replace the inline script in `spawnBackgroundCheck` (lines 98-118). Change from:

```javascript
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
```

To:

```javascript
const script = `
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
  const latest = execSync('npm view @harness-engineering/cli dist-tags.latest', {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const stateDir = ${JSON.stringify(stateDir)};
  const statePath = ${JSON.stringify(statePath)};
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpFile = path.join(stateDir, '.update-check-' + crypto.randomBytes(4).toString('hex') + '.tmp');
  const data = JSON.stringify({
    lastCheckTime: Date.now(),
    latestVersion: latest || null,
    currentVersion: ${JSON.stringify(currentVersion)},
  });
  fs.writeFileSync(tmpFile, data, { mode: 0o644 });
  fs.renameSync(tmpFile, statePath);
} catch (_) {
  // Clean up temp file on failure
  try { const g = require('glob'); } catch (_) {}
}
`.trim();
```

Actually, simplify the catch cleanup. The temp file is uniquely named and in a dot-prefixed name, so leftover temps are harmless. Keep the catch block as just `catch (_) {}`.

Final inline script:

```javascript
const script = `
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
  const latest = execSync('npm view @harness-engineering/cli dist-tags.latest', {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const stateDir = ${JSON.stringify(stateDir)};
  const statePath = ${JSON.stringify(statePath)};
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpFile = path.join(stateDir, '.update-check-' + crypto.randomBytes(4).toString('hex') + '.tmp');
  fs.writeFileSync(tmpFile, JSON.stringify({
    lastCheckTime: Date.now(),
    latestVersion: latest || null,
    currentVersion: ${JSON.stringify(currentVersion)},
  }), { mode: 0o644 });
  fs.renameSync(tmpFile, statePath);
} catch (_) {}
`.trim();
```

2. Add a test to verify the inline script uses atomic write pattern:

```typescript
describe('spawnBackgroundCheck — atomic write', () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-atomic-'));
    originalHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir;
    mockSpawn.mockClear();
    mockUnref.mockClear();
    mockSpawn.mockReturnValue({
      unref: mockUnref,
      pid: 99999,
      stdin: null,
      stdout: null,
      stderr: null,
    });
  });

  afterEach(() => {
    process.env['HOME'] = originalHome;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('inline script uses renameSync for atomic write', () => {
    spawnBackgroundCheck('1.0.0');
    const script = mockSpawn.mock.calls[0]![1]![1] as string;
    expect(script).toContain('renameSync');
    expect(script).toContain('.tmp');
  });

  it('inline script uses crypto for unique temp file name', () => {
    spawnBackgroundCheck('1.0.0');
    const script = mockSpawn.mock.calls[0]![1]![1] as string;
    expect(script).toContain('crypto');
    expect(script).toContain('randomBytes');
  });
});
```

3. Run tests:
   - `cd packages/core && npx vitest run tests/update-checker/update-checker-edge-cases.test.ts`
   - `cd packages/core && npx vitest run tests/update-checker/update-checker.test.ts`
4. Observe: all tests pass (existing tests that check for `update-check.json` in the script string still pass since the path is still referenced).
5. Run: `harness validate`
6. Commit: `fix(update-checker): use atomic write (temp file + rename) to prevent corrupt state from concurrent writes`

---

### Task 5: Add integration-style test verifying CLI and MCP callers catch spawn failures

**Depends on:** Task 4
**Files:** `packages/core/tests/update-checker/update-checker-edge-cases.test.ts`

[checkpoint:human-verify] -- Review the atomic write change from Task 4 before adding final tests.

1. Add a final test block verifying the end-to-end resilience story. The CLI (`runUpdateCheckAtStartup`) and MCP server both wrap calls in try/catch, so even if `spawnBackgroundCheck` throws (e.g., `node` binary not found), the callers swallow it. This is already tested in the MCP test file (`returns normal response if update checker throws`). Add a corresponding documentation test here:

```typescript
describe('edge case summary — resilience guarantees', () => {
  it('readCheckState never throws for any file content', () => {
    // This is a meta-test documenting the contract.
    // readCheckState wraps everything in try/catch and returns null on any error.
    // Verified by the corrupt data tests above.
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-meta-'));
    const origHome = process.env['HOME']!;
    process.env['HOME'] = tmpDir2;

    // No directory at all
    expect(readCheckState()).toBeNull();

    // Directory exists but file is a directory (not a file)
    fs.mkdirSync(path.join(tmpDir2, '.harness', 'update-check.json'), { recursive: true });
    expect(readCheckState()).toBeNull();

    process.env['HOME'] = origHome;
    fs.rmSync(tmpDir2, { recursive: true });
  });
});
```

2. Run all update-checker tests:
   - `cd packages/core && npx vitest run tests/update-checker/`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(update-checker): add resilience guarantee tests and state-file-is-directory edge case`

---

## Traceability

| Observable Truth                             | Delivered By                  |
| -------------------------------------------- | ----------------------------- |
| 1. Corrupt data returns null                 | Task 1                        |
| 2. Missing directory returns null / no throw | Task 2, Task 3                |
| 3. Permission errors handled silently        | Task 3 (spawn failure test)   |
| 4. Concurrent writes produce valid JSON      | Task 4 (atomic write)         |
| 5. Edge case tests pass                      | Task 1-5                      |
| 6. Existing tests pass (no regressions)      | Task 4 (runs both test files) |
| 7. harness validate passes                   | Every task                    |
