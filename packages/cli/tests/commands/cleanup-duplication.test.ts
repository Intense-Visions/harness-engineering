// packages/cli/tests/commands/cleanup-duplication.test.ts
//
// `harness cleanup -t duplication` at the unit level: what reaches the
// analyzer, and what comes back out.
//
// MUTATIONS these rows fail against:
//   - removing `'duplication'` from `CleanupType` stops this file compiling;
//   - letting `-t all` enable duplication unconditionally fails
//     "all / no entropy.duplication -> key absent";
//   - dropping the `entropy.duplication: false` refusal branch fails
//     "refuses ... and never constructs the analyzer", which is the #1760
//     failure (a clean report for a scan that never ran).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const analyzeResultHolder = { current: null as unknown };
const capturedConfigs: Array<{ analyze: Record<string, unknown> }> = [];

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    EntropyAnalyzer: class {
      constructor(config: unknown) {
        capturedConfigs.push(config as { analyze: Record<string, unknown> });
      }
      async analyze() {
        return analyzeResultHolder.current;
      }
    },
  };
});

vi.mock('../../src/config/loader', () => ({ resolveConfig: vi.fn() }));

import { runCleanup, printCleanupResult } from '../../src/commands/cleanup';

/** The advisory duplication block `printCleanupResult` renders. */
type DuplicationBlock = {
  classes: Array<{
    fingerprint: string;
    tokenCount: number;
    memberCount: number;
    rank: number;
    priority: number;
    signal: 'duplicate' | 'partial-extraction';
    sharedImport?: string;
    members: Array<{
      file: string;
      unit: string;
      kind: string;
      startLine: number;
      endLine: number;
    }>;
  }>;
  filesScanned: number;
  filesSkipped: number;
  classesReported: number;
  classesSuppressed: number;
  classesTruncated: number;
};
import { OutputFormatter, OutputMode } from '../../src/output/formatter';
import { resolveConfig } from '../../src/config/loader';
import { logger } from '../../src/output/logger';

/** A report with nothing in it: no detector produced anything. */
const emptyReport = {
  ok: true as const,
  value: { analysisErrors: [] },
};

function configure(entropy: Record<string, unknown>): void {
  vi.mocked(resolveConfig).mockReturnValue({
    ok: true,
    value: {
      version: 1,
      rootDir: '.',
      docsDir: './docs',
      entropy: { excludePatterns: [], ...entropy },
    },
  } as never);
}

