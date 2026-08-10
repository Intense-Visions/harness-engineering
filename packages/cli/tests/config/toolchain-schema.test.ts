import { describe, it, expect } from 'vitest';
import { HarnessConfigSchema } from '../../src/config/schema';

/**
 * `HarnessConfigSchema` is a closed `z.object` that strips unknown keys, and
 * `warnStrippedKeys` in config/loader.ts writes a stderr warning for each one.
 *
 * So this schema entry is not cosmetic: without it, a workspace declaring the
 * pin would have it silently discarded AND would emit a spurious warning on
 * every config-loading command. That is the regression this file guards.
 */
describe('HarnessConfigSchema — toolchain', () => {
  it('retains toolchain.cliVersion instead of stripping it', () => {
    const parsed = HarnessConfigSchema.parse({
      version: 1,
      toolchain: { cliVersion: '>=11' },
    });
    expect(parsed.toolchain?.cliVersion).toBe('>=11');
  });

  it('accepts a config with no toolchain block', () => {
    const parsed = HarnessConfigSchema.parse({ version: 1 });
    expect(parsed.toolchain).toBeUndefined();
  });

  it('accepts an empty toolchain block', () => {
    const parsed = HarnessConfigSchema.parse({ version: 1, toolchain: {} });
    expect(parsed.toolchain?.cliVersion).toBeUndefined();
  });

  it('rejects a non-string cliVersion', () => {
    expect(() =>
      HarnessConfigSchema.parse({ version: 1, toolchain: { cliVersion: 11 } })
    ).toThrow();
  });

  it('keeps this repo own pin parseable', () => {
    // Guards against the dogfood pin drifting out of schema.
    const parsed = HarnessConfigSchema.parse({
      version: 1,
      name: 'harness-engineering',
      toolchain: { cliVersion: '>=11' },
    });
    expect(parsed.toolchain?.cliVersion).toBe('>=11');
  });
});
