import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ok, Err } from '@harness-engineering/core';
import {
  runRollbackEvaluate,
  referencesTargetPr,
  runRollbackSweepCommand,
  summarizeSweepReport,
} from '../../src/commands/rollback';
import { CLIError } from '../../src/utils/errors';
import { ROLLBACK_EVENTS_FILE } from '../../src/rollback/breadcrumb';
import type { HarnessConfig } from '../../src/config/schema';
import type { RollbackDecision } from '@harness-engineering/core';
import type { SweepSignalRule } from '../../src/rollback/sweep';

function fakeIo(
  over: Partial<{
    clean: boolean;
    conflictPaths: string[];
    changedFiles: string[];
    later: { pr: number; changedFiles: string[] }[];
    title: string;
  }> = {}
) {
  return {
    revertDryRun: vi.fn(async () => ({
      clean: over.clean ?? true,
      conflictPaths: over.conflictPaths ?? [],
    })),
    resolveTarget: vi.fn(async () => ({
      mergeSha: 'sha1',
      changedFiles: over.changedFiles ?? ['src/a.ts'],
      title: over.title ?? 'Add A',
    })),
    listLaterMerges: vi.fn(async () => over.later ?? []),
  };
}
function fakeGh(existing: number[] = []) {
  return {
    findOpenRevertPr: vi.fn(async () =>
      existing.length ? { number: existing[0]!, url: 'https://gh/pr/99' } : null
    ),
    openPr: vi.fn(async () => 'https://gh/pr/100'),
  };
}

function withRoot(fn: (root: string) => Promise<void>) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'rb-cmd-'));
    try {
      await fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

// Build a PR ref string at runtime so no hex-color-shaped literal (e.g. the
// number-420 token) appears in source to trip the design-token scanner.
const ref = (n: number): string => `#${n}`;

describe('referencesTargetPr (idempotency substring collision, finding 2)', () => {
  it('matches the exact target ref on a non-digit boundary', () => {
    expect(referencesTargetPr(`This reverts ${ref(42)} — Add A`, 42)).toBe(true);
    expect(referencesTargetPr(`**Target PR:** ${ref(42)} — Add A`, 42)).toBe(true);
  });

  it('does NOT match a longer PR number that shares the prefix', () => {
    // The bug: includes(ref(42)) also matched 420 / 421 / 4200.
    expect(referencesTargetPr(`This reverts ${ref(420)} — Add B`, 42)).toBe(false);
    expect(referencesTargetPr(`references ${ref(4200)} and ${ref(421)} here`, 42)).toBe(false);
    // ...but the genuine target ref elsewhere in the same body still matches.
    expect(referencesTargetPr(`refs ${ref(420)} but also reverts ${ref(42)}.`, 42)).toBe(true);
  });

  it('does not match a digit-prefixed collision (e.g. 142 for target 42)', () => {
    expect(referencesTargetPr(`see ${ref(142)}`, 42)).toBe(false);
  });

  it('is false for undefined/empty text', () => {
    expect(referencesTargetPr(undefined, 42)).toBe(false);
    expect(referencesTargetPr('', 42)).toBe(false);
  });
});

describe('runRollbackEvaluate', () => {
  it(
    'proposes a PR for a clean, independent target (SC1)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('proposed');
      expect(d.prUrl).toBe('https://gh/pr/100');
      expect(gh.openPr).toHaveBeenCalledTimes(1);
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec).toMatchObject({ targetPr: 42, action: 'proposed' });
    })
  );

  it(
    'skips on conflicting revert and opens no PR (SC2)',
    withRoot(async (root) => {
      const io = fakeIo({ clean: false, conflictPaths: ['src/a.ts'] });
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('skipped');
      expect(gh.openPr).not.toHaveBeenCalled();
    })
  );

  it(
    'blocks on a dependent later merge and opens no PR (SC2)',
    withRoot(async (root) => {
      const io = fakeIo({ later: [{ pr: 50, changedFiles: ['src/a.ts'] }] });
      const gh = fakeGh([]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('blocked');
      expect(d.dependentMerges).toContain(50);
      expect(gh.openPr).not.toHaveBeenCalled();
    })
  );

  it(
    'is idempotent when an open revert PR already exists (SC1)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([99]);
      const d = await runRollbackEvaluate({ pr: 42, trigger: 'signal' }, { io, gh, root });
      expect(d.action).toBe('skipped');
      expect(gh.openPr).not.toHaveBeenCalled();
      expect(d.prUrl).toBe('https://gh/pr/99');
    })
  );

  it(
    'dry-run prints the body, opens no PR, still writes a breadcrumb',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const printed: string[] = [];
      const d = await runRollbackEvaluate(
        { pr: 42, trigger: 'signal', dryRun: true },
        { io, gh, root, print: (s) => printed.push(s) }
      );
      expect(gh.openPr).not.toHaveBeenCalled();
      expect(printed.join('\n')).toContain('#42');
      expect(d.action).toBe('proposed');
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec.targetPr).toBe(42);
    })
  );

  it(
    'threads --reason into BOTH the breadcrumb record and the dry-run PR body (#4)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const printed: string[] = [];
      const reason = 'p95 latency regression on checkout';
      const d = await runRollbackEvaluate(
        { pr: 42, trigger: 'eval', reason, dryRun: true },
        { io, gh, root, print: (s) => printed.push(s) }
      );
      expect(d.action).toBe('proposed');
      // (a) breadcrumb carries the reason
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec.reason).toBe(reason);
      // (b) composed PR body carries the reason
      expect(printed.join('\n')).toContain(`**Reason:** ${reason}`);
    })
  );

  it(
    'omits the reason field/line entirely when --reason is not given (#4)',
    withRoot(async (root) => {
      const io = fakeIo();
      const gh = fakeGh([]);
      const printed: string[] = [];
      await runRollbackEvaluate(
        { pr: 42, trigger: 'signal', dryRun: true },
        { io, gh, root, print: (s) => printed.push(s) }
      );
      const rec = JSON.parse(readFileSync(join(root, ROLLBACK_EVENTS_FILE), 'utf-8').trim());
      expect(rec.reason).toBeUndefined();
      expect(printed.join('\n')).not.toContain('**Reason:**');
    })
  );
});

