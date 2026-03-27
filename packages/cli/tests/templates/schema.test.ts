import { describe, it, expect } from 'vitest';
import { TemplateMetadataSchema } from '../../src/templates/schema';
import { HarnessConfigSchema } from '../../src/config/schema';

describe('TemplateMetadataSchema', () => {
  it('validates a valid level template', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'basic',
      description: 'Level 1 adoption',
      level: 'basic',
      extends: 'base',
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('validates a valid framework template', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'nextjs',
      description: 'Next.js overlay',
      framework: 'nextjs',
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('applies merge strategy defaults', () => {
    const result = TemplateMetadataSchema.parse({
      name: 'basic',
      description: 'Level 1',
      version: 1,
    });
    expect(result.mergeStrategy).toEqual({
      json: 'deep-merge',
      files: 'overlay-wins',
    });
  });

  it('rejects invalid version', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'basic',
      description: 'Level 1',
      version: 2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid level', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'basic',
      description: 'Level 1',
      level: 'expert',
      version: 1,
    });
    expect(result.success).toBe(false);
  });

  it('validates a template with language and tooling fields', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'fastapi',
      description: 'FastAPI scaffold',
      version: 1,
      language: 'python',
      framework: 'fastapi',
      extends: 'python-base',
      tooling: {
        packageManager: 'pip',
        linter: 'ruff',
        formatter: 'ruff',
        buildTool: 'setuptools',
        testRunner: 'pytest',
        lockFile: 'requirements.txt',
      },
      detect: [
        { file: 'requirements.txt', contains: 'fastapi' },
        { file: 'pyproject.toml', contains: 'fastapi' },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.language).toBe('python');
    expect(result.data.tooling?.packageManager).toBe('pip');
    expect(result.data.detect).toHaveLength(2);
  });

  it('accepts template without new fields (backward compatible)', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'basic',
      description: 'Level 1',
      version: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.language).toBeUndefined();
    expect(result.data.tooling).toBeUndefined();
    expect(result.data.detect).toBeUndefined();
  });

  it('rejects invalid language value', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'test',
      description: 'Test',
      version: 1,
      language: 'cobol',
    });
    expect(result.success).toBe(false);
  });

  it('rejects detect entry missing file field', () => {
    const result = TemplateMetadataSchema.safeParse({
      name: 'test',
      description: 'Test',
      version: 1,
      detect: [{ contains: 'fastapi' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema template field', () => {
  it('accepts config with template metadata', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      template: {
        level: 'intermediate',
        framework: 'nextjs',
        version: 1,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without template (backwards compatible)', () => {
    const result = HarnessConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.template).toBeUndefined();
    }
  });

  it('rejects invalid template level', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      template: { level: 'expert', version: 1 },
    });
    expect(result.success).toBe(false);
  });
});
