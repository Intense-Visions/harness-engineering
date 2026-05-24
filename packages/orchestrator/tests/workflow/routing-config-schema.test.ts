import { describe, it, expect } from 'vitest';
import { RoutingConfigSchema } from '../../src/workflow/schema';

describe('RoutingConfigSchema — Spec B Phase 0 widening', () => {
  it('accepts a fully-scalar pre-Spec-B config unchanged', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      'quick-fix': 'local-fast',
      intelligence: { sel: 'local-fast' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts array form for routing.default', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: ['claude-opus', 'claude-sonnet'],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts array form for routing.quick-fix', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      'quick-fix': ['local-fast', 'claude-sonnet'],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts array form for routing.intelligence.sel', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      intelligence: { sel: ['local-fast', 'claude-sonnet'] },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts new routing.skills map with mixed scalar + chain values', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      skills: {
        'harness-debugging': ['local-fast', 'claude-sonnet'],
        'harness-soundness-review': 'claude-opus',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts new routing.modes map with mixed scalar + chain values', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      modes: {
        'adversarial-reviewer': ['local-fast', 'claude-sonnet'],
        'constructive-architect': 'claude-opus',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty fallback chain', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown top-level key (strict mode preserved)', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      bogus: 'value',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty-string entry inside a chain', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: ['claude-opus', ''],
    });
    expect(parsed.success).toBe(false);
  });
});
