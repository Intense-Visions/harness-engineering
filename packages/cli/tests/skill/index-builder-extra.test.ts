import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadOrRebuildIndex, buildIndex } from '../../src/skill/index-builder';
import { resolveAllSkillsDirs } from '../../src/utils/paths';
import { stringify } from 'yaml';

vi.mock('../../src/utils/paths', () => ({
  resolveAllSkillsDirs: vi.fn(() => []),
}));

const mockedResolveAllSkillsDirs = vi.mocked(resolveAllSkillsDirs);

describe('loadOrRebuildIndex', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-rebuild-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSkillYaml(dir: string, name: string, extra: Record<string, unknown> = {}): void {
    const skillDir = path.join(dir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    const yaml = stringify({
      name,
      version: '1.0.0',
      description: `Test skill ${name}`,
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: ['Read'],
      type: 'flexible',
      tier: 3,
      ...extra,
    });
    fs.writeFileSync(path.join(skillDir, 'skill.yaml'), yaml);
  }

  it('builds and caches index when no cache exists', () => {
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSkillYaml(skillsDir, 'test-skill');
    mockedResolveAllSkillsDirs.mockReturnValue([skillsDir]);

    const index = loadOrRebuildIndex('claude-code', tmpDir);
    expect(index.skills['test-skill']).toBeDefined();
    expect(index.version).toBe(1);

    // Cache file should exist
    const indexPath = path.join(tmpDir, '.harness', 'skills-index.json');
    expect(fs.existsSync(indexPath)).toBe(true);
  });

  it('returns cached index when hash matches', () => {
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSkillYaml(skillsDir, 'cached-skill');
    mockedResolveAllSkillsDirs.mockReturnValue([skillsDir]);

    // Build initial index
    const first = loadOrRebuildIndex('claude-code', tmpDir);
    expect(first.skills['cached-skill']).toBeDefined();

    // Load again — should use cache
    const second = loadOrRebuildIndex('claude-code', tmpDir);
    expect(second.skills['cached-skill']).toBeDefined();
    expect(second.hash).toBe(first.hash);
  });

  it('rebuilds index when hash changes', () => {
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSkillYaml(skillsDir, 'original-skill');
    mockedResolveAllSkillsDirs.mockReturnValue([skillsDir]);

    // Build initial index
    const first = loadOrRebuildIndex('claude-code', tmpDir);
    expect(first.skills['original-skill']).toBeDefined();

    // Add a new skill (changes mtimes)
    writeSkillYaml(skillsDir, 'new-skill');

    // Rebuild should detect hash change
    const second = loadOrRebuildIndex('claude-code', tmpDir);
    expect(second.skills['new-skill']).toBeDefined();
    expect(second.hash).not.toBe(first.hash);
  });

  it('rebuilds when cached index is corrupt', () => {
    const skillsDir = path.join(tmpDir, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    writeSkillYaml(skillsDir, 'test-skill');
    mockedResolveAllSkillsDirs.mockReturnValue([skillsDir]);

    // Write corrupt cache
    const indexPath = path.join(tmpDir, '.harness', 'skills-index.json');
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, 'not valid json{{{');

    const index = loadOrRebuildIndex('claude-code', tmpDir);
    expect(index.skills['test-skill']).toBeDefined();
  });
});

describe('buildIndex — source tagging', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'index-source-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSkillYaml(dir: string, name: string): void {
    const skillDir = path.join(dir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    const yaml = stringify({
      name,
      version: '1.0.0',
      description: `Test ${name}`,
      triggers: ['manual'],
      platforms: ['claude-code'],
      tools: ['Read'],
      type: 'flexible',
      tier: 3,
    });
    fs.writeFileSync(path.join(skillDir, 'skill.yaml'), yaml);
  }

  it('tags project skills as project, community as community, bundled as bundled', () => {
    const projectDir = path.join(tmpDir, 'project');
    const communityDir = path.join(tmpDir, 'community');
    const bundledDir = path.join(tmpDir, 'bundled');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(communityDir, { recursive: true });
    fs.mkdirSync(bundledDir, { recursive: true });

    writeSkillYaml(projectDir, 'proj-skill');
    writeSkillYaml(communityDir, 'comm-skill');
    writeSkillYaml(bundledDir, 'bund-skill');

    mockedResolveAllSkillsDirs.mockReturnValue([projectDir, communityDir, bundledDir]);

    const index = buildIndex('claude-code', tmpDir);
    expect(index.skills['proj-skill'].source).toBe('project');
    expect(index.skills['comm-skill'].source).toBe('community');
    expect(index.skills['bund-skill'].source).toBe('bundled');
  });

  it('first-found wins when same skill name in multiple dirs', () => {
    const projectDir = path.join(tmpDir, 'project');
    const bundledDir = path.join(tmpDir, 'bundled');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(bundledDir, { recursive: true });

    writeSkillYaml(projectDir, 'shared-skill');
    writeSkillYaml(bundledDir, 'shared-skill');

    mockedResolveAllSkillsDirs.mockReturnValue([
      projectDir,
      path.join(tmpDir, 'empty'),
      bundledDir,
    ]);

    const index = buildIndex('claude-code', tmpDir);
    expect(index.skills['shared-skill'].source).toBe('project');
  });

  it('handles empty skills dirs gracefully', () => {
    mockedResolveAllSkillsDirs.mockReturnValue(['/nonexistent/a', '/nonexistent/b']);
    const index = buildIndex('claude-code', tmpDir);
    expect(Object.keys(index.skills)).toHaveLength(0);
  });
});
