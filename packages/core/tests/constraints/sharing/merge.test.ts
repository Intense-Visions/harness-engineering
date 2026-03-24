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
});
