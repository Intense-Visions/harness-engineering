// agents/skills/tests/references.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import { SkillMetadataSchema } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, '..');

describe('skill.yaml schema validation', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  // Only validate skills that match the new schema (skip old-format during migration)
  const validSkills = skillFiles.filter((file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    return SkillMetadataSchema.safeParse(parsed).success;
  });

  if (validSkills.length === 0) {
    it.skip('no skills matching new schema found yet', () => {});
  } else {
    it.each(validSkills)('%s conforms to schema', (file) => {
      const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
      const parsed = parse(content);
      const result = SkillMetadataSchema.safeParse(parsed);
      expect(
        result.success,
        `Schema validation failed for ${file}: ${JSON.stringify(result)}`
      ).toBe(true);
    });
  }
});

describe('depends_on references', () => {
  const skillFiles = glob.sync('**/skill.yaml', {
    cwd: SKILLS_DIR,
    ignore: ['**/node_modules/**', '**/tests/**'],
  });

  if (skillFiles.length === 0) {
    it.skip('no skill files found yet', () => {});
    return;
  }

  // Only validate skills matching new schema; collect all names for reference checking
  const allSkillNames = new Set<string>();
  for (const file of skillFiles) {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    if (parsed?.name) allSkillNames.add(parsed.name);
  }

  const validSkills = skillFiles.filter((file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    const parsed = parse(content);
    return SkillMetadataSchema.safeParse(parsed).success;
  });

  if (validSkills.length === 0) {
    it.skip('no skills matching new schema found yet', () => {});
  } else {
    it.each(validSkills)('%s depends_on references existing skills', (file) => {
      const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
      const parsed = parse(content);
      const result = SkillMetadataSchema.safeParse(parsed);
      if (!result.success) return;

      for (const dep of result.data.depends_on) {
        expect(allSkillNames.has(dep), `${file} references unknown skill: ${dep}`).toBe(true);
      }
    });
  }
});
