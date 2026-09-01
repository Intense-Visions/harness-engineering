import type { GraphNode, NodeType } from '../types.js';

/**
 * Stability tiers, in strictly descending stability order (lower index = more
 * stable = belongs earlier in the serialized context so the cacheable prefix is
 * maximal by construction).
 *
 * Prompt caching serves the longest prefix that is byte-identical to a previous
 * request. Interleaving volatile per-turn content with immutable knowledge means
 * a single early change invalidates the cached prefix for everything after it.
 * Ordering by descending stability pushes the churn to the tail, so the stable
 * head stays cacheable across turns.
 */
export enum StabilityTier {
  /** Tool schemas + immutable knowledge — changes across releases, not turns. */
  IMMUTABLE = 0,
  /** Slow-moving conventions — structural code that changes over days/weeks. */
  CONVENTION = 1,
  /** Session state — code under active work this session. */
  SESSION = 2,
  /** Per-turn state — runtime signals that change every turn. */
  VOLATILE = 3,
}

export const STABILITY_TIER_LABELS: Readonly<Record<StabilityTier, string>> = {
  [StabilityTier.IMMUTABLE]: 'immutable',
  [StabilityTier.CONVENTION]: 'convention',
  [StabilityTier.SESSION]: 'session',
  [StabilityTier.VOLATILE]: 'volatile',
};

/**
 * Maps each known graph node type to a stability tier. Unlisted types fall
 * through to {@link StabilityTier.VOLATILE} in {@link stabilityTierForNode} —
 * fail safe: an unclassified node is never placed ahead of known-stable content.
 */
const NODE_TYPE_TIER: Partial<Record<NodeType, StabilityTier>> = {
  // IMMUTABLE — tool schemas + immutable knowledge
  adr: StabilityTier.IMMUTABLE,
  decision: StabilityTier.IMMUTABLE,
  document: StabilityTier.IMMUTABLE,
  requirement: StabilityTier.IMMUTABLE,
  constraint: StabilityTier.IMMUTABLE,
  pattern: StabilityTier.IMMUTABLE,
  layer: StabilityTier.IMMUTABLE,
  skill: StabilityTier.IMMUTABLE,
  design_token: StabilityTier.IMMUTABLE,
  design_constraint: StabilityTier.IMMUTABLE,
  aesthetic_intent: StabilityTier.IMMUTABLE,
  business_rule: StabilityTier.IMMUTABLE,
  business_process: StabilityTier.IMMUTABLE,
  business_concept: StabilityTier.IMMUTABLE,
  business_term: StabilityTier.IMMUTABLE,
  business_metric: StabilityTier.IMMUTABLE,
  // CONVENTION — slow-moving structure
  repository: StabilityTier.CONVENTION,
  module: StabilityTier.CONVENTION,
  interface: StabilityTier.CONVENTION,
  class: StabilityTier.CONVENTION,
  file: StabilityTier.CONVENTION,
  // SESSION — code under active work
  function: StabilityTier.SESSION,
  method: StabilityTier.SESSION,
  variable: StabilityTier.SESSION,
  conversation: StabilityTier.SESSION,
  // VOLATILE — per-turn state
  failure: StabilityTier.VOLATILE,
  learning: StabilityTier.VOLATILE,
  issue: StabilityTier.VOLATILE,
  commit: StabilityTier.VOLATILE,
  build: StabilityTier.VOLATILE,
  test_result: StabilityTier.VOLATILE,
  execution_outcome: StabilityTier.VOLATILE,
  span: StabilityTier.VOLATILE,
  metric: StabilityTier.VOLATILE,
  log: StabilityTier.VOLATILE,
  violation: StabilityTier.VOLATILE,
  packed_summary: StabilityTier.VOLATILE,
  business_fact: StabilityTier.VOLATILE,
  image_annotation: StabilityTier.VOLATILE,
};

