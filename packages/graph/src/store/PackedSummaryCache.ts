import type { GraphStore } from './GraphStore.js';

/** Minimal PackedEnvelope shape -- avoids circular dep on @harness-engineering/core */
interface PackedEnvelope {
  meta: {
    strategy: string[];
    originalTokenEstimate: number;
    compactedTokenEstimate: number;
    reductionPct: number;
    cached: boolean;
  };
  sections: Array<{
    source: string;
    content: string;
  }>;
}

export type { PackedEnvelope as CacheableEnvelope };

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Normalize an intent string for deterministic cache keying.
 * Lowercases, trims, and collapses multiple spaces.
 */
export function normalizeIntent(intent: string): string {
  return intent.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheNodeId(normalizedIntent: string): string {
  return `packed_summary:${normalizedIntent}`;
}

/**
 * PackedSummaryCache reads and writes PackedSummary nodes in the GraphStore.
 *
 * Cache validity is determined by:
 * 1. TTL: node must have been created within the last hour
 * 2. Source freshness: all source nodes linked via `caches` edges must have
 *    `lastModified` timestamps older than the cache creation time
 */
export class PackedSummaryCache {
  constructor(
    private readonly store: GraphStore,
    private readonly ttlMs: number = DEFAULT_TTL_MS
  ) {}

  /**
   * Check cache for a packed summary matching the intent.
   * Returns the envelope with `cached: true` if valid, or null if miss/stale.
   */
  get(intent: string): PackedEnvelope | null {
    const normalized = normalizeIntent(intent);
    const nodeId = cacheNodeId(normalized);
    const node = this.store.getNode(nodeId);

    if (!node) return null;

    const createdAt = node.metadata['createdAt'] as string | undefined;
    if (!createdAt) return null;

    const createdMs = new Date(createdAt).getTime();

    // Check TTL
    if (Date.now() - createdMs > this.ttlMs) {
      return null;
    }

    // Check source freshness via caches edges
    const edges = this.store.getEdges({ from: nodeId, type: 'caches' });
    for (const edge of edges) {
      const sourceNode = this.store.getNode(edge.to);
      if (sourceNode?.lastModified) {
        const sourceModMs = new Date(sourceNode.lastModified).getTime();
        if (sourceModMs > createdMs) {
          return null; // source was modified after cache was created
        }
      }
    }

    // Parse and return envelope with cached: true
    try {
      const envelope = JSON.parse(node.metadata['envelope'] as string) as PackedEnvelope;
      return {
        ...envelope,
        meta: { ...envelope.meta, cached: true },
      };
    } catch {
      return null;
    }
  }

  /**
   * Write a PackedSummary node to the graph with caches edges to source nodes.
   */
  set(intent: string, envelope: PackedEnvelope, sourceNodeIds: string[]): void {
    const normalized = normalizeIntent(intent);
    const nodeId = cacheNodeId(normalized);

    // Remove existing node (and its edges) before writing fresh
    this.store.removeNode(nodeId);

    this.store.addNode({
      id: nodeId,
      type: 'packed_summary',
      name: normalized,
      metadata: {
        envelope: JSON.stringify(envelope),
        createdAt: new Date().toISOString(),
      },
    });

    for (const sourceId of sourceNodeIds) {
      this.store.addEdge({
        from: nodeId,
        to: sourceId,
        type: 'caches',
      });
    }
  }

  /**
   * Explicitly invalidate a cached packed summary.
   */
  invalidate(intent: string): void {
    const normalized = normalizeIntent(intent);
    const nodeId = cacheNodeId(normalized);
    this.store.removeNode(nodeId);
  }
}
