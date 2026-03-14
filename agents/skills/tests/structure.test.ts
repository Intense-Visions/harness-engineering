// agents/skills/tests/structure.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { SkillMetadataSchema } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

const REQUIRED_SECTIONS = ['## When to Use', '## Process', '## Harness Integration', '## Success Criteria', '## Examples'];
const RIGID_SECTIONS = ['## Gates', '## Escalation'];

describe('SKILL.md structure', () => {
  const skillMdFiles = glob.sync('**/SKILL.md', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillMdFiles.length === 0) {
    it.skip('no SKILL.md files found yet', () => {});
    return;
  }

  it.each(skillMdFiles)('%s has required sections', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    for (const section of REQUIRED_SECTIONS) {
      expect(content, `Missing section: ${section} in ${file}`).toContain(section);
    }
  });

  it.each(skillMdFiles)('%s starts with h1 heading', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    expect(content.trim()).toMatch(/^# /);
  });

  it.each(skillMdFiles)('%s has corresponding skill.yaml', (file) => {
    const dir = resolve(SKILLS_DIR, file, '..');
    expect(existsSync(resolve(dir, 'skill.yaml')), `Missing skill.yaml for ${file}`).toBe(true);
  });
});

describe('rigid skills have Gates and Escalation sections', () => {
  const skillYamlFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillYamlFiles.length === 0) {
    it.skip('no skill.yaml files found yet', () => {});
    return;
  }

  const rigidSkills = skillYamlFiles.filter((file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    return parsed?.type === 'rigid';
  });

  if (rigidSkills.length === 0) {
    it.skip('no rigid skills found yet', () => {});
    return;
  }

  it.each(rigidSkills)('%s (rigid) has Gates and Escalation sections', (file) => {
    const dir = resolve(SKILLS_DIR, file, '..');
    const skillMdPath = resolve(dir, 'SKILL.md');
    if (!existsSync(skillMdPath)) return; // skip if SKILL.md doesn't exist yet
    const content = readFileSync(skillMdPath, 'utf-8');
    for (const section of RIGID_SECTIONS) {
      expect(content, `Rigid skill missing section: ${section}`).toContain(section);
    }
  });
});
