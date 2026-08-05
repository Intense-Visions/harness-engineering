import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: vi.fn() };
});
vi.mock('../../../src/registry/lockfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/registry/lockfile')>();
  return { ...actual, readLockfile: vi.fn() };
});
vi.mock('../../../src/commands/install', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/commands/install')>();
  return { ...actual, runInstall: vi.fn().mockResolvedValue({ installed: true, name: 'x', version: '1' }) };
});
vi.mock('../../../src/output/prompt', () => ({ prompt: vi.fn() }));

import { execFileSync } from 'child_process';
import { readLockfile } from '../../../src/registry/lockfile';
import { runInstall } from '../../../src/commands/install';
import { prompt } from '../../../src/output/prompt';
import {
  probeProviders,
  updateProviders,
  type ProbedProvider,
} from '../../../src/commands/skill/provider-update';
import { MAX_PROVIDERS } from '../../../src/registry/freshness-checker';

const mockedExec = vi.mocked(execFileSync);
const mockedRead = vi.mocked(readLockfile);
const mockedInstall = vi.mocked(runInstall);
const mockedPrompt = vi.mocked(prompt);

const gh: ProbedProvider = { name: '@harness-skills/gh', kind: 'github', current: 'old', latest: 'new', outdated: true, global: false, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old' } };
const npm: ProbedProvider = { name: '@harness-skills/n', kind: 'npm', current: '1.0.0', latest: '2.0.0', outdated: true, global: true, source: { kind: 'npm', package: '@harness-skills/n' } };

function lock(skills: Record<string, unknown>) {
  return { version: 2, skills } as any;
}

describe('probeProviders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flags a github provider outdated when upstream SHA differs', () => {
    mockedRead.mockReturnValue(lock({
      '@harness-skills/gh': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
        source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'oldsha' } },
    }));
    mockedExec.mockReturnValue('newsha\trefs/heads/main\n' as any);
    const { providers } = probeProviders([{ path: '/p', global: false }]);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({ name: '@harness-skills/gh', kind: 'github', current: 'oldsha', latest: 'newsha', outdated: true, global: false });
  });

  it('marks a github provider current when SHA matches', () => {
    mockedRead.mockReturnValue(lock({
      '@harness-skills/gh': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
        source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'samesha' } },
    }));
    mockedExec.mockReturnValue('samesha\trefs/heads/main\n' as any);
    expect(probeProviders([{ path: '/p', global: false }]).providers[0].outdated).toBe(false);
  });

  it('flags an npm provider outdated when latest version differs', () => {
    mockedRead.mockReturnValue(lock({
      '@harness-skills/n': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
        source: { kind: 'npm', package: '@harness-skills/n' } },
    }));
    mockedExec.mockReturnValue('2.0.0\n' as any);
    const p = probeProviders([{ path: '/p', global: true }]).providers[0];
    expect(p).toMatchObject({ kind: 'npm', current: '1.0.0', latest: '2.0.0', outdated: true, global: true });
  });

  it('marks an npm provider current when version matches', () => {
    mockedRead.mockReturnValue(lock({
      '@harness-skills/n': { version: '2.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
        source: { kind: 'npm', package: '@harness-skills/n' } },
    }));
    mockedExec.mockReturnValue('2.0.0\n' as any);
    expect(probeProviders([{ path: '/p', global: false }]).providers[0].outdated).toBe(false);
  });

  it('reports a sourceless (legacy v1) entry instead of probing it', () => {
    mockedRead.mockReturnValue(lock({
      '@harness-skills/old': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null },
    }));
    const { providers, sourceless } = probeProviders([{ path: '/p', global: false }]);
    expect(providers).toHaveLength(0);
    expect(sourceless).toEqual([{ name: '@harness-skills/old', global: false }]);
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it('silently skips local and unrecognized-kind entries', () => {
    mockedRead.mockReturnValue(lock({
      '@harness-skills/local': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null, source: { kind: 'local', path: '/x' } },
      '@harness-skills/weird': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null, source: { kind: 'svn' } as any },
    }));
    const { providers, sourceless } = probeProviders([{ path: '/p', global: false }]);
    expect(providers).toHaveLength(0);
    expect(sourceless).toHaveLength(0);
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it('skips a github entry whose source field starts with a dash (unsafe)', () => {
    mockedRead.mockReturnValue(lock({
      '@harness-skills/bad': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
        source: { kind: 'github', owner: '-o', repo: 'r', ref: 'main', commit: 'x' } },
    }));
    const p = probeProviders([{ path: '/p', global: false }]).providers;
    expect(p[0]).toMatchObject({ outdated: false, latest: null }); // probe refused -> null -> fail-safe
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it('bounds probing to MAX_PROVIDERS on an oversized lockfile (DoS guard)', () => {
    const skills: Record<string, unknown> = {};
    for (let i = 0; i < MAX_PROVIDERS + 25; i++) {
      skills[`@harness-skills/n${i}`] = { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null,
        source: { kind: 'npm', package: `@harness-skills/n${i}` } };
    }
    mockedRead.mockReturnValue(lock(skills));
    mockedExec.mockReturnValue('2.0.0\n' as any);
    const { providers } = probeProviders([{ path: '/p', global: false }]);
    // At most MAX_PROVIDERS network probes fire even though the lockfile holds more.
    expect(mockedExec).toHaveBeenCalledTimes(MAX_PROVIDERS);
    expect(providers.length).toBe(MAX_PROVIDERS);
  });

  it('does not count sourceless/local entries against the probe cap', () => {
    const skills: Record<string, unknown> = {
      '@harness-skills/old': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null },
      '@harness-skills/local': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null, source: { kind: 'local', path: '/x' } },
      '@harness-skills/n': { version: '1.0.0', resolved: '', integrity: '', platforms: [], installedAt: '', dependencyOf: null, source: { kind: 'npm', package: '@harness-skills/n' } },
    };
    mockedRead.mockReturnValue(lock(skills));
    mockedExec.mockReturnValue('2.0.0\n' as any);
    const { providers, sourceless } = probeProviders([{ path: '/p', global: false }]);
    expect(mockedExec).toHaveBeenCalledTimes(1); // only the npm entry is probed
    expect(providers).toHaveLength(1);
    expect(sourceless).toHaveLength(1);
  });
});

