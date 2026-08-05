import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: vi.fn() };
});
vi.mock('../../../src/registry/lockfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/registry/lockfile')>();
  return { ...actual, readLockfile: vi.fn() };
});

import { execFileSync } from 'child_process';
import { readLockfile } from '../../../src/registry/lockfile';
import { probeProviders } from '../../../src/commands/skill/provider-update';

const mockedExec = vi.mocked(execFileSync);
const mockedRead = vi.mocked(readLockfile);

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
});
