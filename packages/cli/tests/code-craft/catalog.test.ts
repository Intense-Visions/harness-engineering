import { describe, it, expect } from 'vitest';
import { SEED_RUBRICS, rubricApplies } from '../../src/code-craft/catalog/rubrics';
import { SEED_EXEMPLARS } from '../../src/code-craft/catalog/exemplars';
import type { UnitKind } from '../../src/code-craft/findings/schema';

const ALL_KINDS: ReadonlyArray<UnitKind> = ['function', 'method', 'class'];

describe('code-craft rubric catalog', () => {
  it('ships 7 seed rubrics with unique CODE-R ids', () => {
    expect(SEED_RUBRICS).toHaveLength(7);
    const ids = SEED_RUBRICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(SEED_RUBRICS.length);
    for (const id of ids) expect(id).toMatch(/^CODE-R\d{3}$/);
  });

  it('every rubric carries a grounded external source and contribution metadata', () => {
    for (const r of SEED_RUBRICS) {
      expect(r.source.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
      expect(r.appliesToKinds.length).toBeGreaterThan(0);
      expect(r.contribution.addedBy).toBe('seed');
      expect(r.version).toBe(1);
    }
  });

  it('rubricApplies gates function-only rubrics away from classes', () => {
    // Control-flow / altitude / signature rubrics apply to callable units only.
    const functionOnly = SEED_RUBRICS.filter((r) => !r.appliesToKinds.includes('class'));
    expect(functionOnly.length).toBeGreaterThan(0);
    for (const r of functionOnly) {
      expect(rubricApplies(r, 'class')).toBe(false);
      expect(rubricApplies(r, 'function') || rubricApplies(r, 'method')).toBe(true);
    }
  });

  it('every rubric applies to at least one real unit kind', () => {
    for (const r of SEED_RUBRICS) {
      expect(ALL_KINDS.some((k) => rubricApplies(r, k))).toBe(true);
    }
  });
});

describe('code-craft exemplar catalog', () => {
  it('ships 5 curated reference-point exemplars', () => {
    expect(SEED_EXEMPLARS).toHaveLength(5);
    const names = SEED_EXEMPLARS.map((e) => e.name);
    expect(names).toEqual([
      'Anthropic SDK (TypeScript)',
      'TanStack Query',
      'ky (Sindre Sorhus)',
      'SWR (Vercel)',
      'date-fns',
    ]);
  });

  it('every exemplar names a real URL and anchors at least one seed rubric', () => {
    const rubricIds = new Set(SEED_RUBRICS.map((r) => r.id));
    for (const e of SEED_EXEMPLARS) {
      expect(e.url).toMatch(/^https:\/\//);
      expect(e.exemplifies.length).toBeGreaterThan(0);
      expect(e.anchors.length).toBeGreaterThan(0);
      for (const a of e.anchors) expect(rubricIds.has(a)).toBe(true);
    }
  });
});
