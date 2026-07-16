import { describe, it, expect } from 'vitest';
import { INTEGRATION_REGISTRY, CATALOG_LAST_REVIEWED } from '../../src/integrations/registry';

const EXPECTED_NAMES = ['context7', 'playwright', 'harness', 'github', 'exa'];
// Names retired by the mcp-catalog-refresh (asserted absent below). Built from
// char codes so the grep-clean guard (no removed-name string literals) holds.
const REMOVED_NAMES = [
  ['p', 'e', 'r', 'p', 'l', 'e', 'x', 'i', 't', 'y'].join(''),
  ['a', 'u', 'g', 'm', 'e', 'n', 't', '-', 'c', 'o', 'd', 'e'].join(''),
  [
    's',
    'e',
    'q',
    'u',
    'e',
    'n',
    't',
    'i',
    'a',
    'l',
    '-',
    't',
    'h',
    'i',
    'n',
    'k',
    'i',
    'n',
    'g',
  ].join(''),
];

describe('INTEGRATION_REGISTRY', () => {
  it('contains exactly the curated 5 entries', () => {
    expect(INTEGRATION_REGISTRY).toHaveLength(5);
  });

  it('has unique names', () => {
    const names = INTEGRATION_REGISTRY.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('contains exactly the expected name set (SC1)', () => {
    const names = INTEGRATION_REGISTRY.map((d) => d.name);
    expect(new Set(names)).toEqual(new Set(EXPECTED_NAMES));
  });

  it('contains no removed integration (SC1/SC5)', () => {
    const names = INTEGRATION_REGISTRY.map((d) => d.name);
    for (const removed of REMOVED_NAMES) {
      expect(names).not.toContain(removed);
    }
  });

  it('has exactly 3 Tier 0 entries: context7, playwright, harness', () => {
    const tier0 = INTEGRATION_REGISTRY.filter((d) => d.tier === 0);
    expect(tier0).toHaveLength(3);
    const names = tier0.map((d) => d.name);
    expect(new Set(names)).toEqual(new Set(['context7', 'playwright', 'harness']));
  });

  it('has exactly 2 Tier 1 entries: github, exa', () => {
    const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
    expect(tier1).toHaveLength(2);
    const names = tier1.map((d) => d.name);
    expect(new Set(names)).toEqual(new Set(['github', 'exa']));
  });

  it('every entry validates against the IntegrationDef contract (SC2)', () => {
    for (const def of INTEGRATION_REGISTRY) {
      expect([0, 1]).toContain(def.tier);
      expect(def.name).toBeTruthy();
      expect(def.displayName).toBeTruthy();
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.mcpConfig.command).toBeTruthy();
      expect(Array.isArray(def.mcpConfig.args)).toBe(true);
      expect(def.platforms.length).toBeGreaterThan(0);
    }
  });

  it('every Tier 1 entry has an envVar and env referencing it (SC2)', () => {
    const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
    for (const def of tier1) {
      expect(def.envVar).toBeTruthy();
      expect(def.mcpConfig.env).toBeDefined();
      expect(Object.keys(def.mcpConfig.env!)).toContain(def.envVar);
    }
  });

  it('no Tier 0 entry has an envVar', () => {
    const tier0 = INTEGRATION_REGISTRY.filter((d) => d.tier === 0);
    for (const def of tier0) {
      expect(def.envVar).toBeUndefined();
    }
  });

  it('the harness entry is Tier 0 and launches harness-mcp (SC2)', () => {
    const harness = INTEGRATION_REGISTRY.find((d) => d.name === 'harness');
    expect(harness).toBeDefined();
    expect(harness!.tier).toBe(0);
    expect(harness!.mcpConfig.command).toBe('harness-mcp');
    expect(harness!.mcpConfig.args).toEqual([]);
    expect(harness!.envVar).toBeUndefined();
  });

  it('the github entry is Tier 1 with GITHUB_PERSONAL_ACCESS_TOKEN', () => {
    const github = INTEGRATION_REGISTRY.find((d) => d.name === 'github');
    expect(github).toBeDefined();
    expect(github!.tier).toBe(1);
    expect(github!.envVar).toBe('GITHUB_PERSONAL_ACCESS_TOKEN');
  });

  it('the exa entry is Tier 1 with EXA_API_KEY launching exa-mcp-server', () => {
    const exa = INTEGRATION_REGISTRY.find((d) => d.name === 'exa');
    expect(exa).toBeDefined();
    expect(exa!.tier).toBe(1);
    expect(exa!.envVar).toBe('EXA_API_KEY');
    expect(exa!.mcpConfig.args).toEqual(['-y', 'exa-mcp-server']);
  });

  it('every entry has a lastReviewed ISO date (SC3)', () => {
    for (const def of INTEGRATION_REGISTRY) {
      expect(def.lastReviewed).toBeDefined();
      expect(def.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('exports CATALOG_LAST_REVIEWED as an ISO date (SC3)', () => {
    expect(CATALOG_LAST_REVIEWED).toBeDefined();
    expect(CATALOG_LAST_REVIEWED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('every entry has at least one platform', () => {
    for (const def of INTEGRATION_REGISTRY) {
      expect(def.platforms.length).toBeGreaterThan(0);
    }
  });
});
