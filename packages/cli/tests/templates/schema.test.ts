import { describe, it, expect } from 'vitest';
import { TemplateMetadataSchema } from '../../src/templates/schema';

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
});
