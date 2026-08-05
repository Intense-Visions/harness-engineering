import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { PROFILES, HOOK_SCRIPTS } from '../../src/hooks/profiles.js';

const HOOKS_DIR = resolve(__dirname, '../../src/hooks');

// These tests spawn one `node` subprocess per hook in a serial loop. Under the
// pre-push gate (whole-package vitest under v8 coverage, files running in
// parallel) cold node start-up starves for CPU, so the summed spawn latency can
// far exceed the 30s default — an observed 73s run tripped a false timeout even
// though every spawn ultimately succeeded (#620). The generous per-test timeout
// tolerates that worst-case contention without weakening any assertion; it is a
// latency ceiling, not a correctness gate.
const SPAWN_LOOP_TIMEOUT_MS = 120_000;

describe('hook scripts integration', () => {
  it('all hook scripts referenced in profiles exist as .js files', () => {
    for (const hookName of PROFILES.strict) {
      const hookPath = join(HOOKS_DIR, `${hookName}.js`);
      expect(existsSync(hookPath), `Missing hook script: ${hookPath}`).toBe(true);
    }
  });

  it(
    'all hook scripts are valid Node.js (no syntax errors)',
    () => {
      for (const hookName of PROFILES.strict) {
        const hookPath = join(HOOKS_DIR, `${hookName}.js`);
        // node --check validates syntax without executing
        expect(() => {
          execFileSync('node', ['--check', hookPath], { encoding: 'utf-8' });
        }).not.toThrow();
      }
    },
    SPAWN_LOOP_TIMEOUT_MS
  );

  it(
    'all hook scripts exit 0 on empty stdin (fail-open)',
    () => {
      // All hooks fail-open on empty stdin (exit 0)
      const failOpenHooks = [
        'block-no-verify',
        'protect-config',
        'quality-warner',
        'strict-quality-gate',
        'pre-compact-state',
        'cost-tracker',
        'telemetry-reporter',
      ];
      for (const hookName of failOpenHooks) {
        const hookPath = join(HOOKS_DIR, `${hookName}.js`);
        try {
          execFileSync('node', [hookPath], {
            input: '',
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (err: any) {
          throw new Error(`${hookName} should exit 0 on empty stdin but exited ${err.status}`);
        }
      }
    },
    SPAWN_LOOP_TIMEOUT_MS
  );

  it('HOOK_SCRIPTS count matches profile strict count', () => {
    expect(HOOK_SCRIPTS).toHaveLength(PROFILES.strict.length);
  });

  it('each HOOK_SCRIPT name appears in at least one profile', () => {
    for (const script of HOOK_SCRIPTS) {
      const inSomeProfile = Object.values(PROFILES).some((hooks) => hooks.includes(script.name));
      expect(inSomeProfile, `${script.name} not in any profile`).toBe(true);
    }
  });
});
