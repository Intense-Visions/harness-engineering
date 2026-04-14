import type { GraphStore } from '@harness-engineering/graph';
import { CascadeSimulator } from '@harness-engineering/graph';
import type { AffectedSystem } from '../types.js';

/**
 * Validates affected systems against the knowledge graph.
 *
 * For each system name from the LLM output, searches the graph for matching
 * module or file nodes and enriches with transitive dependencies, test coverage,
 * and ownership information.
 */
export class GraphValidator {
  private readonly store: GraphStore;
  private cachedModuleNodes: ReturnType<GraphStore['findNodes']> | null = null;
  private cachedFileNodes: ReturnType<GraphStore['findNodes']> | null = null;

  constructor(store: GraphStore) {
    this.store = store;
  }

  /**
   * Validate and enrich a list of affected system names against the graph.
   */
  validate(systems: Array<{ name: string }>): AffectedSystem[] {
    // Cache node lists for the duration of this validation pass
    this.cachedModuleNodes = this.store.findNodes({ type: 'module' });
    this.cachedFileNodes = this.store.findNodes({ type: 'file' });
    const result = systems.map((system) => this.resolveSystem(system.name));
    // Release cache after validation
    this.cachedModuleNodes = null;
    this.cachedFileNodes = null;
    return result;
  }

  private resolveSystem(name: string): AffectedSystem {
    // Use cached node lists (populated by validate())
    const moduleNodes = this.cachedModuleNodes ?? this.store.findNodes({ type: 'module' });
    const fileNodes = this.cachedFileNodes ?? this.store.findNodes({ type: 'file' });
    const candidates = [...moduleNodes, ...fileNodes];

    // Find the best fuzzy match
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    let bestMatch: { id: string; name: string; score: number } | null = null;

    for (const node of candidates) {
      const normalizedNodeName = node.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const score = this.fuzzyScore(normalizedName, normalizedNodeName);
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: node.id, name: node.name, score };
      }
    }

    if (!bestMatch || bestMatch.score < 0.4) {
      return {
        name,
        graphNodeId: null,
        confidence: 0,
        transitiveDeps: [],
        testCoverage: 0,
        owner: null,
      };
    }

    // Resolve transitive dependencies via CascadeSimulator
    const transitiveDeps = this.resolveTransitiveDeps(bestMatch.id);

    // Query test coverage
    const testCoverage = this.resolveTestCoverage(bestMatch.id);

    // Query owner from node metadata
    const owner = this.resolveOwner(bestMatch.id);

    return {
      name,
      graphNodeId: bestMatch.id,
      confidence: bestMatch.score,
      transitiveDeps,
      testCoverage,
      owner,
    };
  }

  /**
   * Simple fuzzy scoring: exact match = 1, contains = 0.7, substring overlap.
   */
  private fuzzyScore(query: string, candidate: string): number {
    if (query === candidate) return 1;
    if (candidate.includes(query)) return 0.8;
    if (query.includes(candidate)) return 0.7;

    // Check for significant overlap
    const shorter = query.length < candidate.length ? query : candidate;
    const longer = query.length < candidate.length ? candidate : query;
    let matches = 0;
    for (let i = 0; i <= longer.length - shorter.length; i++) {
      let current = 0;
      for (let j = 0; j < shorter.length && i + j < longer.length; j++) {
        if (shorter[j] === longer[i + j]) current++;
      }
      matches = Math.max(matches, current);
    }
    return shorter.length > 0 ? matches / longer.length : 0;
  }

  private resolveTransitiveDeps(nodeId: string): string[] {
    try {
      const simulator = new CascadeSimulator(this.store);
      const result = simulator.simulate(nodeId, {
        maxDepth: 3,
        probabilityFloor: 0.1,
      });
      return result.flatSummary.map((n) => n.nodeId);
    } catch {
      return [];
    }
  }

  private resolveTestCoverage(nodeId: string): number {
    // Find test nodes that reference this node via 'tested_by' or 'verified_by' edges
    const testedByEdges = this.store.getEdges({ from: nodeId, type: 'tested_by' });
    const verifiedByEdges = this.store.getEdges({ from: nodeId, type: 'verified_by' });
    return testedByEdges.length + verifiedByEdges.length;
  }

  private resolveOwner(nodeId: string): string | null {
    const node = this.store.getNode(nodeId);
    if (!node) return null;
    const owner = node.metadata?.['owner'];
    return typeof owner === 'string' ? owner : null;
  }
}
