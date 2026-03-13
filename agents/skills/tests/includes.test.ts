// agents/skills/tests/includes.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { SkillMetadataSchema } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

describe('skill.yaml includes validation', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  it.each(skillFiles)('%s references existing shared fragments', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    const result = SkillMetadataSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(`Invalid skill.yaml: ${file}`);
    }

    const skill = result.data;
    for (const includePath of skill.includes) {
      const fullPath = resolve(SKILLS_DIR, includePath);
      expect(existsSync(fullPath), `Missing include: ${includePath}`).toBe(true);
    }
  });
});

describe('skill.yaml schema validation', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  it.each(skillFiles)('%s conforms to schema', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    const result = SkillMetadataSchema.safeParse(parsed);
    expect(result.success, `Schema validation failed: ${JSON.stringify(result)}`).toBe(true);
  });
});
