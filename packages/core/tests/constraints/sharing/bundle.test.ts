import { describe, it, expect } from 'vitest';
import { extractBundle } from '../../../src/constraints/sharing/bundle';
import type { Manifest } from '../../../src/constraints/sharing/types';

const baseManifest: Manifest = {
  name: 'strict-api',
  version: '1.0.0',
  keywords: [],
  include: ['layers'],
};

const fullConfig: Record<string, unknown> = {
  layers: [
    { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
    { name: 'api', pattern: 'src/api/**', allowedDependencies: ['domain'] },
  ],
  forbiddenImports: [
    { from: 'src/domain/**', disallow: ['src/api/**'], message: 'domain must not import api' },
  ],
  boundaries: {
    requireSchema: ['src/api/**'],
  },
  architecture: {
    thresholds: { maxCyclomaticComplexity: 10, maxFileLines: 300 },
    modules: [],
  },
  security: {
    rules: {
      'no-hardcoded-secrets': 'error',
      'no-eval': 'error',
    },
  },
};

describe('extractBundle', () => {
  it('should extract layers only when include is ["layers"]', () => {
    const manifest: Manifest = { ...baseManifest, include: ['layers'] };
    const result = extractBundle(manifest, fullConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.constraints.layers).toHaveLength(2);
      expect(result.value.constraints.forbiddenImports).toBeUndefined();
      expect(result.value.constraints.security).toBeUndefined();
    }
  });

  it('should extract forbiddenImports only when include is ["forbiddenImports"]', () => {
    const manifest: Manifest = { ...baseManifest, include: ['forbiddenImports'] };
    const result = extractBundle(manifest, fullConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.constraints.forbiddenImports).toHaveLength(1);
      expect(result.value.constraints.layers).toBeUndefined();
    }
  });

  it('should extract nested security.rules via dot-path', () => {
    const manifest: Manifest = { ...baseManifest, include: ['security.rules'] };
    const result = extractBundle(manifest, fullConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.constraints.security).toBeDefined();
      expect(result.value.constraints.security?.rules).toEqual({
        'no-hardcoded-secrets': 'error',
        'no-eval': 'error',
      });
      expect(result.value.constraints.layers).toBeUndefined();
    }
  });

  it('should extract multiple sections when listed in include', () => {
    const manifest: Manifest = {
      ...baseManifest,
      include: ['layers', 'forbiddenImports', 'security.rules'],
    };
    const result = extractBundle(manifest, fullConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.constraints.layers).toBeDefined();
      expect(result.value.constraints.forbiddenImports).toBeDefined();
      expect(result.value.constraints.security?.rules).toBeDefined();
    }
  });

  it('should silently omit a section that is missing from config', () => {
    const configWithoutBoundaries: Record<string, unknown> = {
      layers: fullConfig.layers,
    };
    const manifest: Manifest = {
      ...baseManifest,
      include: ['layers', 'boundaries'],
    };

    const result = extractBundle(manifest, configWithoutBoundaries);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.constraints.layers).toBeDefined();
      expect(result.value.constraints.boundaries).toBeUndefined();
    }
  });

  it('should silently omit everything when no includes exist in config', () => {
    const manifest: Manifest = {
      ...baseManifest,
      include: ['layers', 'security.rules', 'boundaries'],
    };

    const result = extractBundle(manifest, {});

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.constraints).toEqual({});
    }
  });

  it('should carry manifest metadata into the bundle', () => {
    const manifest: Manifest = {
      name: 'my-constraints',
      version: '2.0.0',
      description: 'A constraint bundle',
      minHarnessVersion: '1.5.0',
      keywords: [],
      include: ['layers'],
    };

    const result = extractBundle(manifest, fullConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('my-constraints');
      expect(result.value.version).toBe('2.0.0');
      expect(result.value.description).toBe('A constraint bundle');
      expect(result.value.minHarnessVersion).toBe('1.5.0');
    }
  });

  it('should perform a full round-trip: manifest + config → valid bundle', () => {
    const manifest: Manifest = {
      name: 'round-trip',
      version: '1.0.0',
      keywords: [],
      include: ['layers', 'forbiddenImports', 'security.rules'],
    };

    const result = extractBundle(manifest, fullConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const bundle = result.value;
      expect(bundle.name).toBe('round-trip');
      expect(bundle.version).toBe('1.0.0');
      expect(bundle.constraints.layers).toHaveLength(2);
      expect(bundle.constraints.forbiddenImports).toHaveLength(1);
      expect(bundle.constraints.security?.rules?.['no-hardcoded-secrets']).toBe('error');
    }
  });
});
