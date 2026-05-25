import { describe, it, expect } from 'vitest';
import { RoutingConfigSchema } from '../../src/workflow/schema';

describe('RoutingConfigSchema — Spec B Phase 2 isolation widening (closes Phase 0 I2)', () => {
  it('accepts scalar value for routing.isolation.none', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      isolation: { none: 'claude-opus' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts chain value for routing.isolation.container', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      isolation: { container: ['local-fast', 'claude-opus'] },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts chain value for routing.isolation.remote-sandbox', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      isolation: { 'remote-sandbox': ['claude-opus', 'claude-sonnet'] },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a mix of scalar + chain across isolation tiers', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      isolation: {
        none: 'claude-opus',
        container: ['local-fast', 'claude-opus'],
        'remote-sandbox': 'claude-opus',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty chain on isolation.container', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      isolation: { container: [] },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown isolation tier (strict mode)', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      isolation: { 'super-isolated': 'claude-opus' } as unknown as { none?: string },
    });
    expect(parsed.success).toBe(false);
  });
});
