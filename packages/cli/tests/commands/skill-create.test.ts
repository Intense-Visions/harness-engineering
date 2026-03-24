import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createCreateCommand, runCreate } from '../../src/commands/skill/create';

describe('createCreateCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createCreateCommand();
    expect(cmd.name()).toBe('create');
  });

  it('has --description option', () => {
    const cmd = createCreateCommand();
    const opt = cmd.options.find((o) => o.long === '--description');
    expect(opt).toBeDefined();
  });

  it('has --type option', () => {
    const cmd = createCreateCommand();
    const opt = cmd.options.find((o) => o.long === '--type');
    expect(opt).toBeDefined();
  });
});

describe('runCreate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-create-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates skill.yaml, SKILL.md, and README.md', () => {
    const result = runCreate('my-test-skill', {
      description: 'A test skill',
      outputDir: tmpDir,
    });

    const skillDir = path.join(tmpDir, 'my-test-skill');
    expect(fs.existsSync(path.join(skillDir, 'skill.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'README.md'))).toBe(true);
    expect(result.name).toBe('my-test-skill');
    expect(result.files).toHaveLength(3);
  });

  it('README.md contains install instructions', () => {
    runCreate('deploy-helper', {
      description: 'Helps with deployments',
      outputDir: tmpDir,
    });

    const readme = fs.readFileSync(path.join(tmpDir, 'deploy-helper', 'README.md'), 'utf-8');
    expect(readme).toContain('harness install deploy-helper');
    expect(readme).toContain('Helps with deployments');
  });

  it('skill.yaml respects type option', () => {
    runCreate('rigid-skill', {
      description: 'A rigid skill',
      type: 'rigid',
      outputDir: tmpDir,
    });

    const yaml = fs.readFileSync(path.join(tmpDir, 'rigid-skill', 'skill.yaml'), 'utf-8');
    expect(yaml).toContain('type: rigid');
  });

  it('skill.yaml respects platforms option', () => {
    runCreate('multi-platform', {
      description: 'Multi-platform skill',
      platforms: 'claude-code,gemini-cli',
      outputDir: tmpDir,
    });

    const yaml = fs.readFileSync(path.join(tmpDir, 'multi-platform', 'skill.yaml'), 'utf-8');
    expect(yaml).toContain('claude-code');
    expect(yaml).toContain('gemini-cli');
  });

  it('rejects non-kebab-case names', () => {
    expect(() => runCreate('NotKebab', { description: 'Bad', outputDir: tmpDir })).toThrow(
      'kebab-case'
    );
  });

  it('rejects when directory already exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'existing-skill'), { recursive: true });
    expect(() => runCreate('existing-skill', { description: 'Dup', outputDir: tmpDir })).toThrow(
      'already exists'
    );
  });
});
