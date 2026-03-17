import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateSlashCommands } from '../../src/commands/generate-slash-commands';
import { GENERATED_HEADER_CLAUDE, GENERATED_HEADER_GEMINI } from '../../src/slash-commands/types';

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
    expect(content).toContain('prompt = """');
  });

  it('dry-run does not write files', () => {
    const results = generateSlashCommands({
      platforms: ['claude-code'],
      global: false,
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
      output: tmpDir,
      skillsDir: fixturesDir,
      dryRun: false,
      yes: true,
    });

    const results = generateSlashCommands({
      platforms: ['claude-code'],
      global: false,
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
