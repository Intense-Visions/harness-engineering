import type { GraphStore } from '../store/GraphStore.js';
import type {
  CommunityDetector,
  CommunityDetectionResult,
  CommunityDetectorOptions,
  CommunityGraphInput,
} from './CommunityDetector.js';
import { LouvainDetector } from './LouvainDetector.js';

/**
 * Build the algorithm-neutral {@link CommunityGraphInput} from a built
 * `GraphStore`. Every node becomes a candidate; every edge becomes an
 * undirected link weighted by its `confidence` (defaulting to 1 when absent),
 * matching the modularity convention that stronger relationships pull nodes
 * together more.
 */
export function buildCommunityInput(store: GraphStore): CommunityGraphInput {
  const nodeIds = store.findNodes({}).map((n) => n.id);
  const edges = store.getEdges({}).map((e) => ({
    source: e.from,
    target: e.to,
    weight: e.confidence ?? 1,
  }));
  return { nodeIds, edges };
}

/** Options for {@link detectCommunities}. */
export interface DetectCommunitiesOptions extends CommunityDetectorOptions {
  /** Detector to use. Defaults to {@link LouvainDetector}. */
  readonly detector?: CommunityDetector;
  /**
   * When true (default), the resulting community id is written onto each node's
   * `community` field in the store. Set false to compute without mutating.
   */
  readonly persist?: boolean;
}

/**
 * Run community detection over a built `GraphStore` and (by default) persist the
 * resulting community id onto each node's optional `community` field. Returns
 * the full labeling so callers can inspect modularity and community count.
 *
 * Nodes are labeled back-compatibly: the field is optional and additive, so
 * existing readers and serialized graphs are unaffected until they opt in.
 */
export function detectCommunities(
  store: GraphStore,
  options: DetectCommunitiesOptions = {}
): CommunityDetectionResult {
  const detector = options.detector ?? new LouvainDetector();
  const input = buildCommunityInput(store);
  const result = detector.detect(input, options);

  if (options.persist !== false) {
    for (const { nodeId, community } of result.assignments) {
      const node = store.getNode(nodeId);
      if (node) store.addNode({ ...node, community });
    }
  }

  return result;
}
