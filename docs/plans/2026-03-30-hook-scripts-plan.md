# Plan: Hook Scripts (Phase 2 of Runtime Enforcement Extensions — Iteration 1)

**Date:** 2026-03-30
**Spec:** docs/changes/runtime-enforcement-extensions/iteration-1.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Align the two hook scripts (`protect-config.js` and `pre-compact-state.js`) with the iteration-1 spec: fail-open behavior for `protect-config.js`, and a structured session-summary output for `pre-compact-state.js`.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When `protect-config.js` receives a Write/Edit targeting `.eslintrc.json` (or any protected config pattern), it exits 2 and writes "BLOCKED" to stderr.
2. **Event-driven:** When `protect-config.js` receives a Write/Edit targeting `src/app.ts`, it exits 0.
3. **Event-driven:** When `protect-config.js` receives malformed stdin (empty, invalid JSON, missing `file_path`), it fails open — exits 0 and logs to stderr.
4. **Event-driven:** When `pre-compact-state.js` runs with valid stdin and a `.harness/state.json` present, it writes a valid JSON file to `.harness/state/pre-compact-summary.json` containing `timestamp`, `sessionId`, `activeStream`, `recentDecisions`, `openQuestions`, and `currentPhase`.
5. **Event-driven:** When `pre-compact-state.js` runs without `.harness/state.json`, it still writes a summary (with null/empty defaults) and exits 0.
6. **Event-driven:** When `pre-compact-state.js` receives malformed stdin, it fails open (exit 0) and logs to stderr.
7. **Ubiquitous:** `npx vitest run tests/hooks/protect-config.test.ts` passes in `packages/cli/`.
8. **Ubiquitous:** `npx vitest run tests/hooks/pre-compact-state.test.ts` passes in `packages/cli/`.

## File Map

- MODIFY `packages/cli/src/hooks/protect-config.js` (change error handling from block to fail-open)
- MODIFY `packages/cli/tests/hooks/protect-config.test.ts` (update tests for fail-open behavior)
- MODIFY `packages/cli/src/hooks/pre-compact-state.js` (rewrite to produce structured summary at correct path)
- MODIFY `packages/cli/tests/hooks/pre-compact-state.test.ts` (rewrite tests for new output format and path)

## Tasks

### Task 1: Update protect-config.js to fail-open on errors

**Depends on:** none
**Files:** `packages/cli/src/hooks/protect-config.js`

The existing `protect-config.js` exits 2 (block) on parse errors, empty stdin, and missing `file_path`. The spec requires fail-open behavior: all error conditions exit 0 and log to stderr. Only a confirmed match against a protected config pattern should exit 2.

1. Open `packages/cli/src/hooks/protect-config.js`.
2. Change the comment on line 4 from "Security hook: blocks on parse errors (exit 2) rather than failing open." to "Fail-open: parse errors and unexpected exceptions log to stderr and exit 0."
3. Replace the `block()` calls in error paths with stderr logging + `process.exit(0)`:
   - stdin read failure: `process.stderr.write('[protect-config] Could not read stdin — allowing (fail-open)\n'); process.exit(0);`
   - empty stdin: `process.stderr.write('[protect-config] Empty stdin — allowing (fail-open)\n'); process.exit(0);`
   - JSON parse failure: `process.stderr.write('[protect-config] Could not parse stdin JSON — allowing (fail-open)\n'); process.exit(0);`
   - missing `file_path`: `process.stderr.write('[protect-config] Missing file_path in tool input — allowing (fail-open)\n'); process.exit(0);`
   - unexpected error in catch: `process.stderr.write('[protect-config] Unexpected error — allowing (fail-open)\n'); process.exit(0);`
4. Keep the `block()` call only for the `isProtected(filePath)` match — that is the only case that should exit 2.
5. Run: `cd packages/cli && npx vitest run tests/hooks/protect-config.test.ts` — expect failures on the 3 tests that assert exit code 2 for error conditions.
6. Run: `npx harness validate`
7. Commit: `fix(hooks): change protect-config.js to fail-open on parse errors`

Final file content for `packages/cli/src/hooks/protect-config.js`:

