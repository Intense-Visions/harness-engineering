import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { PROFILES, HOOK_SCRIPTS } from '../../src/hooks/profiles.js';

const HOOKS_DIR = resolve(__dirname, '../../src/hooks');

describe('hook scripts integration', () => {
  it('all hook scripts referenced in profiles exist as .js files', () => {
    for (const hookName of PROFILES.strict) {
      const hookPath = join(HOOKS_DIR, `${hookName}.js`);
      expect(existsSync(hookPath), `Missing hook script: ${hookPath}`).toBe(true);
    }
  });

  it('all hook scripts are valid Node.js (no syntax errors)', () => {
    for (const hookName of PROFILES.strict) {
      const hookPath = join(HOOKS_DIR, `${hookName}.js`);
      // node --check validates syntax without executing
      expect(() => {
        execFileSync('node', ['--check', hookPath], { encoding: 'utf-8' });
      }).not.toThrow();
    }
  });

  it('all hook scripts exit 0 on empty stdin (fail-open or security-block)', () => {
    // block-no-verify: fail-open (exit 0)
    // protect-config: security hook (exit 2 on empty)
    // quality-gate, pre-compact-state, cost-tracker: fail-open (exit 0)
    const failOpenHooks = ['block-no-verify', 'quality-gate', 'pre-compact-state', 'cost-tracker'];
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
  });

  it('protect-config blocks on empty stdin (security hook)', () => {
    const hookPath = join(HOOKS_DIR, 'protect-config.js');
    try {
      execFileSync('node', [hookPath], {
        input: '',
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      throw new Error('protect-config should have exited with code 2');
    } catch (err: any) {
      expect(err.status).toBe(2);
    }
  });

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
