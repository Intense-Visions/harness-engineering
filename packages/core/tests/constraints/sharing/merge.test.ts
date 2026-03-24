import { describe, it, expect } from 'vitest';
import { deepMergeConstraints } from '../../../src/constraints/sharing/merge';
import type { BundleConstraints } from '../../../src/constraints/sharing/types';

describe('deepMergeConstraints', () => {
  it('should return local config unchanged when bundle is empty', () => {
    const localConfig = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
    };
    const bundle: BundleConstraints = {};

    const result = deepMergeConstraints(localConfig, bundle);

    expect(result.config).toEqual(localConfig);
    expect(result.contributions).toEqual({});
    expect(result.conflicts).toEqual([]);
  });

  describe('layers merge', () => {
    const localConfig = {
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
        { name: 'api', pattern: 'src/api/**', allowedDependencies: ['domain'] },
      ],
    };

    it('should append new layers from bundle', () => {
      const bundle: BundleConstraints = {
        layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] }],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const layers = result.config.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(3);
      expect(layers[2].name).toBe('infra');
      expect(result.contributions.layers).toEqual(['infra']);
      expect(result.conflicts).toEqual([]);
    });

    it('should skip layers that are identical in local and bundle', () => {
      const bundle: BundleConstraints = {
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const layers = result.config.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(2);
      expect(result.contributions.layers).toBeUndefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should report conflict when same name has different config', () => {
      const bundle: BundleConstraints = {
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['utils'] }],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const layers = result.config.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(2); // local unchanged
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].section).toBe('layers');
      expect(result.conflicts[0].key).toBe('domain');
      expect(result.conflicts[0].description).toContain('domain');
    });

    it('should handle bundle layers when local has no layers', () => {
      const bundle: BundleConstraints = {
        layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
      };
      const result = deepMergeConstraints({}, bundle);
      const layers = result.config.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe('infra');
      expect(result.contributions.layers).toEqual(['infra']);
    });

    it('should handle mixed: some new, some identical, some conflicting', () => {
      const bundle: BundleConstraints = {
        layers: [
          { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }, // identical
          { name: 'api', pattern: 'src/api/**', allowedDependencies: [] }, // conflict (different deps)
          { name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }, // new
        ],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const layers = result.config.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(3); // 2 local + 1 new
      expect(result.contributions.layers).toEqual(['infra']);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe('api');
    });
  });

  describe('forbiddenImports merge', () => {
    const localConfig = {
      forbiddenImports: [
        { from: 'src/domain/**', disallow: ['src/api/**'], message: 'domain cannot import api' },
        { from: 'src/types/**', disallow: ['src/core/**'] },
      ],
    };

    it('should append new forbidden imports from bundle', () => {
      const bundle: BundleConstraints = {
        forbiddenImports: [{ from: 'src/infra/**', disallow: ['src/ui/**'] }],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const fi = result.config.forbiddenImports as Array<{ from: string }>;
      expect(fi).toHaveLength(3);
      expect(fi[2].from).toBe('src/infra/**');
      expect(result.contributions.forbiddenImports).toEqual([2]); // index in merged array
      expect(result.conflicts).toEqual([]);
    });

    it('should skip identical forbidden imports', () => {
      const bundle: BundleConstraints = {
        forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'] }],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const fi = result.config.forbiddenImports as Array<{ from: string }>;
      expect(fi).toHaveLength(2);
      expect(result.contributions.forbiddenImports).toBeUndefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should report conflict when same from has different disallow', () => {
      const bundle: BundleConstraints = {
        forbiddenImports: [{ from: 'src/domain/**', disallow: ['src/ui/**'] }],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].section).toBe('forbiddenImports');
      expect(result.conflicts[0].key).toBe('src/domain/**');
    });

    it('should handle bundle forbidden imports when local has none', () => {
      const bundle: BundleConstraints = {
        forbiddenImports: [{ from: 'src/infra/**', disallow: ['src/ui/**'] }],
      };
      const result = deepMergeConstraints({}, bundle);
      const fi = result.config.forbiddenImports as Array<{ from: string }>;
      expect(fi).toHaveLength(1);
      expect(result.contributions.forbiddenImports).toEqual([0]);
    });

    it('should handle mixed: new, identical, and conflicting', () => {
      const bundle: BundleConstraints = {
        forbiddenImports: [
          { from: 'src/types/**', disallow: ['src/core/**'] }, // identical
          { from: 'src/domain/**', disallow: ['src/ui/**'] }, // conflict
          { from: 'src/new/**', disallow: ['src/other/**'] }, // new
        ],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const fi = result.config.forbiddenImports as Array<{ from: string }>;
      expect(fi).toHaveLength(3); // 2 local + 1 new
      expect(result.contributions.forbiddenImports).toEqual([2]);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe('src/domain/**');
    });
  });

  describe('boundaries merge', () => {
    it('should union requireSchema arrays and deduplicate', () => {
      const localConfig = {
        boundaries: { requireSchema: ['src/api/**', 'src/types/**'] },
      };
      const bundle: BundleConstraints = {
        boundaries: { requireSchema: ['src/types/**', 'src/models/**'] },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const boundaries = result.config.boundaries as { requireSchema: string[] };
      expect(boundaries.requireSchema).toEqual(['src/api/**', 'src/types/**', 'src/models/**']);
      expect(result.contributions.boundaries).toEqual(['src/models/**']);
      expect(result.conflicts).toEqual([]);
    });

    it('should handle bundle boundaries when local has none', () => {
      const bundle: BundleConstraints = {
        boundaries: { requireSchema: ['src/api/**'] },
      };
      const result = deepMergeConstraints({}, bundle);
      const boundaries = result.config.boundaries as { requireSchema: string[] };
      expect(boundaries.requireSchema).toEqual(['src/api/**']);
      expect(result.contributions.boundaries).toEqual(['src/api/**']);
    });

    it('should handle all duplicates (nothing new)', () => {
      const localConfig = {
        boundaries: { requireSchema: ['src/api/**'] },
      };
      const bundle: BundleConstraints = {
        boundaries: { requireSchema: ['src/api/**'] },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const boundaries = result.config.boundaries as { requireSchema: string[] };
      expect(boundaries.requireSchema).toEqual(['src/api/**']);
      expect(result.contributions.boundaries).toBeUndefined();
    });

    it('should handle empty requireSchema in bundle', () => {
      const localConfig = {
        boundaries: { requireSchema: ['src/api/**'] },
      };
      const bundle: BundleConstraints = {
        boundaries: { requireSchema: [] },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const boundaries = result.config.boundaries as { requireSchema: string[] };
      expect(boundaries.requireSchema).toEqual(['src/api/**']);
      expect(result.contributions.boundaries).toBeUndefined();
    });
  });

  describe('architecture thresholds merge', () => {
    it('should add new threshold categories from bundle', () => {
      const localConfig = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { 'circular-deps': 0 },
          modules: {},
        },
      };
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { complexity: 10 },
          modules: {},
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const arch = result.config.architecture as { thresholds: Record<string, unknown> };
      expect(arch.thresholds['circular-deps']).toBe(0);
      expect(arch.thresholds['complexity']).toBe(10);
      expect(result.contributions['architecture.thresholds']).toEqual(['complexity']);
    });

    it('should skip identical threshold values', () => {
      const localConfig = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { 'circular-deps': 0 },
          modules: {},
        },
      };
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { 'circular-deps': 0 },
          modules: {},
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.contributions['architecture.thresholds']).toBeUndefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should report conflict for same category with different value', () => {
      const localConfig = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { 'circular-deps': 0 },
          modules: {},
        },
      };
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { 'circular-deps': 5 },
          modules: {},
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].section).toBe('architecture.thresholds');
      expect(result.conflicts[0].key).toBe('circular-deps');
      expect(result.conflicts[0].localValue).toBe(0);
      expect(result.conflicts[0].packageValue).toBe(5);
    });

    it('should handle bundle architecture when local has none', () => {
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { complexity: 10 },
          modules: {},
        },
      };
      const result = deepMergeConstraints({}, bundle);
      const arch = result.config.architecture as { thresholds: Record<string, unknown> };
      expect(arch.thresholds['complexity']).toBe(10);
      expect(result.contributions['architecture.thresholds']).toEqual(['complexity']);
    });

    it('should handle thresholds with nested record values (per-subcategory)', () => {
      const localConfig = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { complexity: { 'src/api': 5 } },
          modules: {},
        },
      };
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { complexity: { 'src/api': 10 } },
          modules: {},
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].section).toBe('architecture.thresholds');
      expect(result.conflicts[0].key).toBe('complexity');
    });
  });

  describe('architecture modules merge', () => {
    const makeArch = (
      thresholds: Record<string, unknown>,
      modules: Record<string, Record<string, unknown>>
    ) => ({
      architecture: {
        enabled: true,
        baselinePath: '.harness/arch/baselines.json',
        thresholds,
        modules,
      },
    });

    it('should add new module overrides from bundle', () => {
      const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: { 'src/lib': { complexity: 15 } },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const arch = result.config.architecture as {
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.modules['src/api']).toEqual({ complexity: 5 });
      expect(arch.modules['src/lib']).toEqual({ complexity: 15 });
      expect(result.contributions['architecture.modules']).toEqual(['src/lib:complexity']);
    });

    it('should add new categories to existing module', () => {
      const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: { 'src/api': { coupling: 3 } },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const arch = result.config.architecture as {
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.modules['src/api']).toEqual({ complexity: 5, coupling: 3 });
      expect(result.contributions['architecture.modules']).toEqual(['src/api:coupling']);
    });

    it('should report conflict for same module + same category with different value', () => {
      const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: { 'src/api': { complexity: 20 } },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].section).toBe('architecture.modules');
      expect(result.conflicts[0].key).toBe('src/api:complexity');
      expect(result.conflicts[0].localValue).toBe(5);
      expect(result.conflicts[0].packageValue).toBe(20);
    });

    it('should skip identical module + category values', () => {
      const localConfig = makeArch({}, { 'src/api': { complexity: 5 } });
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: { 'src/api': { complexity: 5 } },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.contributions['architecture.modules']).toBeUndefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should handle modules when local has no architecture', () => {
      const bundle: BundleConstraints = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: { 'src/lib': { coupling: 3 } },
        },
      };
      const result = deepMergeConstraints({}, bundle);
      const arch = result.config.architecture as {
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.modules['src/lib']).toEqual({ coupling: 3 });
      expect(result.contributions['architecture.modules']).toEqual(['src/lib:coupling']);
    });
  });

  describe('security rules merge', () => {
    const localConfig = {
      security: {
        rules: {
          'SEC-CRY-001': 'error' as const,
          'SEC-INJ-002': 'warning' as const,
        },
      },
    };

    it('should add new security rules from bundle', () => {
      const bundle: BundleConstraints = {
        security: {
          rules: { 'SEC-XSS-003': 'error' },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const security = result.config.security as { rules: Record<string, string> };
      expect(security.rules['SEC-CRY-001']).toBe('error');
      expect(security.rules['SEC-XSS-003']).toBe('error');
      expect(result.contributions['security.rules']).toEqual(['SEC-XSS-003']);
    });

    it('should skip identical security rules', () => {
      const bundle: BundleConstraints = {
        security: {
          rules: { 'SEC-CRY-001': 'error' },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.contributions['security.rules']).toBeUndefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should report conflict for same rule ID with different severity', () => {
      const bundle: BundleConstraints = {
        security: {
          rules: { 'SEC-CRY-001': 'warning' },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].section).toBe('security.rules');
      expect(result.conflicts[0].key).toBe('SEC-CRY-001');
      expect(result.conflicts[0].localValue).toBe('error');
      expect(result.conflicts[0].packageValue).toBe('warning');
    });

    it('should handle bundle security rules when local has none', () => {
      const bundle: BundleConstraints = {
        security: {
          rules: { 'SEC-CRY-001': 'error' },
        },
      };
      const result = deepMergeConstraints({}, bundle);
      const security = result.config.security as { rules: Record<string, string> };
      expect(security.rules['SEC-CRY-001']).toBe('error');
      expect(result.contributions['security.rules']).toEqual(['SEC-CRY-001']);
    });

    it('should handle mixed: new, identical, and conflicting rules', () => {
      const bundle: BundleConstraints = {
        security: {
          rules: {
            'SEC-CRY-001': 'error', // identical
            'SEC-INJ-002': 'error', // conflict (was warning)
            'SEC-XSS-003': 'info', // new
          },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const security = result.config.security as { rules: Record<string, string> };
      expect(security.rules['SEC-XSS-003']).toBe('info');
      expect(result.contributions['security.rules']).toEqual(['SEC-XSS-003']);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].key).toBe('SEC-INJ-002');
    });

    it('should handle bundle security with undefined rules', () => {
      const bundle: BundleConstraints = {
        security: {},
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.config).toEqual(localConfig);
      expect(result.contributions['security.rules']).toBeUndefined();
    });

    it('should handle security rules with off severity', () => {
      const bundle: BundleConstraints = {
        security: {
          rules: { 'SEC-NEW-001': 'off' },
        },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      const security = result.config.security as { rules: Record<string, string> };
      expect(security.rules['SEC-NEW-001']).toBe('off');
      expect(result.contributions['security.rules']).toEqual(['SEC-NEW-001']);
    });
  });

  describe('cross-section integration', () => {
    it('should merge all sections at once from a realistic bundle', () => {
      const localConfig = {
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
        forbiddenImports: [{ from: 'src/domain/**', disallow: ['src/api/**'] }],
        boundaries: { requireSchema: ['src/api/**'] },
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { 'circular-deps': 0 },
          modules: {},
        },
        security: { rules: { 'SEC-CRY-001': 'error' } },
      };

      const bundle: BundleConstraints = {
        layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] }],
        forbiddenImports: [
          {
            from: 'src/infra/**',
            disallow: ['src/ui/**'],
            message: 'infra cannot import ui',
          },
        ],
        boundaries: { requireSchema: ['src/models/**'] },
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { complexity: 10 },
          modules: { 'src/api': { coupling: 3 } },
        },
        security: { rules: { 'SEC-XSS-003': 'warning' } },
      };

      const result = deepMergeConstraints(localConfig, bundle);

      // Layers
      const layers = result.config.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(2);
      expect(layers[1].name).toBe('infra');
      expect(result.contributions.layers).toEqual(['infra']);

      // Forbidden imports
      const fi = result.config.forbiddenImports as Array<{ from: string }>;
      expect(fi).toHaveLength(2);
      expect(fi[1].from).toBe('src/infra/**');
      expect(result.contributions.forbiddenImports).toEqual([1]);

      // Boundaries
      const boundaries = result.config.boundaries as { requireSchema: string[] };
      expect(boundaries.requireSchema).toEqual(['src/api/**', 'src/models/**']);
      expect(result.contributions.boundaries).toEqual(['src/models/**']);

      // Architecture
      const arch = result.config.architecture as {
        thresholds: Record<string, unknown>;
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.thresholds['circular-deps']).toBe(0);
      expect(arch.thresholds['complexity']).toBe(10);
      expect(arch.modules['src/api']).toEqual({ coupling: 3 });
      expect(result.contributions['architecture.thresholds']).toEqual(['complexity']);
      expect(result.contributions['architecture.modules']).toEqual(['src/api:coupling']);

      // Security
      const security = result.config.security as { rules: Record<string, string> };
      expect(security.rules['SEC-CRY-001']).toBe('error');
      expect(security.rules['SEC-XSS-003']).toBe('warning');
      expect(result.contributions['security.rules']).toEqual(['SEC-XSS-003']);

      // No conflicts
      expect(result.conflicts).toEqual([]);
    });

    it('should collect conflicts across multiple sections', () => {
      const localConfig = {
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
        security: { rules: { 'SEC-CRY-001': 'error' } },
      };
      const bundle: BundleConstraints = {
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['utils'] }],
        security: { rules: { 'SEC-CRY-001': 'off' } },
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect(result.conflicts).toHaveLength(2);
      expect(result.conflicts.map((c) => c.section).sort()).toEqual(['layers', 'security.rules']);
    });

    it('should preserve non-constraint config keys untouched', () => {
      const localConfig = {
        projectName: 'my-project',
        version: '1.0.0',
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      };
      const bundle: BundleConstraints = {
        layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
      };
      const result = deepMergeConstraints(localConfig, bundle);
      expect((result.config as Record<string, unknown>).projectName).toBe('my-project');
      expect((result.config as Record<string, unknown>).version).toBe('1.0.0');
    });

    it('should handle completely empty local config with a full bundle', () => {
      const bundle: BundleConstraints = {
        layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
        forbiddenImports: [{ from: 'src/infra/**', disallow: ['src/ui/**'] }],
        boundaries: { requireSchema: ['src/api/**'] },
        security: { rules: { 'SEC-CRY-001': 'error' } },
      };
      const result = deepMergeConstraints({}, bundle);
      expect(result.conflicts).toEqual([]);
      expect(result.contributions.layers).toEqual(['infra']);
      expect(result.contributions.forbiddenImports).toEqual([0]);
      expect(result.contributions.boundaries).toEqual(['src/api/**']);
      expect(result.contributions['security.rules']).toEqual(['SEC-CRY-001']);
    });

    it('should be idempotent: merging the same bundle twice yields no new contributions', () => {
      const localConfig = {};
      const bundle: BundleConstraints = {
        layers: [{ name: 'infra', pattern: 'src/infra/**', allowedDependencies: [] }],
        security: { rules: { 'SEC-CRY-001': 'error' } },
      };

      // First merge
      const first = deepMergeConstraints(localConfig, bundle);
      expect(first.contributions.layers).toEqual(['infra']);

      // Second merge into the result of the first
      const second = deepMergeConstraints(first.config, bundle);
      expect(second.contributions.layers).toBeUndefined();
      expect(second.contributions['security.rules']).toBeUndefined();
      expect(second.conflicts).toEqual([]);
      expect(second.config).toEqual(first.config);
    });
  });
});