```javascript
#!/usr/bin/env node
// protect-config.js — PreToolUse:Write/Edit hook
// Blocks modifications to linter/formatter config files.
// Fail-open: parse errors and unexpected exceptions log to stderr and exit 0.
// Exit codes: 0 = allow, 2 = block

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import process from 'node:process';

// Protected config file patterns
const PROTECTED_PATTERNS = [
  /^\.eslintrc/,
  /^eslint\.config\./,
  /^\.prettierrc/,
  /^prettier\.config\./,
  /^biome\.json$/,
  /^biome\.jsonc$/,
  /^\.ruff\.toml$/,
  /^ruff\.toml$/,
  /^\.stylelintrc/,
  /^\.markdownlint/,
  /^deno\.json$/,
];

function isProtected(filePath) {
  const base = basename(filePath);
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(base));
}

function main() {
  let raw;
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.stderr.write('[protect-config] Could not read stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  if (!raw.trim()) {
    process.stderr.write('[protect-config] Empty stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('[protect-config] Could not parse stdin JSON — allowing (fail-open)\n');
    process.exit(0);
  }

  try {
    const filePath = input?.tool_input?.file_path;

    if (typeof filePath !== 'string' || !filePath) {
      process.stderr.write(
        '[protect-config] Missing file_path in tool input — allowing (fail-open)\n'
      );
      process.exit(0);
    }

    if (isProtected(filePath)) {
      process.stderr.write(
        `BLOCKED: Modification to protected config file: ${basename(filePath)}. Linter/formatter configs must not be weakened.\n`
      );
      process.exit(2);
    }

    process.exit(0);
  } catch {
    process.stderr.write('[protect-config] Unexpected error — allowing (fail-open)\n');
    process.exit(0);
  }
}

main();
```

---

### Task 2: Update protect-config tests for fail-open behavior

**Depends on:** Task 1
**Files:** `packages/cli/tests/hooks/protect-config.test.ts`

3 existing tests assert exit code 2 for error conditions. These must change to assert exit code 0 (fail-open).

1. Open `packages/cli/tests/hooks/protect-config.test.ts`.
2. Change the test `'blocks on malformed JSON (security hook)'` (line 85-89):
   - Rename to `'fails open on malformed JSON'`
   - Change `expect(exitCode).toBe(2)` to `expect(exitCode).toBe(0)`
   - Remove the `expect(stderr).toContain('parse')` assertion (or change to check for `fail-open` in stderr)
3. Change the test `'blocks on empty stdin (security hook)'` (line 91-93):
   - Rename to `'fails open on empty stdin'`
   - Change `expect(exitCode).toBe(2)` to `expect(exitCode).toBe(0)`
4. Change the test `'blocks on missing file_path (security hook)'` (line 96-103):
   - Rename to `'fails open on missing file_path'`
   - Change `expect(exitCode).toBe(2)` to `expect(exitCode).toBe(0)`
5. Run: `cd packages/cli && npx vitest run tests/hooks/protect-config.test.ts` — all 21 tests pass.
6. Run: `npx harness validate`
7. Commit: `test(hooks): update protect-config tests for fail-open behavior`

---

### Task 3: Rewrite pre-compact-state.js to produce structured summary

**Depends on:** none
**Files:** `packages/cli/src/hooks/pre-compact-state.js`

The existing implementation writes timestamped snapshots to `.harness/compact-snapshots/`. The spec requires writing a structured summary to `.harness/state/pre-compact-summary.json` with fields gathered from `.harness/state.json` and `.harness/sessions/`.

1. Open `packages/cli/src/hooks/pre-compact-state.js`.
2. Replace entire contents with the implementation below.
3. Run: `echo '{}' | node packages/cli/src/hooks/pre-compact-state.js` from a temp directory — verify it creates `.harness/state/pre-compact-summary.json`.
4. Run: `npx harness validate`
5. Commit: `feat(hooks): rewrite pre-compact-state.js to produce structured session summary`

Final file content for `packages/cli/src/hooks/pre-compact-state.js`:

