import { describe, it, expect } from 'vitest';
import {
  CORE_TOOL_NAMES,
  STANDARD_TOOL_NAMES,
  DEFAULT_BUDGETS,
  DEFAULT_CHARS_PER_TOKEN,
  estimateBaselineTokens,
  selectTier,
} from '../../src/mcp/tool-tiers';
import type { ToolDefinition } from '../../src/mcp/server';

function def(name: string, descLen = 40, schemaDepth = 1): ToolDefinition {
  return {
    name,
    description: 'd'.repeat(descLen),
    inputSchema: schemaDepth > 0 ? { type: 'object', properties: {} } : {},
  };
}

describe('CORE_TOOL_NAMES', () => {
  it('is non-empty', () => {
    expect(CORE_TOOL_NAMES.length).toBeGreaterThan(0);
  });
  it('is a strict subset of STANDARD_TOOL_NAMES', () => {
    const std = new Set(STANDARD_TOOL_NAMES);
    for (const name of CORE_TOOL_NAMES) expect(std.has(name)).toBe(true);
    expect(STANDARD_TOOL_NAMES.length).toBeGreaterThan(CORE_TOOL_NAMES.length);
  });
});

describe('estimateBaselineTokens()', () => {
  it('returns 0 for empty input', () => {
    expect(estimateBaselineTokens([])).toBe(0);
  });

  it('sums name + description + schema JSON length / CHARS_PER_TOKEN', () => {
    const defs = [def('a', 40), def('b', 40)];
    // name(1) + desc(40) + schema('{"type":"object","properties":{}}' = 33) = 74 per def
    // total = 148 / 4 = 37
    expect(estimateBaselineTokens(defs, DEFAULT_CHARS_PER_TOKEN)).toBe(37);
  });

  it('respects custom charsPerToken override', () => {
    const defs = [def('a', 40)];
    const base = estimateBaselineTokens(defs, 1);
    const halved = estimateBaselineTokens(defs, 2);
    expect(halved).toBe(Math.ceil(base / 2));
  });

  it('rejects zero or negative charsPerToken', () => {
    expect(() => estimateBaselineTokens([], 0)).toThrow();
    expect(() => estimateBaselineTokens([], -1)).toThrow();
  });
});

describe('selectTier()', () => {
  const allDefs: ToolDefinition[] = [
    // known core tools
    def('validate_project'),
    def('check_dependencies'),
    def('check_docs'),
    def('query_graph'),
    def('get_impact'),
    def('list_gateway_tokens'),
    def('manage_state'),
    def('run_skill'),
    def('code_search'),
    def('code_outline'),
    def('compact'),
    // Hermes Phase 1 — core tier
    def('search_sessions'),
    def('insights_summary'),
    // additional standard tools
    def('run_code_review'),
    def('run_security_scan'),
    def('trigger_maintenance_job'),
    def('summarize_session'),
    // extras not in any tier
    def('fancy_new_tool'),
    def('yet_another_tool'),
  ];

  it('returns full when no budget specified', () => {
    const result = selectTier(allDefs);
    expect(result.tier).toBe('full');
    expect(result.filter).toBeUndefined();
  });

  it('returns core when budget is tight', () => {
    const result = selectTier(allDefs, { tokenBudget: 2_000 });
    expect(result.tier).toBe('core');
    expect(new Set(result.filter)).toEqual(new Set(CORE_TOOL_NAMES));
  });

  it('returns standard when budget is between core and full thresholds', () => {
    const result = selectTier(allDefs, { tokenBudget: 8_000 });
    expect(result.tier).toBe('standard');
    // Must include every core tool
    for (const name of CORE_TOOL_NAMES) {
      expect(result.filter).toContain(name);
    }
    // Must NOT include tools that aren't in standard
    expect(result.filter).not.toContain('fancy_new_tool');
  });

  it('returns full when budget exceeds standard threshold', () => {
    const result = selectTier(allDefs, { tokenBudget: 20_000 });
    expect(result.tier).toBe('full');
    expect(result.filter).toBeUndefined();
  });

  it('honors overrideTier regardless of budget', () => {
    const result = selectTier(allDefs, { tokenBudget: 100_000, overrideTier: 'core' });
    expect(result.tier).toBe('core');
  });

  it('respects custom budgets', () => {
    const result = selectTier(allDefs, {
      tokenBudget: 500,
      budgets: { coreMax: 100, standardMax: 1_000 },
    });
    expect(result.tier).toBe('standard');
  });

  it('filters out tier names that are not actually registered', () => {
    const limitedDefs = [def('validate_project'), def('check_docs')];
    const result = selectTier(limitedDefs, { overrideTier: 'core' });
    expect(result.filter).toEqual(['validate_project', 'check_docs']);
  });

  it('provides a human-readable reason for the decision', () => {
    const override = selectTier(allDefs, { overrideTier: 'standard' });
    expect(override.reason).toContain('override');
    const budgeted = selectTier(allDefs, { tokenBudget: 1_000 });
    expect(budgeted.reason).toContain('tokenBudget');
    const none = selectTier(allDefs);
    expect(none.reason).toContain('no budget');
  });

  it('DEFAULT_BUDGETS has core < standard', () => {
    expect(DEFAULT_BUDGETS.coreMax).toBeLessThan(DEFAULT_BUDGETS.standardMax);
  });

  it('estimatedTokens reflects the filter size', () => {
    const core = selectTier(allDefs, { tokenBudget: 2_000 });
    const full = selectTier(allDefs, { tokenBudget: 20_000 });
    expect(core.estimatedTokens).toBeLessThan(full.estimatedTokens);
  });
});
