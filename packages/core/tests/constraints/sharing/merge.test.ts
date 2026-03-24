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
});
