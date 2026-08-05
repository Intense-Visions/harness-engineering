import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/commands/skill/provider-update', () => ({
  probeProviders: vi.fn(),
  updateProviders: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/output/prompt', () => ({ prompt: vi.fn() }));
vi.mock('../../src/commands/install', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/commands/install')>();
  return { ...actual, resolveCommunityBase: vi.fn(() => ({ communityBase: '/c', lockfilePath: '/c/skills-lock.json' })) };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

import { existsSync } from 'node:fs';
import { probeProviders, updateProviders } from '../../src/commands/skill/provider-update';
import { prompt } from '../../src/output/prompt';
import { offerSkillProviderUpdates } from '../../src/commands/update';

const mockedProbe = vi.mocked(probeProviders);
const mockedUpdate = vi.mocked(updateProviders);
const mockedPrompt = vi.mocked(prompt);
const mockedExists = vi.mocked(existsSync);
const outdated = { name: '@harness-skills/gh', kind: 'github', current: 'old', latest: 'new', outdated: true, global: false, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old' } } as any;

let logSpy: any;
const origTtyOut = process.stdout.isTTY;
const origTtyIn = process.stdin.isTTY;
const origEnv = process.env;
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...origEnv };
  delete process.env['HARNESS_NO_UPDATE_CHECK'];
  // Default to "lockfile present" so tests exercising the probe/hint path run;
  // the no-lockfile tests override this to false explicitly.
  mockedExists.mockReturnValue(true);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  Object.defineProperty(process.stdout, 'isTTY', { value: origTtyOut, configurable: true });
  Object.defineProperty(process.stdin, 'isTTY', { value: origTtyIn, configurable: true });
  process.env = origEnv;
});
function setTty(v: boolean) {
  Object.defineProperty(process.stdout, 'isTTY', { value: v, configurable: true });
  Object.defineProperty(process.stdin, 'isTTY', { value: v, configurable: true });
}
const out = () => logSpy.mock.calls.map((c: any[]) => c.map((x) => String(x)).join(' ')).join('\n');

describe('offerSkillProviderUpdates', () => {
  it('stays silent when nothing is outdated', async () => {
    setTty(true);
    mockedProbe.mockReturnValue({ providers: [{ ...outdated, outdated: false }], sourceless: [] });
    await offerSkillProviderUpdates();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('TTY + assent runs updateProviders({ yes: true })', async () => {
    setTty(true);
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    mockedPrompt.mockResolvedValue('y');
    await offerSkillProviderUpdates();
    expect(mockedUpdate).toHaveBeenCalledWith([outdated], { yes: true });
  });

  it('TTY + decline does not update', async () => {
    setTty(true);
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    mockedPrompt.mockResolvedValue('n');
    await offerSkillProviderUpdates();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(out()).toContain('harness skill update');
  });

  it('non-TTY prints a report-only hint and never probes or prompts', async () => {
    setTty(false);
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    await offerSkillProviderUpdates();
    // A non-interactive shell (CI, piped) must never trigger the synchronous
    // git/npm probe storm — the report-only hint is static.
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(out()).toContain('harness skill update');
  });

  it('HARNESS_NO_UPDATE_CHECK=1 suppresses ALL freshness behavior (no probe, no output)', async () => {
    setTty(true);
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    await offerSkillProviderUpdates();
    // Opt-out is checked BEFORE probing: no probe, no prompt, no output.
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(out()).toBe('');
  });

  it('prints nothing when no community lockfile exists (no CI noise)', async () => {
    // No external providers were ever installed => no lockfile => the static
    // report-only hint must NOT print, even in a non-TTY (FIX #4).
    setTty(false);
    mockedExists.mockReturnValue(false);
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    await offerSkillProviderUpdates();
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(out()).toBe('');
  });

  it('prints nothing on a TTY when no community lockfile exists', async () => {
    setTty(true);
    mockedExists.mockReturnValue(false);
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    await offerSkillProviderUpdates();
    expect(mockedProbe).not.toHaveBeenCalled();
    expect(out()).toBe('');
  });

  it('never throws when the probe fails (does not abort update)', async () => {
    setTty(true);
    mockedProbe.mockImplementation(() => { throw new Error('probe boom'); });
    await expect(offerSkillProviderUpdates()).resolves.toBeUndefined();
  });
});