describe('harness cleanup -t duplication — what reaches the analyzer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedConfigs.length = 0;
    analyzeResultHolder.current = emptyReport;
  });

  it('runs on the shipped defaults when nothing is configured', async () => {
    configure({});
    await runCleanup({ cwd: '/tmp/test', type: 'duplication' });
    expect(capturedConfigs).toHaveLength(1);
    expect(capturedConfigs[0]!.analyze.duplication).toBe(true);
    // An explicit -t duplication runs ONLY duplication.
    expect(capturedConfigs[0]!.analyze.drift).toBe(false);
    expect(capturedConfigs[0]!.analyze.deadCode).toBe(false);
    expect(capturedConfigs[0]!.analyze.patterns).toBe(false);
  });

  it('threads an object config through verbatim', async () => {
    configure({ duplication: { minTokens: 60 } });
    await runCleanup({ cwd: '/tmp/test', type: 'duplication' });
    expect(capturedConfigs[0]!.analyze.duplication).toEqual({ minTokens: 60 });
  });

  it('leaves the key ABSENT under -t all when entropy.duplication is unset', async () => {
    configure({});
    await runCleanup({ cwd: '/tmp/test', type: 'all' });
    // Absent, not `undefined`: `analyzer.ts:194` branches on the key's
    // truthiness and the detector's own tests assert the absent case.
    expect('duplication' in capturedConfigs[0]!.analyze).toBe(false);
  });

  it('runs under -t all when the project opted in with `true`', async () => {
    configure({ duplication: true });
    await runCleanup({ cwd: '/tmp/test', type: 'all' });
    expect(capturedConfigs[0]!.analyze.duplication).toBe(true);
  });

  it('leaves the key absent under another type even when configured', async () => {
    configure({ duplication: true });
    await runCleanup({ cwd: '/tmp/test', type: 'drift' });
    expect('duplication' in capturedConfigs[0]!.analyze).toBe(false);
  });

  it('refuses an explicit request on a disabled detector, and never constructs the analyzer', async () => {
    configure({ duplication: false });
    const result = await runCleanup({ cwd: '/tmp/test', type: 'duplication' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('entropy.duplication');
    // The refusal happens BEFORE analysis — nothing was scanned, so nothing
    // may be reported.
    expect(capturedConfigs).toHaveLength(0);
  });

  // An unknown `-t` value was a GREEN PASS on both channels: measured,
  // `harness cleanup -t duplicaiton` (one transposed character) printed
  // "Entropy issues: not checked" and exited 0, and `-t bogus --findings-json`
  // published `{"findings":0,"v":1,"check":"cleanup"}` and exited 0. The value
  // fell through the analyzer switch with everything off. `runCleanup` already
  // refuses on two adjacent branches of that switch citing #1760; this is the
  // third.
  it('refuses an unrecognized type instead of running no analyzer', async () => {
    configure({});
    const result = await runCleanup({ cwd: '/tmp/test', type: 'duplicaiton' as never });
    // MUTATION: drop the `isEntropyIssueType` guard and this returns ok with
    // totalIssues 0 — a pass over nothing examined.
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('Unknown issue type "duplicaiton"');
    expect(!result.ok && result.error.message).toContain('duplication');
    expect(!result.ok && result.error.exitCode).not.toBe(0);
    // Refused before anything was constructed or scanned.
    expect(capturedConfigs).toHaveLength(0);
  });

  it('skips silently under -t all on a disabled detector', async () => {
    configure({ duplication: false });
    const result = await runCleanup({ cwd: '/tmp/test', type: 'all' });
    expect(result.ok).toBe(true);
    expect('duplication' in capturedConfigs[0]!.analyze).toBe(false);
  });
});

/** A `DuplicationReport` shaped like the real one, with 2 classes. */
function duplicationReport() {
  return {
    classes: [
      {
        fingerprint: 'aaaa1111',
        tokenCount: 120,
        rank: 360,
        priority: 360,
        signal: 'duplicate' as const,
        members: [
          { file: 'src/a.ts', unit: 'alpha', kind: 'function', startLine: 3, endLine: 20 },
          { file: 'src/b.ts', unit: 'beta', kind: 'function', startLine: 5, endLine: 22 },
          { file: 'src/c.ts', unit: 'gamma', kind: 'function', startLine: 7, endLine: 24 },
        ],
      },
      {
        fingerprint: 'bbbb2222',
        tokenCount: 48,
        rank: 192,
        priority: 384,
        signal: 'partial-extraction' as const,
        sharedImport: 'src/shared/payload',
        members: [
          { file: 'src/d.ts', unit: 'delta', kind: 'method', startLine: 1, endLine: 9 },
          { file: 'src/e.ts', unit: 'epsilon', kind: 'method', startLine: 2, endLine: 10 },
          { file: 'src/f.ts', unit: 'zeta', kind: 'method', startLine: 3, endLine: 11 },
          { file: 'src/g.ts', unit: 'eta', kind: 'method', startLine: 4, endLine: 12 },
        ],
      },
    ],
    byMember: new Map(),
    collisions: [],
    skipErrors: [],
    // The REAL 13-key `stats` block (`CloneIndex['stats']` plus
    // `violationCount` / `infoCount`), not the four keys the projection
    // happens to keep — a mock that carries only what the code reads cannot
    // show what the code drops.
    stats: {
      filesScanned: 11,
      filesIgnored: 4,
      filesSkipped: 2,
      skippedTruncated: 0,
      unitsFingerprinted: 30,
      unitsBelowMinTokens: 12,
      classesReported: 2,
      classesSuppressed: 5,
      classesTruncated: 3,
      collisionsObserved: 0,
      collisionsTruncated: 0,
      violationCount: 0,
      infoCount: 2,
    },
  };
}

