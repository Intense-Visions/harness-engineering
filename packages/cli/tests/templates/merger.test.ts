import { describe, it, expect } from 'vitest';
import { deepMergeJson, mergePackageJson } from '../../src/templates/merger';

describe('deepMergeJson', () => {
  it('merges flat objects with overlay precedence', () => {
    const base = { a: 1, b: 2 };
    const overlay = { b: 3, c: 4 };
    expect(deepMergeJson(base, overlay)).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('deep merges nested objects', () => {
    const base = { nested: { a: 1, b: 2 } };
    const overlay = { nested: { b: 3, c: 4 } };
    expect(deepMergeJson(base, overlay)).toEqual({ nested: { a: 1, b: 3, c: 4 } });
  });

  it('overlay replaces arrays by default', () => {
    const base = { items: [1, 2] };
    const overlay = { items: [3, 4] };
    expect(deepMergeJson(base, overlay)).toEqual({ items: [3, 4] });
  });
});

describe('mergePackageJson', () => {
  it('concatenates dependencies', () => {
    const base = { dependencies: { lodash: '^4.0.0' } };
    const overlay = { dependencies: { zod: '^3.22.0' } };
    expect(mergePackageJson(base, overlay)).toEqual({
      dependencies: { lodash: '^4.0.0', zod: '^3.22.0' },
    });
  });

  it('concatenates devDependencies', () => {
    const base = { devDependencies: { vitest: '^2.0.0' } };
    const overlay = { devDependencies: { typescript: '^5.0.0' } };
    expect(mergePackageJson(base, overlay)).toEqual({
      devDependencies: { vitest: '^2.0.0', typescript: '^5.0.0' },
    });
  });

  it('overlay version of same dependency wins', () => {
    const base = { dependencies: { zod: '^3.20.0' } };
    const overlay = { dependencies: { zod: '^3.22.0' } };
    expect(mergePackageJson(base, overlay)).toEqual({
      dependencies: { zod: '^3.22.0' },
    });
  });

  it('replaces scripts with overlay', () => {
    const base = { scripts: { build: 'tsc' } };
    const overlay = { scripts: { build: 'next build', dev: 'next dev' } };
    expect(mergePackageJson(base, overlay).scripts).toEqual({
      build: 'next build',
      dev: 'next dev',
    });
  });
});