```javascript
#!/usr/bin/env node
// pre-compact-state.js — PreCompact:* hook
// Saves a compact session summary before context compaction.
// Reads from .harness/state.json and .harness/sessions/ to gather context.
// Writes to .harness/state/pre-compact-summary.json (overwrites on each run).
// Fail-open: parse errors and unexpected exceptions log to stderr and exit 0.
// Exit codes: 0 = allow (always, log-only hook)

import { readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import process from 'node:process';

function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function findActiveSession(sessionsDir) {
  try {
    const entries = readdirSync(sessionsDir, { withFileTypes: true });
    // Look for the most recently modified session with an autopilot-state.json
    let latest = null;
    let latestMtime = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const statePath = join(sessionsDir, entry.name, 'autopilot-state.json');
      try {
        const stat = require('node:fs').statSync(statePath);
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latest = { dir: entry.name, state: readJsonSafe(statePath) };
        }
      } catch {
        // No autopilot-state.json in this session
      }
    }
    return latest;
  } catch {
    return null;
  }
}

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    process.stderr.write('[pre-compact-state] Could not read stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  if (!raw.trim()) {
    process.stderr.write('[pre-compact-state] Empty stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('[pre-compact-state] Could not parse stdin — allowing (fail-open)\n');
    process.exit(0);
  }

  try {
    const cwd = process.cwd();
    const harnessDir = join(cwd, '.harness');
    const stateDir = join(harnessDir, 'state');

    // Read harness state
    const state = readJsonSafe(join(harnessDir, 'state.json'));

    // Find active session
    const session = findActiveSession(join(harnessDir, 'sessions'));

    // Extract recent decisions (last 5)
    const decisions = state?.decisions ?? [];
    const recentDecisions = decisions
      .slice(-5)
      .map((d) => (typeof d === 'string' ? d : (d?.decision ?? d?.summary ?? JSON.stringify(d))));

    // Extract open questions / blockers
    const openQuestions = state?.blockers ?? [];

    // Determine current phase from session state
    const currentPhase = session?.state?.currentState ?? state?.position?.phase ?? null;

    // Build summary
    const summary = {
      timestamp: new Date().toISOString(),
      sessionId: session?.dir ?? null,
      activeStream: session?.state?.currentState ?? null,
      recentDecisions,
      openQuestions,
      currentPhase,
    };

    mkdirSync(stateDir, { recursive: true });
    writeFileSync(
      join(stateDir, 'pre-compact-summary.json'),
      JSON.stringify(summary, null, 2) + '\n'
    );

    process.stderr.write('[pre-compact-state] Saved pre-compact summary\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[pre-compact-state] Failed to save summary: ${err.message}\n`);
    process.exit(0);
  }
}

main();
```

---

### Task 4: Rewrite pre-compact-state tests for new output format

**Depends on:** Task 3
**Files:** `packages/cli/tests/hooks/pre-compact-state.test.ts`

The existing tests verify snapshot files in `.harness/compact-snapshots/`. The new tests must verify structured JSON in `.harness/state/pre-compact-summary.json`.

1. Open `packages/cli/tests/hooks/pre-compact-state.test.ts`.
2. Replace entire contents with the test file below.
3. Run: `cd packages/cli && npx vitest run tests/hooks/pre-compact-state.test.ts` — all tests pass.
4. Run: `npx harness validate`
5. Commit: `test(hooks): rewrite pre-compact-state tests for structured summary output`

Final file content for `packages/cli/tests/hooks/pre-compact-state.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK_PATH = resolve(__dirname, '../../src/hooks/pre-compact-state.js');

function runHook(stdinData: string, cwd?: string): { exitCode: number; stderr: string } {
  try {
    execFileSync('node', [HOOK_PATH], {
      input: stdinData,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: cwd ?? process.cwd(),
    });
    return { exitCode: 0, stderr: '' };
  } catch (err: any) {
    return { exitCode: err.status ?? 1, stderr: err.stderr ?? '' };
  }
}

function readSummary(tmpDir: string): any {
  const summaryPath = join(tmpDir, '.harness', 'state', 'pre-compact-summary.json');
  return JSON.parse(readFileSync(summaryPath, 'utf-8'));
}

