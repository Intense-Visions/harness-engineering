import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateSlashCommands } from '../../src/commands/generate-slash-commands';
import { normalizeSkills } from '../../src/slash-commands/normalize';
import {
  GENERATED_HEADER_CLAUDE,
  GENERATED_HEADER_GEMINI,
  GENERATED_HEADER_CODEX,
} from '../../src/slash-commands/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slash-cmd-integration-'));
}

const fixturesDir = path.join(__dirname, 'fixtures');

describe('generateSlashCommands integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates Claude Code markdown files from fixture skills', () => {
    const results = generateSlashCommands({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe('claude-code');
    expect(results[0].added.length).toBeGreaterThan(0);

    const outputDir = path.join(tmpDir, 'harness');
    const files = fs.readdirSync(outputDir);
    const mdFiles = files.filter((f) => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);

    const content = fs.readFileSync(path.join(outputDir, mdFiles[0]), 'utf-8');
    expect(content).toContain(GENERATED_HEADER_CLAUDE);
    expect(content).toContain('name: harness:');
  });

  it('generates Gemini CLI TOML files from fixture skills', () => {
    const results = generateSlashCommands({
      platforms: ['gemini-cli'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    expect(results).toHaveLength(1);

    const outputDir = path.join(tmpDir, 'harness');
    const files = fs.readdirSync(outputDir);
    const tomlFiles = files.filter((f) => f.endsWith('.toml'));
    expect(tomlFiles.length).toBeGreaterThan(0);

    const content = fs.readFileSync(path.join(outputDir, tomlFiles[0]), 'utf-8');
    expect(content).toContain(GENERATED_HEADER_GEMINI);
    expect(content).toContain('description = ');
    expect(content).toContain("prompt = '''");
  });

  it('dry-run does not write files', () => {
    const results = generateSlashCommands({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: true,
      yes: true,
    });

    expect(results[0].added.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tmpDir, 'harness'))).toBe(false);
  });

  it('second run detects unchanged files', () => {
    generateSlashCommands({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    const results = generateSlashCommands({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    expect(results[0].added).toEqual([]);
    expect(results[0].updated).toEqual([]);
    expect(results[0].unchanged.length).toBeGreaterThan(0);
  });
});

describe('project-local skill discovery', () => {
  let tmpDir: string;
  let projectSkillsDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Create a project-like structure with agents/skills/claude-code/
    projectSkillsDir = path.join(tmpDir, 'project', 'agents', 'skills', 'claude-code');
    fs.mkdirSync(projectSkillsDir, { recursive: true });

    // Copy the valid-skill fixture into the project skills dir
    const fixtureSkillDir = path.join(fixturesDir, 'valid-skill');
    const destDir = path.join(projectSkillsDir, 'valid-skill');
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(path.join(fixtureSkillDir, 'skill.yaml'), path.join(destDir, 'skill.yaml'));
    const skillMdSrc = path.join(fixtureSkillDir, 'SKILL.md');
    if (fs.existsSync(skillMdSrc)) {
      fs.copyFileSync(skillMdSrc, path.join(destDir, 'SKILL.md'));
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers skills from explicit skillsDir', () => {
    const outputDir = path.join(tmpDir, 'output');
    const results = generateSlashCommands({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      output: outputDir,
      skillsDir: projectSkillsDir,
      dryRun: false,
      yes: true,
    });

    expect(results[0].added.length).toBeGreaterThan(0);
  });

  it('project skill shadows global skill on name collision', () => {
    const specs = normalizeSkills(
      [
        { dir: projectSkillsDir, source: 'project' },
        { dir: fixturesDir, source: 'global' },
      ],
      ['claude-code']
    );

    // valid-skill exists in both — only one should appear, with source 'project'
    const matches = specs.filter((s) => s.skillYamlName === 'harness-test-skill');
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe('project');
  });

  it('same-source collision throws an error', () => {
    // Create a second skill that normalizes to the same name
    const dupeDir = path.join(projectSkillsDir, 'harness-test-skill');
    fs.mkdirSync(dupeDir, { recursive: true });
    fs.copyFileSync(
      path.join(fixturesDir, 'valid-skill', 'skill.yaml'),
      path.join(dupeDir, 'skill.yaml')
    );

    expect(() =>
      normalizeSkills([{ dir: projectSkillsDir, source: 'project' }], ['claude-code'])
    ).toThrow(/Name collision/);
  });

  it('skips non-existent skill directories gracefully', () => {
    const specs = normalizeSkills(
      [{ dir: path.join(tmpDir, 'does-not-exist'), source: 'project' }],
      ['claude-code']
    );

    expect(specs).toEqual([]);
  });
});

describe('codex sync', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('first codex run reports all skills as added', () => {
    const results = generateSlashCommands({
      platforms: ['codex'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    expect(results).toHaveLength(1);
    expect(results[0].platform).toBe('codex');
    expect(results[0].added.length).toBeGreaterThan(0);
    expect(results[0].updated).toEqual([]);
    expect(results[0].unchanged).toEqual([]);
  });

  it('second codex run detects unchanged skill directories', () => {
    const opts = {
      platforms: ['codex'] as const,
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    };

    generateSlashCommands({ ...opts, platforms: ['codex'] });
    const results = generateSlashCommands({ ...opts, platforms: ['codex'] });

    expect(results[0].added).toEqual([]);
    expect(results[0].updated).toEqual([]);
    expect(results[0].unchanged.length).toBeGreaterThan(0);
  });

  it('detects orphaned codex skill directories for removal', { timeout: 15000 }, () => {
    // First generate to create the skill directories
    generateSlashCommands({
      platforms: ['codex'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    // Create a fake orphaned skill directory with generated header
    const outputDir = path.join(tmpDir, 'harness');
    const orphanDir = path.join(outputDir, 'orphaned-skill');
    fs.mkdirSync(path.join(orphanDir, 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(orphanDir, 'SKILL.md'),
      `<!-- ${GENERATED_HEADER_CODEX.replace(/<!--\s*|\s*-->/g, '').trim()} -->\n\nOrphaned content`,
      'utf-8'
    );

    // Re-run generation — orphan should appear in removed
    const results = generateSlashCommands({
      platforms: ['codex'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    expect(results[0].removed).toContain('orphaned-skill');
  });

  it('codex dry-run does not write files', () => {
    const results = generateSlashCommands({
      platforms: ['codex'],
      global: false,
      includeGlobal: false,
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: true,
      yes: true,
    });

    expect(results[0].added.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tmpDir, 'harness'))).toBe(false);
  });
});