const notRunError = {
  analyzer: 'duplication',
  error: {
    code: 'INVALID_CONFIG',
    message: 'Duplication analysis did not run: the snapshot was bypassed.',
    details: { reason: 'snapshot-bypassed' },
    suggestions: ['Supply graph data for at most one of drift / deadCode'],
  },
};

describe('harness cleanup -t duplication — what comes back out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedConfigs.length = 0;
  });

  it('reports the classes advisorially and keeps them OUT of totalIssues', async () => {
    configure({ duplication: true });
    analyzeResultHolder.current = {
      ok: true,
      value: {
        drift: {
          drifts: [
            {
              docFile: 'docs/api.md',
              line: 12,
              type: 'api-signature',
              issue: 'outdated',
              details: 'stale',
            },
          ],
        },
        duplication: duplicationReport(),
        analysisErrors: [],
      },
    };
    const result = await runCleanup({ cwd: '/tmp/test', type: 'all' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.duplication?.classes).toHaveLength(2);
    expect(result.value.duplication?.classes[0]).toEqual({
      fingerprint: 'aaaa1111',
      tokenCount: 120,
      memberCount: 3,
      rank: 360,
      priority: 360,
      signal: 'duplicate',
      members: [
        { file: 'src/a.ts', unit: 'alpha', kind: 'function', startLine: 3, endLine: 20 },
        { file: 'src/b.ts', unit: 'beta', kind: 'function', startLine: 5, endLine: 22 },
        { file: 'src/c.ts', unit: 'gamma', kind: 'function', startLine: 7, endLine: 24 },
      ],
    });
    expect(result.value.duplication?.classes[1]?.memberCount).toBe(4);
    // Order is preserved as handed in — the detector already sorted by
    // priority, so the CLI must not re-sort by rank (which would reverse these).
    expect(result.value.duplication?.classes.map((c) => c.rank)).toEqual([360, 192]);
    expect(result.value.duplication?.classes.map((c) => c.priority)).toEqual([360, 384]);

    // The labelled class carries all three new fields through the projection.
    expect(result.value.duplication?.classes[1]).toEqual({
      fingerprint: 'bbbb2222',
      tokenCount: 48,
      memberCount: 4,
      rank: 192,
      priority: 384,
      signal: 'partial-extraction',
      sharedImport: 'src/shared/payload',
      members: [
        { file: 'src/d.ts', unit: 'delta', kind: 'method', startLine: 1, endLine: 9 },
        { file: 'src/e.ts', unit: 'epsilon', kind: 'method', startLine: 2, endLine: 10 },
        { file: 'src/f.ts', unit: 'zeta', kind: 'method', startLine: 3, endLine: 11 },
        { file: 'src/g.ts', unit: 'eta', kind: 'method', startLine: 4, endLine: 12 },
      ],
    });
    // ABSENT on a plain duplicate, not present-and-undefined: `toEqual` above
    // ignores an undefined-valued key, so assert the key itself.
    expect('sharedImport' in result.value.duplication!.classes[0]!).toBe(false);
    expect(Object.keys(result.value.duplication!.classes[0]!)).not.toContain('sharedImport');
    // The cap's dropped count is not lost.
    expect(result.value.duplication?.classesTruncated).toBe(3);
    expect(result.value.duplication?.classesSuppressed).toBe(5);
    expect(result.value.duplication?.filesScanned).toBe(11);
    // A scan with skips is INCOMPLETE and the operator is the only one who can
    // judge whether that matters. MUTATION: drop `filesSkipped` from
    // `projectDuplication` and this fails — re-creating the exact blindness
    // `core/src/duplication/index.ts:152` records as the defect those counters
    // were added to fix.
    expect(result.value.duplication?.filesSkipped).toBe(2);

    // THE EXIT-CODE TEST'S UNIT-LEVEL TWIN. MUTATION: add
    // `duplication.classes.length` to the totalIssues sum and this fails at 3.
    expect(result.value.totalIssues).toBe(1);

    expect(result.value.ran).toEqual({
      drift: true,
      deadCode: false,
      patterns: false,
      duplication: true,
    });
  });

  it("errors with the analyzer's own reason when an explicit request did not run", async () => {
    configure({ duplication: true });
    analyzeResultHolder.current = {
      ok: true,
      value: { analysisErrors: [notRunError] },
    };
    const result = await runCleanup({ cwd: '/tmp/test', type: 'duplication' });
    // MUTATION: delete the did-not-run branch and the command reports
    // `duplication: undefined` as if the scan were clean.
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('snapshot was bypassed');
    expect(!result.ok && result.error.message).toContain('Supply graph data for at most one');
    expect(!result.ok && result.error.message).not.toMatch(/no duplication/i);
  });

  it('warns but continues when -t all could not run the detector', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    configure({ duplication: true });
    analyzeResultHolder.current = {
      ok: true,
      value: { analysisErrors: [notRunError] },
    };
    const result = await runCleanup({ cwd: '/tmp/test', type: 'all' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.duplication).toBeUndefined();
    expect(result.ok && result.value.ran.duplication).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('snapshot was bypassed'));
    warn.mockRestore();
  });

  /** Capture what `printCleanupResult` writes for one advisory result. */
  function printed(duplication: Partial<DuplicationBlock> = {}): string {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    printCleanupResult(
      {
        driftIssues: [],
        deadCode: [],
        patternViolations: [],
        totalIssues: 0,
        ran: { drift: false, deadCode: false, patterns: false, duplication: true },
        duplication: {
          classes: [
            {
              fingerprint: 'aaaa1111',
              tokenCount: 120,
              memberCount: 3,
              rank: 360,
              priority: 360,
              signal: 'duplicate' as const,
              members: [
                { file: 'src/a.ts', unit: 'alpha', kind: 'function', startLine: 3, endLine: 20 },
              ],
            },
            {
              fingerprint: 'bbbb2222',
              tokenCount: 48,
              memberCount: 4,
              rank: 192,
              priority: 384,
              signal: 'partial-extraction' as const,
              sharedImport: 'src/shared/payload',
              members: [
                { file: 'src/d.ts', unit: 'delta', kind: 'method', startLine: 1, endLine: 9 },
              ],
            },
          ],
          filesScanned: 11,
          filesSkipped: 0,
          classesReported: 2,
          classesSuppressed: 5,
          classesTruncated: 3,
          ...duplication,
        },
      },
      new OutputFormatter(OutputMode.NORMAL)
    );
    log.mockRestore();
    return lines.join('\n');
  }

  it('does not green-tick "Entropy issues: 0" when no gating analyzer ran', () => {
    const output = printed();
    // MUTATION: keep the unconditional formatSummary call and this fails —
    // the run would print a pass over three checks that never executed.
    expect(output).toContain('not checked');
    expect(output).not.toMatch(/Entropy issues:\s*\u001b?\[?[0-9;]*m?0/);
    expect(output).toContain('Duplication (advisory');
    expect(output).toContain('3 dropped by the maxClasses cap');
    expect(output).toContain('3x 120 tokens: alpha (src/a.ts:3)');
    // The signal is what makes a row jump the size ordering, so the row that
    // jumped names it — and the plain row must NOT be tagged. Asserted per
    // LINE, because `toContain` over the whole block cannot tell the two apart.
    const rows = output.split('\n').filter((l) => l.trimStart().startsWith('- '));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe('  - 3x 120 tokens: alpha (src/a.ts:3)');
    expect(rows[1]).toBe(
      '  - 4x 48 tokens: delta (src/d.ts:1) [partial-extraction -> src/shared/payload]'
    );
    // Nothing was skipped: the advisory line must not imply otherwise.
    expect(output).not.toContain('skipped');
  });

  it('says so on the advisory line when files were skipped', () => {
    // MUTATION: drop the `filesSkipped > 0` clause and a partial scan prints
    // identically to a complete one.
    expect(printed({ filesSkipped: 2 })).toContain('2 file(s) skipped');
  });
});
