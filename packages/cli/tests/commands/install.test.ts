import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import {
  createInstallCommand,
  runInstall,
  runBulkInstall,
  installSkillDir,
  offerGenerateSlashCommands,
} from '../../src/commands/install';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFileSync: vi.fn(() => {
      throw new Error('git not available in test environment');
    }),
  };
});

vi.mock('../../src/output/prompt', () => ({ prompt: vi.fn() }));

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
import { execFileSync } from 'child_process';
import { prompt } from '../../src/output/prompt';

const mockedExecFileSync = vi.mocked(execFileSync);
const mockedPrompt = vi.mocked(prompt);
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

  it('has --generate option', () => {
    const cmd = createInstallCommand();
    expect(cmd.options.find((o) => o.long === '--generate')).toBeDefined();
  });

  it('has --no-generate option', () => {
    const cmd = createInstallCommand();
    expect(cmd.options.find((o) => o.long === '--no-generate')).toBeDefined();
  });

  it('resolves generate as a tri-state: undefined / true / false', () => {
    // Guards the implicit contract that --generate is declared before --no-generate;
    // reordering would make Commander default `generate` to true and silently break
    // the interactive-prompt-by-default behavior.
    const parse = (argv: string[]): boolean | undefined => {
      const cmd = createInstallCommand();
      cmd.exitOverride().action(() => {}); // no-op action; we only want parsed opts
      cmd.parse(['some-skill', ...argv], { from: 'user' });
      return cmd.opts().generate as boolean | undefined;
    };
    expect(parse([])).toBeUndefined();
    expect(parse(['--generate'])).toBe(true);
    expect(parse(['--no-generate'])).toBe(false);
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
      name: 'acme-ui',
      version: '1.0.0',
      description: 'Acme UI skill',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });

    const result = await runInstall('acme-ui', { from: '/path/to/skill', global: true });
    expect(result.installed).toBe(true);
    // placeSkillContent should be called with the global community base dir
    expect(mockedPlaceContent).toHaveBeenCalledWith(
      expect.any(String),
      '/home/user/.harness/skills/community',
      'acme-ui',
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
    // Directory structure: /project/skills/{acme-ui,acme-tools}/skill.yaml
    // Root dir does NOT have skill.yaml — subdirs do
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      // Normalize separators for cross-platform compatibility (Windows uses backslashes)
      const s = String(p).replace(/\\/g, '/');
      // No skill.yaml at root, but subdirs exist and have skill.yaml
      if (s.endsWith('/project/skills/skill.yaml')) return false;
      return true;
    });
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);

    // Mock readdirSync to return skill subdirectories for the root
    const mockedReaddirSync = vi.mocked(fs.readdirSync);
    mockedReaddirSync.mockImplementation(((p: string, _opts?: unknown) => {
      const normalized = String(p).replace(/\\/g, '/');
      if (normalized.endsWith('/project/skills')) {
        return [
          { name: 'acme-ui', isDirectory: () => true },
          { name: 'acme-tools', isDirectory: () => true },
        ] as unknown as fs.Dirent[];
      }
      // Skill subdirs themselves have no further subdirs
      return [] as unknown as fs.Dirent[];
    }) as typeof fs.readdirSync);

    mockedYamlParse.mockReturnValue({
      name: 'acme-ui',
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
    await expect(runInstall('acme', { from: 'github:owner/repo' })).rejects.toThrow(); // Will fail at git clone, but proves the GitHub path is taken
  });
});

describe('installSkillDir source recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set());
    mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
    mockedExistsSync.mockReturnValue(true);
    mockedYamlParse.mockReturnValue({
      name: 'acme',
      version: '1.0.0',
      description: 'd',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });
  });

  it('defaults to a local source when none is provided', () => {
    installSkillDir('/pkg', '/resolved/path', {});
    const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
    expect(entry.source).toEqual({ kind: 'local', path: '/resolved/path' });
  });

  it('records an explicit github source when provided', () => {
    const source = { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'sha' } as const;
    installSkillDir('/pkg', '/resolved/path', {}, source);
    const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
    expect(entry.source).toEqual(source);
  });
});

describe('GitHub source provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set());
    mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
    mockedExistsSync.mockReturnValue(true);
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
    mockedYamlParse.mockReturnValue({
      name: 'gh-skill',
      version: '1.0.0',
      description: 'd',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });
    mockedExecFileSync.mockImplementation(((_cmd: string, args?: readonly string[]) => {
      if (Array.isArray(args) && args.includes('rev-parse')) return Buffer.from('deadbeefsha\n');
      return Buffer.from('');
    }) as typeof execFileSync);
  });

  it('records a github source with the resolved commit SHA', async () => {
    await runInstall('ignored', { from: 'github:owner/repo#main' });
    const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
    expect(entry.source).toEqual({
      kind: 'github',
      owner: 'owner',
      repo: 'repo',
      ref: 'main',
      commit: 'deadbeefsha',
    });
  });

  it('cleans up the temp clone dir when git rev-parse fails (not just clone)', async () => {
    // clone succeeds (empty buffer), rev-parse throws — the temp dir must still be removed.
    mockedExecFileSync.mockImplementation(((_cmd: string, args?: readonly string[]) => {
      if (Array.isArray(args) && args.includes('rev-parse')) {
        throw new Error('rev-parse failed');
      }
      return Buffer.from('');
    }) as typeof execFileSync);
    await expect(runInstall('ignored', { from: 'github:owner/repo#main' })).rejects.toThrow();
    expect(mockedCleanup).toHaveBeenCalled();
  });
});

