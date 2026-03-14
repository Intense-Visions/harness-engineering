import { describe, it, expect, beforeAll } from 'vitest';
import { loadTemplate, TemplateLoadError } from '../../src/engine/template-loader';
import * as path from 'path';
import * as fs from 'fs/promises';

const fixturesDir = path.join(__dirname, '../fixtures');
const customTemplateDir = path.join(fixturesDir, 'with-custom-template');

describe('loadTemplate', () => {
  beforeAll(async () => {
    // Ensure fixture directories exist
    await fs.mkdir(path.join(customTemplateDir, 'templates'), { recursive: true });
    await fs.mkdir(path.join(customTemplateDir, 'my-templates'), { recursive: true });

    // Create convention template
    await fs.writeFile(
      path.join(customTemplateDir, 'templates', 'convention-type.ts.hbs'),
      '// Convention template\nexport const name = "{{name}}";'
    );

    // Create explicit template
    await fs.writeFile(
      path.join(customTemplateDir, 'my-templates', 'explicit.ts.hbs'),
      '// Explicit template\nexport const name = "{{name}}";'
    );
  });

  it('loads template from explicit path in config', async () => {
    const result = await loadTemplate(
      'explicit-custom',
      { 'explicit-custom': './my-templates/explicit.ts.hbs' },
      customTemplateDir
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('explicit');
      expect(result.source.content).toContain('Explicit template');
    }
  });

  it('loads template from convention path (templates/ directory)', async () => {
    const result = await loadTemplate('convention-type', {}, customTemplateDir);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('convention');
      expect(result.source.content).toContain('Convention template');
    }
  });

  it('loads built-in template when no custom template found', async () => {
    const result = await loadTemplate('import-restriction', {}, customTemplateDir);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('builtin');
    }
  });

  it('returns error for unknown template type', async () => {
    const result = await loadTemplate('unknown-type', {}, customTemplateDir);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TemplateLoadError);
      expect(result.error.code).toBe('TEMPLATE_NOT_FOUND');
    }
  });

  it('explicit path takes priority over convention', async () => {
    // Create a convention template with same type name
    await fs.writeFile(
      path.join(customTemplateDir, 'templates', 'explicit-custom.ts.hbs'),
      '// Should not be used'
    );

    const result = await loadTemplate(
      'explicit-custom',
      { 'explicit-custom': './my-templates/explicit.ts.hbs' },
      customTemplateDir
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source.type).toBe('explicit');
      expect(result.source.content).toContain('Explicit template');
    }
  });
});
