import { Command } from 'commander';
import type { McpToolTier } from '../mcp/tool-tiers.js';

const VALID_TIERS: ReadonlySet<string> = new Set(['core', 'standard', 'full']);

function parseTier(value: string): McpToolTier {
  const lower = value.toLowerCase();
  if (!VALID_TIERS.has(lower)) {
    throw new Error(`Invalid tier "${value}". Expected one of: core, standard, full.`);
  }
  return lower as McpToolTier;
}

function parseBudget(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid --budget-tokens "${value}". Expected a non-negative integer.`);
  }
  return n;
}

export function createMcpCommand(): Command {
  return new Command('mcp')
    .description('Start the MCP (Model Context Protocol) server on stdio')
    .option('--tools <tools...>', 'Only register the specified tools (used by Cursor integration)')
    .option(
      '--tier <core|standard|full>',
      'Load a preset tool tier instead of all tools',
      parseTier
    )
    .option(
      '--budget-tokens <n>',
      'Auto-select tier to fit this baseline token budget',
      parseBudget
    )
    .action(async (opts: { tools?: string[]; tier?: McpToolTier; budgetTokens?: number }) => {
      const [{ startServer, getToolDefinitions }, { selectTier }] = await Promise.all([
        import('../mcp/index.js'),
        import('../mcp/tool-tiers.js'),
      ]);

      // Explicit --tools list wins over tier/budget selection.
      if (opts.tools && opts.tools.length > 0) {
        await startServer(opts.tools);
        return;
      }

      if (opts.tier || opts.budgetTokens !== undefined) {
        const definitions = getToolDefinitions();
        const selection = selectTier(definitions, {
          ...(opts.tier ? { overrideTier: opts.tier } : {}),
          ...(opts.budgetTokens !== undefined ? { tokenBudget: opts.budgetTokens } : {}),
        });
        await startServer(selection.filter);
        return;
      }

      await startServer();
    });
}
