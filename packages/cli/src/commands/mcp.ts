import { Command } from 'commander';
import type { McpToolTier } from '../mcp/tool-tiers.js';
import type { ToolCapability, ToolScope } from '../mcp/tool-capabilities.js';

const VALID_TIERS: ReadonlySet<string> = new Set(['core', 'standard', 'full']);

const SCOPE_ORDER: readonly ToolScope[] = ['read', 'write', 'exec'];

/**
 * A one-line legend printed above human-readable output. Scopes are now the
 * DECLARED, evidence-based per-tool capability; the heuristic survives only as
 * a labeled fallback for any not-yet-declared tool (shown in the SOURCE column).
 */
const CAPABILITY_NOTE =
  'scope is DECLARED per-tool from actual behavior (read/write/exec, multiple allowed); ' +
  'network + trust are exact. SOURCE=heuristic means the tool has no declaration yet ' +
  'and its scope is inferred from the name (fallback).';

function padEnd(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/** Join a tool's scopes for single-cell display, e.g. `read+write`. */
function formatScopes(scopes: readonly ToolScope[]): string {
  return scopes.join('+');
}

/**
 * Render the flat capability table (default view). Deterministic: rows arrive
 * pre-sorted by name and column widths are derived from the data.
 */
export function formatCapabilitiesTable(capabilities: readonly ToolCapability[]): string {
  const nameWidth = Math.max(4, ...capabilities.map((c) => c.name.length));
  const scopeWidth = Math.max(6, ...capabilities.map((c) => formatScopes(c.scopes).length));
  const header =
    `${padEnd('TOOL', nameWidth)}  ${padEnd('SCOPES', scopeWidth)}  ` +
    `${padEnd('NETWORK', 7)}  ${padEnd('TRUST', 9)}  SOURCE`;
  const rows = capabilities.map(
    (c) =>
      `${padEnd(c.name, nameWidth)}  ${padEnd(formatScopes(c.scopes), scopeWidth)}  ` +
      `${padEnd(c.network ? 'yes' : 'no', 7)}  ${padEnd(c.trust, 9)}  ${c.source}`
  );
  return [`# ${CAPABILITY_NOTE}`, header, ...rows, '', `${capabilities.length} tools`].join('\n');
}

/**
 * Render capabilities grouped by permission: one section per read/write/exec
 * scope, plus a cross-cutting NETWORK section listing every network-touching
 * tool. A tool with several scopes (e.g. read+write) appears in each of its
 * sections, so per-section counts can sum to more than the tool total.
 */
export function formatCapabilitiesByPermission(capabilities: readonly ToolCapability[]): string {
  const lines: string[] = [`# ${CAPABILITY_NOTE}`, ''];
  for (const scope of SCOPE_ORDER) {
    const inScope = capabilities.filter((c) => c.scopes.includes(scope));
    lines.push(`## ${scope.toUpperCase()} (${inScope.length})`);
    for (const c of inScope) {
      lines.push(`  ${c.name}${c.network ? '  [network]' : ''}  (${c.trust}, ${c.source})`);
    }
    lines.push('');
  }
  const networked = capabilities.filter((c) => c.network);
  lines.push(`## NETWORK (${networked.length})`);
  for (const c of networked) {
    lines.push(`  ${c.name}  (scopes: ${formatScopes(c.scopes)}, ${c.trust})`);
  }
  lines.push('', `${capabilities.length} tools`);
  return lines.join('\n');
}

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

/**
 * `harness mcp list-capabilities [--by-permission] [--json]`
 *
 * Adopter-audit view of what an agent can do through the MCP server. Surfaces,
 * per tool, its DECLARED read/write/exec scopes, network access, and trust tag.
 * Scopes come from each tool's authored capability declaration (see
 * `../mcp/tool-capability-declarations.ts`); a name heuristic is the labeled
 * fallback for any not-yet-declared tool (see `../mcp/tool-capabilities.ts`).
 */
export function createMcpListCapabilitiesCommand(): Command {
  return new Command('list-capabilities')
    .description('Audit each MCP tool: read/write/exec scope, network access, and trust tag')
    .option('--by-permission', 'Group tools by read/write/exec/network scope')
    .option('--json', 'Emit machine-readable JSON')
    .action(async function (this: Command) {
      // `--json` is also a global root option; read via optsWithGlobals so the
      // flag resolves whether it lands on this subcommand or the root program.
      const opts = this.optsWithGlobals() as { byPermission?: boolean; json?: boolean };
      const [{ getToolDefinitions }, { deriveToolCapabilities }] = await Promise.all([
        import('../mcp/index.js'),
        import('../mcp/tool-capabilities.js'),
      ]);
      const capabilities = deriveToolCapabilities(getToolDefinitions());

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              scopeSource: 'declared-with-heuristic-fallback',
              count: capabilities.length,
              declaredCount: capabilities.filter((c) => c.source === 'declared').length,
              heuristicCount: capabilities.filter((c) => c.source === 'heuristic').length,
              capabilities,
            },
            null,
            2
          )
        );
        return;
      }

      console.log(
        opts.byPermission
          ? formatCapabilitiesByPermission(capabilities)
          : formatCapabilitiesTable(capabilities)
      );
    });
}

