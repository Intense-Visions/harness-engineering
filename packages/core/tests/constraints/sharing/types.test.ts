import { describe, it, expect } from 'vitest';
import {
  ManifestSchema,
  BundleSchema,
  LockfileSchema,
  ContributionsSchema,
  LockfilePackageSchema,
  BundleConstraintsSchema,
} from '../../../src/constraints/sharing/types';

describe('ManifestSchema', () => {
  it('should parse a valid manifest', () => {
    const input = {
      name: 'strict-api',
      version: '1.0.0',
      description: 'Strict API constraints',
      minHarnessVersion: '1.0.0',
      keywords: ['api', 'strict'],
      include: ['layers', 'forbiddenImports', 'security.rules'],
    };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('strict-api');
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.include).toHaveLength(3);
    }
  });

  it('should apply defaults for optional fields', () => {
    const input = {
      name: 'minimal',
      version: '0.1.0',
      include: ['layers'],
    };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords).toEqual([]);
      expect(result.data.description).toBeUndefined();
      expect(result.data.minHarnessVersion).toBeUndefined();
    }
  });

  it('should reject manifest without name', () => {
    const input = { version: '1.0.0', include: ['layers'] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject manifest without version', () => {
    const input = { name: 'test', include: ['layers'] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject manifest with empty include array', () => {
    const input = { name: 'test', version: '1.0.0', include: [] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject manifest without include', () => {
    const input = { name: 'test', version: '1.0.0' };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept empty name (no min length constraint)', () => {
    const input = { name: '', version: '1.0.0', include: ['layers'] };
    const result = ManifestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('BundleConstraintsSchema', () => {
  it('should parse empty constraints', () => {
    const result = BundleConstraintsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should parse constraints with layers', () => {
    const input = {
      layers: [{ name: 'types', pattern: 'src/types/**', allowedDependencies: [] }],
    };
    const result = BundleConstraintsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.layers).toHaveLength(1);
      expect(result.data.layers![0].name).toBe('types');
    }
  });

  it('should parse constraints with forbiddenImports', () => {
    const input = {
      forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'], message: 'No' }],
    };
    const result = BundleConstraintsSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should parse constraints with security rules', () => {
    const input = {
      security: {
        rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning' },
      },
    };
    const result = BundleConstraintsSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('BundleSchema', () => {
  it('should parse a valid bundle', () => {
    const manifest = {
      name: 'strict-api',
      version: '1.0.0',
      include: ['layers', 'forbiddenImports', 'security.rules'],
      minHarnessVersion: '1.0.0',
      description: 'Strict API constraints',
    };
    const input = {
      name: 'strict-api',
      version: '1.0.0',
      minHarnessVersion: '1.0.0',
      description: 'Strict API constraints',
      manifest,
      constraints: {
        layers: [{ name: 'types', pattern: 'src/types/**', allowedDependencies: [] }],
        forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'] }],
        security: { rules: { 'SEC-CRY-001': 'error' } },
      },
    };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('strict-api');
      expect(result.data.constraints.layers).toHaveLength(1);
    }
  });

  it('should reject bundle without name', () => {
    const input = {
      version: '1.0.0',
      manifest: { name: 'test', version: '1.0.0', include: ['layers'] },
      constraints: {},
    };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject bundle without constraints', () => {
    const input = {
      name: 'test',
      version: '1.0.0',
      manifest: { name: 'test', version: '1.0.0', include: ['layers'] },
    };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should parse bundle with empty constraints', () => {
    const input = {
      name: 'empty',
      version: '1.0.0',
      manifest: { name: 'empty', version: '1.0.0', include: ['layers'] },
      constraints: {},
    };
    const result = BundleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('ContributionsSchema', () => {
  it('should parse valid contributions', () => {
    const input = {
      layers: ['types', 'core'],
      forbiddenImports: ['src/domain/**', 'src/types/**'],
      'security.rules': ['SEC-CRY-001'],
    };
    const result = ContributionsSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should parse empty contributions', () => {
    const result = ContributionsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept any record values (relaxed schema)', () => {
    const input = { forbiddenImports: [123], custom: 'value' };
    const result = ContributionsSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('LockfileSchema', () => {
  it('should parse a valid lockfile', () => {
    const input = {
      version: 1,
      packages: {
        'strict-api': {
          version: '1.0.0',
          source: './shared/strict-api.harness-constraints.json',
          installedAt: '2026-03-24T12:00:00Z',
          contributions: {
            layers: ['types', 'core'],
            forbiddenImports: ['src/domain/**', 'src/types/**'],
            'security.rules': ['SEC-CRY-001'],
          },
        },
      },
    };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.packages['strict-api'].version).toBe('1.0.0');
    }
  });

  it('should reject lockfile with wrong version', () => {
    const input = { version: 2, packages: {} };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should parse empty lockfile (no packages)', () => {
    const input = { version: 1, packages: {} };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept package with any installedAt string (relaxed schema)', () => {
    const input = {
      version: 1,
      packages: {
        test: {
          version: '1.0.0',
          source: './test.json',
          installedAt: 'not-a-date',
          contributions: {},
        },
      },
    };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should accept lockfileVersion field as alternative to version', () => {
    const input = {
      lockfileVersion: 1,
      packages: {},
    };
    const result = LockfileSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});
