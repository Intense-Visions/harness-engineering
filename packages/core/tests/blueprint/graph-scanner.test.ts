import { describe, it, expect, vi } from 'vitest';
import { GraphScanner } from '../../src/blueprint/graph-scanner';
import { GraphStore } from '@harness-engineering/graph';

describe('GraphScanner', () => {
  it('should scan modules and dependencies from graph store', async () => {
    const mockStore = {
      findNodes: vi.fn().mockImplementation((q) => {
        if (q.type === 'module')
          return [{ id: 'm1', name: 'Core', metadata: { description: 'Core', files: [] } }];
        return [];
      }),
      getEdges: vi.fn().mockImplementation((q) => {
        if (q.type === 'imports') return [{ from: 'm1', to: 'm2' }];
        return [];
      }),
    } as unknown as GraphStore;

    const scanner = new GraphScanner(mockStore);
    const data = await scanner.scan();

    expect(data.modules.length).toBe(1);
    expect(data.dependencies.length).toBe(1);
  });
});