describe('pre-compact-state', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pre-compact-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .harness/state/ directory and writes summary', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);

    const summaryPath = join(tmpDir, '.harness', 'state', 'pre-compact-summary.json');
    expect(existsSync(summaryPath)).toBe(true);
  });

  it('summary contains all required fields', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary).toHaveProperty('timestamp');
    expect(summary).toHaveProperty('sessionId');
    expect(summary).toHaveProperty('activeStream');
    expect(summary).toHaveProperty('recentDecisions');
    expect(summary).toHaveProperty('openQuestions');
    expect(summary).toHaveProperty('currentPhase');
    expect(Array.isArray(summary.recentDecisions)).toBe(true);
    expect(Array.isArray(summary.openQuestions)).toBe(true);
  });

  it('reads decisions from .harness/state.json when present', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.harness', 'state.json'),
      JSON.stringify({
        schemaVersion: 1,
        decisions: [
          { decision: 'decision-1' },
          { decision: 'decision-2' },
          { decision: 'decision-3' },
        ],
        blockers: ['unresolved-question-1'],
        position: { phase: 'execute', task: 'Task 2' },
      })
    );

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary.recentDecisions).toEqual(['decision-1', 'decision-2', 'decision-3']);
    expect(summary.openQuestions).toEqual(['unresolved-question-1']);
    expect(summary.currentPhase).toBe('execute');
  });

  it('limits recentDecisions to last 5', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.harness', 'state.json'),
      JSON.stringify({
        schemaVersion: 1,
        decisions: [
          { decision: 'd1' },
          { decision: 'd2' },
          { decision: 'd3' },
          { decision: 'd4' },
          { decision: 'd5' },
          { decision: 'd6' },
          { decision: 'd7' },
        ],
        blockers: [],
      })
    );

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    const summary = readSummary(tmpDir);
    expect(summary.recentDecisions).toHaveLength(5);
    expect(summary.recentDecisions[0]).toBe('d3');
    expect(summary.recentDecisions[4]).toBe('d7');
  });

  it('works without .harness/state.json (defaults to empty)', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);

    const summary = readSummary(tmpDir);
    expect(summary.recentDecisions).toEqual([]);
    expect(summary.openQuestions).toEqual([]);
    expect(summary.currentPhase).toBeNull();
  });

  it('preserves existing .harness directory', () => {
    mkdirSync(join(tmpDir, '.harness'), { recursive: true });
    writeFileSync(join(tmpDir, '.harness', 'existing.txt'), 'keep me');

    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);

    expect(existsSync(join(tmpDir, '.harness', 'existing.txt'))).toBe(true);
  });

  it('overwrites previous summary on each run', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    runHook(input, tmpDir);
    const summary1 = readSummary(tmpDir);

    runHook(input, tmpDir);
    const summary2 = readSummary(tmpDir);

    // Timestamps should differ (or at least file was overwritten)
    expect(summary2).toHaveProperty('timestamp');
    expect(summary2.timestamp).not.toBe(summary1.timestamp);
  });

  it('fails open on malformed JSON', () => {
    const { exitCode } = runHook('not json', tmpDir);
    expect(exitCode).toBe(0);
  });

  it('fails open on empty stdin', () => {
    const { exitCode } = runHook('', tmpDir);
    expect(exitCode).toBe(0);
  });

  it('always exits 0', () => {
    const input = JSON.stringify({ hook_type: 'PreCompact' });
    const { exitCode } = runHook(input, tmpDir);
    expect(exitCode).toBe(0);
  });
});
```

---

### Task 5: Run full test suite and verify all acceptance criteria

**Depends on:** Tasks 1-4
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `cd packages/cli && npx vitest run tests/hooks/protect-config.test.ts tests/hooks/pre-compact-state.test.ts`
2. Verify: all tests pass (21 protect-config + 10 pre-compact-state = 31 tests).
3. Run: `npx harness validate`
4. Verify acceptance criteria manually:
   - AC 1: Protected file test cases exit 2 (13 test cases in protect-config)
   - AC 2: Non-protected file test cases exit 0 (`src/app.ts`, `tsconfig.json`, `pyproject.toml`)
   - AC 3: Error condition tests exit 0 (malformed JSON, empty stdin, missing file_path)
   - AC 4: Summary file written with correct fields (3 tests verify field presence and content)
   - AC 5: Works without state.json (dedicated test)
   - AC 6: Malformed stdin exits 0 (dedicated test)
5. Commit: no commit (verification only).

## Traceability

| Observable Truth                               | Delivered by                                    |
| ---------------------------------------------- | ----------------------------------------------- |
| 1. Protected config exits 2                    | Task 1 (implementation), Task 2 (13 test cases) |
| 2. Non-protected exits 0                       | Task 1 (implementation), Task 2 (3 test cases)  |
| 3. Malformed stdin fails open (protect-config) | Task 1 (implementation), Task 2 (3 test cases)  |
| 4. Summary JSON with correct fields            | Task 3 (implementation), Task 4 (3 test cases)  |
| 5. Works without state.json                    | Task 3 (implementation), Task 4 (1 test case)   |
| 6. Malformed stdin fails open (pre-compact)    | Task 3 (implementation), Task 4 (2 test cases)  |
| 7. protect-config tests pass                   | Task 5 (verification)                           |
| 8. pre-compact-state tests pass                | Task 5 (verification)                           |
