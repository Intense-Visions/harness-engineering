import { GraphStore } from '@harness-engineering/graph';
import { BlueprintModule, Hotspot, ModuleDependency } from './types';

export class GraphScanner {
  constructor(private store: GraphStore) {}

  async scan(): Promise<{
    modules: BlueprintModule[];
    hotspots: Hotspot[];
    dependencies: ModuleDependency[];
  }> {
    const modules = this.store.findNodes({ type: 'module' });
    const dependencies = this.store.getEdges({ type: 'imports' });

    return {
      modules: modules.map((m) => ({
        id: m.id,
        title: m.name ?? 'Unnamed Module',
        description: (m.metadata?.description as string) || '',
        files: (m.metadata?.files as string[]) || [],
      })),
      hotspots: [],
      dependencies: dependencies.map((d) => ({
        from: d.from,
        to: d.to,
      })),
    };
  }
}