/** Default context-window size to budget the surface against (Opus/Sonnet 1M). */
const DEFAULT_WINDOW_TOKENS = 200_000;

function parsePositiveInt(flag: string, value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${flag} "${value}". Expected a positive integer.`);
  }
  return n;
}

interface AttributionReportShape {
  windowTokens: number;
  totalTokens: number;
  counterMode: string;
  degraded: boolean;
  byClass: ReadonlyArray<{
    contextClass: string;
    tokens: number;
    count: number;
    budgetTokens: number;
    overBudget: boolean;
  }>;
  topContributors: ReadonlyArray<{
    label: string;
    contextClass: string;
    tokens: number;
    degraded: boolean;
  }>;
}

/** Render the attribution report as scannable, terminal-friendly text. */
export function formatContextReport(report: AttributionReportShape, tier: string): string {
  const lines: string[] = [];
  lines.push(`# Context-surface attribution (tier: ${tier})`);
  lines.push(
    `# window=${report.windowTokens} tokens · counts=${report.counterMode}` +
      (report.degraded ? ' (some entries fell back to the chars/4 heuristic)' : '')
  );
  lines.push('');
  lines.push('## By class (budget from contextBudget())');
  for (const c of report.byClass) {
    const flag = c.overBudget ? '  OVER BUDGET' : '';
    lines.push(
      `  ${padEnd(c.contextClass, 14)}  ${padEnd(String(c.tokens), 8)} tok  ` +
        `budget ${padEnd(String(c.budgetTokens), 8)}  (${c.count} contributors)${flag}`
    );
  }
  lines.push('');
  lines.push('## Top contributors');
  for (const c of report.topContributors) {
    lines.push(
      `  ${padEnd(String(c.tokens), 8)} tok  ${padEnd(c.contextClass, 14)}  ${c.label}` +
        (c.degraded ? '  [heuristic]' : '')
    );
  }
  lines.push('');
  lines.push(`Total: ${report.totalTokens} tokens across the measured surface.`);
  return lines.join('\n');
}

/**
 * `harness mcp context-report [--tier <t>] [--exact] [--window <n>] [--top <n>] [--no-skills] [--json]`
 *
 * Reports what the always-loaded context surface costs per turn — MCP tool
 * schemas (per tier), AGENTS.md, hooks, and the platform skill trees —
 * classified always-loaded / path-scoped / invoked-only, top contributors
 * ranked, and over-budget flags derived from the contextBudget() allocator.
 * Uses exact `/v1/messages/count_tokens` counts with `--exact` (needs
 * ANTHROPIC_API_KEY); otherwise the chars/4 heuristic. Never hard-fails.
 */
