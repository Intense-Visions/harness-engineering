import { describe, it, expect } from 'vitest';
import { defineLayer, resolveFileToLayer } from '../../src/constraints/layers';
import type { Layer } from '../../src/constraints/types';

describe('defineLayer', () => {
  it('should create a layer with all properties', () => {
    const layer = defineLayer('domain', ['src/domain/**'], []);

    expect(layer.name).toBe('domain');
    expect(layer.patterns).toEqual(['src/domain/**']);
    expect(layer.allowedDependencies).toEqual([]);
  });

  it('should create a layer with dependencies', () => {
    const layer = defineLayer('services', ['src/services/**'], ['domain']);

    expect(layer.allowedDependencies).toEqual(['domain']);
  });
});

describe('resolveFileToLayer', () => {
  const layers: Layer[] = [
    { name: 'domain', patterns: ['src/domain/**'], allowedDependencies: [] },
    { name: 'services', patterns: ['src/services/**'], allowedDependencies: ['domain'] },
    { name: 'api', patterns: ['src/api/**'], allowedDependencies: ['services', 'domain'] },
  ];

  it('should resolve file to correct layer', () => {
    const layer = resolveFileToLayer('src/domain/user.ts', layers);
    expect(layer?.name).toBe('domain');
  });

  it('should resolve nested file to correct layer', () => {
    const layer = resolveFileToLayer('src/services/auth/login.ts', layers);
    expect(layer?.name).toBe('services');
  });

  it('should return undefined for file not in any layer', () => {
    const layer = resolveFileToLayer('src/utils/helpers.ts', layers);
    expect(layer).toBeUndefined();
  });
});
