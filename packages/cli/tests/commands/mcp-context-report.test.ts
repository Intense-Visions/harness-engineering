/**
 * Covers the `harness mcp` surfaces that the existing mcp tests leave untouched:
 * the `formatContextReport` attribution renderer, the option parsers that guard
 * `--tier` / `--budget-tokens` / `--window` / `--top`, and the
 * `list-capabilities` JSON envelope and formatter selection.
 *
 * The formatter internals of `formatCapabilitiesTable` /
 * `formatCapabilitiesByPermission` are covered by `mcp-list-capabilities.test.ts`
 * and are deliberately not re-asserted here — only which of the two the command
 * chooses.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureConsole, type ConsoleCapture } from './cli-command-harness';

// Only the two entry points the context-report action reaches for are replaced;
// everything else in `@harness-engineering/core` (and the rest of the MCP tree)
// stays real so `list-capabilities` still exercises the production tool list.
const gatherContextSurface = vi.fn(() => [] as unknown[]);
const buildAttributionReport = vi.fn();
const startServer = vi.fn(async () => undefined);
const selectTier = vi.fn();

vi.mock('../../src/mcp/context-surface.js', () => ({ gatherContextSurface }));

vi.mock('@harness-engineering/core', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildAttributionReport,
}));

vi.mock('../../src/mcp/index.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startServer,
}));

vi.mock('../../src/mcp/tool-tiers.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    selectTier: (...args: unknown[]) => {
      selectTier(...args);
      return (actual.selectTier as (...a: unknown[]) => unknown)(...args);
    },
  };
});

import {
  formatContextReport,
  createMcpContextReportCommand,
  createMcpListCapabilitiesCommand,
  createMcpCommand,
} from '../../src/commands/mcp';

/**
 * The options argument a collaborator was invoked with. Fails with a readable
 * message when the command never reached the collaborator.
 */
function optionsPassedTo(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const [firstCall] = mock.mock.calls;
  if (!firstCall) throw new Error('Expected the collaborator to be invoked, but it never was.');
  return firstCall[1] as Record<string, unknown>;
}

type ReportArg = Parameters<typeof formatContextReport>[0];

function report(over: Partial<ReportArg> = {}): ReportArg {
  return {
    windowTokens: 200_000,
    totalTokens: 1_234,
    counterMode: 'heuristic',
    degraded: false,
    byClass: [],
    topContributors: [],
    ...over,
  };
}

let out: ConsoleCapture;

beforeEach(() => {
  vi.clearAllMocks();
  gatherContextSurface.mockReturnValue([]);
  buildAttributionReport.mockResolvedValue(report());
  out = captureConsole();
});

afterEach(() => {
  out.restore();
});

describe('formatContextReport', () => {
  it('names the tier the measurement was taken at in the header', () => {
    expect(formatContextReport(report(), 'core')).toContain(
      '# Context-surface attribution (tier: core)'
    );
  });

  it('reports the budgeting window and the counter mode on the provenance line', () => {
    const text = formatContextReport(
      report({ windowTokens: 50_000, counterMode: 'exact' }),
      'full'
    );

    expect(text).toContain('# window=50000 tokens · counts=exact');
  });

  it('warns that some entries fell back to the heuristic when the report is degraded', () => {
    const text = formatContextReport(report({ degraded: true }), 'full');

    expect(text).toContain('(some entries fell back to the chars/4 heuristic)');
  });

  it('stays silent about the heuristic fallback when nothing was degraded', () => {
    expect(formatContextReport(report({ degraded: false }), 'full')).not.toContain(
      'fell back to the chars/4 heuristic'
    );
  });

  it('flags only the class that exceeded its budget', () => {
    const text = formatContextReport(
      report({
        byClass: [
          {
            contextClass: 'always-loaded',
            tokens: 90_000,
            count: 12,
            budgetTokens: 40_000,
            overBudget: true,
          },
          {
            contextClass: 'invoked-only',
            tokens: 500,
            count: 3,
            budgetTokens: 40_000,
            overBudget: false,
          },
        ],
      }),
      'full'
    );

    const flagged = text.split('\n').filter((l) => l.includes('OVER BUDGET'));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('always-loaded');
  });

  it('shows each class with its token total, budget, and contributor count', () => {
    const text = formatContextReport(
      report({
        byClass: [
          {
            contextClass: 'path-scoped',
            tokens: 1_500,
            count: 7,
            budgetTokens: 20_000,
            overBudget: false,
          },
        ],
      }),
      'full'
    );

    expect(text).toContain('path-scoped');
    expect(text).toMatch(/1500\s+tok\s+budget 20000\s+\(7 contributors\)/);
  });

  it('marks only the estimated contributors as [heuristic]', () => {
    const text = formatContextReport(
      report({
        topContributors: [
          { label: 'AGENTS.md', contextClass: 'always-loaded', tokens: 900, degraded: true },
          { label: 'hooks', contextClass: 'always-loaded', tokens: 300, degraded: false },
        ],
      }),
      'full'
    );

    const marked = text.split('\n').filter((l) => l.includes('[heuristic]'));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain('AGENTS.md');
  });

  it('closes with the measured-surface total', () => {
    expect(formatContextReport(report({ totalTokens: 98_765 }), 'full')).toContain(
      'Total: 98765 tokens across the measured surface.'
    );
  });
});

