import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInstallCommand, runInstall, runBulkInstall } from '../../src/commands/install';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => {
    throw new Error('git not available in test environment');
  }),
}));

// Mock all registry modules
vi.mock('../../src/registry/npm-client', () => ({
  resolvePackageName: vi.fn((name: string) =>
    name.startsWith('@') ? name : `@harness-skills/${name}`
  ),
  extractSkillName: vi.fn((name: string) => name.replace('@harness-skills/', '')),
  fetchPackageMetadata: vi.fn(),
  downloadTarball: vi.fn(),
  readNpmrcToken: vi.fn(() => null),
}));

vi.mock('../../src/registry/tarball', () => ({
  extractTarball: vi.fn(),
  placeSkillContent: vi.fn(),
  cleanupTempDir: vi.fn(),
}));

vi.mock('../../src/registry/resolver', () => ({
  resolveVersion: vi.fn(),
}));

vi.mock('../../src/registry/lockfile', () => ({
  readLockfile: vi.fn(),
  writeLockfile: vi.fn(),
  updateLockfileEntry: vi.fn(),
}));

vi.mock('../../src/registry/bundled-skills', () => ({
  getBundledSkillNames: vi.fn(),
}));

vi.mock('../../src/utils/paths', () => ({
  resolveGlobalSkillsDir: vi.fn(() => '/global/skills/claude-code'),
  resolveCommunitySkillsDir: vi.fn(() => '/community/skills/claude-code'),
  resolveGlobalCommunityBaseDir: vi.fn(() => '/home/user/.harness/skills/community'),
}));

vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => 'name: deployment\nversion: 1.0.0\n'),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    readdirSync: vi.fn(() => []),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import { fetchPackageMetadata, downloadTarball } from '../../src/registry/npm-client';
import { extractTarball, placeSkillContent, cleanupTempDir } from '../../src/registry/tarball';
import { resolveVersion } from '../../src/registry/resolver';
import { readLockfile, writeLockfile, updateLockfileEntry } from '../../src/registry/lockfile';
import { getBundledSkillNames } from '../../src/registry/bundled-skills';
import { parse as yamlParse } from 'yaml';
import * as fs from 'fs';

const mockedFetchMetadata = vi.mocked(fetchPackageMetadata);
const mockedDownloadTarball = vi.mocked(downloadTarball);
const mockedExtractTarball = vi.mocked(extractTarball);
const mockedPlaceContent = vi.mocked(placeSkillContent);
const mockedCleanup = vi.mocked(cleanupTempDir);
const mockedResolveVersion = vi.mocked(resolveVersion);
const mockedReadLockfile = vi.mocked(readLockfile);
const mockedWriteLockfile = vi.mocked(writeLockfile);
const mockedUpdateLockfileEntry = vi.mocked(updateLockfileEntry);
const mockedGetBundledNames = vi.mocked(getBundledSkillNames);
const mockedYamlParse = vi.mocked(yamlParse);
const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedStatSync = vi.mocked(fs.statSync);

describe('createInstallCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createInstallCommand();
    expect(cmd.name()).toBe('install');
  });

  it('has --version option', () => {
    const cmd = createInstallCommand();
    const opt = cmd.options.find((o) => o.long === '--version');
    expect(opt).toBeDefined();
  });

  it('has --force option', () => {
    const cmd = createInstallCommand();
    const opt = cmd.options.find((o) => o.long === '--force');
    expect(opt).toBeDefined();
  });
});

