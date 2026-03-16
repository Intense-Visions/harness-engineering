import { describe, it, expect } from 'vitest';
import { HarnessConfigSchema } from '../../src/utils/schema';

describe('HarnessConfigSchema', () => {
  it('validates minimal config', () => {
    const result = HarnessConfigSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });

  it('validates config with layers', () => {
    const config = {
      version: 1,
      layers: [
        { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
      ],
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with forbiddenImports', () => {
    const config = {
      version: 1,
      forbiddenImports: [{ from: 'src/services/**', disallow: ['react'] }],
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('validates config with boundaries', () => {
    const config = {
      version: 1,
      boundaries: { requireSchema: ['src/api/**/*.ts'] },
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects invalid version', () => {
    const result = HarnessConfigSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects layer without required fields', () => {
    const config = {
      version: 1,
      layers: [{ name: 'types' }], // missing pattern and allowedDependencies
    };
    const result = HarnessConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
