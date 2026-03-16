import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateMetadataSchema } from '../../src/templates/schema';

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'templates');

describe('template content files', () => {
  const templateDirs = fs
    .readdirSync(TEMPLATES_DIR)
    .filter((d) => fs.statSync(path.join(TEMPLATES_DIR, d)).isDirectory());

  for (const dir of templateDirs) {
    it(`${dir}/template.json is valid`, () => {
      const metaPath = path.join(TEMPLATES_DIR, dir, 'template.json');
      expect(fs.existsSync(metaPath)).toBe(true);
      const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const result = TemplateMetadataSchema.safeParse(raw);
      expect(result.success).toBe(true);
    });
  }

  it('basic template has required files', () => {
    expect(fs.existsSync(path.join(TEMPLATES_DIR, 'basic', 'harness.config.json.hbs'))).toBe(true);
    expect(fs.existsSync(path.join(TEMPLATES_DIR, 'basic', 'package.json.hbs'))).toBe(true);
  });
});