// The rejection tests below assert the exact message text on purpose: for a CLI
// the message *is* the contract, because it is the only place the user learns
// which values are accepted. A silent or vague rejection is the regression.
describe('context-report option parsing', () => {
  const parse = (...argv: string[]) =>
    createMcpContextReportCommand().parseAsync(argv, { from: 'user' });

  it('rejects an unrecognised tier and names the accepted values', async () => {
    await expect(parse('--tier', 'bogus')).rejects.toThrow(
      'Invalid tier "bogus". Expected one of: core, standard, full.'
    );
  });

  it('accepts a tier in any casing and normalises it to lower case', async () => {
    await parse('--tier', 'CORE');

    expect(optionsPassedTo(gatherContextSurface)).toMatchObject({ tier: 'core' });
  });

  it('defaults to the full tier when --tier is omitted', async () => {
    await parse();

    expect(optionsPassedTo(gatherContextSurface)).toMatchObject({ tier: 'full' });
  });

  it('rejects a zero --window because the budget denominator must be positive', async () => {
    await expect(parse('--window', '0')).rejects.toThrow(
      'Invalid --window "0". Expected a positive integer.'
    );
  });

  it('names the offending flag when --top is not positive', async () => {
    await expect(parse('--top', '-3')).rejects.toThrow(
      'Invalid --top "-3". Expected a positive integer.'
    );
  });

  it('rejects a non-numeric --window', async () => {
    await expect(parse('--window', 'lots')).rejects.toThrow(
      'Invalid --window "lots". Expected a positive integer.'
    );
  });

  it('forwards an accepted --window and --top into the attribution report', async () => {
    await parse('--window', '50000', '--top', '3');

    expect(optionsPassedTo(buildAttributionReport)).toMatchObject({
      windowTokens: 50_000,
      topN: 3,
    });
  });

  it('budgets against a 200k window and 10 contributors by default', async () => {
    await parse();

    expect(optionsPassedTo(buildAttributionReport)).toMatchObject({
      windowTokens: 200_000,
      topN: 10,
    });
  });

  it('includes the platform skill trees by default', async () => {
    await parse();

    expect(optionsPassedTo(gatherContextSurface)).toMatchObject({ includeSkills: true });
  });

  it('excludes the platform skill trees when --no-skills is passed', async () => {
    await parse('--no-skills');

    expect(optionsPassedTo(gatherContextSurface)).toMatchObject({ includeSkills: false });
  });

  it('counts with the heuristic — not exact counts — unless --exact is given', async () => {
    await parse();

    expect(optionsPassedTo(buildAttributionReport)).toMatchObject({ exact: false });
  });

  it('emits the report as JSON tagged with the measured tier when --json is set', async () => {
    buildAttributionReport.mockResolvedValue(report({ totalTokens: 42 }));

    await parse('--tier', 'standard', '--json');

    const parsed = JSON.parse(out.stdout());
    expect(parsed.tier).toBe('standard');
    expect(parsed.totalTokens).toBe(42);
  });

  it('renders the human report instead of JSON by default', async () => {
    buildAttributionReport.mockResolvedValue(report({ totalTokens: 42 }));

    await parse('--tier', 'standard');

    expect(out.stdout()).toContain('# Context-surface attribution (tier: standard)');
  });
});

