import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  formatCapabilitiesTable,
  formatCapabilitiesByPermission,
  formatContextReport,
  formatRefinementDemand,
  createMcpCommand,
  createMcpListCapabilitiesCommand,
  createMcpContextReportCommand,
} from '../../src/commands/mcp';

const caps = [
  {
    name: 'read_file',
    scopes: ['read'] as const,
    network: false,
    trust: 'trusted',
    source: 'declared',
  },
  {
    name: 'fetch_url',
    scopes: ['read', 'exec'] as const,
    network: true,
    trust: 'untrusted',
    source: 'heuristic',
  },
  {
    name: 'write_file',
    scopes: ['read', 'write'] as const,
    network: false,
    trust: 'trusted',
    source: 'declared',
  },
];

describe('formatCapabilitiesTable', () => {
  it('renders a header, per-tool rows, and a trailing count', () => {
    const out = formatCapabilitiesTable(caps);
    expect(out).toContain('TOOL');
    expect(out).toContain('read+exec');
    expect(out).toContain('yes'); // network: fetch_url
    expect(out).toContain('no'); // network: read_file
    expect(out).toContain('3 tools');
  });
});

describe('formatCapabilitiesByPermission', () => {
  it('groups by scope and lists a NETWORK section with per-tool network tags', () => {
    const out = formatCapabilitiesByPermission(caps);
    expect(out).toContain('## READ');
    expect(out).toContain('## WRITE');
    expect(out).toContain('## EXEC');
    expect(out).toContain('## NETWORK (1)');
    expect(out).toContain('[network]'); // network tag on fetch_url within a scope section
    expect(out).toContain('3 tools');
  });
});

describe('formatContextReport', () => {
  it('flags over-budget classes and a degraded run', () => {
    const report = {
      windowTokens: 200000,
      totalTokens: 1234,
      counterMode: 'heuristic',
      degraded: true,
      byClass: [
        { contextClass: 'always', tokens: 900, count: 3, budgetTokens: 500, overBudget: true },
        { contextClass: 'scoped', tokens: 100, count: 1, budgetTokens: 500, overBudget: false },
      ],
      topContributors: [
        { label: 'AGENTS.md', contextClass: 'always', tokens: 500, degraded: true },
        { label: 'hooks', contextClass: 'scoped', tokens: 50, degraded: false },
      ],
    };
    const out = formatContextReport(report, 'full');
    expect(out).toContain('tier: full');
    expect(out).toContain('OVER BUDGET');
    expect(out).toContain('chars/4 heuristic');
    expect(out).toContain('[heuristic]'); // degraded top contributor
    expect(out).toContain('Total: 1234 tokens');
  });

  it('omits the degraded note and over-budget flag when clean', () => {
    const report = {
      windowTokens: 200000,
      totalTokens: 10,
      counterMode: 'exact',
      degraded: false,
      byClass: [
        { contextClass: 'always', tokens: 10, count: 1, budgetTokens: 500, overBudget: false },
      ],
      topContributors: [{ label: 'x', contextClass: 'always', tokens: 10, degraded: false }],
    };
    const out = formatContextReport(report, 'core');
    expect(out).not.toContain('OVER BUDGET');
    expect(out).not.toContain('heuristic');
  });
});

describe('formatRefinementDemand', () => {
  it('renders a ranked class table with frequencies', () => {
    const out = formatRefinementDemand({
      total: 7,
      byClass: [
        { contextClass: 'symbols', count: 5, frequency: 0.7142 },
        { contextClass: 'files', count: 2, frequency: 0.2857 },
      ],
    });
    expect(out).toContain('CLASS');
    expect(out).toContain('symbols');
    expect(out).toContain('0.7142');
    expect(out).toContain('Total: 7 refinement requests');
  });
});

describe('mcp command wiring', () => {
  it('registers the three sub-commands', () => {
    const names = createMcpCommand().commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining(['list-capabilities', 'context-report', 'refinement-demand'])
    );
  });
});

describe('option parsers reject bad values before the action runs', () => {
  it('rejects an invalid --tier on context-report', async () => {
    const cmd = createMcpContextReportCommand();
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(['context-report', '--tier', 'nonsense'], { from: 'user' })
    ).rejects.toThrow(/tier/i);
  });

  it('rejects a non-positive --window on context-report', async () => {
    const cmd = createMcpContextReportCommand();
    cmd.exitOverride();
    await expect(
      cmd.parseAsync(['context-report', '--window', '0'], { from: 'user' })
    ).rejects.toThrow(/window/i);
  });

  it('rejects a negative --budget-tokens on the root mcp command', async () => {
    const cmd = createMcpCommand();
    cmd.exitOverride();
    await expect(cmd.parseAsync(['--budget-tokens', '-4'], { from: 'user' })).rejects.toThrow(
      /budget/i
    );
  });
});

describe('list-capabilities action', () => {
  async function runList(argv: string[]): Promise<string[]> {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    try {
      await createMcpListCapabilitiesCommand().parseAsync(argv, { from: 'user' });
    } finally {
      logSpy.mockRestore();
    }
    return logs;
  }

  it('prints the flat capability table by default', async () => {
    const logs = await runList(['list-capabilities']);
    expect(logs.join('\n')).toContain('TOOL');
  });

  it('prints the by-permission grouping', async () => {
    const logs = await runList(['list-capabilities', '--by-permission']);
    expect(logs.join('\n')).toContain('## READ');
  });

  it('emits machine-readable JSON with a count', async () => {
    const logs = await runList(['list-capabilities', '--json']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed).toHaveProperty('count');
    expect(parsed).toHaveProperty('capabilities');
    expect(parsed.scopeSource).toBe('declared-with-heuristic-fallback');
  });
});

describe('context-report action (heuristic, empty project)', () => {
  let tmp: string;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function runReport(argv: string[]): Promise<string[]> {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-ctx-'));
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp);
    const logs: string[] = [];
    const logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((m?: unknown) => logs.push(String(m)));
    try {
      await createMcpContextReportCommand().parseAsync(argv, { from: 'user' });
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
    return logs;
  }

  it('prints a human-readable attribution report (default tier, no skills)', async () => {
    const logs = await runReport(['context-report', '--no-skills']);
    expect(logs.join('\n')).toContain('Context-surface attribution');
  });

  it('emits JSON with the resolved tier', async () => {
    const logs = await runReport(['context-report', '--tier', 'core', '--json', '--no-skills']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.tier).toBe('core');
  });
});
