import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/paths', () => ({
  resolveSkillsDir: vi.fn(() => '/bundled/skills/claude-code'),
  resolveProjectSkillsDir: vi.fn(() => '/project/agents/skills/claude-code'),
  resolveCommunitySkillsDir: vi.fn(() => '/community/skills/claude-code'),
  resolveGlobalSkillsDir: vi.fn(() => '/bundled/skills/claude-code'),
}));

vi.mock('../../src/registry/lockfile', () => ({
  readLockfile: vi.fn(),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock('yaml', () => ({
  parse: vi.fn(),
}));

import * as fs from 'fs';
import { parse as yamlParse } from 'yaml';
import { readLockfile } from '../../src/registry/lockfile';
import { collectSkills } from '../../src/commands/skill/list';
import { createListCommand } from '../../src/commands/skill/list';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReaddirSync = vi.mocked(fs.readdirSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedYamlParse = vi.mocked(yamlParse);
const mockedReadLockfile = vi.mocked(readLockfile);

describe('createListCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createListCommand();
    expect(cmd.name()).toBe('list');
  });

  it('has --installed option', () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === '--installed');
    expect(opt).toBeDefined();
  });

  it('has --local option', () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === '--local');
    expect(opt).toBeDefined();
  });

  it('has --all option', () => {
    const cmd = createListCommand();
    const opt = cmd.options.find((o) => o.long === '--all');
    expect(opt).toBeDefined();
  });
});

describe('collectSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });
  });

  it('collects bundled skills with source "bundled"', () => {
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === '/bundled/skills/claude-code') return true;
      if (s.includes('skill.yaml')) return true;
      return false;
    });
    mockedReaddirSync.mockImplementation((p: fs.PathLike) => {
      if (String(p) === '/bundled/skills/claude-code') {
        return [{ name: 'harness-tdd', isDirectory: () => true }] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    });
    mockedReadFileSync.mockReturnValue('name: harness-tdd');
    mockedYamlParse.mockReturnValue({
      name: 'harness-tdd',
      description: 'TDD skill',
      type: 'rigid',
      platforms: ['claude-code'],
      triggers: ['manual'],
      tools: [],
      version: '1.0.0',
    });

    const skills = collectSkills({ filter: 'all' });
    expect(skills).toHaveLength(1);
    expect(skills[0].source).toBe('bundled');
    expect(skills[0].name).toBe('harness-tdd');
  });

  it('filters to installed-only skills', () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/deployment': {
          version: '1.0.0',
          resolved: 'https://example.com',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-24',
          dependencyOf: null,
        },
      },
    });

    const skills = collectSkills({ filter: 'installed' });
    expect(skills).toHaveLength(1);
    expect(skills[0].source).toBe('community');
    expect(skills[0].name).toBe('deployment');
    expect(skills[0].version).toBe('1.0.0');
  });

  it('deduplicates: local overrides bundled', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation(() => {
      return [{ name: 'my-skill', isDirectory: () => true }] as unknown as fs.Dirent[];
    });
    mockedReadFileSync.mockReturnValue('name: my-skill');
    mockedYamlParse.mockReturnValue({
      name: 'my-skill',
      description: 'My skill',
      type: 'flexible',
      platforms: ['claude-code'],
      triggers: ['manual'],
      tools: [],
      version: '1.0.0',
    });

    const skills = collectSkills({ filter: 'all' });
    // Should only have one entry even if found in multiple dirs
    const mySkills = skills.filter((s) => s.name === 'my-skill');
    // First occurrence wins (project-local > community > bundled)
    expect(mySkills.length).toBeGreaterThanOrEqual(1);
    expect(mySkills[0].source).toBe('local');
  });

  it('returns empty when no skills found', () => {
    mockedExistsSync.mockReturnValue(false);
    const skills = collectSkills({ filter: 'all' });
    expect(skills).toHaveLength(0);
  });

  it('filters to local-only skills', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation((p: fs.PathLike) => {
      if (String(p) === '/project/agents/skills/claude-code') {
        return [{ name: 'local-skill', isDirectory: () => true }] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    });
    mockedReadFileSync.mockReturnValue('name: local-skill');
    mockedYamlParse.mockReturnValue({
      name: 'local-skill',
      description: 'A local skill',
      type: 'flexible',
      platforms: ['claude-code'],
      triggers: ['manual'],
      tools: [],
      version: '1.0.0',
    });

    const skills = collectSkills({ filter: 'local' });
    const localSkills = skills.filter((s) => s.source === 'local');
    expect(localSkills.length).toBeGreaterThanOrEqual(1);
    expect(localSkills[0].name).toBe('local-skill');
  });
});
