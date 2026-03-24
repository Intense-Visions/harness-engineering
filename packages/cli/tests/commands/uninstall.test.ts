import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUninstallCommand, runUninstall } from '../../src/commands/uninstall';

vi.mock('../../src/registry/npm-client', () => ({
  resolvePackageName: vi.fn((name: string) =>
    name.startsWith('@') ? name : `@harness-skills/${name}`
  ),
  extractSkillName: vi.fn((name: string) => name.replace('@harness-skills/', '')),
}));

vi.mock('../../src/registry/lockfile', () => ({
  readLockfile: vi.fn(),
  writeLockfile: vi.fn(),
  removeLockfileEntry: vi.fn(),
}));

vi.mock('../../src/registry/resolver', () => ({
  findDependentsOf: vi.fn(),
}));

vi.mock('../../src/registry/tarball', () => ({
  removeSkillContent: vi.fn(),
}));

vi.mock('../../src/utils/paths', () => ({
  resolveGlobalSkillsDir: vi.fn(() => '/global/skills/claude-code'),
}));

import { readLockfile, writeLockfile, removeLockfileEntry } from '../../src/registry/lockfile';
import { findDependentsOf } from '../../src/registry/resolver';
import { removeSkillContent } from '../../src/registry/tarball';

const mockedReadLockfile = vi.mocked(readLockfile);
const mockedWriteLockfile = vi.mocked(writeLockfile);
const mockedRemoveLockfileEntry = vi.mocked(removeLockfileEntry);
const mockedFindDependents = vi.mocked(findDependentsOf);
const mockedRemoveContent = vi.mocked(removeSkillContent);

describe('createUninstallCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createUninstallCommand();
    expect(cmd.name()).toBe('uninstall');
  });

  it('has --force option', () => {
    const cmd = createUninstallCommand();
    const opt = cmd.options.find((o) => o.long === '--force');
    expect(opt).toBeDefined();
  });
});

describe('runUninstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRemoveLockfileEntry.mockImplementation((lf, name) => {
      const { [name]: _removed, ...rest } = lf.skills;
      return { ...lf, skills: rest };
    });
  });

  it('uninstalls a skill successfully', async () => {
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/deployment': {
          version: '1.0.0',
          resolved: 'https://example.com/deployment.tgz',
          integrity: 'sha512-abc',
          platforms: ['claude-code', 'gemini-cli'],
          installedAt: '2026-03-24T10:00:00Z',
          dependencyOf: null,
        },
      },
    });
    mockedFindDependents.mockReturnValue([]);

    const result = await runUninstall('deployment', {});
    expect(result.removed).toBe(true);
    expect(result.name).toBe('@harness-skills/deployment');
    expect(mockedRemoveContent).toHaveBeenCalledWith(expect.any(String), 'deployment', [
      'claude-code',
      'gemini-cli',
    ]);
    expect(mockedWriteLockfile).toHaveBeenCalled();
  });

  it('throws when skill is not installed', async () => {
    mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });

    await expect(runUninstall('nonexistent', {})).rejects.toThrow(
      "Skill 'nonexistent' is not installed"
    );
  });

  it('refuses when dependents exist without --force', async () => {
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/docker-basics': {
          version: '0.3.1',
          resolved: 'https://example.com/docker-basics.tgz',
          integrity: 'sha512-def',
          platforms: ['claude-code'],
          installedAt: '2026-03-24T10:00:01Z',
          dependencyOf: '@harness-skills/deployment',
        },
      },
    });
    mockedFindDependents.mockReturnValue(['@harness-skills/deployment']);

    await expect(runUninstall('docker-basics', {})).rejects.toThrow('is required by');
  });

  it('proceeds with --force when dependents exist', async () => {
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/docker-basics': {
          version: '0.3.1',
          resolved: 'https://example.com/docker-basics.tgz',
          integrity: 'sha512-def',
          platforms: ['claude-code'],
          installedAt: '2026-03-24T10:00:01Z',
          dependencyOf: '@harness-skills/deployment',
        },
      },
    });
    mockedFindDependents.mockReturnValue(['@harness-skills/deployment']);

    const result = await runUninstall('docker-basics', { force: true });
    expect(result.removed).toBe(true);
    expect(result.warnings).toContain(
      'Forced removal despite dependents: @harness-skills/deployment'
    );
  });
});
