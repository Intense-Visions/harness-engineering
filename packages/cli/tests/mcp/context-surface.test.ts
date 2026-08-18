import { describe, it, expect } from 'vitest';
import { buildAttributionReport, heuristicTokenCounter } from '@harness-engineering/core';
import {
  mcpToolEntries,
  toolDefinitionText,
  gatherContextSurface,
} from '../../src/mcp/context-surface';
import type { ToolDefinition } from '../../src/mcp/tool-types';
import { getToolDefinitions } from '../../src/mcp/index';
import { CORE_TOOL_NAMES } from '../../src/mcp/tool-tiers';

const fakeDefs: ToolDefinition[] = [
  { name: 'validate_project', description: 'validate', inputSchema: { type: 'object' } },
  { name: 'run_code_review', description: 'review', inputSchema: { type: 'object' } },
  { name: 'design_craft', description: 'craft', inputSchema: { type: 'object' } },
];

describe('mcpToolEntries', () => {
  it('classifies every MCP tool schema as always-loaded', () => {
    const entries = mcpToolEntries('full', fakeDefs);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.contextClass === 'always-loaded')).toBe(true);
    expect(entries[0].id).toBe('mcp:validate_project');
  });

  it('restricts to the core allow-list at the core tier', () => {
    const entries = mcpToolEntries('core', fakeDefs);
    const names = entries.map((e) => e.id.replace('mcp:', ''));
    // Only validate_project is in CORE_TOOL_NAMES among the fakes.
    expect(names).toEqual(['validate_project']);
    expect(CORE_TOOL_NAMES).toContain('validate_project');
  });

  it('the full tier exposes at least as many tools as the core tier', () => {
    const full = mcpToolEntries('full', fakeDefs);
    const core = mcpToolEntries('core', fakeDefs);
    expect(full.length).toBeGreaterThanOrEqual(core.length);
  });
});

describe('toolDefinitionText', () => {
  it('includes name, description, and serialized schema', () => {
    const text = toolDefinitionText(fakeDefs[0]);
    expect(text).toContain('validate_project');
    expect(text).toContain('validate');
    expect(text).toContain('"type":"object"');
  });
});

describe('gatherContextSurface + buildAttributionReport (real registry)', () => {
  it('produces a per-tier report over the live MCP tool schemas', async () => {
    const liveDefs = getToolDefinitions();
    expect(liveDefs.length).toBeGreaterThan(50); // ~88 tool modules

    const entries = gatherContextSurface(process.cwd(), {
      definitions: liveDefs,
      includeSkills: false,
    });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.id.startsWith('mcp:'))).toBe(true);

    const report = await buildAttributionReport(entries, {
      windowTokens: 200_000,
      counter: heuristicTokenCounter,
    });

    const always = report.byClass.find((c) => c.contextClass === 'always-loaded')!;
    expect(always.tokens).toBeGreaterThan(0);
    expect(report.topContributors.length).toBeGreaterThan(0);
    expect(report.counterMode).toBe('heuristic');
  });

  it('the core tier measures fewer tool tokens than the full tier', async () => {
    const liveDefs = getToolDefinitions();
    const coreEntries = gatherContextSurface(process.cwd(), {
      definitions: liveDefs,
      tier: 'core',
      includeSkills: false,
    });
    const fullEntries = gatherContextSurface(process.cwd(), {
      definitions: liveDefs,
      tier: 'full',
      includeSkills: false,
    });
    const coreMcp = coreEntries.filter((e) => e.id.startsWith('mcp:')).length;
    const fullMcp = fullEntries.filter((e) => e.id.startsWith('mcp:')).length;
    expect(coreMcp).toBeLessThan(fullMcp);
  });
});
