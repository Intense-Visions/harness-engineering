import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInstallCommand } from '../../src/commands/install';
import { logger } from '../../src/output/logger';

/**
 * Coverage for the `install` commander action — the skipped / upgraded /
 * installed logging branches and the catch → logger.error → exit(1) path — plus
 * the resolveCommunityBase global branch, none of which the existing sibling
 * test drives (it exercises runInstall directly, never the action).
 */

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: vi.fn(() => Buffer.from('')) };
});
vi.mock('../../src/output/prompt', () => ({ prompt: vi.fn() }));
vi.mock('../../src/registry/npm-client', () => ({
  resolvePackageName: vi.fn((n: string) => (n.startsWith('@') ? n : `@harness-skills/${n}`)),
  extractSkillName: vi.fn((n: string) => n.replace('@harness-skills/', '')),
  fetchPackageMetadata: vi.fn(),
  downloadTarball: vi.fn(),
  readNpmrcToken: vi.fn(() => null),
}));
vi.mock('../../src/registry/tarball', () => ({
  extractTarball: vi.fn(() => '/tmp/extracted'),
  placeSkillContent: vi.fn(),
  cleanupTempDir: vi.fn(),
}));
vi.mock('../../src/registry/resolver', () => ({ resolveVersion: vi.fn() }));
vi.mock('../../src/registry/lockfile', () => ({
  readLockfile: vi.fn(),
  writeLockfile: vi.fn(),
  updateLockfileEntry: vi.fn((lf, name, entry) => ({
    ...lf,
    skills: { ...lf.skills, [name]: entry },
  })),
}));
vi.mock('../../src/registry/bundled-skills', () => ({ getBundledSkillNames: vi.fn() }));
vi.mock('../../src/utils/paths', () => ({
  resolveGlobalSkillsDir: vi.fn(() => '/global/skills/claude-code'),
  resolveCommunitySkillsDir: vi.fn(() => '/community/skills/claude-code'),
  resolveGlobalCommunityBaseDir: vi.fn(() => '/home/user/.harness/skills/community'),
}));
vi.mock('yaml', () => ({ parse: vi.fn() }));
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
import { extractTarball } from '../../src/registry/tarball';
import { resolveVersion } from '../../src/registry/resolver';
import { readLockfile } from '../../src/registry/lockfile';
import { getBundledSkillNames } from '../../src/registry/bundled-skills';
import { parse as yamlParse } from 'yaml';

const metadata = {
  name: '@harness-skills/deployment',
  'dist-tags': { latest: '1.0.0' },
  versions: {
    '1.0.0': {
      version: '1.0.0',
      dist: { tarball: 'https://x/deployment-1.0.0.tgz', shasum: 'a', integrity: 'sha512-a' },
    },
    '1.1.0': {
      version: '1.1.0',
      dist: { tarball: 'https://x/deployment-1.1.0.tgz', shasum: 'b', integrity: 'sha512-b' },
    },
  },
};

const validYaml = {
  name: 'deployment',
  version: '1.0.0',
  description: 'd',
  triggers: ['manual'],
  platforms: ['claude-code'],
  tools: [],
  type: 'flexible',
  depends_on: [],
};

describe('install command action (cov544b)', () => {
  let info: string[];
  let success: string[];
  let error: string[];
  let exitCode: number | null;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBundledSkillNames).mockReturnValue(new Set(['harness-tdd']));
    vi.mocked(readLockfile).mockReturnValue({ version: 1, skills: {} });
    vi.mocked(fetchPackageMetadata).mockResolvedValue(metadata);
    vi.mocked(resolveVersion).mockReturnValue(metadata.versions['1.0.0']);
    vi.mocked(downloadTarball).mockResolvedValue(Buffer.from('t'));
    vi.mocked(extractTarball).mockReturnValue('/tmp/extracted');
    vi.mocked(yamlParse).mockReturnValue(validYaml);

    info = [];
    success = [];
    error = [];
    exitCode = null;
    spies = [
      vi.spyOn(logger, 'info').mockImplementation((m: string) => info.push(m)),
      vi.spyOn(logger, 'success').mockImplementation((m: string) => success.push(m)),
      vi.spyOn(logger, 'error').mockImplementation((m: string) => error.push(m)),
      vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never),
    ];
  });

  afterEach(() => spies.forEach((s) => s.mockRestore()));

  async function run(args: string[]) {
    try {
      // --no-generate suppresses the post-install slash-command offer entirely.
      await createInstallCommand().parseAsync([...args, '--no-generate'], { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  it('logs a success line on a fresh install', async () => {
    await run(['deployment']);
    expect(success.join('\n')).toContain('Installed @harness-skills/deployment@1.0.0');
    expect(exitCode).toBeNull(); // action returns normally on success
  });

  it('logs the already-installed hint when the same version is present (skipped)', async () => {
    vi.mocked(readLockfile).mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/deployment': {
          version: '1.0.0',
          resolved: 'https://x/deployment-1.0.0.tgz',
          integrity: 'sha512-a',
          platforms: ['claude-code'],
          installedAt: '2026-01-01T00:00:00Z',
          dependencyOf: null,
        },
      },
    });
    await run(['deployment']);
    expect(info.join('\n')).toContain('already installed');
    expect(success.length).toBe(0);
  });

  it('logs an upgrade line when a newer version is installed over an older one', async () => {
    vi.mocked(readLockfile).mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/deployment': {
          version: '1.0.0',
          resolved: 'https://x/deployment-1.0.0.tgz',
          integrity: 'sha512-a',
          platforms: ['claude-code'],
          installedAt: '2026-01-01T00:00:00Z',
          dependencyOf: null,
        },
      },
    });
    vi.mocked(resolveVersion).mockReturnValue(metadata.versions['1.1.0']);
    vi.mocked(yamlParse).mockReturnValue({ ...validYaml, version: '1.1.0' });
    await run(['deployment']);
    expect(success.join('\n')).toContain('Upgraded @harness-skills/deployment from 1.0.0 to 1.1.0');
  });

  it('logs the error and exits 1 when install throws (bundled-skill collision)', async () => {
    await run(['harness-tdd']);
    expect(exitCode).toBe(1);
    expect(error.join('\n')).toContain('bundled skill and cannot be overridden');
  });
});
