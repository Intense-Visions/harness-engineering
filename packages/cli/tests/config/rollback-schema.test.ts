// packages/cli/tests/config/rollback-schema.test.ts
import { describe, it, expect } from 'vitest';
import { RollbackConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('RollbackConfigSchema', () => {
  it('accepts a fully populated rollback config', () => {
    const result = RollbackConfigSchema.safeParse({
      signals: { errorRate: { threshold: 0.05, direction: 'above', window: '24h' } },
      evalTrigger: { enabled: true },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all fields defaulted)', () => {
    const parsed = RollbackConfigSchema.parse({});
    expect(parsed.signals).toEqual({});
    expect(parsed.evalTrigger).toEqual({ enabled: false });
  });

  it('defaults evalTrigger.enabled to false', () => {
    const parsed = RollbackConfigSchema.parse({ signals: {} });
    expect(parsed.evalTrigger.enabled).toBe(false);
  });

  it('rejects an invalid signal direction', () => {
    const result = RollbackConfigSchema.safeParse({
      signals: { x: { threshold: 1, direction: 'sideways', window: '1d' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-numeric threshold', () => {
    const result = RollbackConfigSchema.safeParse({
      signals: { x: { threshold: 'high', direction: 'above', window: '1d' } },
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with rollback block', () => {
  const baseConfig = { version: 1 as const, name: 'test-project' };

  it('accepts config with populated rollback block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      rollback: {
        signals: { errorRate: { threshold: 0.05, direction: 'above', window: '24h' } },
        evalTrigger: { enabled: false },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without rollback block (back-compat)', () => {
    const result = HarnessConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('applies defaults when rollback block is empty object', () => {
    const parsed = HarnessConfigSchema.parse({ ...baseConfig, rollback: {} });
    expect(parsed.rollback).toEqual({ signals: {}, evalTrigger: { enabled: false } });
  });
});
