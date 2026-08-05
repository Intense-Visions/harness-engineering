import { describe, it, expect } from 'vitest';
import { SEED_RUBRICS, rubricsForKind } from '../../src/cli-ergonomics-craft/catalog/rubrics';
import { SEED_EXEMPLARS } from '../../src/cli-ergonomics-craft/catalog/exemplars';

describe('cli-ergonomics-craft rubric catalog', () => {
  it('ships 7 seed rubrics with unique CLI-R ids', () => {
    expect(SEED_RUBRICS).toHaveLength(7);
    const ids = SEED_RUBRICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(7);
    for (const id of ids) expect(id).toMatch(/^CLI-R\d{3}$/);
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

  it('the 2 wildcard rubrics (naming + help) apply to every kind', () => {
    const wildcard = SEED_RUBRICS.filter((r) => r.appliesTo[0] === '*').map((r) => r.id);
    expect(wildcard).toEqual(['CLI-R001', 'CLI-R002']);
    for (const kind of ['leaf', 'group'] as const) {
      const applied = rubricsForKind(kind).map((r) => r.id);
      for (const id of wildcard) expect(applied).toContain(id);
    }
  });

  it('leaf commands get all 7 rubrics; group commands get only naming + help', () => {
    expect(rubricsForKind('leaf')).toHaveLength(7);
    expect(rubricsForKind('group').map((r) => r.id)).toEqual(['CLI-R001', 'CLI-R002']);
  });

  it('the leaf-only rubrics (errors/defaults/output/compose/destructive) never fire on a group', () => {
    const groupIds = rubricsForKind('group').map((r) => r.id);
    for (const id of ['CLI-R003', 'CLI-R004', 'CLI-R005', 'CLI-R006', 'CLI-R007']) {
      expect(groupIds).not.toContain(id);
    }
  });
});

describe('cli-ergonomics-craft exemplar catalog', () => {
  it('ships 5 curated reference-point exemplars (gh / cargo / ripgrep / docker / Stripe CLI)', () => {
    expect(SEED_EXEMPLARS).toHaveLength(5);
    const names = SEED_EXEMPLARS.map((e) => e.name);
    expect(names).toEqual([
      'GitHub CLI (gh)',
      'Cargo (Rust)',
      'ripgrep (rg)',
      'Docker CLI',
      'Stripe CLI',
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

  it('every seed rubric is anchored by at least one exemplar', () => {
    const anchored = new Set(SEED_EXEMPLARS.flatMap((e) => e.anchors));
    for (const r of SEED_RUBRICS) expect(anchored.has(r.id)).toBe(true);
  });
});
