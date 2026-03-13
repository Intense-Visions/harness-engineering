// agents/skills/tests/prompt-lint.test.ts
import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REQUIRED_SECTIONS = ['## Steps', '## Success Criteria'];
const SKILLS_DIR = resolve(__dirname, '..');

describe('prompt.md structure', () => {
  const promptFiles = glob.sync('**/prompt.md', {
    cwd: SKILLS_DIR,
    ignore: ['**/shared/**', '**/tests/**', '**/node_modules/**'],
  });

  // Skip if no prompt files exist yet
  if (promptFiles.length === 0) {
    it.skip('no prompt files found yet', () => {});
    return;
  }

  it.each(promptFiles)('%s has required sections', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    for (const section of REQUIRED_SECTIONS) {
      expect(content, `Missing section: ${section}`).toContain(section);
    }
  });

  it.each(promptFiles)('%s starts with h1 heading', (file) => {
    const content = readFileSync(resolve(SKILLS_DIR, file), 'utf-8');
    expect(content.trim()).toMatch(/^# /);
  });
});

describe('skill.yaml exists for each prompt', () => {
  const promptFiles = glob.sync('**/prompt.md', {
    cwd: SKILLS_DIR,
    ignore: ['**/shared/**', '**/tests/**', '**/node_modules/**'],
  });

  if (promptFiles.length === 0) {
    it.skip('no prompt files found yet', () => {});
    return;
  }

  it.each(promptFiles)('%s has corresponding skill.yaml', (file) => {
    const dir = resolve(SKILLS_DIR, file, '..');
    const yamlPath = resolve(dir, 'skill.yaml');
    expect(existsSync(yamlPath), `Missing skill.yaml for ${file}`).toBe(true);
  });
});
