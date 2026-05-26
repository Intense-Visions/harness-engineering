import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computeCodexSync, detectLegacyCodexOrphans } from '../../src/slash-commands/sync-codex';
import { GENERATED_HEADER_CODEX } from '../../src/slash-commands/types';
import type { SlashCommandSpec } from '../../src/slash-commands/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sync-codex-test-'));
}

function makeSpec(name: string, skillsBaseDir: string): SlashCommandSpec {
  return {
    name,
    namespace: 'harness',
    fullName: `harness:${name}`,
    description: `Test skill ${name}`,
    version: '1.0.0',
    tools: [],
    args: [],
    skillYamlName: `harness-${name}`,
    sourceDir: `harness-${name}`,
    skillsBaseDir,
    prompt: {
      context: 'ctx',
      objective: 'obj',
      executionContext: '@x',
      process: '1',
    },
  };
}

describe('detectLegacyCodexOrphans', () => {
  let legacyDir: string;

  beforeEach(() => {
    legacyDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(legacyDir, { recursive: true, force: true });
  });

  it('returns empty when the legacy dir does not exist', () => {
    fs.rmSync(legacyDir, { recursive: true, force: true });
    expect(detectLegacyCodexOrphans(legacyDir)).toEqual([]);
  });

  it('detects harness-generated skill dirs by SKILL.md header', () => {
    const skillDir = path.join(legacyDir, 'harness-debugging');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `${GENERATED_HEADER_CODEX}\n\n# old content`);

    expect(detectLegacyCodexOrphans(legacyDir)).toEqual(['harness-debugging']);
  });

  it('ignores user-created skill dirs that lack the generated header', () => {
    const userSkillDir = path.join(legacyDir, 'my-custom-skill');
    fs.mkdirSync(userSkillDir, { recursive: true });
    fs.writeFileSync(path.join(userSkillDir, 'SKILL.md'), '# user-authored skill — not touched\n');

    expect(detectLegacyCodexOrphans(legacyDir)).toEqual([]);
  });

  it('ignores directories without a SKILL.md file', () => {
    fs.mkdirSync(path.join(legacyDir, 'empty-dir'), { recursive: true });
    expect(detectLegacyCodexOrphans(legacyDir)).toEqual([]);
  });

  it('returns multiple orphans when several harness skills exist', () => {
    for (const name of ['harness-debugging', 'harness-planning']) {
      const dir = path.join(legacyDir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `${GENERATED_HEADER_CODEX}\n# x`);
    }
    expect(detectLegacyCodexOrphans(legacyDir).sort()).toEqual([
      'harness-debugging',
      'harness-planning',
    ]);
  });
});

describe('computeCodexSync', () => {
  let outputDir: string;
  let skillsSource: string;

  beforeEach(() => {
    outputDir = makeTmpDir();
    skillsSource = makeTmpDir();
    const skillDir = path.join(skillsSource, 'harness-debugging');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Debugging\nBody.');
  });
  afterEach(() => {
    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.rmSync(skillsSource, { recursive: true, force: true });
  });

  it('writes SKILL.md with YAML frontmatter Codex can discover', () => {
    const spec = makeSpec('debugging', skillsSource);
    computeCodexSync(outputDir, [spec], /* dryRun */ false);

    const written = fs.readFileSync(path.join(outputDir, 'harness-debugging', 'SKILL.md'), 'utf-8');
    expect(written.startsWith('---\n')).toBe(true);
    expect(written).toContain('name: harness-debugging');
    expect(written).toContain('description: Test skill debugging');
  });

  it('writes openai.yaml without the Phase B placeholder comment', () => {
    const spec = makeSpec('debugging', skillsSource);
    computeCodexSync(outputDir, [spec], /* dryRun */ false);

    const yaml = fs.readFileSync(
      path.join(outputDir, 'harness-debugging', 'agents', 'openai.yaml'),
      'utf-8'
    );
    expect(yaml).not.toContain('Reserved for Phase B');
    expect(yaml).toContain('name: harness-debugging');
  });
});