describe('updateProviders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('re-pulls a github provider via a reconstructed from-spec with force', async () => {
    await updateProviders([gh], { yes: true });
    expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/gh',
      expect.objectContaining({ from: 'github:o/r#main', force: true, global: false, generate: false }));
  });

  it('re-pulls an npm provider by package name with force', async () => {
    await updateProviders([npm], { yes: true });
    expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/n',
      expect.objectContaining({ force: true, global: true, generate: false }));
  });

  it('omits the "#HEAD" ref when reconstructing a HEAD-tracking github spec', async () => {
    const head = { ...gh, source: { ...gh.source, ref: 'HEAD' } } as ProbedProvider;
    await updateProviders([head], { yes: true });
    expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/gh', expect.objectContaining({ from: 'github:o/r' }));
  });

  it('confirms per provider (default N) and skips on decline', async () => {
    mockedPrompt.mockResolvedValue('n');
    const out = await updateProviders([gh]);
    expect(mockedInstall).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ name: '@harness-skills/gh', updated: false, skipped: 'declined' });
  });

  it('re-pulls on affirmative confirmation', async () => {
    mockedPrompt.mockResolvedValue('y');
    await updateProviders([gh]);
    expect(mockedInstall).toHaveBeenCalledTimes(1);
  });

  it('skips a provider whose reconstructed source is unsafe (leading dash)', async () => {
    const bad = { ...gh, source: { kind: 'github', owner: '-o', repo: 'r', ref: 'main', commit: 'old' } } as ProbedProvider;
    const out = await updateProviders([bad], { yes: true });
    expect(mockedInstall).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ updated: false, skipped: 'unsafe' });
  });

  it.each([
    ['owner', 'o/evil'],
    ['owner', 'o#evil'],
    ['repo', 'r/evil'],
    ['repo', 'r#evil'],
    ['ref', 'main#evil'],
  ])('skips a github provider whose %s carries an embedded %s delimiter (spec injection)', async (field, value) => {
    const bad = { ...gh, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'old', [field]: value } } as ProbedProvider;
    const out = await updateProviders([bad], { yes: true });
    expect(mockedInstall).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ updated: false, skipped: 'unsafe' });
  });

  it('allows a slash-containing branch ref (round-trips cleanly, not unsafe)', async () => {
    const ok = { ...gh, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'feature/foo', commit: 'old' } } as ProbedProvider;
    await updateProviders([ok], { yes: true });
    // `feature/foo` sits after the single '#' delimiter, so it round-trips
    // through parseGitHubRef back to ref='feature/foo' — must NOT be skipped.
    expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/gh', expect.objectContaining({ from: 'github:o/r#feature/foo' }));
  });

  it('still allows a plain HEAD-relative ref with no delimiters', async () => {
    const ok = { ...gh, source: { kind: 'github', owner: 'o', repo: 'r', ref: 'v1.2.3', commit: 'old' } } as ProbedProvider;
    await updateProviders([ok], { yes: true });
    expect(mockedInstall).toHaveBeenCalledWith('@harness-skills/gh', expect.objectContaining({ from: 'github:o/r#v1.2.3' }));
  });

  it('logs and continues when one provider re-pull throws (no abort)', async () => {
    mockedInstall.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ installed: true, name: 'x', version: '2' } as any);
    const out = await updateProviders([gh, npm], { yes: true });
    expect(out[0]).toMatchObject({ name: '@harness-skills/gh', updated: false });
    expect(out[1]).toMatchObject({ name: '@harness-skills/n', updated: true });
  });
});
