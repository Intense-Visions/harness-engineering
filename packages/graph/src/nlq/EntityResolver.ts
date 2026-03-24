import type { GraphStore } from '../store/GraphStore.js';
import type { FusionLayer } from '../search/FusionLayer.js';
import type { ResolvedEntity } from './types.js';

/**
 * Resolves raw entity strings to graph nodes using a 3-step fuzzy cascade:
 *
 * 1. Exact name match via store.findNodes({ name })
 * 2. FusionLayer search (if provided), take top result if score > 0.5
 * 3. Path match on file nodes via path.includes(raw)
 *
 * Each step tags its match with method and confidence.
 * Unresolved entities are silently omitted from results.
 */
export class EntityResolver {
  private readonly store: GraphStore;
  private readonly fusion: FusionLayer | undefined;

  constructor(store: GraphStore, fusion?: FusionLayer) {
    this.store = store;
    this.fusion = fusion;
  }

  /**
   * Resolve an array of raw entity strings to graph nodes.
   *
   * @param raws - Raw entity strings from EntityExtractor
   * @returns Array of ResolvedEntity for each successfully resolved raw string
   */
  resolve(raws: readonly string[]): readonly ResolvedEntity[] {
    const results: ResolvedEntity[] = [];

    for (const raw of raws) {
      const resolved = this.resolveOne(raw);
      if (resolved !== undefined) {
        results.push(resolved);
      }
    }

    return results;
  }

  private resolveOne(raw: string): ResolvedEntity | undefined {
    // Step 1: Exact name match
    const exactMatches = this.store.findNodes({ name: raw });
    if (exactMatches.length > 0) {
      const node = exactMatches[0]!;
      return {
        raw,
        nodeId: node.id,
        node,
        confidence: 1.0,
        method: 'exact',
      };
    }

    // Step 2: FusionLayer search (if provided)
    if (this.fusion) {
      const fusionResults = this.fusion.search(raw, 5);
      if (fusionResults.length > 0 && fusionResults[0]!.score > 0.5) {
        const top = fusionResults[0]!;
        return {
          raw,
          nodeId: top.nodeId,
          node: top.node,
          confidence: top.score,
          method: 'fusion',
        };
      }
    }

    // Step 3: Path match on file nodes
    // Require either: raw contains '/' (path-like), or raw matches a path basename,
    // or raw is long enough (>= 4 chars) to avoid false positives on short strings like "src", "api"
    if (raw.length < 3) return undefined;
    const isPathLike = raw.includes('/');
    const fileNodes = this.store.findNodes({ type: 'file' });
    for (const node of fileNodes) {
      if (!node.path) continue;
      if (isPathLike && node.path.includes(raw)) {
        return { raw, nodeId: node.id, node, confidence: 0.6, method: 'path' };
      }
      // For non-path strings, match against the basename or require longer substring
      const basename = node.path.split('/').pop() ?? '';
      if (basename.includes(raw)) {
        return { raw, nodeId: node.id, node, confidence: 0.6, method: 'path' };
      }
      if (raw.length >= 4 && node.path.includes(raw)) {
        return { raw, nodeId: node.id, node, confidence: 0.6, method: 'path' };
      }
    }

    return undefined;
  }
}
