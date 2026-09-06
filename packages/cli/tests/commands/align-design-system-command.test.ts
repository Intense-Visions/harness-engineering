/**
 * Behavior tests for the `harness align-design-system` COMMAND LAYER
 * (`src/commands/align-design-system.ts`).
 *
 * Scope note: `tests/align/**` covers the align ENGINE (`src/align/`). Nothing
 * covered the command that wraps it — the conditional input assembly, the
 * error/exit mapping, and the whole `printAlignResult` renderer. The engine is
 * mocked here on purpose: the contract under test is what the command hands
 * the engine and what it renders back, not what the engine computes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/align/index.js', () => ({
  runAlignDesignSystem: vi.fn(),
}));

import { createAlignDesignSystemCommand } from '../../src/commands/align-design-system';
import { runAlignDesignSystem, type AlignDesignSystemOutput } from '../../src/align/index.js';
import type { DriftFinding } from '../../src/drift/findings/finding.js';
import { runCommand, parseJsonStdout } from './design-command-harness';

const CWD = '/tmp/align-project';

/** The runner is the seam: everything the command decided is visible in its argument. */
function inputHandedToEngine(): Record<string, unknown> {
  expect(runAlignDesignSystem).toHaveBeenCalledTimes(1);
  return vi.mocked(runAlignDesignSystem).mock.calls[0]![0] as unknown as Record<string, unknown>;
}

function finding(overrides: Partial<DriftFinding> = {}): DriftFinding {
  return {
    code: 'DRIFT-T001',
    severity: 'error',
    file: 'src/Card.tsx',
    line: 12,
    message: 'Hex color "#ff0000" outside token system',
    evidence: { snippet: 'color: "#ff0000"' },
    rule: { id: 'DRIFT-T001', category: 'token-bypass' },
    fix: { kind: 'codemod-todo', description: 'Replace with token reference' },
    ...overrides,
  } as DriftFinding;
}

function output(overrides: Partial<AlignDesignSystemOutput> = {}): AlignDesignSystemOutput {
  const outcomes = overrides.outcomes ?? [];
  return {
    outcomes,
    summary: {
      totalFindings: outcomes.length,
      applied: 0,
      suggestions: 0,
      skipped: 0,
      failed: 0,
      filesModified: 0,
      durationMs: 7,
      ...overrides.summary,
    },
    catalog: { codemodApplied: [], suggestionsEmitted: [], ...overrides.catalog },
    meta: { mode: 'standalone', dryRun: false, tokensLoaded: true, ...overrides.meta },
  };
}

/** Summary defaults with per-test overrides — avoids `output().summary` round-trips. */
function summary(
  overrides: Partial<AlignDesignSystemOutput['summary']> = {}
): AlignDesignSystemOutput['summary'] {
  return {
    totalFindings: 0,
    applied: 0,
    suggestions: 0,
    skipped: 0,
    failed: 0,
    filesModified: 0,
    durationMs: 7,
    ...overrides,
  };
}

function engineReturns(value: AlignDesignSystemOutput): void {
  vi.mocked(runAlignDesignSystem).mockResolvedValue(value);
}

async function run(globalArgv: string[], subArgv: string[] = []) {
  return runCommand(createAlignDesignSystemCommand(), ['--cwd', CWD, ...globalArgv], subArgv);
}

beforeEach(() => {
  vi.mocked(runAlignDesignSystem).mockReset();
  engineReturns(output());
});