describe('local source provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set());
    mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
    mockedExistsSync.mockReturnValue(true);
    mockedStatSync.mockReturnValue({ isDirectory: () => true } as fs.Stats);
    mockedYamlParse.mockReturnValue({
      name: 'local-skill',
      version: '0.1.0',
      description: 'd',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });
  });

  it('records a local source for --from installs', async () => {
    await runInstall('local-skill', { from: '/path/to/skill' });
    const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
    expect(entry.source).toEqual({ kind: 'local', path: path.resolve('/path/to/skill') });
  });
});

describe('npm source provenance', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set());
    mockedReadLockfile.mockReturnValue({ version: 2, skills: {} });
    mockedUpdateLockfileEntry.mockImplementation((lf, name, entry) => ({
      ...lf,
      skills: { ...lf.skills, [name]: entry },
    }));
    mockedFetchMetadata.mockResolvedValue(metadata);
    mockedResolveVersion.mockReturnValue(metadata.versions['1.0.0']);
    mockedDownloadTarball.mockResolvedValue(Buffer.from('tarball'));
    mockedExtractTarball.mockReturnValue('/tmp/extracted');
    mockedExistsSync.mockReturnValue(true);
    mockedYamlParse.mockReturnValue({
      name: 'deployment',
      version: '1.0.0',
      description: 'd',
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: [],
      type: 'flexible',
      depends_on: [],
    });
  });

  it('records an npm source with the resolved package name', async () => {
    await runInstall('deployment', {});
    const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
    expect(entry.source).toEqual({ kind: 'npm', package: '@harness-skills/deployment' });
  });

  it('includes the custom registry in the npm source', async () => {
    await runInstall('deployment', { registry: 'https://custom.example.com' });
    const entry = mockedUpdateLockfileEntry.mock.calls.at(-1)![2];
    expect(entry.source).toEqual({
      kind: 'npm',
      package: '@harness-skills/deployment',
      registry: 'https://custom.example.com',
    });
  });
});

describe('offerGenerateSlashCommands', () => {
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecFileSync.mockImplementation(() => Buffer.from(''));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    process.stdout.isTTY = originalStdoutIsTTY;
    process.stdin.isTTY = originalStdinIsTTY;
    logSpy.mockRestore();
  });

  const hintPrinted = (): boolean =>
    logSpy.mock.calls.some((c) => c.some((a) => String(a).includes('generate-slash-commands')));
  const generateRan = (): boolean =>
    mockedExecFileSync.mock.calls.some(
      (c) => c[0] === 'harness' && Array.isArray(c[1]) && c[1][0] === 'generate-slash-commands'
    );

  it('TTY + assent runs generate-slash-commands', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    mockedPrompt.mockResolvedValue(''); // default Y
    await offerGenerateSlashCommands({});
    expect(mockedPrompt).toHaveBeenCalled();
    expect(generateRan()).toBe(true);
  });

  it('TTY + decline does not run generate-slash-commands', async () => {
    process.stdout.isTTY = true;
    process.stdin.isTTY = true;
    mockedPrompt.mockResolvedValue('n');
    await offerGenerateSlashCommands({});
    expect(generateRan()).toBe(false);
    expect(hintPrinted()).toBe(true);
  });

  it('piped stdin (stdout TTY, stdin non-TTY) prints hint without prompting', async () => {
    // Guards the "never hangs on readline" contract: prompt() reads stdin, so an
    // EOF/piped stdin must fall back to the hint even when stdout is a TTY.
    process.stdout.isTTY = true;
    process.stdin.isTTY = false;
    await offerGenerateSlashCommands({});
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(generateRan()).toBe(false);
    expect(hintPrinted()).toBe(true);
  });

  it('non-TTY prints the hint without prompting or running', async () => {
    process.stdout.isTTY = false;
    await offerGenerateSlashCommands({});
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(generateRan()).toBe(false);
    expect(hintPrinted()).toBe(true);
  });

  it('--generate runs without prompting and threads global scope flags', async () => {
    process.stdout.isTTY = false;
    await offerGenerateSlashCommands({ generate: true, global: true });
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'harness',
      ['generate-slash-commands', '--global', '--include-global'],
      { stdio: 'inherit' }
    );
  });

  it('--no-generate suppresses entirely (no prompt, run, or hint)', async () => {
    process.stdout.isTTY = true;
    await offerGenerateSlashCommands({ generate: false });
    expect(mockedPrompt).not.toHaveBeenCalled();
    expect(generateRan()).toBe(false);
    expect(hintPrinted()).toBe(false);
  });
});