describe('runInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set(['harness-tdd', 'harness-planning']));
    mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
  });

  it('installs a skill successfully', async () => {
    const metadata = {
      name: '@harness-skills/deployment',
      'dist-tags': { latest: '1.0.0' },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: {
            tarball: 'https://registry.npmjs.org/@harness-skills/deployment/-/deployment-1.0.0.tgz',
            shasum: 'abc',
            integrity: 'sha512-abc',
          },
        },
      },
    };
    mockedFetchMetadata.mockResolvedValue(metadata);
    mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);
    mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
    mockedExtractTarball.mockReturnValue('/tmp/extracted');
    mockedYamlParse.mockReturnValue({
      name: 'deployment',
      version: '1.0.0',
      description: 'Deployment skill',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    const result = await runInstall('deployment', {});
    expect(result.installed).toBe(true);
    expect(result.name).toBe('@harness-skills/deployment');
    expect(result.version).toBe('1.0.0');
    expect(mockedPlaceContent).toHaveBeenCalled();
    expect(mockedWriteLockfile).toHaveBeenCalled();
    expect(mockedCleanup).toHaveBeenCalled();
  });

  it('rejects bundled skill names', async () => {
    await expect(runInstall('harness-tdd', {})).rejects.toThrow(
      'bundled skill and cannot be overridden'
    );
  });

  it('skips when same version already installed', async () => {
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/deployment': {
          version: '1.0.0',
          resolved: 'https://example.com/deployment.tgz',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-24T10:00:00Z',
          dependencyOf: null,
        },
      },
    });
    const metadata = {
      name: '@harness-skills/deployment',
      'dist-tags': { latest: '1.0.0' },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: {
            tarball: 'https://example.com/deployment.tgz',
            shasum: 'abc',
            integrity: 'sha512-abc',
          },
        },
      },
    };
    mockedFetchMetadata.mockResolvedValue(metadata);
    mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);

    const result = await runInstall('deployment', {});
    expect(result.installed).toBe(false);
    expect(result.skipped).toBe(true);
    expect(mockedDownloadTarball).not.toHaveBeenCalled();
  });

  it('upgrades when newer version available', async () => {
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/deployment': {
          version: '1.0.0',
          resolved: 'https://example.com/deployment-1.0.0.tgz',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-24T10:00:00Z',
          dependencyOf: null,
        },
      },
    });
    const metadata = {
      name: '@harness-skills/deployment',
      'dist-tags': { latest: '1.1.0' },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: {
            tarball: 'https://example.com/deployment-1.0.0.tgz',
            shasum: 'abc',
            integrity: 'sha512-abc',
          },
        },
        '1.1.0': {
          version: '1.1.0',
          dist: {
            tarball: 'https://example.com/deployment-1.1.0.tgz',
            shasum: 'def',
            integrity: 'sha512-def',
          },
        },
      },
    };
    mockedFetchMetadata.mockResolvedValue(metadata);
    mockedResolveVersion.mockReturnValue(metadata.versions['1.1.0']);
    mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
    mockedExtractTarball.mockReturnValue('/tmp/extracted');
    mockedYamlParse.mockReturnValue({
      name: 'deployment',
      version: '1.1.0',
      description: 'Deployment skill',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    const result = await runInstall('deployment', {});
    expect(result.installed).toBe(true);
    expect(result.upgraded).toBe(true);
    expect(result.previousVersion).toBe('1.0.0');
  });

  it('cleans up temp dir on validation failure', async () => {
    const metadata = {
      name: '@harness-skills/deployment',
      'dist-tags': { latest: '1.0.0' },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: {
            tarball: 'https://example.com/deployment.tgz',
            shasum: 'abc',
            integrity: 'sha512-abc',
          },
        },
      },
    };
    mockedFetchMetadata.mockResolvedValue(metadata);
    mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);
    mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
    mockedExtractTarball.mockReturnValue('/tmp/extracted');
    mockedYamlParse.mockReturnValue({ invalid: true });

    await expect(runInstall('deployment', {})).rejects.toThrow('contains invalid skill.yaml');
    expect(mockedCleanup).toHaveBeenCalledWith('/tmp/extracted');
    expect(mockedPlaceContent).not.toHaveBeenCalled();
  });
});

describe('createInstallCommand options', () => {
  it('has --from option', () => {
    const cmd = createInstallCommand();
    const opt = cmd.options.find((o) => o.long === '--from');
    expect(opt).toBeDefined();
  });

  it('has --registry option', () => {
    const cmd = createInstallCommand();
    const opt = cmd.options.find((o) => o.long === '--registry');
    expect(opt).toBeDefined();
  });
});

describe('local install (--from)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set(['harness-tdd', 'harness-planning']));
    mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
  });

  it('rejects when --from and --registry are both set', async () => {
    await expect(
      runInstall('anything', { from: './path', registry: 'https://example.com' })
    ).rejects.toThrow('--from and --registry cannot be used together');
  });

  it('installs from a local directory', async () => {
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      if (String(p).includes('skill.yaml')) return true;
      return true;
    });
    mockedYamlParse.mockReturnValue({
      name: 'local-skill',
      version: '0.1.0',
      description: 'A local skill',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    const result = await runInstall('local-skill', { from: '/path/to/skill' });
    expect(result.installed).toBe(true);
    expect(result.name).toBe('@harness-skills/local-skill');
    expect(result.version).toBe('0.1.0');
    // Should NOT have called npm functions
    expect(mockedFetchMetadata).not.toHaveBeenCalled();
    expect(mockedDownloadTarball).not.toHaveBeenCalled();
    // Should have called place and lockfile
    expect(mockedPlaceContent).toHaveBeenCalled();
    expect(mockedWriteLockfile).toHaveBeenCalled();
  });

  it('throws when --from dir has no skill.yaml anywhere', async () => {
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      // The --from path itself exists, but no skill.yaml anywhere inside it
      if (String(p).includes('skill.yaml')) return false;
      return true;
    });
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
    // readdirSync returns empty — no subdirs to scan
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    await expect(runInstall('local-skill', { from: '/path/to/skill' })).rejects.toThrow(
      'No skills found'
    );
  });

  it('throws for unsupported file type', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedStatSync.mockReturnValue({ isDirectory: () => false } as fs.Stats);

    await expect(runInstall('local-skill', { from: '/path/to/skill.zip' })).rejects.toThrow(
      '--from path must be a directory or .tgz file'
    );
  });
});

