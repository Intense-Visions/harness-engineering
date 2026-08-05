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

import { probeProviders, updateProviders } from '../../src/commands/skill/provider-update';
import { prompt } from '../../src/output/prompt';
import { offerSkillProviderUpdates } from '../../src/commands/update';

const mockedProbe = vi.mocked(probeProviders);
const mockedUpdate = vi.mocked(updateProviders);
const mockedPrompt = vi.mocked(prompt);
const outdated = { name: '@harness-skills/gh', kind: 'github', current: 'old', latest: 'new', outdated: true, global: false, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old' } } as any;

let logSpy: any;
const origTtyOut = process.stdout.isTTY;
const origTtyIn = process.stdin.isTTY;
const origEnv = process.env;
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...origEnv };
  delete process.env['HARNESS_NO_UPDATE_CHECK'];
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

  it('non-TTY prints a report-only hint and never prompts', async () => {
    setTty(false);
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    await offerSkillProviderUpdates();
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(out()).toContain('harness skill update');
  });

  it('HARNESS_NO_UPDATE_CHECK=1 degrades to report-only even on a TTY', async () => {
    setTty(true);
    process.env['HARNESS_NO_UPDATE_CHECK'] = '1';
    mockedProbe.mockReturnValue({ providers: [outdated], sourceless: [] });
    await offerSkillProviderUpdates();
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(out()).toContain('harness skill update');
  });

  it('never throws when the probe fails (does not abort update)', async () => {
    mockedProbe.mockImplementation(() => { throw new Error('probe boom'); });
    await expect(offerSkillProviderUpdates()).resolves.toBeUndefined();
  });
});
