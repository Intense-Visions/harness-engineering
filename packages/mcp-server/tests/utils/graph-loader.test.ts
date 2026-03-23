import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// Mock @harness-engineering/graph
const mockLoad = vi.fn().mockResolvedValue(true);
let constructorCallCount = 0;

class MockGraphStore {
  load = mockLoad;
  nodeCount = 5;
  constructor() {
    constructorCallCount++;
  }
}

vi.mock('@harness-engineering/graph', () => ({
  GraphStore: MockGraphStore,
}));

// Mock fs/promises for stat
const mockStat = vi.fn();
vi.mock('fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}));

import { loadGraphStore, clearGraphStoreCache } from '../../src/utils/graph-loader.js';

describe('loadGraphStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGraphStoreCache();
    constructorCallCount = 0;
  });

  it('returns a GraphStore on first call', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    const store = await loadGraphStore('/project');
    expect(store).not.toBeNull();
    expect(constructorCallCount).toBe(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('returns cached instance on second call with same mtime', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    const store1 = await loadGraphStore('/project');
    const store2 = await loadGraphStore('/project');
    expect(store1).toBe(store2);
    expect(constructorCallCount).toBe(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('cached call completes in <5ms', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    await loadGraphStore('/project');
    const start = performance.now();
    await loadGraphStore('/project');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });

  it('reloads when mtime changes', async () => {
    mockStat.mockResolvedValueOnce({ mtimeMs: 1000 });
    await loadGraphStore('/project');
    mockStat.mockResolvedValueOnce({ mtimeMs: 2000 });
    await loadGraphStore('/project');
    expect(constructorCallCount).toBe(2);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('returns null when load fails and does not cache the null result', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    mockLoad.mockResolvedValueOnce(false);
    const store = await loadGraphStore('/project');
    expect(store).toBeNull();

    // Second call should retry loading, not return cached null
    mockLoad.mockResolvedValueOnce(true);
    const store2 = await loadGraphStore('/project');
    expect(store2).not.toBeNull();
    expect(constructorCallCount).toBe(2);
  });

  it('returns null when graph.json does not exist (stat throws)', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    const store = await loadGraphStore('/project');
    expect(store).toBeNull();
  });

  it('caches by path -- different paths get different instances', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    const store1 = await loadGraphStore('/project-a');
    const store2 = await loadGraphStore('/project-b');
    expect(store1).not.toBe(store2);
    expect(constructorCallCount).toBe(2);
  });
});
