import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { HooksConfig } from '@harness-engineering/types';
import { WorkspaceHooks } from '../../src/workspace/hooks';

/**
 * Behavior characterization for WorkspaceHooks.
 *
 * The class spawns real `/bin/sh -c <command>` subprocesses, so these tests
 * exercise the actual spawn/exit/timeout/error plumbing against real shell
 * commands rather than mocking child_process. All fs side effects are confined
 * to an os.tmpdir() sandbox that is cleaned up per-test.
 */
function makeConfig(overrides: Partial<HooksConfig> = {}): HooksConfig {
  return {
    afterCreate: null,
    beforeRun: null,
    afterRun: null,
    beforeRemove: null,
    timeoutMs: 5000,
    ...overrides,
  };
}

describe('WorkspaceHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-hooks-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('executeHook — no configured command', () => {
    it('resolves Ok(undefined) when the hook command is null', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ afterCreate: null }));
      const result = await hooks.executeHook('afterCreate', tmpDir);
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBeUndefined();
    });

    it('does not spawn anything (no side effect) when command is null', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ afterCreate: null }));
      await hooks.executeHook('afterCreate', tmpDir);
      // An empty-string command is also falsy → treated as unconfigured.
      const empty = new WorkspaceHooks(makeConfig({ afterCreate: '' }));
      const emptyResult = await empty.executeHook('afterCreate', tmpDir);
      expect(emptyResult.ok).toBe(true);
      expect(fs.readdirSync(tmpDir)).toEqual([]);
    });
  });

  describe('executeHook — success and failure exit codes', () => {
    it('resolves Ok when the command exits with code 0', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ afterCreate: 'exit 0' }));
      const result = await hooks.executeHook('afterCreate', tmpDir);
      expect(result.ok).toBe(true);
    });

    it('resolves Err with the exit code in the message on non-zero exit', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ beforeRun: 'exit 3' }));
      const result = await hooks.executeHook('beforeRun', tmpDir);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBeInstanceOf(Error);
      expect(result.ok === false && result.error.message).toBe(
        'Hook beforeRun failed with exit code 3'
      );
    });

    it('runs the command through a shell so shell operators are honored', async () => {
      // `/bin/sh -c` evaluates the string; `&&` chaining must work.
      const hooks = new WorkspaceHooks(makeConfig({ afterRun: 'true && exit 0' }));
      const result = await hooks.executeHook('afterRun', tmpDir);
      expect(result.ok).toBe(true);
    });
  });

  describe('executeHook — working directory', () => {
    it('runs the command with cwd set to the provided directory', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ afterCreate: 'printf hi > created.txt' }));
      const result = await hooks.executeHook('afterCreate', tmpDir);
      expect(result.ok).toBe(true);
      const written = path.join(tmpDir, 'created.txt');
      expect(fs.existsSync(written)).toBe(true);
      expect(fs.readFileSync(written, 'utf8')).toBe('hi');
    });
  });

  describe('executeHook — environment filtering', () => {
    const injected = {
      HARNESS_HOOK_TEST_PLAIN: 'plain-value',
      HARNESS_HOOK_TEST_SECRET: 'secret-value',
      HARNESS_HOOK_TEST_TOKEN: 'token-value',
      HARNESS_HOOK_TEST_PASSWORD: 'password-value',
      HARNESS_HOOK_TEST_secret_lower: 'lower-value',
    } as const;

    beforeEach(() => {
      for (const [k, v] of Object.entries(injected)) process.env[k] = v;
    });

    afterEach(() => {
      for (const k of Object.keys(injected)) delete process.env[k];
    });

    it('passes non-sensitive env vars through but strips SECRET/TOKEN/PASSWORD keys', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ afterCreate: 'printenv > env.txt' }));
      const result = await hooks.executeHook('afterCreate', tmpDir);
      expect(result.ok).toBe(true);
      const dump = fs.readFileSync(path.join(tmpDir, 'env.txt'), 'utf8');
      const keys = new Set(
        dump
          .split('\n')
          .map((line) => line.split('=')[0])
          .filter(Boolean)
      );
      // Non-sensitive var survives.
      expect(keys.has('HARNESS_HOOK_TEST_PLAIN')).toBe(true);
      // Keys containing the uppercase substrings are filtered out.
      expect(keys.has('HARNESS_HOOK_TEST_SECRET')).toBe(false);
      expect(keys.has('HARNESS_HOOK_TEST_TOKEN')).toBe(false);
      expect(keys.has('HARNESS_HOOK_TEST_PASSWORD')).toBe(false);
      // Filtering is case-sensitive substring matching: a lowercase "secret"
      // key is NOT stripped (characterizes current behavior).
      expect(keys.has('HARNESS_HOOK_TEST_secret_lower')).toBe(true);
    });
  });

  describe('executeHook — timeout', () => {
    it('resolves Err with a timeout message and kills a long-running command', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ beforeRemove: 'sleep 5', timeoutMs: 150 }));
      const start = Date.now();
      const result = await hooks.executeHook('beforeRemove', tmpDir);
      const elapsed = Date.now() - start;
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error.message).toBe(
        'Hook beforeRemove timed out after 150ms'
      );
      // Should return promptly (well under the 5s sleep) because the child is killed.
      expect(elapsed).toBeLessThan(4000);
    });
  });

  describe('convenience wrappers delegate to the matching hook', () => {
    it('afterCreate runs only the afterCreate command', async () => {
      const hooks = new WorkspaceHooks(
        makeConfig({
          afterCreate: 'printf x > a.txt',
          beforeRun: 'printf x > b.txt',
        })
      );
      const result = await hooks.afterCreate(tmpDir);
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'a.txt'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'b.txt'))).toBe(false);
    });

    it('beforeRun runs the beforeRun command', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ beforeRun: 'printf x > br.txt' }));
      const result = await hooks.beforeRun(tmpDir);
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'br.txt'))).toBe(true);
    });

    it('afterRun runs the afterRun command', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ afterRun: 'printf x > ar.txt' }));
      const result = await hooks.afterRun(tmpDir);
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'ar.txt'))).toBe(true);
    });

    it('beforeRemove runs the beforeRemove command', async () => {
      const hooks = new WorkspaceHooks(makeConfig({ beforeRemove: 'printf x > brm.txt' }));
      const result = await hooks.beforeRemove(tmpDir);
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'brm.txt'))).toBe(true);
    });

    it('a convenience wrapper resolves Ok(undefined) when its hook is unconfigured', async () => {
      const hooks = new WorkspaceHooks(makeConfig());
      const result = await hooks.beforeRun(tmpDir);
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBeUndefined();
    });
  });
});
