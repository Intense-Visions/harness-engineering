import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { createHolidayConfidenceCommand } from './holiday-confidence';

/**
 * Regression contract for `harness holiday-confidence --json`.
 *
 * The weekly Holiday Confidence Tracker workflow pipes this command's stdout
 * straight into `JSON.parse`. `--json` is ALSO declared on the root program
 * (src/index.ts), and commander binds a repeated flag to the first command that
 * declared it — so the subcommand's own `opts.json` is always undefined when the
 * flag is typed after the subcommand name. Reading only the action's `opts` made
 * `--json` a silent no-op, the tracker's parse threw on the pretty-text render,
 * and the ledger recorded nothing on every run since the workflow shipped.
 *
 * These tests pin the fix by parsing through a ROOT PROGRAM that declares the
 * same `--json` flag — the only arrangement in which the shadowing reproduces.
 */

const hoisted = vi.hoisted(() => ({
  computeMock: vi.fn(),
}));

vi.mock('@harness-engineering/signals', () => ({
  computeHolidayConfidence: hoisted.computeMock,
  gatherSignals: vi.fn(),
}));

// Keep the run hermetic: the command best-effort loads the graph for the
// per-PR outcome linkage. Stub it so no graph directory is read from disk.
vi.mock('@harness-engineering/graph', () => ({
  GraphStore: class {
    load = vi.fn().mockResolvedValue(false);
  },
  resolveGraphDir: vi.fn(() => '/tmp/does-not-exist'),
}));

const RESULT = {
  value: 87,
  status: 'ok',
  windowDays: 30,
  mergedPrs: 8,
  confidentPrs: 7,
  generatedAt: '2026-09-07T00:00:00.000Z',
  detail: 'detail line',
  notes: [],
  criteria: {
    reviewFired: { passed: 7, total: 8 },
    outcomeEvalPassed: { passed: 7, total: 8, degraded: false },
    noBaselineAutoUpdate: { held: true, count: 0 },
    noSignalBreach: { held: true, breached: [] },
  },
};

/** A root program shaped like the real CLI: it declares `--json` too. */
function programWithGlobalJson(): Command {
  const program = new Command();
  program.name('harness').option('--json', 'Output as JSON').exitOverride();
  program.addCommand(createHolidayConfidenceCommand());
  return program;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  hoisted.computeMock.mockReset();
  hoisted.computeMock.mockResolvedValue(RESULT);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function stdout(): string {
  return logSpy.mock.calls.map((c: unknown[]) => (typeof c[0] === 'string' ? c[0] : '')).join('\n');
}

describe('harness holiday-confidence --json', () => {
  it('emits parseable JSON even though the root program also declares --json', async () => {
    await programWithGlobalJson().parseAsync(['holiday-confidence', '--json'], { from: 'user' });

    // The whole point: the tracker workflow does exactly this.
    const parsed = JSON.parse(stdout());
    expect(parsed.value).toBe(87);
    expect(parsed.status).toBe('ok');
  });

  it('still emits JSON when --json is given before the subcommand', async () => {
    await programWithGlobalJson().parseAsync(['--json', 'holiday-confidence'], { from: 'user' });

    expect(JSON.parse(stdout()).value).toBe(87);
  });

  it('renders pretty text (not JSON) when --json is absent', async () => {
    await programWithGlobalJson().parseAsync(['holiday-confidence'], { from: 'user' });

    const out = stdout();
    expect(out).toContain('(a) multi-persona review fired');
    expect(() => JSON.parse(out)).toThrow();
  });

  it('passes --window through to the computation', async () => {
    await programWithGlobalJson().parseAsync(['holiday-confidence', '--window', '7', '--json'], {
      from: 'user',
    });

    expect(hoisted.computeMock).toHaveBeenCalledWith(expect.objectContaining({ windowDays: 7 }));
  });
});