describe('align-design-system command → AlignInput assembly', () => {
  it('sends only path and the defaulted mode when no flags are supplied', async () => {
    await run([]);
    // toStrictEqual (not toEqual) so an `{ dryRun: undefined }` key would fail:
    // the command's contract is to OMIT unsupplied flags, not to null them out.
    expect(inputHandedToEngine()).toStrictEqual({ path: CWD, mode: 'standalone' });
  });

  // One loop rather than four near-identical bodies; the per-key name keeps the
  // failure report as specific as four separate tests would.
  for (const key of ['dryRun', 'revert', 'files', 'designStrictness']) {
    it(`omits ${key} from the input entirely when its flag is not supplied`, async () => {
      await run([]);
      expect(Object.keys(inputHandedToEngine())).not.toContain(key);
    });
  }

  it('sets dryRun: true when --dry-run is supplied', async () => {
    await run([], ['--dry-run']);
    expect(inputHandedToEngine().dryRun).toBe(true);
  });

  it('sets revert: true when --revert is supplied', async () => {
    await run([], ['--revert']);
    expect(inputHandedToEngine().revert).toBe(true);
  });

  it('forwards a multi-value --files scope as an array', async () => {
    await run([], ['--files', 'src/A.tsx', 'src/B.tsx']);
    expect(inputHandedToEngine().files).toEqual(['src/A.tsx', 'src/B.tsx']);
  });

  it('defaults mode to standalone', async () => {
    await run([]);
    expect(inputHandedToEngine().mode).toBe('standalone');
  });

  it('forwards --mode pipeline over the standalone default', async () => {
    await run([], ['--mode', 'pipeline']);
    expect(inputHandedToEngine().mode).toBe('pipeline');
  });

  it('forwards --design-strictness as designStrictness', async () => {
    await run([], ['--design-strictness', 'strict']);
    expect(inputHandedToEngine().designStrictness).toBe('strict');
  });

  it('resolves path from the global --cwd', async () => {
    await runCommand(createAlignDesignSystemCommand(), ['--cwd', '/elsewhere'], []);
    expect(inputHandedToEngine().path).toBe('/elsewhere');
  });

  it('falls back to process.cwd() when no global --cwd is given', async () => {
    await runCommand(createAlignDesignSystemCommand(), [], []);
    expect(inputHandedToEngine().path).toBe(process.cwd());
  });
});

describe('align-design-system command → engine failure', () => {
  it('prints {"error": message} as the whole of stdout in JSON mode', async () => {
    vi.mocked(runAlignDesignSystem).mockRejectedValue(new Error('tokens.json is malformed'));
    const res = await run(['--json']);
    expect(parseJsonStdout(res)).toEqual({ error: 'tokens.json is malformed' });
  });

  it('writes the failure to stderr via logger.error in human mode', async () => {
    vi.mocked(runAlignDesignSystem).mockRejectedValue(new Error('tokens.json is malformed'));
    const res = await run([]);
    expect(res.stderr).toContain('align-design-system failed: tokens.json is malformed');
  });

  it('writes nothing to stdout when the engine fails in human mode', async () => {
    vi.mocked(runAlignDesignSystem).mockRejectedValue(new Error('boom'));
    const res = await run([]);
    expect(res.stdout).toBe('');
  });

  it('exits ERROR (2) when the engine throws', async () => {
    vi.mocked(runAlignDesignSystem).mockRejectedValue(new Error('boom'));
    expect((await run([])).exitCode).toBe(2);
  });

  it('stringifies a non-Error rejection rather than reporting "undefined"', async () => {
    vi.mocked(runAlignDesignSystem).mockRejectedValue('plain string failure');
    const res = await run(['--json']);
    expect(parseJsonStdout(res)).toEqual({ error: 'plain string failure' });
  });
});

describe('align-design-system command → exit mapping', () => {
  it('exits ERROR (2) when the summary reports any failed outcome', async () => {
    engineReturns(output({ summary: { ...summary(), failed: 1 } }));
    expect((await run([])).exitCode).toBe(2);
  });

  it('exits SUCCESS (0) when nothing failed, even with skipped outcomes', async () => {
    engineReturns(output({ summary: { ...summary(), failed: 0, skipped: 3 } }));
    expect((await run([])).exitCode).toBe(0);
  });
});

describe('align-design-system command → JSON mode', () => {
  it('emits the engine result verbatim rather than the human render', async () => {
    const value = output({
      outcomes: [
        { kind: 'skipped-unsafe', finding: finding(), reason: 'inside a template literal' },
      ],
      summary: { ...summary(), totalFindings: 1, skipped: 1 },
    });
    engineReturns(value);
    const res = await run(['--json']);
    expect(parseJsonStdout(res)).toEqual(JSON.parse(JSON.stringify(value)));
  });
});

describe('align-design-system command → empty-result rendering', () => {
  it('reports "No drift findings to align." when a normal run found nothing', async () => {
    engineReturns(output({ outcomes: [] }));
    const res = await run([]);
    expect(res.stdout).toBe('No drift findings to align.');
  });

  it('reports the revert-specific message when a --revert run found no batch', async () => {
    engineReturns(
      output({
        outcomes: [],
        meta: { mode: 'standalone', dryRun: false, tokensLoaded: false, revert: true },
      })
    );
    const res = await run([], ['--revert']);
    expect(res.stdout).toBe(
      'No batch to revert (.harness/align/last-batch.json missing or empty).'
    );
  });
});

