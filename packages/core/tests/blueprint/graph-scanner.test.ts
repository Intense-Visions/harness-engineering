import { describe, it, expect, vi } from 'vitest';
import { GraphScanner } from '../../src/blueprint/graph-scanner';
import { GraphStore } from '@harness-engineering/graph';

describe('GraphScanner', () => {
  it('should scan modules and dependencies from graph store', async () => {
    const mockStore = {
      query: vi.fn().mockImplementation((q) => {
        if (q === 'nodes:module') return [{ id: 'm1', name: 'Core', description: 'Core' }];
        if (q === 'edges:import') return [{ from: 'm1', to: 'm2' }];
        return [];
      })
    } as unknown as GraphStore;

    const scanner = new GraphScanner(mockStore);
    const data = await scanner.scan();

    expect(data.modules.length).toBe(1);
    expect(data.dependencies.length).toBe(1);
  });
});