export function createMcpContextReportCommand(): Command {
  return new Command('context-report')
    .description('Attribute the always-loaded context surface cost per turn, per tier')
    .option('--tier <core|standard|full>', 'Measure the tool schemas at this tier', parseTier)
    .option('--exact', 'Use exact /v1/messages/count_tokens counts (needs ANTHROPIC_API_KEY)')
    .option(
      '--window <n>',
      'Context-window size to budget against',
      (v) => parsePositiveInt('--window', v),
      DEFAULT_WINDOW_TOKENS
    )
    .option(
      '--top <n>',
      'How many top contributors to show',
      (v) => parsePositiveInt('--top', v),
      10
    )
    .option('--no-skills', 'Skip the platform skill trees')
    .option('--json', 'Emit machine-readable JSON')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as {
        tier?: McpToolTier;
        exact?: boolean;
        window: number;
        top: number;
        skills?: boolean;
        json?: boolean;
      };
      const tier = opts.tier ?? 'full';
      const [{ gatherContextSurface }, core] = await Promise.all([
        import('../mcp/context-surface.js'),
        import('@harness-engineering/core'),
      ]);

      const entries = gatherContextSurface(process.cwd(), {
        tier,
        includeSkills: opts.skills !== false,
      });

      const resolved = opts.exact
        ? core.resolveTokenCounter()
        : { counter: core.heuristicTokenCounter, mode: 'heuristic' as const };

      const report = await core.buildAttributionReport(entries, {
        windowTokens: opts.window,
        counter: resolved.counter,
        exact: resolved.mode === 'exact',
        topN: opts.top,
      });

      if (opts.json) {
        console.log(JSON.stringify({ tier, ...report }, null, 2));
        return;
      }
      console.log(formatContextReport(report, tier));
    });
}

interface RefinementDemandReportShape {
  total: number;
  byClass: ReadonlyArray<{
    contextClass: string;
    count: number;
    frequency: number;
  }>;
}

/**
 * Render the refinement-demand report as a ranked, terminal-friendly table.
 * Classes arrive pre-ranked (count desc, canonical order tiebreak), so a
 * never-read class lands at the bottom with a zero count.
 */
export function formatRefinementDemand(report: RefinementDemandReportShape): string {
  const lines: string[] = [];
  lines.push('# Refinement demand by context class (ranked by count desc)');
  lines.push('# demand signal = refinement frequency per progressive-domain context class');
  lines.push('');
  lines.push(`  ${padEnd('CLASS', 14)}  ${padEnd('COUNT', 6)}  FREQUENCY`);
  for (const c of report.byClass) {
    lines.push(
      `  ${padEnd(c.contextClass, 14)}  ${padEnd(String(c.count), 6)}  ${c.frequency.toFixed(4)}`
    );
  }
  lines.push('');
  lines.push(`Total: ${report.total} refinement requests across the measured surface.`);
  return lines.join('\n');
}

/**
 * `harness mcp refinement-demand [--json]`
 *
 * Reads the progressive-context refinement-demand log
 * (`.harness/metrics/refinement-events.jsonl`) and prints the ranked per-class
 * demand signal — how often each context class was refined. `--json` emits the
 * raw `RefinementDemandReport`. Never hard-fails (a missing log is an all-zero
 * report). Sibling of `context-report`; no new MCP tool.
 */
export function createMcpRefinementDemandCommand(): Command {
  return new Command('refinement-demand')
    .description('Report refinement frequency per progressive-context class (demand signal)')
    .option('--json', 'Emit machine-readable JSON')
    .action(async function (this: Command) {
      const opts = this.optsWithGlobals() as { json?: boolean };
      const { readRefinementDemand } = await import('../mcp/tools/refinement-telemetry.js');
      const report = readRefinementDemand(process.cwd());

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.log(formatRefinementDemand(report));
    });
}

export function createMcpCommand(): Command {
  const command = new Command('mcp')
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

  command.addCommand(createMcpListCapabilitiesCommand());
  command.addCommand(createMcpContextReportCommand());
  command.addCommand(createMcpRefinementDemandCommand());
  return command;
}
