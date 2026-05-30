import { describe, expect, it } from 'vitest';

import { InstallError } from '../../src/installer/errors.js';
import { nullInstallAdapter } from '../../src/installer/interface.js';

describe('nullInstallAdapter', () => {
  it('rejects every mutating method with installer_unavailable', async () => {
    const adapter = nullInstallAdapter();
    for (const method of ['install', 'evict', 'inspect'] as const) {
      const err = await adapter[method]({ name: 'qwen3:32b' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InstallError);
      expect((err as InstallError).code).toBe('installer_unavailable');
      expect((err as InstallError).target).toBe('qwen3:32b');
    }
  });

  it('rejects list with installer_unavailable and no target', async () => {
    const adapter = nullInstallAdapter();
    const err = await adapter.list().catch((e: unknown) => e);
    expect((err as InstallError).code).toBe('installer_unavailable');
    expect((err as InstallError).target).toBeUndefined();
  });
});
