import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateAgentDefinitions } from '../../src/commands/generate-agent-definitions';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-def-cmd-test-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateAgentDefinitions', () => {
  it('generates agent files for all personas', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results.length).toBe(1);
    expect(results[0]!.added.length).toBeGreaterThan(0);
    // Verify files were written
    const outputDir = path.join(tmpDir, 'claude-code');
    const files = fs.readdirSync(outputDir);
    expect(files.some((f) => f.startsWith('harness-'))).toBe(true);
  });

  it('generates harness-prefixed filenames', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    for (const filename of results[0]!.added) {
      expect(filename).toMatch(/^harness-.*\.md$/);
    }
  });

  it('dry run does not write files', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: true,
    });
    expect(results[0]!.added.length).toBeGreaterThan(0);
    const outputDir = path.join(tmpDir, 'claude-code');
    expect(fs.existsSync(outputDir)).toBe(false);
  });

  it('generates for both platforms', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code', 'gemini-cli'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results.length).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, 'claude-code'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'gemini-cli'))).toBe(true);
  });

  it('second run detects unchanged files', () => {
    generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    expect(results[0]!.unchanged.length).toBeGreaterThan(0);
    expect(results[0]!.added.length).toBe(0);
  });

  it('generates one file per persona', () => {
    const results = generateAgentDefinitions({
      platforms: ['claude-code'],
      global: false,
      output: tmpDir,
      dryRun: false,
    });
    // 8 personas = 8 agent files
    expect(results[0]!.added.length).toBe(8);
  });
});
