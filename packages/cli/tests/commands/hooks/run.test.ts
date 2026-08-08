import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runHook, createRunCommand } from '../../../src/commands/hooks/run';

// Mock the archive seam the shared core dynamically imports so the
// archive-on-enabled branch runs in-process without sqlite or a real build.
// `archiveSession` returning { ok: true } is what makes the core write the
// once-per-session sentinel, so asserting on the sentinel + this call count
// proves runCodexRetrospect wired parse → delegate → archive correctly.
const { archiveSessionMock, buildArchiveHooksMock } = vi.hoisted(() => ({
  archiveSessionMock: vi.fn(),
  buildArchiveHooksMock: vi.fn(),
}));

vi.mock('@harness-engineering/core', () => ({ archiveSession: archiveSessionMock }));
vi.mock('@harness-engineering/orchestrator', () => ({ buildArchiveHooks: buildArchiveHooksMock }));

/**
 * Tests for `harness hooks run <name> [payload]`. These verify the
 * parse + delegate + always-exit-0 seam (spec criteria 3 and 4). Most cases run
 * with retrospection UNSET so no archive package loads and each call is a pure
 * no-op that must still resolve 0; one positive-path case sets the flag and
 * asserts the archive-on-enabled branch of runCodexRetrospect actually fires.
 */
describe('runHook', () => {
  let dir: string;
  const savedFlag = process.env.HARNESS_SESSION_RETROSPECTION;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-run-'));
    delete process.env.HARNESS_SESSION_RETROSPECTION;
    archiveSessionMock.mockReset();
    buildArchiveHooksMock.mockReset().mockReturnValue({});
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
    if (savedFlag === undefined) delete process.env.HARNESS_SESSION_RETROSPECTION;
    else process.env.HARNESS_SESSION_RETROSPECTION = savedFlag;
  });

  it('returns 0 for an unknown hook name (fail-soft, D4)', async () => {
    expect(await runHook('bogus-name', undefined)).toBe(0);
  });

  it('returns 0 for inherited prototype names (Object.hasOwn guard, D4)', async () => {
    // Without the Object.hasOwn guard these resolve real functions off the
    // prototype chain (Object.prototype.toString, the Object constructor) and
    // bypass the unknown-name fail-soft. They must be treated as unknown.
    expect(await runHook('toString', undefined)).toBe(0);
    expect(await runHook('constructor', undefined)).toBe(0);
    expect(await runHook('hasOwnProperty', '{"thread-id":"x"}')).toBe(0);
    // A prototype name must never reach the archive seam.
    expect(archiveSessionMock).not.toHaveBeenCalled();
  });

  it('archives once and logs when opted in (runCodexRetrospect positive path)', async () => {
    // Opt in for this case only; afterEach restores the saved flag so there is
    // no cross-test pollution.
    process.env.HARNESS_SESSION_RETROSPECTION = '1';
    archiveSessionMock.mockResolvedValue({ ok: true });
    // Seed an active session under the payload cwd for the core to archive,
    // mirroring assertArchivesOnce in session-retrospect-agents.test.ts.
    fs.mkdirSync(path.join(dir, '.harness', 'sessions', 'active-session'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.harness', 'sessions', 'active-session', 'summary.md'),
      '# s\n'
    );

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    // The exact shape Codex delivers on its notify argv: hyphenated thread-id + cwd.
    const payload = JSON.stringify({
      type: 'agent-turn-complete',
      'thread-id': 'codex-thread-1',
      cwd: dir,
    });

    const code = await runHook('session-retrospect-codex', payload);

    // Delegated to the shared archive seam exactly once, for the seeded session.
    expect(archiveSessionMock).toHaveBeenCalledTimes(1);
    expect(archiveSessionMock).toHaveBeenCalledWith(
      dir,
      'active-session',
      expect.objectContaining({ hooks: expect.anything() })
    );
    // The once-per-session sentinel is written for THIS thread-id — proves the
    // parsed payload (not the raw string) reached retrospectSession.
    expect(
      fs.existsSync(path.join(dir, '.harness', 'state', 'retrospection', 'codex-thread-1.archived'))
    ).toBe(true);
    // Logged under the correct per-agent label (guards against a wrong-label wiring bug).
    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain("[session-retrospect-codex] Archived session 'active-session'");
    // Codex ignores exit codes, but the seam must still resolve 0.
    expect(code).toBe(0);
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