function isStabilityTier(value: unknown): value is StabilityTier {
  return (
    value === StabilityTier.IMMUTABLE ||
    value === StabilityTier.CONVENTION ||
    value === StabilityTier.SESSION ||
    value === StabilityTier.VOLATILE
  );
}

/**
 * Classify a node into a stability tier.
 *
 * Precedence: an explicit `metadata.stabilityTier` override wins; otherwise the
 * node's type is mapped; otherwise {@link StabilityTier.VOLATILE} (fail safe).
 */
export function stabilityTierForNode(node: GraphNode): StabilityTier {
  const override = node.metadata?.['stabilityTier'];
  if (isStabilityTier(override)) {
    return override;
  }
  return NODE_TYPE_TIER[node.type] ?? StabilityTier.VOLATILE;
}

/** chars/4 token heuristic, matching the assembler's node token estimate. */
export function estimateNodeTokens(node: GraphNode): number {
  const baseChars = (node.name?.length ?? 0) + (node.path?.length ?? 0) + (node.type?.length ?? 0);
  const metadataChars = node.metadata ? JSON.stringify(node.metadata).length : 0;
  return Math.ceil((baseChars + metadataChars) / 4);
}

/**
 * Reorder nodes into strictly descending stability order (most stable first).
 *
 * Uses a stable sort keyed by ascending tier index, so within a tier the input
 * order (relevance ranking) is preserved. The result is a permutation of the
 * input — the same multiset of nodes, reordered. No node is added or removed,
 * which makes the layout pass content-neutral by construction.
 */
