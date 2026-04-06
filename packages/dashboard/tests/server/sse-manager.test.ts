import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEManager } from '../../src/server/sse';
import type { ServerContext } from '../../src/server/context';
import { DataCache } from '../../src/server/cache';

// Minimal fake SSEStreamingApi
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
    cache: new DataCache(60_000),
    pollIntervalMs: 100,
  };
}

describe('SSEManager', () => {
  let manager: SSEManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SSEManager();
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  it('starts with zero connections', () => {
    expect(manager.connectionCount).toBe(0);
  });

  it('adds a connection and increments count', () => {
    const stream = makeStream() as never;
    const ctx = makeContext();
    manager.addConnection(stream, ctx);
    expect(manager.connectionCount).toBe(1);
  });

  it('removes a connection when stream aborts', () => {
    const stream = makeStream();
    const ctx = makeContext();
    manager.addConnection(stream as never, ctx);
    stream.simulateAbort();
    expect(manager.connectionCount).toBe(0);
  });

  it('stops the polling loop when all clients disconnect', () => {
    const stream = makeStream();
    const ctx = makeContext();
    manager.addConnection(stream as never, ctx);
    expect(manager.isRunning).toBe(true);
    stream.simulateAbort();
    expect(manager.isRunning).toBe(false);
  });

  it('broadcasts to all connected streams on tick', async () => {
    const stream1 = makeStream();
    const stream2 = makeStream();
    const ctx = makeContext();

    // Mock gatherers to avoid real FS calls
    vi.mock('../../src/server/gather/roadmap', () => ({
      gatherRoadmap: vi.fn().mockResolvedValue({ error: 'skipped' }),
    }));
    vi.mock('../../src/server/gather/health', () => ({
      gatherHealth: vi.fn().mockResolvedValue({ error: 'skipped' }),
    }));
    vi.mock('../../src/server/gather/graph', () => ({
      gatherGraph: vi.fn().mockResolvedValue({ available: false, reason: 'skipped' }),
    }));

    manager.addConnection(stream1 as never, ctx);
    manager.addConnection(stream2 as never, ctx);

    // Advance past one poll interval (100ms) to trigger one tick
    await vi.advanceTimersByTimeAsync(150);

    expect(stream1.writeSSE).toHaveBeenCalled();
    expect(stream2.writeSSE).toHaveBeenCalled();
  });
});
