import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizeSkills } from '../../src/slash-commands/normalize';
import type { SkillSource } from '../../src/slash-commands/normalize';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'community-skill-test-'));
}

const SKILL_YAML = `name: community-deploy
version: 1.0.0
description: Deploy from community registry
triggers:
  - manual
platforms:
  - claude-code
tools:
  - Bash
type: flexible
depends_on: []`;

const SKILL_MD = `# community-deploy

Deploy skill from community registry.

## Process

1. Deploy the application`;

describe('community skill slash command integration', () => {
  let tmpDir: string;
  let communityDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    communityDir = path.join(tmpDir, 'community');
    const skillDir = path.join(communityDir, 'community-deploy');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'skill.yaml'), SKILL_YAML);
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), SKILL_MD);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normalizeSkills processes community skill source', () => {
    const specs = normalizeSkills([{ dir: communityDir, source: 'community' }], ['claude-code']);

    expect(specs.length).toBe(1);
    const spec = specs[0];
    expect(spec.skillYamlName).toBe('community-deploy');
    expect(spec.source).toBe('community');
    expect(spec.name).toBe('community-deploy');
    expect(spec.namespace).toBe('harness');
    expect(spec.fullName).toBe('harness:community-deploy');
  });

  it('community skill is shadowed by project skill with same name', () => {
    // Create a project skill with the same normalized name
    const projectDir = path.join(tmpDir, 'project');
    const projectSkillDir = path.join(projectDir, 'community-deploy');
    fs.mkdirSync(projectSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectSkillDir, 'skill.yaml'),
      SKILL_YAML.replace('Deploy from community registry', 'Project override')
    );
    fs.writeFileSync(path.join(projectSkillDir, 'SKILL.md'), SKILL_MD);

    const sources: SkillSource[] = [
      { dir: projectDir, source: 'project' },
      { dir: communityDir, source: 'community' },
    ];

    const specs = normalizeSkills(sources, ['claude-code']);

    // Only one spec for the name -- project wins
    const matches = specs.filter((s) => s.name === 'community-deploy');
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe('project');
  });

  it('community skill shadows global skill with same name', () => {
    // Create a global skill with the same normalized name
    const globalDir = path.join(tmpDir, 'global');
    const globalSkillDir = path.join(globalDir, 'community-deploy');
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillDir, 'skill.yaml'),
      SKILL_YAML.replace('Deploy from community registry', 'Global version')
    );
    fs.writeFileSync(path.join(globalSkillDir, 'SKILL.md'), SKILL_MD);

    const sources: SkillSource[] = [
      { dir: communityDir, source: 'community' },
      { dir: globalDir, source: 'global' },
    ];

    const specs = normalizeSkills(sources, ['claude-code']);

    // Only one spec -- community wins over global
    const matches = specs.filter((s) => s.name === 'community-deploy');
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe('community');
  });

  it('full priority chain: project > community > global', () => {
    // Project skill
    const projectDir = path.join(tmpDir, 'project');
    const projectSkillDir = path.join(projectDir, 'project-only');
    fs.mkdirSync(projectSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectSkillDir, 'skill.yaml'),
      SKILL_YAML.replace('community-deploy', 'project-only').replace(
        'Deploy from community registry',
        'Project only skill'
      )
    );
    fs.writeFileSync(path.join(projectSkillDir, 'SKILL.md'), SKILL_MD);

    // Global skill
    const globalDir = path.join(tmpDir, 'global');
    const globalSkillDir = path.join(globalDir, 'global-only');
    fs.mkdirSync(globalSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalSkillDir, 'skill.yaml'),
      SKILL_YAML.replace('community-deploy', 'global-only').replace(
        'Deploy from community registry',
        'Global only skill'
      )
    );
    fs.writeFileSync(path.join(globalSkillDir, 'SKILL.md'), SKILL_MD);

    const sources: SkillSource[] = [
      { dir: projectDir, source: 'project' },
      { dir: communityDir, source: 'community' },
      { dir: globalDir, source: 'global' },
    ];

    const specs = normalizeSkills(sources, ['claude-code']);

    // All three unique skills should appear
    expect(specs).toHaveLength(3);

    const projectSpec = specs.find((s) => s.name === 'project-only');
    const communitySpec = specs.find((s) => s.name === 'community-deploy');
    const globalSpec = specs.find((s) => s.name === 'global-only');

    expect(projectSpec).toBeDefined();
    expect(projectSpec!.source).toBe('project');
    expect(communitySpec).toBeDefined();
    expect(communitySpec!.source).toBe('community');
    expect(globalSpec).toBeDefined();
    expect(globalSpec!.source).toBe('global');
  });
});
