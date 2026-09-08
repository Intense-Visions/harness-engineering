import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';

const computeHolidayConfidence = vi.fn();
const gatherSignals = vi.fn();

vi.mock('@harness-engineering/signals', () => ({
  computeHolidayConfidence: (...a: unknown[]) => computeHolidayConfidence(...a),
  gatherSignals: (...a: unknown[]) => gatherSignals(...a),
}));

const graphLoad = vi.fn();
const resolveGraphDir = vi.fn().mockReturnValue('/graph');
vi.mock('@harness-engineering/graph', () => ({
  GraphStore: class {
    load = (...a: unknown[]) => graphLoad(...a);
  },
  resolveGraphDir: (...a: unknown[]) => resolveGraphDir(...a),
}));

import { createHolidayConfidenceCommand } from '../../src/commands/holiday-confidence';
import { logger } from '../../src/output/logger';

let logOutput: string[];
const sink = (...a: unknown[]) => logOutput.push(a.map(String).join(' '));
const logSpy = vi.spyOn(console, 'log').mockImplementation(sink);
const infoSpy = vi.spyOn(logger, 'info').mockImplementation(sink as never);

function baseResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    value: 75,
    status: 'ok',
    windowDays: 30,
    confidentPrs: 3,
    mergedPrs: 4,
    criteria: {
      reviewFired: { passed: 4, total: 4 },
      outcomeEvalPassed: { passed: 3, total: 4, degraded: false },
      noBaselineAutoUpdate: { held: true, count: 0 },
      noSignalBreach: { held: true, breached: [] },
    },
    detail: 'looks good',
    notes: [],
    ...over,
  };
}

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.addCommand(createHolidayConfidenceCommand());
  parent.exitOverride();
  return parent.parseAsync(['holiday-confidence', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  resolveGraphDir.mockReturnValue('/graph');
  graphLoad.mockResolvedValue(true);
  computeHolidayConfidence.mockResolvedValue(baseResult());
});

afterAll(() => {
  logSpy.mockRestore();
  infoSpy.mockRestore();
});

describe('holiday-confidence (cov544)', () => {
  it('pretty output renders the KPI and criteria', async () => {
    await run([]);
    const out = logOutput.join('\n');
    expect(out).toContain('Holiday Confidence: 75%');
    expect(out).toContain('multi-persona review fired');
    expect(out).toContain('held');
  });

  it('null value renders "n/a"', async () => {
    computeHolidayConfidence.mockResolvedValue(baseResult({ value: null }));
    await run([]);
    expect(logOutput.join('\n')).toContain('Holiday Confidence: n/a');
  });

  it('degraded outcome-eval + breached criteria render their annotations', async () => {
    computeHolidayConfidence.mockResolvedValue(
      baseResult({
        criteria: {
          reviewFired: { passed: 1, total: 4 },
          outcomeEvalPassed: { passed: 0, total: 0, degraded: true },
          noBaselineAutoUpdate: { held: false, count: 2 },
          noSignalBreach: { held: false, breached: ['coverage', 'complexity'] },
        },
        notes: ['note one', 'note two'],
      })
    );
    await run([]);
    const out = logOutput.join('\n');
    expect(out).toContain('degraded: no outcome data');
    expect(out).toContain('BREACHED');
    expect(out).toContain('count=2');
    expect(out).toContain('coverage, complexity');
    expect(out).toContain('note one');
  });

  it('noBaselineAutoUpdate with null count omits the count suffix', async () => {
    computeHolidayConfidence.mockResolvedValue(
      baseResult({
        criteria: {
          reviewFired: { passed: 4, total: 4 },
          outcomeEvalPassed: { passed: 3, total: 4, degraded: false },
          noBaselineAutoUpdate: { held: true, count: null },
          noSignalBreach: { held: true, breached: [] },
        },
      })
    );
    await run([]);
    expect(logOutput.join('\n')).not.toContain('count=');
  });

  it('--json emits the raw result and skips pretty rendering', async () => {
    await run(['--json']);
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed.value).toBe(75);
    expect(logOutput.join('\n')).not.toContain('Holiday Confidence:');
  });

  it('--window parses to a positive integer and is forwarded', async () => {
    await run(['--window', '14.9']);
    expect(computeHolidayConfidence).toHaveBeenCalledWith(
      expect.objectContaining({ windowDays: 14 })
    );
  });

  it('invalid --window falls back to 30', async () => {
    await run(['--window', 'abc']);
    expect(computeHolidayConfidence).toHaveBeenCalledWith(
      expect.objectContaining({ windowDays: 30 })
    );
  });

  it('forwards a loaded graph store', async () => {
    graphLoad.mockResolvedValue(true);
    await run([]);
    expect(computeHolidayConfidence).toHaveBeenCalledWith(
      expect.objectContaining({ graphStore: expect.anything() })
    );
  });

  it('omits the graph store when the graph fails to load', async () => {
    graphLoad.mockResolvedValue(false);
    await run([]);
    const arg = computeHolidayConfidence.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('graphStore');
  });

  it('omits the graph store when the graph import/load throws', async () => {
    graphLoad.mockRejectedValue(new Error('bad graph'));
    await run(['--path', '/somewhere']);
    const arg = computeHolidayConfidence.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty('graphStore');
    expect(arg.projectPath).toBe('/somewhere');
  });
});