describe('mcp root option parsing', () => {
  const parse = (...argv: string[]) => createMcpCommand().parseAsync(argv, { from: 'user' });

  it('rejects a non-numeric --budget-tokens', async () => {
    await expect(parse('--budget-tokens', 'plenty')).rejects.toThrow(
      'Invalid --budget-tokens "plenty". Expected a non-negative integer.'
    );
  });

  it('rejects a negative --budget-tokens', async () => {
    await expect(parse('--budget-tokens', '-1')).rejects.toThrow(
      'Invalid --budget-tokens "-1". Expected a non-negative integer.'
    );
  });

  it('accepts a zero --budget-tokens as a real (most restrictive) budget', async () => {
    // Zero is a legitimate budget, not "unset" — it must reach tier selection
    // rather than being rejected alongside the negatives.
    await parse('--budget-tokens', '0');

    expect(selectTier).toHaveBeenCalledWith(expect.anything(), { tokenBudget: 0 });
    expect(startServer).toHaveBeenCalledTimes(1);
  });

  it('lower-cases an explicit --tier before handing it to tier selection', async () => {
    await parse('--tier', 'STANDARD');

    expect(selectTier).toHaveBeenCalledWith(expect.anything(), { overrideTier: 'standard' });
  });

  it('lets an explicit --tools list win over tier selection', async () => {
    await parse('--tools', 'code_search', 'query_graph');

    expect(startServer).toHaveBeenCalledWith(['code_search', 'query_graph']);
    expect(selectTier).not.toHaveBeenCalled();
  });

  it('starts the server with no filter when neither tier nor budget is given', async () => {
    await parse();

    expect(startServer).toHaveBeenCalledWith();
    expect(selectTier).not.toHaveBeenCalled();
  });
});

describe('list-capabilities output selection', () => {
  const parse = (...argv: string[]) =>
    createMcpListCapabilitiesCommand().parseAsync(argv, { from: 'user' });

  it('partitions the tool count into declared and heuristic sources in the JSON envelope', async () => {
    await parse('--json');

    const parsed = JSON.parse(out.stdout());
    expect(parsed.scopeSource).toBe('declared-with-heuristic-fallback');
    expect(parsed.count).toBe(parsed.capabilities.length);
    expect(parsed.declaredCount).toBe(
      parsed.capabilities.filter((c: { source: string }) => c.source === 'declared').length
    );
    expect(parsed.heuristicCount).toBe(
      parsed.capabilities.filter((c: { source: string }) => c.source === 'heuristic').length
    );
    expect(parsed.declaredCount + parsed.heuristicCount).toBe(parsed.count);
  });

  it('reports a non-empty tool surface so the envelope is not vacuously consistent', async () => {
    await parse('--json');

    expect(JSON.parse(out.stdout()).count).toBeGreaterThan(0);
  });

  it('prints the flat table by default', async () => {
    await parse();

    expect(out.stdout()).toMatch(/TOOL\s+SCOPES\s+NETWORK\s+TRUST\s+SOURCE/);
    expect(out.stdout()).not.toContain('## READ (');
  });

  it('prints the permission-grouped view when --by-permission is set', async () => {
    await parse('--by-permission');

    expect(out.stdout()).toContain('## READ (');
    expect(out.stdout()).toContain('## NETWORK (');
    expect(out.stdout()).not.toMatch(/TOOL\s+SCOPES\s+NETWORK\s+TRUST\s+SOURCE/);
  });

  it('lets --json win over --by-permission', async () => {
    await parse('--json', '--by-permission');

    expect(JSON.parse(out.stdout()).scopeSource).toBe('declared-with-heuristic-fallback');
    expect(out.stdout()).not.toContain('## READ (');
  });
});
