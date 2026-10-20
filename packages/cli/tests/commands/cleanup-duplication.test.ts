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

import { runCleanup } from '../../src/commands/cleanup';
import { resolveConfig } from '../../src/config/loader';

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

  it('skips silently under -t all on a disabled detector', async () => {
    configure({ duplication: false });
    const result = await runCleanup({ cwd: '/tmp/test', type: 'all' });
    expect(result.ok).toBe(true);
    expect('duplication' in capturedConfigs[0]!.analyze).toBe(false);
  });
});
