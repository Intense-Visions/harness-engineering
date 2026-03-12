import { describe, it, expect } from 'vitest';
import { validatePatternConfig, EntropyConfigSchema } from '../../../src/entropy/config/schema';

describe('validatePatternConfig', () => {
  it('should validate valid pattern config', () => {
    const config = {
      patterns: [
        {
          name: 'must-export-default',
          description: 'Services must export default class',
          severity: 'error' as const,
          files: ['src/services/**/*.ts'],
          rule: { type: 'must-export-default' as const, kind: 'class' as const },
        },
      ],
    };

    const result = validatePatternConfig(config);
    expect(result.ok).toBe(true);
  });

  it('should reject invalid severity', () => {
    const config = {
      patterns: [
        {
          name: 'test',
          description: 'Test',
          severity: 'invalid' as any,
          files: ['*.ts'],
          rule: { type: 'must-export-default' as const },
        },
      ],
    };

    const result = validatePatternConfig(config);
    expect(result.ok).toBe(false);
  });

  it('should validate naming convention pattern', () => {
    const config = {
      patterns: [
        {
          name: 'camelCase-functions',
          description: 'Functions must be camelCase',
          severity: 'warning' as const,
          files: ['src/**/*.ts'],
          rule: {
            type: 'naming' as const,
            match: '^[a-z]',
            convention: 'camelCase' as const,
          },
        },
      ],
    };

    const result = validatePatternConfig(config);
    expect(result.ok).toBe(true);
  });

  it('should validate max-exports pattern', () => {
    const config = {
      patterns: [
        {
          name: 'max-exports',
          description: 'Max 5 exports per file',
          severity: 'error' as const,
          files: ['src/**/*.ts'],
          rule: { type: 'max-exports' as const, count: 5 },
        },
      ],
    };

    const result = validatePatternConfig(config);
    expect(result.ok).toBe(true);
  });
});

describe('EntropyConfigSchema', () => {
  it('should validate full entropy config', () => {
    const config = {
      rootDir: '/project',
      analyze: {
        drift: true,
        deadCode: { includeTypes: false },
        patterns: {
          patterns: [],
        },
      },
    };

    const result = EntropyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate config with boolean analyze flags', () => {
    const config = {
      rootDir: '/project',
      analyze: {
        drift: true,
        deadCode: true,
        patterns: true,
      },
    };

    const result = EntropyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