describe('align-design-system command → grouping by file', () => {
  it('groups an applied outcome under diff.file, not finding.file', async () => {
    // The two differ deliberately: `outcomeFile` reads diff.file for applied
    // outcomes, so a file-header of finding.file would be a regression.
    engineReturns(
      output({
        outcomes: [
          {
            kind: 'applied',
            finding: finding({ file: 'src/stale-finding-path.tsx' }),
            diff: {
              file: 'src/actually-written.tsx',
              before: 'color: "#ff0000"',
              after: 'color: tokens.color.danger',
              line: 12,
            },
          },
        ],
        summary: { ...summary(), totalFindings: 1, applied: 1, filesModified: 1 },
      })
    );
    const res = await run([]);
    expect(res.stdoutLines).toContain('src/actually-written.tsx');
    expect(res.stdoutLines).not.toContain('src/stale-finding-path.tsx');
  });

  it('groups a non-applied outcome under finding.file', async () => {
    engineReturns(
      output({
        outcomes: [
          {
            kind: 'skipped-unsafe',
            finding: finding({ file: 'src/Skipped.tsx' }),
            reason: 'unsafe',
          },
        ],
        summary: { ...summary(), totalFindings: 1, skipped: 1 },
      })
    );
    expect((await run([])).stdoutLines).toContain('src/Skipped.tsx');
  });

  it('prints one file header for several outcomes sharing a file', async () => {
    engineReturns(
      output({
        outcomes: [
          {
            kind: 'skipped-unsafe',
            finding: finding({ file: 'src/Same.tsx', line: 1 }),
            reason: 'a',
          },
          { kind: 'failed', finding: finding({ file: 'src/Same.tsx', line: 2 }), error: 'b' },
        ],
        summary: { ...summary(), totalFindings: 2, skipped: 1, failed: 1 },
      })
    );
    const res = await run([]);
    expect(res.stdoutLines.filter((l) => l === 'src/Same.tsx')).toHaveLength(1);
  });
});

describe('align-design-system command → per-outcome line', () => {
  const cases: Array<[string, string, () => AlignDesignSystemOutput]> = [
    [
      'applied',
      '✓',
      () =>
        output({
          outcomes: [
            {
              kind: 'applied',
              finding: finding({ code: 'DRIFT-T001', line: 12, message: 'hex bypass' }),
              diff: { file: 'src/Card.tsx', before: 'a', after: 'b', line: 12 },
            },
          ],
          summary: { ...summary(), totalFindings: 1, applied: 1 },
        }),
    ],
    [
      'suggestion',
      '?',
      () =>
        output({
          outcomes: [
            {
              kind: 'suggestion',
              finding: finding({ code: 'DRIFT-T001', line: 12, message: 'hex bypass' }),
              suggestion: { description: 'swap for a token', preview: 'p' },
            },
          ],
          summary: { ...summary(), totalFindings: 1, suggestions: 1 },
        }),
    ],
    [
      'skipped-unsafe',
      '·',
      () =>
        output({
          outcomes: [
            {
              kind: 'skipped-unsafe',
              finding: finding({ code: 'DRIFT-T001', line: 12, message: 'hex bypass' }),
              reason: 'inside a template literal',
            },
          ],
          summary: { ...summary(), totalFindings: 1, skipped: 1 },
        }),
    ],
    [
      'failed',
      '✗',
      () =>
        output({
          outcomes: [
            {
              kind: 'failed',
              finding: finding({ code: 'DRIFT-T001', line: 12, message: 'hex bypass' }),
              error: 'EACCES',
            },
          ],
          summary: { ...summary(), totalFindings: 1, failed: 1 },
        }),
    ],
  ];

  for (const [kind, icon, fixture] of cases) {
    it(`marks a ${kind} outcome with "${icon}"`, async () => {
      engineReturns(fixture());
      const res = await run([]);
      expect(res.stdoutLines).toContain(`  ${icon} DRIFT-T001:12 — hex bypass`);
    });
  }

  it('omits the :line suffix when the finding carries no line number', async () => {
    engineReturns(
      output({
        outcomes: [
          {
            kind: 'skipped-unsafe',
            finding: finding({ line: null, message: 'file-level bypass' }),
            reason: 'r',
          },
        ],
        summary: { ...summary(), totalFindings: 1, skipped: 1 },
      })
    );
    const res = await run([]);
    expect(res.stdoutLines).toContain('  · DRIFT-T001 — file-level bypass');
  });
});

