import { describe, it, expect } from 'vitest';
import { removeContributions } from '../../../src/constraints/sharing/remove';
import type { Contributions } from '../../../src/constraints/sharing/types';

describe('removeContributions', () => {
  it('returns config unchanged when contributions is empty', () => {
    const config = {
      layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
    };
    const contributions: Contributions = {};
    const result = removeContributions(config, contributions);
    expect(result).toEqual(config);
  });

  describe('layers removal', () => {
    it('removes layers whose name matches contributions.layers', () => {
      const config = {
        layers: [
          { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
          { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
          { name: 'api', pattern: 'src/api/**', allowedDependencies: ['domain'] },
        ],
      };
      const contributions: Contributions = { layers: ['infra'] };
      const result = removeContributions(config, contributions);
      const layers = result.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(2);
      expect(layers.map((l) => l.name)).toEqual(['domain', 'api']);
    });

    it('handles removing multiple layers', () => {
      const config = {
        layers: [
          { name: 'a', pattern: 'a/**', allowedDependencies: [] },
          { name: 'b', pattern: 'b/**', allowedDependencies: [] },
          { name: 'c', pattern: 'c/**', allowedDependencies: [] },
        ],
      };
      const contributions: Contributions = { layers: ['a', 'c'] };
      const result = removeContributions(config, contributions);
      const layers = result.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe('b');
    });

    it('is a no-op when contributed layer name does not exist', () => {
      const config = {
        layers: [{ name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] }],
      };
      const contributions: Contributions = { layers: ['nonexistent'] };
      const result = removeContributions(config, contributions);
      expect(result.layers).toEqual(config.layers);
    });
  });

  describe('forbiddenImports removal', () => {
    it('removes rules whose from key matches contributions.forbiddenImports', () => {
      const config = {
        forbiddenImports: [
          { from: 'src/types/**', disallow: ['src/core/**'], message: 'No core' },
          { from: 'src/api/**', disallow: ['src/db/**'], message: 'No db' },
        ],
      };
      const contributions: Contributions = { forbiddenImports: ['src/types/**'] };
      const result = removeContributions(config, contributions);
      const rules = result.forbiddenImports as Array<{ from: string }>;
      expect(rules).toHaveLength(1);
      expect(rules[0].from).toBe('src/api/**');
    });
  });

  describe('boundaries removal', () => {
    it('removes matching requireSchema entries', () => {
      const config = {
        boundaries: {
          requireSchema: ['user.schema.json', 'order.schema.json', 'product.schema.json'],
        },
      };
      const contributions: Contributions = {
        boundaries: ['order.schema.json'],
      };
      const result = removeContributions(config, contributions);
      const boundaries = result.boundaries as { requireSchema: string[] };
      expect(boundaries.requireSchema).toEqual(['user.schema.json', 'product.schema.json']);
    });
  });

  describe('architecture.thresholds removal', () => {
    it('removes matching category keys from thresholds', () => {
      const config = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: { coupling: 0.5, complexity: 10, cohesion: 0.8 },
          modules: {},
        },
      };
      const contributions: Contributions = {
        'architecture.thresholds': ['complexity'],
      };
      const result = removeContributions(config, contributions);
      const arch = result.architecture as {
        thresholds: Record<string, unknown>;
      };
      expect(arch.thresholds).toEqual({ coupling: 0.5, cohesion: 0.8 });
    });
  });

  describe('architecture.modules removal', () => {
    it('removes matching modulePath:category entries', () => {
      const config = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: {
            'src/core': { coupling: 0.3, complexity: 5 },
            'src/api': { coupling: 0.4 },
          },
        },
      };
      const contributions: Contributions = {
        'architecture.modules': ['src/core:complexity'],
      };
      const result = removeContributions(config, contributions);
      const arch = result.architecture as {
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.modules['src/core']).toEqual({ coupling: 0.3 });
      expect(arch.modules['src/api']).toEqual({ coupling: 0.4 });
    });

    it('removes entire module entry when all categories are removed', () => {
      const config = {
        architecture: {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: {
            'src/core': { coupling: 0.3 },
            'src/api': { coupling: 0.4 },
          },
        },
      };
      const contributions: Contributions = {
        'architecture.modules': ['src/core:coupling'],
      };
      const result = removeContributions(config, contributions);
      const arch = result.architecture as {
        modules: Record<string, Record<string, unknown>>;
      };
      expect(arch.modules['src/core']).toBeUndefined();
      expect(arch.modules['src/api']).toEqual({ coupling: 0.4 });
    });
  });

  describe('security.rules removal', () => {
    it('removes matching rule IDs', () => {
      const config = {
        security: {
          rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning', 'SEC-XSS-003': 'error' },
        },
      };
      const contributions: Contributions = {
        'security.rules': ['SEC-CRY-001', 'SEC-XSS-003'],
      };
      const result = removeContributions(config, contributions);
      const security = result.security as { rules: Record<string, string> };
      expect(security.rules).toEqual({ 'SEC-INJ-002': 'warning' });
    });
  });

  describe('multi-section removal', () => {
    it('removes contributions from multiple sections in one call', () => {
      const config = {
        layers: [
          { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
          { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
        ],
        forbiddenImports: [{ from: 'src/types/**', disallow: ['src/core/**'] }],
        security: {
          rules: { 'SEC-CRY-001': 'error', 'SEC-INJ-002': 'warning' },
        },
      };
      const contributions: Contributions = {
        layers: ['infra'],
        forbiddenImports: ['src/types/**'],
        'security.rules': ['SEC-CRY-001'],
      };
      const result = removeContributions(config, contributions);
      const layers = result.layers as Array<{ name: string }>;
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe('domain');
      expect(result.forbiddenImports).toEqual([]);
      const security = result.security as { rules: Record<string, string> };
      expect(security.rules).toEqual({ 'SEC-INJ-002': 'warning' });
    });
  });

  it('does not mutate the original config object', () => {
    const config = {
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
        { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
      ],
    };
    const contributions: Contributions = { layers: ['infra'] };
    const originalLayersLength = config.layers.length;
    removeContributions(config, contributions);
    expect(config.layers).toHaveLength(originalLayersLength);
  });
});