export function orderByStability(nodes: readonly GraphNode[]): GraphNode[] {
  // `Array.prototype.sort` is stable in modern engines (ES2019+), so equal-tier
  // nodes keep their relative order. Map to (node, index) to be robust anyway.
  return nodes
    .map((node, index) => ({ node, index, tier: stabilityTierForNode(node) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.node);
}

/** A node placed ahead of a strictly more-stable node later in the layout. */
export interface LayoutViolation {
  /** Position of the offending (less-stable) node in the layout. */
  readonly index: number;
  readonly nodeId: string;
  readonly tier: StabilityTier;
  /** The more-stable node it precedes. */
  readonly precedesNodeId: string;
  readonly precedesTier: StabilityTier;
}

/**
 * Audit a layout for volatile-first placements: any node that appears before a
 * strictly more-stable node. A correctly stability-ordered layout yields none.
 *
 * Each offending node is reported once, against the first more-stable node that
 * follows it — enough to flag the regression without O(n^2) noise.
 */
export function auditLayout(nodes: readonly GraphNode[]): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  const tiers = nodes.map(stabilityTierForNode);

  // Suffix-min of tiers: the most-stable (lowest) tier at or after each index.
  const minTierAfter: StabilityTier[] = new Array(nodes.length);
  let running = StabilityTier.VOLATILE;
  for (let i = nodes.length - 1; i >= 0; i--) {
    running = Math.min(running, tiers[i]!) as StabilityTier;
    minTierAfter[i] = running;
  }

  for (let i = 0; i < nodes.length; i++) {
    const tier = tiers[i]!;
    // If something strictly more stable exists later, this node is volatile-first.
    if (i + 1 < nodes.length && minTierAfter[i + 1]! < tier) {
      // Find the first strictly-more-stable follower for the report.
      for (let j = i + 1; j < nodes.length; j++) {
        if (tiers[j]! < tier) {
          violations.push({
            index: i,
            nodeId: nodes[i]!.id,
            tier,
            precedesNodeId: nodes[j]!.id,
            precedesTier: tiers[j]!,
          });
          break;
        }
      }
    }
  }

  return violations;
}

/**
 * Cache-hit measurement for one assembly of a workflow class, computed against
 * that class's previous assembly.
 */
export interface PrefixStabilityReport {
  readonly workflowClass: string;
  /** Tokens in the maximal id+content-identical prefix vs the previous turn. */
  readonly commonPrefixTokens: number;
  /** Total tokens in this assembly (the declared denominator). */
  readonly totalTokens: number;
  /** commonPrefixTokens / totalTokens, in [0, 1]. First turn of a class is 0. */
  readonly cachedFraction: number;
}

export interface CacheEfficiencySummary {
  readonly assemblies: number;
  readonly meanCachedFraction: number;
}

interface RecordedLayout {
  readonly ids: string[];
  readonly fingerprints: string[];
  readonly tokens: number[];
}

/** Fingerprint that changes whenever a node's serialized content changes. */
function fingerprint(node: GraphNode): string {
  return (
    node.hash ?? `${node.name ?? ''}|${node.path ?? ''}|${JSON.stringify(node.metadata ?? {})}`
  );
}

/**
 * Records assembled layouts per workflow class and reports the cached token
 * fraction — the share of tokens a prompt cache would serve from the previous
 * turn's shared prefix. The prefix runs while both node id and content
 * fingerprint match position-for-position; the first mismatch ends it, exactly
 * as a real prefix cache would.
 *
 * Feeding a relevance-ordered layout vs a stability-ordered layout for the same
 * two turns yields the before/after cache-hit fraction per workflow class.
 */
export class CacheEfficiencyMeter {
  private readonly previous = new Map<string, RecordedLayout>();
  private readonly totals = new Map<string, { count: number; fractionSum: number }>();

  record(workflowClass: string, nodes: readonly GraphNode[]): PrefixStabilityReport {
    const current: RecordedLayout = {
      ids: nodes.map((n) => n.id),
      fingerprints: nodes.map(fingerprint),
      tokens: nodes.map(estimateNodeTokens),
    };
    const totalTokens = current.tokens.reduce((sum, t) => sum + t, 0);

    const prior = this.previous.get(workflowClass);
    let commonPrefixTokens = 0;
    if (prior) {
      const limit = Math.min(current.ids.length, prior.ids.length);
      for (let i = 0; i < limit; i++) {
        if (current.ids[i] !== prior.ids[i] || current.fingerprints[i] !== prior.fingerprints[i]) {
          break;
        }
        commonPrefixTokens += current.tokens[i]!;
      }
    }

    const cachedFraction = totalTokens > 0 ? commonPrefixTokens / totalTokens : 0;

    this.previous.set(workflowClass, current);
    const agg = this.totals.get(workflowClass) ?? { count: 0, fractionSum: 0 };
    agg.count += 1;
    agg.fractionSum += cachedFraction;
    this.totals.set(workflowClass, agg);

    return { workflowClass, commonPrefixTokens, totalTokens, cachedFraction };
  }

  /** Per-workflow-class assembly count and mean cached fraction. */
  summary(): Record<string, CacheEfficiencySummary> {
    const out: Record<string, CacheEfficiencySummary> = {};
    for (const [workflowClass, agg] of this.totals) {
      out[workflowClass] = {
        assemblies: agg.count,
        meanCachedFraction: agg.count > 0 ? agg.fractionSum / agg.count : 0,
      };
    }
    return out;
  }
}

/** One stability tier's slice of an assembled layout. */
export interface LayoutSection {
  readonly tier: StabilityTier;
  readonly tierLabel: string;
  readonly nodeIds: readonly string[];
  readonly tokens: number;
}

/** Group an ordered node list into per-tier sections (for reporting/inspection). */
export function toLayoutSections(nodes: readonly GraphNode[]): LayoutSection[] {
  const byTier = new Map<StabilityTier, { nodeIds: string[]; tokens: number }>();
  for (const node of nodes) {
    const tier = stabilityTierForNode(node);
    const section = byTier.get(tier) ?? { nodeIds: [], tokens: 0 };
    section.nodeIds.push(node.id);
    section.tokens += estimateNodeTokens(node);
    byTier.set(tier, section);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, section]) => ({
      tier,
      tierLabel: STABILITY_TIER_LABELS[tier],
      nodeIds: section.nodeIds,
      tokens: section.tokens,
    }));
}
