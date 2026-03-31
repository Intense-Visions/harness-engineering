import { describe, it, expect } from 'vitest';
import { INTEGRATION_REGISTRY } from '../../src/integrations/registry';
import type { IntegrationDef } from '../../src/integrations/types';

describe('INTEGRATION_REGISTRY', () => {
  it('contains exactly 5 entries', () => {
    expect(INTEGRATION_REGISTRY).toHaveLength(5);
  });

  it('has unique names', () => {
    const names = INTEGRATION_REGISTRY.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('contains all expected integrations', () => {
    const names = INTEGRATION_REGISTRY.map((d) => d.name);
    expect(names).toContain('context7');
    expect(names).toContain('sequential-thinking');
    expect(names).toContain('playwright');
    expect(names).toContain('perplexity');
    expect(names).toContain('augment-code');
  });

  it('has exactly 3 Tier 0 entries', () => {
    const tier0 = INTEGRATION_REGISTRY.filter((d) => d.tier === 0);
    expect(tier0).toHaveLength(3);
    const names = tier0.map((d) => d.name);
    expect(names).toContain('context7');
    expect(names).toContain('sequential-thinking');
    expect(names).toContain('playwright');
  });

  it('has exactly 2 Tier 1 entries', () => {
    const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
    expect(tier1).toHaveLength(2);
    const names = tier1.map((d) => d.name);
    expect(names).toContain('perplexity');
    expect(names).toContain('augment-code');
  });

  it('every Tier 1 entry has an envVar', () => {
    const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
    for (const def of tier1) {
      expect(def.envVar).toBeTruthy();
    }
  });

  it('no Tier 0 entry has an envVar', () => {
    const tier0 = INTEGRATION_REGISTRY.filter((d) => d.tier === 0);
    for (const def of tier0) {
      expect(def.envVar).toBeUndefined();
    }
  });

  it('every entry has a non-empty mcpConfig.command', () => {
    for (const def of INTEGRATION_REGISTRY) {
      expect(def.mcpConfig.command).toBeTruthy();
    }
  });

  it('every entry has at least one platform', () => {
    for (const def of INTEGRATION_REGISTRY) {
      expect(def.platforms.length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty description', () => {
    for (const def of INTEGRATION_REGISTRY) {
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  it('Tier 1 entries have mcpConfig.env referencing their envVar', () => {
    const tier1 = INTEGRATION_REGISTRY.filter((d) => d.tier === 1);
    for (const def of tier1) {
      expect(def.mcpConfig.env).toBeDefined();
      expect(Object.keys(def.mcpConfig.env!)).toContain(def.envVar);
    }
  });
});
