import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/commands/skill/provider-update', () => ({
  probeProviders: vi.fn(),
  updateProviders: vi.fn(),
}));
vi.mock('../../src/commands/install', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/commands/install')>();
  return { ...actual, resolveCommunityBase: vi.fn(() => ({ communityBase: '/c', lockfilePath: '/c/skills-lock.json' })) };
});

import { probeProviders, updateProviders } from '../../src/commands/skill/provider-update';
import { createUpdateCommand } from '../../src/commands/skill/update';
import { createSkillCommand } from '../../src/commands/skill/index';

const mockedProbe = vi.mocked(probeProviders);
const mockedUpdate = vi.mocked(updateProviders);

const outdatedGh = { name: '@harness-skills/gh', kind: 'github', current: 'old', latest: 'new', outdated: true, global: false, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old' } } as any;
const currentNpm = { name: '@harness-skills/n', kind: 'npm', current: '1', latest: '1', outdated: false, global: true, source: { kind: 'npm', package: '@harness-skills/n' } } as any;
// A provider whose upstream probe failed (offline/CI): latest === null. Fail-safe:
// never outdated, never auto-repulled — but must render distinctly, not "up to date".
const uncheckedGh = { name: '@harness-skills/u', kind: 'github', current: 'abc123', latest: null, outdated: false, global: false, source: { kind: 'github', owner: 'o', repo: 'u', ref: 'main', commit: 'abc123' } } as any;

function out() { return logSpy.mock.calls.map((c: any[]) => c.map((x) => String(x)).join(' ')).join('\n'); }

let exitSpy: any;
let logSpy: any;
beforeEach(() => {
  vi.clearAllMocks();
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => { throw new Error(`exit:${c}`); }) as any);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { exitSpy.mockRestore(); logSpy.mockRestore(); });

async function run(args: string[]) {
  const cmd = createUpdateCommand();
  try { await cmd.parseAsync(['node', 'skill-update', ...args]); } catch (e) { return String((e as Error).message); }
  return null;
}

describe('harness skill update', () => {
  it('is registered under the skill command group', () => {
    expect(createSkillCommand().commands.find((c) => c.name() === 'update')).toBeDefined();
  });

  it('--check exits 1 (VALIDATION_FAILED) when a provider is outdated', async () => {
    mockedProbe.mockReturnValue({ providers: [outdatedGh], sourceless: [] });
    expect(await run(['--check'])).toBe('exit:1');
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('--check exits 0 when nothing is outdated', async () => {
    mockedProbe.mockReturnValue({ providers: [currentNpm], sourceless: [] });
    expect(await run(['--check'])).toBe('exit:0');
  });

  it('reports sourceless entries without crashing', async () => {
    mockedProbe.mockReturnValue({ providers: [], sourceless: [{ name: '@harness-skills/old', global: false }] });
    await run([]);
    const out = logSpy.mock.calls.map((c: any[]) => c.map((x) => String(x)).join(' ')).join('\n');
    expect(out.toLowerCase()).toContain('source unknown');
  });

  it('runs updateProviders with yes=false by default', async () => {
    mockedProbe.mockReturnValue({ providers: [outdatedGh], sourceless: [] });
    mockedUpdate.mockResolvedValue([{ name: '@harness-skills/gh', updated: true }]);
    await run([]);
    expect(mockedUpdate).toHaveBeenCalledWith([outdatedGh], { yes: false });
  });

  it('passes yes=true with --yes', async () => {
    mockedProbe.mockReturnValue({ providers: [outdatedGh], sourceless: [] });
    mockedUpdate.mockResolvedValue([{ name: '@harness-skills/gh', updated: true }]);
    await run(['--yes']);
    expect(mockedUpdate).toHaveBeenCalledWith([outdatedGh], { yes: true });
  });

  it('renders a failed probe as "could not check", not "(up to date)"', async () => {
    mockedProbe.mockReturnValue({ providers: [uncheckedGh], sourceless: [] });
    expect(await run(['--check'])).toBe('exit:0'); // probe failure is NOT outdated
    const rendered = out();
    expect(rendered).toContain('could not check');
    expect(rendered).not.toContain('up to date');
  });

  it('--check exits 0 when the only provider could not be checked (never auto-repull on probe failure)', async () => {
    mockedProbe.mockReturnValue({ providers: [uncheckedGh], sourceless: [] });
    expect(await run(['--check'])).toBe('exit:0');
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('filters to a single provider by [name]', async () => {
    mockedProbe.mockReturnValue({ providers: [outdatedGh, currentNpm], sourceless: [] });
    // filter to the current npm provider -> nothing outdated in scope -> exit 0
    expect(await run(['--check', 'n'])).toBe('exit:0');
    // filter to the outdated github provider -> exit 1
    expect(await run(['--check', 'gh'])).toBe('exit:1');
  });
});
