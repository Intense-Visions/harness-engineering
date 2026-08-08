import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runHook, createRunCommand } from '../../../src/commands/hooks/run';

/**
 * Tests for `harness hooks run <name> [payload]`. These verify the
 * parse + delegate + always-exit-0 seam (spec criteria 3 and 4). The
 * archive-on-enabled equivalence is inherited from the shared
 * `retrospectSession` core and is proven end-to-end by
 * `session-retrospect-agents.test.ts`; here retrospection is left UNSET so no
 * archive package loads and each call is a pure no-op that must still resolve 0.
 */
describe('runHook', () => {
  let dir: string;
  const savedFlag = process.env.HARNESS_SESSION_RETROSPECTION;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-run-'));
    delete process.env.HARNESS_SESSION_RETROSPECTION;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (savedFlag === undefined) delete process.env.HARNESS_SESSION_RETROSPECTION;
    else process.env.HARNESS_SESSION_RETROSPECTION = savedFlag;
  });

  it('returns 0 for an unknown hook name (fail-soft, D4)', async () => {
    expect(await runHook('bogus-name', undefined)).toBe(0);
  });

  it('returns 0 for session-retrospect-codex with no payload', async () => {
    expect(await runHook('session-retrospect-codex', undefined)).toBe(0);
  });

  it('returns 0 for session-retrospect-codex with malformed JSON', async () => {
    expect(await runHook('session-retrospect-codex', 'not json')).toBe(0);
  });

  it('returns 0 for a valid payload and is a no-op when retrospection is unset', async () => {
    const payload = JSON.stringify({ 'thread-id': 't1', cwd: dir });
    expect(await runHook('session-retrospect-codex', payload)).toBe(0);
    // With the flag unset, no sentinel is written under the payload cwd.
    expect(fs.existsSync(path.join(dir, '.harness', 'state', 'retrospection'))).toBe(false);
  });

  it('createRunCommand() returns a Command named "run" with <name> and [payload] args', () => {
    const cmd = createRunCommand();
    expect(cmd).toBeInstanceOf(Command);
    expect(cmd.name()).toBe('run');
    const args = cmd.registeredArguments.map((a) => ({ name: a.name(), required: a.required }));
    expect(args).toEqual([
      { name: 'name', required: true },
      { name: 'payload', required: false },
    ]);
  });
});
