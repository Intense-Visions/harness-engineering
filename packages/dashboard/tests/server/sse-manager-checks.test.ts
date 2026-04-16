import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEManager } from '../../src/server/sse';
import type { ServerContext } from '../../src/server/context';
import { DataCache } from '../../src/server/cache';
import { GatherCache } from '../../src/server/gather-cache';

vi.mock('../../src/server/gather/roadmap', () => ({
  gatherRoadmap: vi.fn().mockResolvedValue({ error: 'skipped' }),
}));
vi.mock('../../src/server/gather/health', () => ({
  gatherHealth: vi.fn().mockResolvedValue({ error: 'skipped' }),
}));
vi.mock('../../src/server/gather/graph', () => ({
  gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'skipped' }),
}));
vi.mock('../../src/server/gather/security', () => ({
  gatherSecurity: vi.fn().mockResolvedValue({
    valid: true,
    findings: [],
    stats: { filesScanned: 0, errorCount: 0, warningCount: 0, infoCount: 0 },
  }),
}));
vi.mock('../../src/server/gather/perf', () => ({
  gatherPerf: vi.fn().mockResolvedValue({
    valid: true,
    violations: [],
    stats: { filesAnalyzed: 0, violationCount: 0 },
  }),
}));
vi.mock('../../src/server/gather/arch', () => ({
  gatherArch: vi
    .fn()
    .mockResolvedValue({ passed: true, totalViolations: 0, regressions: [], newViolations: [] }),
}));
vi.mock('../../src/server/gather/anomalies', () => ({
  gatherAnomalies: vi
    .fn()
    .mockResolvedValue({ outliers: [], articulationPoints: [], overlapCount: 0 }),
}));

function makeStream() {
  return {
    aborted: false,
    closed: false,
    _abortListeners: [] as (() => void)[],
    onAbort(fn: () => void) {
      this._abortListeners.push(fn);
    },
    writeSSE: vi.fn().mockResolvedValue(undefined),
    simulateAbort() {
      this.aborted = true;
      for (const fn of this._abortListeners) fn();
    },
  };
}

function makeContext(): ServerContext {
  return {
    projectPath: '/fake',
    roadmapPath: '/fake/docs/roadmap.md',
    chartsPath: '/fake/docs/roadmap-charts.md',
    cache: new DataCache(60_000),
    pollIntervalMs: 100,
    sseManager: undefined!,
    gatherCache: new GatherCache(),
  };
}

describe('SSEManager on-demand gather', () => {
  let manager: SSEManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SSEManager();
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('runs expensive gatherers on first tick and emits checks event', async () => {
    const stream = makeStream();
    const ctx = makeContext();
    manager.addConnection(stream as never, ctx);

    await vi.advanceTimersByTimeAsync(150);

    // Should have two writeSSE calls: overview + checks
    expect(stream.writeSSE).toHaveBeenCalledTimes(2);
    const calls = stream.writeSSE.mock.calls;
    const events = calls.map((c: unknown[]) => JSON.parse((c[0] as { data: string }).data));
    const types = events.map((e: { type: string }) => e.type);
    expect(types).toContain('overview');
    expect(types).toContain('checks');
  });

  it('does not re-run expensive gatherers on second tick', async () => {
    const { gatherSecurity } = await import('../../src/server/gather/security');
    const stream = makeStream();
    const ctx = makeContext();
    manager.addConnection(stream as never, ctx);

    // First tick
    await vi.advanceTimersByTimeAsync(150);
    const callsAfterFirst = (gatherSecurity as ReturnType<typeof vi.fn>).mock.calls.length;

    // Reset writeSSE to track second tick only
    stream.writeSSE.mockClear();

    // Second tick
    await vi.advanceTimersByTimeAsync(150);

    // gatherSecurity should NOT have been called again
    expect((gatherSecurity as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);

    // Second tick emits overview + cached checks (replay for late-connecting clients)
    const calls = stream.writeSSE.mock.calls;
    const events = calls.map((c: unknown[]) => JSON.parse((c[0] as { data: string }).data));
    const types = events.map((e: { type: string }) => e.type);
    expect(types).toContain('overview');
    expect(types).toContain('checks');
  });
});