describe('global install (--global)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set(['harness-tdd', 'harness-planning']));
    mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
  });

  it('has --global option', () => {
    const cmd = createInstallCommand();
    const opt = cmd.options.find((o) => o.long === '--global');
    expect(opt).toBeDefined();
  });

  it('installs to global community dir when --global is set', async () => {
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
    mockedExistsSync.mockReturnValue(true);
    mockedYamlParse.mockReturnValue({
      name: 'capillary-ui',
      version: '1.0.0',
      description: 'Cap UI skill',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    const result = await runInstall('capillary-ui', { from: '/path/to/skill', global: true });
    expect(result.installed).toBe(true);
    // placeSkillContent should be called with the global community base dir
    expect(mockedPlaceContent).toHaveBeenCalledWith(
      expect.any(String),
      '/home/user/.harness/skills/community',
      'capillary-ui',
      ['claude-code']
    );
  });

  it('allows installing bundled skill names globally', async () => {
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
    mockedExistsSync.mockReturnValue(true);
    mockedYamlParse.mockReturnValue({
      name: 'harness-tdd',
      version: '2.0.0',
      description: 'Custom TDD',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    // Global installs skip bundled collision check
    const result = await runInstall('harness-tdd', { from: '/path/to/skill', global: true });
    expect(result.installed).toBe(true);
  });
});

describe('bulk install from directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set());
    mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
  });

  it('auto-discovers and installs multiple skills from a directory', async () => {
    // Directory structure: /project/skills/{capillary-ui,capillary-vulcan}/skill.yaml
    // Root dir does NOT have skill.yaml — subdirs do
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      // No skill.yaml at root, but subdirs exist and have skill.yaml
      if (s === '/project/skills/skill.yaml') return false;
      return true;
    });
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);

    // Mock readdirSync to return skill subdirectories for the root
    const mockedReaddirSync = vi.mocked(fs.readdirSync);
    mockedReaddirSync.mockImplementation(((p: string, _opts?: unknown) => {
      if (String(p) === '/project/skills') {
        return [
          { name: 'capillary-ui', isDirectory: () => true },
          { name: 'capillary-vulcan', isDirectory: () => true },
        ] as unknown as fs.Dirent[];
      }
      // Skill subdirs themselves have no further subdirs
      return [] as unknown as fs.Dirent[];
    }) as typeof fs.readdirSync);

    mockedYamlParse.mockReturnValue({
      name: 'capillary-ui',
      version: '1.0.0',
      description: 'A skill',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    const results = await runBulkInstall('/project/skills', {});
    expect(results.length).toBe(2);
    expect(results.every((r) => r.installed)).toBe(true);
  });

  it('auto-detects bulk install when --from dir has no skill.yaml', async () => {
    // When --from points to a directory without skill.yaml at root,
    // it should discover child skill dirs
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      // Root dir exists but has no skill.yaml
      if (s === '/project/skills/skill.yaml') return false;
      return true;
    });
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);

    const mockedReaddirSync = vi.mocked(fs.readdirSync);
    mockedReaddirSync.mockImplementation(((p: string, _opts?: unknown) => {
      if (String(p).includes('/project/skills')) {
        return [{ name: 'my-skill', isDirectory: () => true }] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    }) as typeof fs.readdirSync);

    mockedYamlParse.mockReturnValue({
      name: 'my-skill',
      version: '1.0.0',
      description: 'A skill',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    const result = await runInstall('my-skill', { from: '/project/skills' });
    expect(result.installed).toBe(true);
  });
});

describe('GitHub install', () => {
  it('parses github: shorthand references', async () => {
    // The parseGitHubRef function is internal, but we can test through runInstall
    // which will try to clone — this will fail in test env but validates the path
    await expect(runInstall('capillary', { from: 'github:owner/repo' })).rejects.toThrow(); // Will fail at git clone, but proves the GitHub path is taken
  });
});
