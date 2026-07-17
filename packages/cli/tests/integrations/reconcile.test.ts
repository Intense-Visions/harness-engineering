import { describe, it, expect } from 'vitest';
import { reconcileIntegrations } from '../../src/integrations/reconcile';
import type { ConfiguredServer } from '../../src/integrations/reconcile';
import type { IntegrationDef } from '../../src/integrations/types';

function def(name: string, tier: 0 | 1 = 0): IntegrationDef {
  return {
    name,
    displayName: name,
    description: `${name} desc`,
    tier,
    mcpConfig: { command: 'npx', args: ['-y', `${name}-mcp`] },
    platforms: ['claude-code'],
  };
}

const registry: IntegrationDef[] = [
  def('context7'),
  def('harness'),
  def('github', 1),
  def('exa', 1),
];

describe('reconcileIntegrations (SC5, pure)', () => {
  it('all-new: nothing configured => every registry entry is toAdd (registry order), no deprecated', () => {
    const plan = reconcileIntegrations([], registry);
    expect(plan.toAdd.map((d) => d.name)).toEqual(['context7', 'harness', 'github', 'exa']);
    expect(plan.deprecated).toEqual([]);
  });

  it('all-old: only deprecated servers configured => all deprecated (configured order), all registry toAdd', () => {
    const configured: ConfiguredServer[] = [
      { name: 'perplexity' },
      { name: 'augment-code' },
      { name: 'sequential-thinking' },
    ];
    const plan = reconcileIntegrations(configured, registry);
    expect(plan.deprecated.map((s) => s.name)).toEqual([
      'perplexity',
      'augment-code',
      'sequential-thinking',
    ]);
    expect(plan.toAdd.map((d) => d.name)).toEqual(['context7', 'harness', 'github', 'exa']);
  });

  it('mixed: some configured overlap the registry, some are deprecated', () => {
    const configured: ConfiguredServer[] = [
      { name: 'context7' }, // in registry -> not toAdd, not deprecated
      { name: 'perplexity' }, // deprecated
      { name: 'github' }, // in registry
      { name: 'augment-code' }, // deprecated
    ];
    const plan = reconcileIntegrations(configured, registry);
    // Registry order preserved, context7 & github already configured
    expect(plan.toAdd.map((d) => d.name)).toEqual(['harness', 'exa']);
    // Configured order preserved for deprecated
    expect(plan.deprecated.map((s) => s.name)).toEqual(['perplexity', 'augment-code']);
  });

  it('empty registry: everything configured is deprecated, nothing to add', () => {
    const configured: ConfiguredServer[] = [{ name: 'context7' }, { name: 'exa' }];
    const plan = reconcileIntegrations(configured, []);
    expect(plan.toAdd).toEqual([]);
    expect(plan.deprecated.map((s) => s.name)).toEqual(['context7', 'exa']);
  });

  it('fully in sync: configured exactly matches registry => empty plan (SC4 idempotency core)', () => {
    const configured: ConfiguredServer[] = registry.map((d) => ({ name: d.name }));
    const plan = reconcileIntegrations(configured, registry);
    expect(plan.toAdd).toEqual([]);
    expect(plan.deprecated).toEqual([]);
  });

  it('is pure: does not mutate its inputs', () => {
    const configured: ConfiguredServer[] = [{ name: 'perplexity' }];
    const reg = [def('context7')];
    const snapConfigured = JSON.stringify(configured);
    const snapReg = JSON.stringify(reg);
    reconcileIntegrations(configured, reg);
    expect(JSON.stringify(configured)).toBe(snapConfigured);
    expect(JSON.stringify(reg)).toBe(snapReg);
  });
});
