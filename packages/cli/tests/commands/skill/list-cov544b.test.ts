import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

vi.mock('../../../src/utils/paths', () => ({
  resolveSkillsDir: vi.fn(() => '/bundled/skills/claude-code'),
  resolveProjectSkillsDir: vi.fn(() => '/project/agents/skills/claude-code'),
  resolveCommunitySkillsDir: vi.fn(() => '/community/skills/claude-code'),
  resolveGlobalSkillsDir: vi.fn(() => '/bundled/skills/claude-code'),
}));

vi.mock('../../../src/registry/lockfile', () => ({
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

vi.mock('yaml', () => ({ parse: vi.fn() }));

import * as fs from 'fs';
import { parse as yamlParse } from 'yaml';
import { readLockfile } from '../../../src/registry/lockfile';
import { collectSkills, createListCommand } from '../../../src/commands/skill/list';

const mockedExistsSync = vi.mocked(fs.existsSync);
const mockedReaddirSync = vi.mocked(fs.readdirSync);
const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedYamlParse = vi.mocked(yamlParse);
const mockedReadLockfile = vi.mocked(readLockfile);

let logOutput: string[];
let exitCode: number | undefined;

const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--quiet');
  parent.addCommand(createListCommand());
  parent.exitOverride();
  return parent.parseAsync(['list', ...args], { from: 'user' });
}

function stubOneBundledSkill(): void {
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
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedReadLockfile.mockReturnValue({ version: 1, skills: {} });
  logOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('skill list command action (cov544b)', () => {
  it('verbose (default) prints the entry with description and exits SUCCESS', async () => {
    stubOneBundledSkill();
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    const out = logOutput.join('\n');
    expect(out).toContain('Available skills:');
    expect(out).toContain('harness-tdd');
    expect(out).toContain('[bundled]');
    expect(out).toContain('TDD skill');
  });

  it('--json emits the raw skills array', async () => {
    stubOneBundledSkill();
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput.join('\n')) as { name: string }[];
    expect(parsed[0]!.name).toBe('harness-tdd');
  });

  it('--quiet prints only the skill names', async () => {
    stubOneBundledSkill();
    await expect(run(['--quiet'])).rejects.toThrow('exit:0');
    expect(logOutput).toContain('harness-tdd');
    expect(logOutput.join('\n')).not.toContain('[bundled]');
  });

  it('prints "No skills found." when nothing is discovered', async () => {
    mockedExistsSync.mockReturnValue(false);
    await expect(run([])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('No skills found.');
  });

  it('--installed resolves the installed filter and prints a version-only community entry', async () => {
    // lockfile-only "ghost": has a version, empty description, empty type →
    // exercises printSkillEntry's version branch, `type || 'unknown'`, and the
    // no-description branch, plus resolveFilter's `installed` path.
    mockedExistsSync.mockReturnValue(false);
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/ghost': {
          version: '1.2.3',
          resolved: 'https://example.com',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-24',
          dependencyOf: null,
        },
      },
    });
    await expect(run(['--installed'])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('ghost@1.2.3');
    expect(out).toContain('[community]');
    expect(out).toContain('(unknown)');
  });

  it('--local resolves the local filter', async () => {
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === '/project/agents/skills/claude-code') return true;
      if (s.includes('skill.yaml')) return true;
      return false;
    });
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
    await expect(run(['--local'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('local-skill');
    expect(logOutput.join('\n')).toContain('[local]');
  });
});

describe('collectSkills community/version branches (cov544b)', () => {
  it('stamps the lockfile version onto a matching community skill', () => {
    mockedExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s.includes('community/claude-code')) return true;
      if (s.includes('skill.yaml')) return true;
      return false;
    });
    mockedReaddirSync.mockImplementation((p: fs.PathLike) => {
      if (String(p).includes('community/claude-code')) {
        return [{ name: 'deployment', isDirectory: () => true }] as unknown as fs.Dirent[];
      }
      return [] as unknown as fs.Dirent[];
    });
    mockedReadFileSync.mockReturnValue('name: deployment');
    mockedYamlParse.mockReturnValue({
      name: 'deployment',
      description: 'Deploy skill',
      type: 'flexible',
      platforms: ['claude-code'],
      triggers: ['manual'],
      tools: [],
      version: '9.9.9',
    });
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/deployment': {
          version: '2.3.4',
          resolved: 'https://example.com',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-24',
          dependencyOf: null,
        },
      },
    });

    const skills = collectSkills({ filter: 'installed' });
    const dep = skills.find((s) => s.name === 'deployment');
    expect(dep).toBeDefined();
    expect(dep!.source).toBe('community');
    expect(dep!.version).toBe('2.3.4');
  });

  it('adds lockfile-only entries with an empty description when files are gone', () => {
    mockedExistsSync.mockReturnValue(false); // no community files on disk
    mockedReadLockfile.mockReturnValue({
      version: 1,
      skills: {
        '@harness-skills/ghost': {
          version: '1.2.3',
          resolved: 'https://example.com',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-24',
          dependencyOf: null,
        },
      },
    });
    const skills = collectSkills({ filter: 'installed' });
    const ghost = skills.find((s) => s.name === 'ghost');
    expect(ghost).toBeDefined();
    expect(ghost!.source).toBe('community');
    expect(ghost!.version).toBe('1.2.3');
    expect(ghost!.description).toBe('');
  });
});
