/**
 * Community detection over a knowledge graph.
 *
 * A `CommunityDetector` partitions a graph into communities (densely-connected
 * subsystems) so downstream consumers can label nodes with the subsystem they
 * belong to. The interface is deliberately algorithm-agnostic: the shipped
 * implementation is {@link LouvainDetector} (modularity maximization), and a
 * Leiden detector can be added later behind this same interface with zero
 * rework at the call sites. See ADR 0104 (graphify-adoption).
 */

/** A single undirected, optionally-weighted edge fed to a detector. */
export interface CommunityEdgeInput {
  readonly source: string;
  readonly target: string;
  /** Edge weight for modularity. Defaults to 1 when omitted. */
  readonly weight?: number;
}

/**
 * Algorithm-neutral graph input for community detection.
 *
 * Kept intentionally minimal (node ids + weighted edges) so detectors are
 * decoupled from `GraphStore` and trivially constructible in unit tests.
 * Build one from a store with {@link buildCommunityInput}.
 */
export interface CommunityGraphInput {
  readonly nodeIds: readonly string[];
  readonly edges: readonly CommunityEdgeInput[];
}

/** Options that tune a detection run. */
export interface CommunityDetectorOptions {
  /**
   * Seed for the tie-break / node-processing order. Detection is deterministic:
   * the same seed (or no seed) over the same graph always yields the same
   * labeling. Provided purely to let callers explore alternative stable orders.
   */
  readonly seed?: number;
  /** Safety cap on local-move passes per aggregation level. Defaults to 32. */
  readonly maxPasses?: number;
  /**
   * Resolution parameter (gamma). >1 favors smaller communities, <1 larger
   * ones. Defaults to 1 (classic modularity).
   */
  readonly resolution?: number;
}

/** Community assignment for one node. */
export interface CommunityAssignment {
  readonly nodeId: string;
  /** Canonical community id in `[0, communityCount)`. */
  readonly community: number;
}

/** Result of a detection run. */
export interface CommunityDetectionResult {
  readonly assignments: readonly CommunityAssignment[];
  /** Number of distinct communities produced. */
  readonly communityCount: number;
  /** Final modularity of the partition (higher = better separated). */
  readonly modularity: number;
}

/**
 * A pluggable community-detection algorithm.
 *
 * Implementations must be deterministic given `options.seed` (or its absence):
 * a fully-connected clique collapses to a single community, a graph of clearly
 * separable clusters yields one community per cluster, and repeated runs return
 * identical labels.
 */
export interface CommunityDetector {
  /** Stable identifier, e.g. `'louvain'`. */
  readonly name: string;
  detect(input: CommunityGraphInput, options?: CommunityDetectorOptions): CommunityDetectionResult;
}
