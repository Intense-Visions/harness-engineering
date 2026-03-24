import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateForPublish, type ValidationResult } from '../../src/registry/validator';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('../../src/registry/bundled-skills', () => ({
  getBundledSkillNames: vi.fn(),
}));

vi.mock('../../src/utils/paths', () => ({
  resolveGlobalSkillsDir: vi.fn(() => '/global/skills/claude-code'),
}));

vi.mock('../../src/registry/npm-client', () => ({
  resolvePackageName: vi.fn((name: string) =>
    name.startsWith('@') ? name : `@harness-skills/${name}`
  ),
  fetchPackageMetadata: vi.fn(),
}));

import * as fs from 'fs';
import { getBundledSkillNames } from '../../src/registry/bundled-skills';
import { fetchPackageMetadata } from '../../src/registry/npm-client';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedGetBundledNames = vi.mocked(getBundledSkillNames);
const mockedFetchMetadata = vi.mocked(fetchPackageMetadata);

describe('validateForPublish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetBundledNames.mockReturnValue(new Set(['harness-tdd', 'harness-planning']));
  });

  it('passes validation for a valid skill', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.endsWith('skill.yaml')) {
        return 'name: my-skill\nversion: 0.1.0\ndescription: A skill\nplatforms:\n  - claude-code\ntriggers:\n  - manual\ntools: []\ntype: flexible\ndepends_on: []';
      }
      if (s.endsWith('SKILL.md')) {
        return '# my-skill\n\n## When to Use\n\nUse this skill when...\n\n## Process\n\n1. Do thing';
      }
      return '';
    });
    // First publish — 404 from npm
    mockedFetchMetadata.mockRejectedValue(new Error('Package not found'));

    const result = await validateForPublish('/path/to/skill');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when skill.yaml does not exist', async () => {
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      return !String(p).endsWith('skill.yaml');
    });

    const result = await validateForPublish('/path/to/skill');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('skill.yaml');
  });

  it('fails when SKILL.md is missing', async () => {
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.endsWith('SKILL.md')) return false;
      return true;
    });
    mockedReadFileSync.mockReturnValue(
      'name: test\nversion: 0.1.0\ndescription: Test\nplatforms:\n  - claude-code\ntriggers:\n  - manual\ntools: []\ntype: flexible\ndepends_on: []'
    );

    const result = await validateForPublish('/path/to/skill');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('SKILL.md'))).toBe(true);
  });

  it('fails when SKILL.md lacks required sections', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: fs.PathLike) => {
      if (String(p).endsWith('skill.yaml')) {
        return 'name: test\nversion: 0.1.0\ndescription: Test\nplatforms:\n  - claude-code\ntriggers:\n  - manual\ntools: []\ntype: flexible\ndepends_on: []';
      }
      if (String(p).endsWith('SKILL.md')) {
        return '# test\n\nJust some text without required sections.';
      }
      return '';
    });
    mockedFetchMetadata.mockRejectedValue(new Error('not found'));

    const result = await validateForPublish('/path/to/skill');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('When to Use'))).toBe(true);
  });

  it('fails when name conflicts with bundled skill', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: fs.PathLike) => {
      if (String(p).endsWith('skill.yaml')) {
        return 'name: harness-tdd\nversion: 0.1.0\ndescription: Test\nplatforms:\n  - claude-code\ntriggers:\n  - manual\ntools: []\ntype: flexible\ndepends_on: []';
      }
      if (String(p).endsWith('SKILL.md')) {
        return '# harness-tdd\n\n## When to Use\n\nUse it.\n\n## Process\n\n1. Do.';
      }
      return '';
    });
    mockedFetchMetadata.mockRejectedValue(new Error('not found'));

    const result = await validateForPublish('/path/to/skill');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('bundled'))).toBe(true);
  });

  it('fails when version is not bumped', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: fs.PathLike) => {
      if (String(p).endsWith('skill.yaml')) {
        return 'name: my-skill\nversion: 1.0.0\ndescription: Test\nplatforms:\n  - claude-code\ntriggers:\n  - manual\ntools: []\ntype: flexible\ndepends_on: []';
      }
      if (String(p).endsWith('SKILL.md')) {
        return '# my-skill\n\n## When to Use\n\nUse it.\n\n## Process\n\n1. Do.';
      }
      return '';
    });
    mockedFetchMetadata.mockResolvedValue({
      name: '@harness-skills/my-skill',
      'dist-tags': { latest: '1.0.0' },
      versions: {
        '1.0.0': {
          version: '1.0.0',
          dist: { tarball: '', shasum: '', integrity: '' },
        },
      },
    });

    const result = await validateForPublish('/path/to/skill');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('version') || e.includes('bump'))).toBe(true);
  });

  it('fails when description is empty', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: fs.PathLike) => {
      if (String(p).endsWith('skill.yaml')) {
        return 'name: test\nversion: 0.1.0\ndescription: ""\nplatforms:\n  - claude-code\ntriggers:\n  - manual\ntools: []\ntype: flexible\ndepends_on: []';
      }
      if (String(p).endsWith('SKILL.md')) {
        return '# test\n\n## When to Use\n\nUse.\n\n## Process\n\n1. Do.';
      }
      return '';
    });
    mockedFetchMetadata.mockRejectedValue(new Error('not found'));

    const result = await validateForPublish('/path/to/skill');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });
});
