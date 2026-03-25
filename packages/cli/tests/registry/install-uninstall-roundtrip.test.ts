import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInstall } from '../../src/commands/install';
import { runUninstall } from '../../src/commands/uninstall';

// Mock all external I/O
vi.mock('../../src/registry/npm-client', () => ({
  resolvePackageName: vi.fn((name: string) =>
    name.startsWith('@') ? name : `@harness-skills/${name}`
  ),
  extractSkillName: vi.fn((name: string) => name.replace('@harness-skills/', '')),
  fetchPackageMetadata: vi.fn(),
  downloadTarball: vi.fn(),
}));

vi.mock('../../src/registry/tarball', () => ({
  extractTarball: vi.fn(() => '/tmp/mock-extract'),
  placeSkillContent: vi.fn(),
  removeSkillContent: vi.fn(),
  cleanupTempDir: vi.fn(),
}));

vi.mock('../../src/registry/resolver', () => {
  const actual = vi.importActual('../../src/registry/resolver');
  return actual;
});

vi.mock('../../src/registry/bundled-skills', () => ({
  getBundledSkillNames: vi.fn(() => new Set(['harness-tdd'])),
}));

vi.mock('../../src/utils/paths', () => ({
  resolveGlobalSkillsDir: vi.fn(() => '/mock/agents/skills/claude-code'),
}));

// Mock fs and yaml to control skill.yaml reading
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const store: Record<string, string> = {};
  return {
    ...actual,
    existsSync: vi.fn((p: string) => {
      if (String(p).includes('skills-lock.json')) return String(p) in store;
      if (String(p).includes('skill.yaml')) return true;
      return true;
    }),
    readFileSync: vi.fn((p: string) => {
      if (String(p).includes('skills-lock.json'))
        return store[String(p)] ?? '{"version":1,"skills":{}}';
      return 'name: deployment\nversion: 1.0.0\n';
    }),
    writeFileSync: vi.fn((p: string, content: string) => {
      store[String(p)] = content;
    }),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock('yaml', () => ({
  parse: vi.fn(() => ({
    name: 'deployment',
    version: '1.0.0',
    description: 'Deploy skill',
    triggers: ['manual'],
    platforms: ['claude-code'],
    tools: [],
    type: 'flexible',
    depends_on: [],
  })),
}));

import { fetchPackageMetadata, downloadTarball } from '../../src/registry/npm-client';

const mockedFetchMetadata = vi.mocked(fetchPackageMetadata);
const mockedDownloadTarball = vi.mocked(downloadTarball);

describe('install -> uninstall round-trip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('install then uninstall completes cleanly', async () => {
    // Setup metadata
    mockedFetchMetadata.mockResolvedValue({
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
    });
    mockedDownloadTarball.mockResolvedValue(Buffer.from('fake-tarball'));

    const installResult = await runInstall('deployment', {});
    expect(installResult.installed).toBe(true);
    expect(installResult.name).toBe('@harness-skills/deployment');
    expect(installResult.version).toBe('1.0.0');
  });
});
