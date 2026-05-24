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

  // --- I3 (Phase 0 review) — coverage gaps -----------------------------------
  // The original suite covered the headline cases (scalar + array on a few
  // representative fields). The cases below pin behavior for shapes that
  // the typecheck fixture already covers but that the Zod schema did not.

  it('accepts a single-element chain on routing.default (parity with scalar form)', () => {
    const parsed = RoutingConfigSchema.safeParse({
      default: ['claude-opus'],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a duplicate-entry chain (pins current behavior — no diagnostic)', () => {
    // I3: duplicates within a chain may be intentional (operator hedging) or
    // accidental. Phase 0 accepts both — this test pins the behavior so a
    // future tightening (e.g., warn-on-duplicate) is an explicit change.
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      skills: {
        foo: ['claude-opus', 'claude-opus'],
      },
    });
    expect(parsed.success).toBe(true);
  });

  // I3: parametric coverage of array form across the remaining widened
  // scalar fields. `default`, `quick-fix`, `intelligence.sel`, `skills.*`,
  // and `modes.*` are exercised by earlier tests; the four below close
  // the gap. (`isolation.*` is intentionally skipped — not in the Zod
  // schema yet per `schema.ts:105-106` TODO; Phase 2 follow-up.)
  it.each([
    ['guided-change', { 'guided-change': ['claude-opus', 'claude-sonnet'] }],
    ['full-exploration', { 'full-exploration': ['claude-opus', 'claude-sonnet'] }],
    ['diagnostic', { diagnostic: ['claude-opus', 'claude-sonnet'] }],
    ['intelligence.pesl', { intelligence: { pesl: ['claude-opus', 'claude-sonnet'] } }],
  ])('accepts array form for routing.%s', (_label, extraFields) => {
    const parsed = RoutingConfigSchema.safeParse({
      default: 'claude-opus',
      ...extraFields,
    });
    expect(parsed.success).toBe(true);
  });
});
