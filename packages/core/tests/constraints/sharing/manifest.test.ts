import { describe, it, expect } from 'vitest';
import { parseManifest } from '../../../src/constraints/sharing/manifest';

describe('parseManifest', () => {
  it('should accept a valid manifest object', () => {
    const input = {
      name: 'strict-api',
      version: '1.0.0',
      description: 'Strict API constraints',
      minHarnessVersion: '1.0.0',
      keywords: ['api', 'strict'],
      include: ['layers', 'forbiddenImports', 'security.rules'],
    };

    const result = parseManifest(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('strict-api');
      expect(result.value.version).toBe('1.0.0');
      expect(result.value.include).toHaveLength(3);
      expect(result.value.keywords).toEqual(['api', 'strict']);
    }
  });

  it('should apply defaults for optional fields', () => {
    const input = {
      name: 'minimal',
      version: '0.1.0',
      include: ['layers'],
    };

    const result = parseManifest(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.keywords).toEqual([]);
      expect(result.value.description).toBeUndefined();
      expect(result.value.minHarnessVersion).toBeUndefined();
    }
  });

  it('should return an error when name is missing', () => {
    const input = {
      version: '1.0.0',
      include: ['layers'],
    };

    const result = parseManifest(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid manifest');
    }
  });

  it('should return an error when version is missing', () => {
    const input = {
      name: 'strict-api',
      include: ['layers'],
    };

    const result = parseManifest(input);

    expect(result.ok).toBe(false);
  });

  it('should return an error when include is empty', () => {
    const input = {
      name: 'strict-api',
      version: '1.0.0',
      include: [],
    };

    const result = parseManifest(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid manifest');
    }
  });

  it('should return an error when include is missing', () => {
    const input = {
      name: 'strict-api',
      version: '1.0.0',
    };

    const result = parseManifest(input);

    expect(result.ok).toBe(false);
  });

  it('should return an error when passed a non-object', () => {
    const result = parseManifest('not-an-object');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid manifest');
    }
  });

  it('should return an error when passed null', () => {
    const result = parseManifest(null);

    expect(result.ok).toBe(false);
  });
});