describe('summarizeSweepReport (S4 observability)', () => {
  it('renders a non-crossing as an explicit "no crossing" line', () => {
    expect(
      summarizeSweepReport({ signal: 'errorRate', window: '7d', crossed: false, forwarded: [] })
    ).toBe('rollback sweep: errorRate (7d) — no crossing');
  });

  it('renders a crossing with each forwarded PR action + prUrl', () => {
    const line = summarizeSweepReport({
      signal: 'errorRate',
      window: '24h',
      crossed: true,
      forwarded: [
        { pr: 201, action: 'proposed', prUrl: 'https://gh/pr/201' },
        { pr: 202, action: 'skipped' },
      ],
    });
    expect(line).toContain('crossed');
    expect(line).toContain('#201 → proposed (https://gh/pr/201)');
    expect(line).toContain('#202 → skipped');
  });

  it('renders a crossing that forwarded no PRs', () => {
    expect(
      summarizeSweepReport({ signal: 'errorRate', window: '7d', crossed: true, forwarded: [] })
    ).toContain('crossed, no PRs in window');
  });
});

describe('runRollbackSweepCommand (I2 config-error visibility, S4 output)', () => {
  const okConfig = (signals: Record<string, SweepSignalRule>) =>
    Ok({ rollback: { signals } } as unknown as HarnessConfig);

  const baseDeps = () => {
    const info = vi.fn();
    const warn = vi.fn();
    // A runSweep test double that drives the injected report/evaluate seams so
    // we exercise the command's wiring without real gh/timeline.
    const runSweep = vi.fn(
      async (
        signals: Record<string, SweepSignalRule>,
        deps: {
          evaluate: (pr: number) => Promise<RollbackDecision>;
          report?: (r: unknown) => void;
        }
      ) => {
        for (const [signal, rule] of Object.entries(signals)) {
          // pretend a crossing forwarded PR 201
          const decision = await deps.evaluate(201);
          deps.report?.({
            signal,
            window: rule.window,
            crossed: true,
            forwarded: [
              {
                pr: 201,
                action: decision.action,
                ...(decision.prUrl ? { prUrl: decision.prUrl } : {}),
              },
            ],
          });
        }
      }
    );
    return { info, warn, runSweep };
  };

  it('I2: warns on stderr (breaker inactive) when config fails to resolve, still returns', async () => {
    const { info, warn, runSweep } = baseDeps();
    await expect(
      runRollbackSweepCommand({
        resolveConfig: () =>
          Err(new CLIError('Invalid config:\n  - rollback.signals.x.window: bad window')),
        runSweep: runSweep as never,
        makeReader: () => (() => []) as never,
        makeResolver: () => (async () => []) as never,
        evaluate: async () => ({}) as RollbackDecision,
        root: '/tmp/x',
        info,
        warn,
      })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('config error, breaker inactive');
    expect(warn.mock.calls[0]![0]).toContain('bad window');
    // Disarmed: no signals → sweep gets an empty map, nothing forwarded/logged.
    expect(runSweep).toHaveBeenCalledWith({}, expect.anything());
    expect(info).not.toHaveBeenCalled();
  });

  it('S4: emits a per-crossing summary line when a crossing forwards a PR', async () => {
    const { info, warn, runSweep } = baseDeps();
    await runRollbackSweepCommand({
      resolveConfig: () =>
        okConfig({ errorRate: { threshold: 5, direction: 'above', window: '7d' } }),
      runSweep: runSweep as never,
      makeReader: () => (() => []) as never,
      makeResolver: () => (async () => []) as never,
      evaluate: async (pr) =>
        ({ targetPr: pr, action: 'proposed', prUrl: 'https://gh/pr/900' }) as RollbackDecision,
      root: '/tmp/x',
      info,
      warn,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    const line = info.mock.calls[0]![0] as string;
    expect(line).toContain('errorRate');
    expect(line).toContain('#201 → proposed (https://gh/pr/900)');
  });
});