describe('align-design-system command → detail lines and verbose gating', () => {
  const appliedFixture = output({
    outcomes: [
      {
        kind: 'applied',
        finding: finding(),
        diff: {
          file: 'src/Card.tsx',
          before: '  color: "#ff0000"  ',
          after: '  color: tokens.color.danger  ',
          line: 12,
        },
      },
    ],
    summary: { ...summary(), totalFindings: 1, applied: 1, filesModified: 1 },
  });

  const suggestionFixture = output({
    outcomes: [
      {
        kind: 'suggestion',
        finding: finding({ code: 'DRIFT-T004' }),
        suggestion: { description: 'token color.old is deprecated', preview: 'p' },
      },
    ],
    summary: { ...summary(), totalFindings: 1, suggestions: 1 },
  });

  const skippedFixture = output({
    outcomes: [
      { kind: 'skipped-unsafe', finding: finding(), reason: 'value spans a template literal' },
    ],
    summary: { ...summary(), totalFindings: 1, skipped: 1 },
  });

  const failedFixture = output({
    outcomes: [{ kind: 'failed', finding: finding(), error: 'EACCES: permission denied' }],
    summary: { ...summary(), totalFindings: 1, failed: 1 },
  });

  it('prints the applied before/after diff in plain text mode', async () => {
    engineReturns(appliedFixture);
    const res = await run([]);
    expect(res.stdoutLines).toContain('     before: color: "#ff0000"');
    expect(res.stdoutLines).toContain('     after:  color: tokens.color.danger');
  });

  it('withholds the suggestion description in plain text mode', async () => {
    engineReturns(suggestionFixture);
    expect((await run([])).stdout).not.toContain('token color.old is deprecated');
  });

  it('reveals the suggestion description in verbose mode', async () => {
    engineReturns(suggestionFixture);
    const res = await run(['--verbose']);
    expect(res.stdoutLines).toContain('     suggest: token color.old is deprecated');
  });

  it('withholds the skip reason in plain text mode', async () => {
    engineReturns(skippedFixture);
    expect((await run([])).stdout).not.toContain('value spans a template literal');
  });

  it('reveals the skip reason in verbose mode', async () => {
    engineReturns(skippedFixture);
    const res = await run(['--verbose']);
    expect(res.stdoutLines).toContain('     skipped: value spans a template literal');
  });

  it('prints the failure error in plain text mode — failures are never verbose-gated', async () => {
    engineReturns(failedFixture);
    const res = await run([]);
    expect(res.stdoutLines).toContain('     error: EACCES: permission denied');
  });

  it('still prints the failure error in verbose mode', async () => {
    engineReturns(failedFixture);
    const res = await run(['--verbose']);
    expect(res.stdoutLines).toContain('     error: EACCES: permission denied');
  });
});

describe('align-design-system command → summary line', () => {
  const withCounts = (meta: Partial<AlignDesignSystemOutput['meta']> = {}) =>
    output({
      outcomes: [
        {
          kind: 'applied',
          finding: finding(),
          diff: { file: 'src/Card.tsx', before: 'a', after: 'b', line: 12 },
        },
      ],
      summary: {
        totalFindings: 4,
        applied: 1,
        suggestions: 2,
        skipped: 3,
        failed: 0,
        filesModified: 5,
        durationMs: 42,
      },
      meta: { mode: 'standalone', dryRun: false, tokensLoaded: true, ...meta },
    });

  it('says "applied" and reports every count on a normal run', async () => {
    engineReturns(withCounts());
    const res = await run([]);
    expect(res.stdoutLines).toContain(
      'Summary: 1 applied, 2 suggestions, 3 skipped, 0 failed (5 files modified, 42ms)'
    );
  });

  it('says "reverted" instead of "applied" on a revert run', async () => {
    engineReturns(withCounts({ revert: true }));
    const res = await run([], ['--revert']);
    expect(res.stdoutLines).toContain(
      'Summary: 1 reverted, 2 suggestions, 3 skipped, 0 failed (5 files modified, 42ms)'
    );
  });

  it('appends the dry-run notice when the run wrote nothing', async () => {
    engineReturns(withCounts({ dryRun: true }));
    const res = await run([], ['--dry-run']);
    expect(res.stdoutLines).toContain('(dry-run — no files written)');
  });

  it('omits the dry-run notice on a writing run', async () => {
    engineReturns(withCounts());
    expect((await run([])).stdout).not.toContain('dry-run');
  });
});
