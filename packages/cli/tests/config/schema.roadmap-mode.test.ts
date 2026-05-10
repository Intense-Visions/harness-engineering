import { describe, it, expect } from 'vitest';
import { HarnessConfigSchema } from '../../src/config/schema';

describe('HarnessConfigSchema — roadmap.mode', () => {
  const base = { version: 1 as const };
  it('accepts no roadmap field (default file-backed)', () => {
    expect(HarnessConfigSchema.safeParse(base).success).toBe(true);
  });
  it('accepts roadmap with no mode', () => {
    expect(HarnessConfigSchema.safeParse({ ...base, roadmap: {} }).success).toBe(true);
  });
  it('accepts mode: "file-backed"', () => {
    expect(
      HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'file-backed' } }).success
    ).toBe(true);
  });
  it('accepts mode: "file-less"', () => {
    expect(HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'file-less' } }).success).toBe(
      true
    );
  });
  it('rejects mode: "weird"', () => {
    expect(HarnessConfigSchema.safeParse({ ...base, roadmap: { mode: 'weird' } }).success).toBe(
      false
    );
  });
});
