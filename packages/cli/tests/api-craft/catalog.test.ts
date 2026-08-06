import { describe, it, expect } from 'vitest';
import { SEED_RUBRICS, rubricsForKind } from '../../src/api-craft/catalog/rubrics';
import { SEED_EXEMPLARS } from '../../src/api-craft/catalog/exemplars';

describe('api-craft rubric catalog', () => {
  it('ships 9 seed rubrics with unique API-R ids', () => {
    expect(SEED_RUBRICS).toHaveLength(9);
    const ids = SEED_RUBRICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(9);
    for (const id of ids) expect(id).toMatch(/^API-R\d{3}$/);
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

  it('the 8 cross-surface rubrics apply to every kind', () => {
    const wildcard = SEED_RUBRICS.filter((r) => r.appliesTo[0] === '*').map((r) => r.id);
    expect(wildcard).toHaveLength(8);
    for (const kind of ['openapi', 'route'] as const) {
      const applied = rubricsForKind(kind).map((r) => r.id);
      for (const id of wildcard) expect(applied).toContain(id);
    }
  });

  it('route surfaces get all 9 rubrics; openapi surfaces get 8 (no idempotency)', () => {
    expect(rubricsForKind('route')).toHaveLength(9);
    const openapiIds = rubricsForKind('openapi').map((r) => r.id);
    expect(openapiIds).toHaveLength(8);
    expect(openapiIds).not.toContain('API-R008');
  });

  it('the idempotency rubric (API-R008) is route-only', () => {
    const r008 = SEED_RUBRICS.find((r) => r.id === 'API-R008');
    expect(r008).toBeDefined();
    expect(r008!.appliesTo).toEqual(['route']);
  });
});

describe('api-craft exemplar catalog', () => {
  it('ships 5 curated reference-point exemplars (Stripe / Linear / GitHub / Resend / Anthropic)', () => {
    expect(SEED_EXEMPLARS).toHaveLength(5);
    const names = SEED_EXEMPLARS.map((e) => e.name);
    expect(names).toEqual([
      'Stripe API',
      'Linear GraphQL API',
      'GitHub REST API',
      'Resend API',
      'Anthropic API',
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
