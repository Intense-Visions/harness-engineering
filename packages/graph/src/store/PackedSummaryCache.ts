import type { GraphStore } from './GraphStore.js';

/**
 * Minimal PackedEnvelope shape -- avoids circular dep on @harness-engineering/core.
 * Canonical type: packages/core/src/compaction/envelope.ts — keep in sync.
 */
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

/** Normalize an intent string for deterministic cache keying. */
export function normalizeIntent(intent: string): string {
  return intent.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheNodeId(normalizedIntent: string): string {
  return `packed_summary:${normalizedIntent}`;
}

/** Reads/writes PackedSummary nodes in the GraphStore. Validates via TTL + source freshness. */
export class PackedSummaryCache {
  constructor(
    private readonly store: GraphStore,
    private readonly ttlMs: number = DEFAULT_TTL_MS
  ) {}

  /** Returns cached envelope with `cached: true` if valid, or null if miss/stale. */
  get(intent: string): PackedEnvelope | null {
    const normalized = normalizeIntent(intent);
    const nodeId = cacheNodeId(normalized);
    const node = this.store.getNode(nodeId);

    if (!node) return null;

    const createdMs = this.parseCreatedMs(node.metadata['createdAt'] as string | undefined);
    if (createdMs === null) return null;
    if (Date.now() - createdMs > this.ttlMs) return null;
    if (!this.areSourcesFresh(nodeId, node, createdMs)) return null;

    return this.parseEnvelope(node.metadata['envelope'] as string);
  }

  /** Parse and validate createdAt. Returns epoch ms or null if missing/malformed (GC-002). */
  private parseCreatedMs(createdAt: string | undefined): number | null {
    if (!createdAt) return null;
    const ms = new Date(createdAt).getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  /** GC-001: Checks source nodes exist and are unmodified since cache creation. */
  private areSourcesFresh(
    nodeId: string,
    node: { metadata: Record<string, unknown> },
    createdMs: number
  ): boolean {
    const sourceNodeIds = node.metadata['sourceNodeIds'] as string[] | undefined;
    const edges = this.store.getEdges({ from: nodeId, type: 'caches' });

    if (sourceNodeIds && edges.length < sourceNodeIds.length) return false;

    for (const edge of edges) {
      const sourceNode = this.store.getNode(edge.to);
      if (!sourceNode) return false;
      if (sourceNode.lastModified) {
        const sourceModMs = new Date(sourceNode.lastModified).getTime();
        if (sourceModMs > createdMs) return false;
      }
    }
    return true;
  }

  /** Parse envelope JSON and set cached: true. Returns null on invalid JSON. */
  private parseEnvelope(raw: string): PackedEnvelope | null {
    try {
      const envelope = JSON.parse(raw) as PackedEnvelope;
      return { ...envelope, meta: { ...envelope.meta, cached: true } };
    } catch {
      return null;
    }
  }

  /** Write a PackedSummary node with caches edges to source nodes. */
  set(intent: string, envelope: PackedEnvelope, sourceNodeIds: string[]): void {
    const normalized = normalizeIntent(intent);
    const nodeId = cacheNodeId(normalized);

    this.store.removeNode(nodeId); // clear stale node + edges

    this.store.addNode({
      id: nodeId,
      type: 'packed_summary',
      name: normalized,
      metadata: {
        envelope: JSON.stringify(envelope),
        createdAt: new Date().toISOString(),
        sourceNodeIds,
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

  /** Explicitly invalidate a cached packed summary. */
  invalidate(intent: string): void {
    const normalized = normalizeIntent(intent);
    const nodeId = cacheNodeId(normalized);
    this.store.removeNode(nodeId);
  }
}
