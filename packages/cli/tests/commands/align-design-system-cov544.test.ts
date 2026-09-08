import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { ExitCode } from '../../src/utils/errors';

// Mock the orchestrator so the thin command layer (createAlignDesignSystemCommand)
// is exercised in isolation across every render + exit branch.
const runAlignMock = vi.fn();
vi.mock('../../src/align/index.js', () => ({
  runAlignDesignSystem: (...args: unknown[]) => runAlignMock(...args),
}));

import { createAlignDesignSystemCommand } from '../../src/commands/align-design-system';

const exitSentinel = new Error('__exit__');

function finding(over: Record<string, unknown> = {}) {
  return {
    code: 'DRIFT-T001',
    severity: 'warning',
    file: 'src/Button.tsx',
    line: 12,
    message: 'hex literal bypasses token',
    evidence: { snippet: '#fff' },
    rule: { id: 'T001', category: 'token-bypass' },
    fix: { kind: 'codemod-todo', description: 'use token' },
    ...over,
  };
}

function output(over: Record<string, unknown> = {}) {
  return {
    outcomes: [],
    summary: {
      totalFindings: 0,
      applied: 0,
      suggestions: 0,
      skipped: 0,
      failed: 0,
      filesModified: 0,
      durationMs: 5,
    },
    catalog: { codemodApplied: [], suggestionsEmitted: [] },
    meta: { mode: 'standalone', dryRun: false, tokensLoaded: true },
    ...over,
  };
}

describe('align-design-system command (cov544)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];

  beforeEach(() => {
    runAlignMock.mockReset();
    logs = [];
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitSentinel;
    }) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  async function run(globalFlags: string[], subArgs: string[]): Promise<number | undefined> {
    const p = new Command();
    p.exitOverride();
    p.option('--json');
    p.option('--quiet');
    p.option('--verbose');
    p.addCommand(createAlignDesignSystemCommand());
    try {
      await p.parseAsync(['align-design-system', ...globalFlags, ...subArgs], { from: 'user' });
    } catch (e) {
      if (e !== exitSentinel) throw e;
    }
    return exitSpy.mock.calls.at(-1)?.[0] as number | undefined;
  }

  it('empty outcomes (no revert) prints "No drift findings to align." and exits 0', async () => {
    runAlignMock.mockResolvedValue(output());
    const code = await run([], []);
    expect(logs.join('\n')).toContain('No drift findings to align.');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('empty outcomes under --revert prints the no-batch message', async () => {
    runAlignMock.mockResolvedValue(
      output({ meta: { mode: 'standalone', dryRun: false, tokensLoaded: true, revert: true } })
    );
    const code = await run([], ['--revert']);
    expect(logs.join('\n')).toContain('No batch to revert');
    expect(code).toBe(ExitCode.SUCCESS);
    // --revert flag threads into the AlignInput.
    expect(runAlignMock.mock.calls[0]?.[0]).toMatchObject({ revert: true });
  });

  it('renders applied/suggestion/skipped/failed outcomes grouped by file (verbose)', async () => {
    const outcomes = [
      {
        kind: 'applied',
        finding: finding({ code: 'DRIFT-T001', line: 3 }),
        diff: { file: 'src/Button.tsx', before: '#fff', after: 'token.white', line: 3 },
      },
      {
        kind: 'suggestion',
        finding: finding({ code: 'DRIFT-P001', line: 8, file: 'src/Card.tsx' }),
        suggestion: { description: 'adopt primitive', preview: 'x' },
      },
      {
        kind: 'skipped-unsafe',
        finding: finding({ code: 'DRIFT-T002', line: null, file: 'src/Card.tsx' }),
        reason: 'ambiguous context',
      },
      {
        kind: 'failed',
        finding: finding({ code: 'DRIFT-T003', line: 20, file: 'src/Card.tsx' }),
        error: 'boom',
      },
    ];
    runAlignMock.mockResolvedValue(
      output({
        outcomes,
        summary: {
          totalFindings: 4,
          applied: 1,
          suggestions: 1,
          skipped: 1,
          failed: 1,
          filesModified: 1,
          durationMs: 9,
        },
        meta: { mode: 'standalone', dryRun: true, tokensLoaded: true },
      })
    );
    const code = await run(['--verbose'], []);
    const out = logs.join('\n');
    expect(out).toContain('src/Button.tsx');
    expect(out).toContain('before:');
    expect(out).toContain('after:');
    expect(out).toContain('suggest:'); // verbose-only suggestion detail
    expect(out).toContain('skipped:'); // verbose-only skipped detail
    expect(out).toContain('error: boom');
    expect(out).toContain('Summary:');
    expect(out).toContain('(dry-run — no files written)');
    // failed > 0 => ExitCode.ERROR
    expect(code).toBe(ExitCode.ERROR);
  });

  it('non-verbose hides suggestion/skipped detail and exits 0 when no failures', async () => {
    runAlignMock.mockResolvedValue(
      output({
        outcomes: [
          {
            kind: 'suggestion',
            finding: finding({ code: 'DRIFT-P002', line: 1 }),
            suggestion: { description: 'primitive', preview: 'p' },
          },
        ],
        summary: {
          totalFindings: 1,
          applied: 0,
          suggestions: 1,
          skipped: 0,
          failed: 0,
          filesModified: 0,
          durationMs: 2,
        },
      })
    );
    const code = await run([], []);
    const out = logs.join('\n');
    expect(out).not.toContain('suggest:');
    expect(out).toContain('Summary:');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('JSON mode emits the raw output structure', async () => {
    runAlignMock.mockResolvedValue(output({ summary: { ...output().summary, applied: 2 } }));
    const code = await run(['--json'], ['--dry-run']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.summary.applied).toBe(2);
    expect(parsed.meta).toBeDefined();
    expect(code).toBe(ExitCode.SUCCESS);
    // --dry-run threads into the input.
    expect(runAlignMock.mock.calls[0]?.[0]).toMatchObject({ dryRun: true });
  });

  it('threads --files, --mode, and --design-strictness into the AlignInput', async () => {
    runAlignMock.mockResolvedValue(output());
    await run(
      [],
      ['-f', 'src/a.tsx', 'src/b.tsx', '--mode', 'pipeline', '--design-strictness', 'strict']
    );
    expect(runAlignMock.mock.calls[0]?.[0]).toMatchObject({
      files: ['src/a.tsx', 'src/b.tsx'],
      mode: 'pipeline',
      designStrictness: 'strict',
    });
  });

  it('handles a thrown orchestrator error in text mode (logs + exit 2)', async () => {
    runAlignMock.mockRejectedValue(new Error('kaboom'));
    const code = await run([], []);
    expect(code).toBe(ExitCode.ERROR);
  });

  it('handles a thrown orchestrator error in JSON mode (prints {error})', async () => {
    runAlignMock.mockRejectedValue(new Error('kaboom-json'));
    const code = await run(['--json'], []);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.error).toBe('kaboom-json');
    expect(code).toBe(ExitCode.ERROR);
  });
});
