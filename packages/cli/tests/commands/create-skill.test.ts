import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCreateSkillCommand, generateSkillFiles } from '../../src/commands/create-skill';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import YAML from 'yaml';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-create-skill-'));
}

describe('create-skill command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createCreateSkillCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCreateSkillCommand();
      expect(cmd.name()).toBe('create-skill');
    });

    it('has required options', () => {
      const cmd = createCreateSkillCommand();
      const optionNames = cmd.options.map((o) => o.long);
      expect(optionNames).toContain('--name');
      expect(optionNames).toContain('--description');
      expect(optionNames).toContain('--cognitive-mode');
      expect(optionNames).toContain('--reads');
      expect(optionNames).toContain('--produces');
      expect(optionNames).toContain('--pre-checks');
      expect(optionNames).toContain('--post-checks');
    });
  });

  describe('generateSkillFiles', () => {
    it('generates skill.yaml with correct fields', () => {
      const result = generateSkillFiles({
        name: 'my-test-skill',
        description: 'A test skill for unit testing',
        outputDir: tmpDir,
      });

      expect(fs.existsSync(result.skillYamlPath)).toBe(true);

      const content = fs.readFileSync(result.skillYamlPath, 'utf-8');
      const parsed = YAML.parse(content);

      expect(parsed.name).toBe('my-test-skill');
      expect(parsed.version).toBe('0.1.0');
      expect(parsed.description).toBe('A test skill for unit testing');
      expect(parsed.cognitive_mode).toBe('constructive-architect');
      expect(parsed.triggers).toEqual(['manual']);
      expect(parsed.platforms).toEqual(['claude-code', 'gemini-cli']);
      expect(parsed.type).toBe('flexible');
      expect(parsed.tools).toContain('Read');
    });

    it('generates skill.yaml with custom cognitive mode', () => {
      const result = generateSkillFiles({
        name: 'reviewer-skill',
        description: 'Reviews code',
        cognitiveMode: 'adversarial-reviewer',
        outputDir: tmpDir,
      });

      const content = fs.readFileSync(result.skillYamlPath, 'utf-8');
      const parsed = YAML.parse(content);
      expect(parsed.cognitive_mode).toBe('adversarial-reviewer');
    });

    it('generates SKILL.md with required sections', () => {
      const result = generateSkillFiles({
        name: 'my-test-skill',
        description: 'A test skill for unit testing',
        reads: ['src/**/*.ts'],
        produces: 'report.json',
        preChecks: ['pnpm lint'],
        postChecks: ['pnpm test'],
        outputDir: tmpDir,
      });

      expect(fs.existsSync(result.skillMdPath)).toBe(true);

      const content = fs.readFileSync(result.skillMdPath, 'utf-8');

      expect(content).toContain('# my-test-skill');
      expect(content).toContain('> Cognitive Mode: constructive-architect');
      expect(content).toContain('A test skill for unit testing');
      expect(content).toContain('## When to Use');
      expect(content).toContain('## Context Assembly');
      expect(content).toContain('`src/**/*.ts`');
      expect(content).toContain('`report.json`');
      expect(content).toContain('## Deterministic Checks');
      expect(content).toContain('`pnpm lint`');
      expect(content).toContain('`pnpm test`');
      expect(content).toContain('## Process');
      expect(content).toContain('## Harness Integration');
      expect(content).toContain('## Success Criteria');
      expect(content).toContain('## Examples');
    });

    it('does not overwrite existing skill directory', () => {
      // Create the skill directory first
      const skillDir = path.join(tmpDir, 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      expect(() =>
        generateSkillFiles({
          name: 'existing-skill',
          description: 'Should fail',
          outputDir: tmpDir,
        })
      ).toThrow(/Skill directory already exists/);
    });

    it('rejects invalid skill names', () => {
      expect(() =>
        generateSkillFiles({
          name: 'Invalid_Name',
          description: 'Bad name',
          outputDir: tmpDir,
        })
      ).toThrow(/Invalid skill name/);
    });

    it('rejects invalid cognitive modes', () => {
      expect(() =>
        generateSkillFiles({
          name: 'valid-name',
          description: 'Bad mode',
          cognitiveMode: 'invalid-mode',
          outputDir: tmpDir,
        })
      ).toThrow(/Invalid cognitive mode/);
    });

    it('creates skill inside a subdirectory named after the skill', () => {
      const result = generateSkillFiles({
        name: 'nested-skill',
        description: 'Test nesting',
        outputDir: tmpDir,
      });

      expect(result.skillYamlPath).toBe(path.join(tmpDir, 'nested-skill', 'skill.yaml'));
      expect(result.skillMdPath).toBe(path.join(tmpDir, 'nested-skill', 'SKILL.md'));
    });
  });
});
