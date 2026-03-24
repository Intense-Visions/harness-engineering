import { groupNodesByImpact } from '@harness-engineering/graph';
import { GraphStore } from '@harness-engineering/graph';

export async function generateImpactData(store: GraphStore, file: string) {
  try {
    const nodes = store.findNodes({});
    const impact = groupNodesByImpact(nodes, file);
    return impact;
  } catch (error) {
    console.error('Impact analysis failed', error);
    return { direct: [], transitive: [] };
  }
}

