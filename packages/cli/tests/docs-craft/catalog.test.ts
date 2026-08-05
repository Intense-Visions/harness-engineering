import { describe, it, expect } from 'vitest';
import { SEED_RUBRICS, rubricsForKind } from '../../src/docs-craft/catalog/rubrics';
import { SEED_EXEMPLARS } from '../../src/docs-craft/catalog/exemplars';

describe('docs-craft rubric catalog', () => {
  it('ships 7 seed rubrics with unique DOCS-R ids', () => {
    expect(SEED_RUBRICS).toHaveLength(7);
    const ids = SEED_RUBRICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(7);
    for (const id of ids) expect(id).toMatch(/^DOCS-R\d{3}$/);
  });

  it('every rubric carries a grounded external source and contribution metadata', () => {
    for (const r of SEED_RUBRICS) {
      expect(r.source.length).toBeGreaterThan(0);
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
      expect(r.contribution.addedBy).toBe('seed');
      expect(r.version).toBe(1);
    }
  });

  it('rubricsForKind gates the reference-only rubric (DOCS-R005)', () => {
    expect(rubricsForKind('reference').map((r) => r.id)).toContain('DOCS-R005');
    expect(rubricsForKind('prose').map((r) => r.id)).not.toContain('DOCS-R005');
    expect(rubricsForKind('guide').map((r) => r.id)).not.toContain('DOCS-R005');
  });

  it('rubricsForKind gates the example rubric (DOCS-R003) away from plain prose', () => {
    expect(rubricsForKind('readme').map((r) => r.id)).toContain('DOCS-R003');
    expect(rubricsForKind('prose').map((r) => r.id)).not.toContain('DOCS-R003');
  });

  it('the 5 wildcard rubrics apply to every kind', () => {
    const wildcard = SEED_RUBRICS.filter((r) => r.appliesTo[0] === '*').map((r) => r.id);
    expect(wildcard).toHaveLength(5);
    for (const kind of ['reference', 'guide', 'readme', 'prose'] as const) {
      const applied = rubricsForKind(kind).map((r) => r.id);
      for (const id of wildcard) expect(applied).toContain(id);
    }
  });
});

describe('docs-craft exemplar catalog', () => {
  it('ships 5 curated reference-point exemplars (Stripe / Vercel / MDN / Linear / Tailwind)', () => {
    expect(SEED_EXEMPLARS).toHaveLength(5);
    const names = SEED_EXEMPLARS.map((e) => e.name);
    expect(names).toEqual([
      'Stripe Docs',
      'Vercel Docs',
      'MDN Web Docs',
      'Linear Docs',
      'Tailwind CSS Docs',
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
