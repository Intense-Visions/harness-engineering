// packages/cli/tests/config/constraint-packs-schema.test.ts
import { describe, it, expect } from 'vitest';
import { HarnessConfigSchema } from '../../src/config/schema';

const base = { version: 1 as const };

describe('HarnessConfigSchema — constraintPacks', () => {
  it('accepts an array of pack names', () => {
    const result = HarnessConfigSchema.safeParse({
      ...base,
      constraintPacks: ['secrets-and-injection', 'web-hardening'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraintPacks).toEqual(['secrets-and-injection', 'web-hardening']);
    }
  });

  it('is optional — absent means no packs (default behavior unchanged)', () => {
    const result = HarnessConfigSchema.safeParse({ ...base });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraintPacks).toBeUndefined();
    }
  });

  it('accepts an empty array', () => {
    const result = HarnessConfigSchema.safeParse({ ...base, constraintPacks: [] });
    expect(result.success).toBe(true);
  });

  it('rejects a non-array value', () => {
    const result = HarnessConfigSchema.safeParse({
      ...base,
      constraintPacks: 'secrets-and-injection',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string entries', () => {
    const result = HarnessConfigSchema.safeParse({ ...base, constraintPacks: [123] });
    expect(result.success).toBe(false);
  });
});
