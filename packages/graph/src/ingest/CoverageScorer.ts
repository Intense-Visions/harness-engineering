import type { GraphStore } from '../store/GraphStore.js';
import type { EdgeType, GraphNode, NodeType } from '../types.js';
import { KNOWLEDGE_NODE_TYPES } from './knowledgeTypes.js';
import { inferDomain, type DomainInferenceOptions } from './domain-inference.js';

// --- Exported result types ---

/**
 * Coverage grade. `'N/A'` is the *unmeasured* state: it is emitted when there
 * is no linkable-code denominator to score against (0/0), so that "no graph /
 * no data" is never rendered as the confident failing grade `'F'` (#1110).
 */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F' | 'N/A';

export interface DomainCoverageScore {
  readonly domain: string;
  readonly score: number;
  readonly knowledgeEntries: number;
  readonly codeEntities: number;
  readonly linkedEntities: number;
  readonly unlinkedEntities: number;
  readonly sourceBreakdown: Record<string, number>;
  /**
   * Whether this domain had a linkable-code denominator (`codeEntities > 0`).
   * When `false` the domain is *unmeasured*: its `grade` is `'N/A'` and it is
   * excluded from the report aggregate rather than averaging a zero into it.
   */
  readonly measured: boolean;
  readonly grade: Grade;
}

export interface CoverageReport {
  readonly domains: readonly DomainCoverageScore[];
  /** Rounded average of *measured* domains only (0 when none are measured). */
  readonly overallScore: number;
  /** `'N/A'` when no domain was measurable (no linkable code anywhere). */
  readonly overallGrade: Grade;
  /** Whether the graph contained any code or knowledge nodes at all. */
  readonly graphPresent: boolean;
  /** Count of domains with a linkable-code denominator. */
  readonly measuredDomainCount: number;
  readonly generatedAt: string;
}

// --- Constants ---

const KNOWLEDGE_TYPES = KNOWLEDGE_NODE_TYPES;

const CODE_TYPES: readonly NodeType[] = [
  'file',
  'function',
  'class',
  'method',
  'interface',
  'variable',
];

const KNOWLEDGE_EDGE_TYPES: readonly EdgeType[] = [
  'governs',
  'documents',
  'measures',
  'applies_to',
  'references',
  'uses_token',
  'declares_intent',
  'annotates',
];

// --- Helpers ---

function toGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

// --- Helpers (module-level) ---

/**
 * Group nodes by domain. Domain resolution delegates to the shared
 * `inferDomain` helper, which honours `metadata.domain` first and falls
 * back to path-based / config-pattern / built-in-pattern resolution.
 *
 * @param fallback Deprecated. Ignored. Retained as an optional positional
 *   parameter for source-level back-compat with callers that still pass it.
 *   Will be removed in a future release. Use `options.extraPatterns` /
 *   `options.extraBlocklist` instead.
 */
function groupByDomain(
  nodes: readonly GraphNode[],
  /** @deprecated Ignored. */ _fallback?: (node: GraphNode) => string,
  options: DomainInferenceOptions = {}
): Map<string, GraphNode[]> {
  const map = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const domain = inferDomain(node, options);
    const group = map.get(domain) ?? [];
    group.push(node);
    map.set(domain, group);
  }
  return map;
}

/** Count code entities that have at least one knowledge edge pointing to them. */
function countLinkedEntities(codeEntries: readonly GraphNode[], store: GraphStore): Set<string> {
  const linkedIds = new Set<string>();
  for (const codeNode of codeEntries) {
    if (hasKnowledgeEdge(codeNode.id, store)) {
      linkedIds.add(codeNode.id);
    }
  }
  return linkedIds;
}

/** Check whether a code node has at least one knowledge edge pointing to it. */
function hasKnowledgeEdge(nodeId: string, store: GraphStore): boolean {
  for (const edgeType of KNOWLEDGE_EDGE_TYPES) {
    if (store.getEdges({ to: nodeId, type: edgeType }).length > 0) return true;
  }
  return false;
}

/** Compute source breakdown for a set of knowledge nodes. */
function computeSourceBreakdown(knEntries: readonly GraphNode[]): Record<string, number> {
  const breakdown: Record<string, number> = {};
  for (const kn of knEntries) {
    const src = (kn.metadata.source as string) ?? 'unknown';
    breakdown[src] = (breakdown[src] ?? 0) + 1;
  }
  return breakdown;
}

/** Compute the weighted score for a single domain. */
function computeDomainScore(
  knowledgeEntries: number,
  codeEntities: number,
  linkedEntities: number,
  uniqueSources: number
): number {
  // 60% weight: code coverage (linked / total code entities)
  const codeCoverageComponent = codeEntities > 0 ? (linkedEntities / codeEntities) * 60 : 0;
  // 20% weight: knowledge depth (capped at 10 entries)
  const knowledgeDepthComponent = Math.min(knowledgeEntries / 10, 1.0) * 20;
  // 20% weight: source diversity (capped at 3 sources)
  const sourceDiversityComponent = Math.min(uniqueSources / 3, 1.0) * 20;
  return Math.round(codeCoverageComponent + knowledgeDepthComponent + sourceDiversityComponent);
}

/** Score a single domain and return a DomainCoverageScore. */
function scoreDomain(
  domain: string,
  knEntries: readonly GraphNode[],
  codeEntries: readonly GraphNode[],
  store: GraphStore
): DomainCoverageScore {
  const linkedIds = countLinkedEntities(codeEntries, store);
  const sourceBreakdown = computeSourceBreakdown(knEntries);

  const codeEntities = codeEntries.length;
  const linkedEntities = linkedIds.size;
  const knowledgeEntries = knEntries.length;
  const uniqueSources = Object.keys(sourceBreakdown).length;

  const score = computeDomainScore(knowledgeEntries, codeEntities, linkedEntities, uniqueSources);

  // A domain is *measured* only when it has a linkable-code denominator. With
  // `codeEntities === 0` there is nothing to link (0/0), so we abstain from a
  // letter grade rather than emit a confident `F` on no data (#1110).
  const measured = codeEntities > 0;

  return {
    domain,
    score,
    knowledgeEntries,
    codeEntities,
    linkedEntities,
    unlinkedEntities: codeEntities - linkedEntities,
    sourceBreakdown,
    measured,
    grade: measured ? toGrade(score) : 'N/A',
  };
}

// --- Scorer ---

export class CoverageScorer {
  constructor(private readonly inferenceOptions: DomainInferenceOptions = {}) {}

  score(store: GraphStore): CoverageReport {
    const knowledgeNodes = KNOWLEDGE_TYPES.flatMap((t) => store.findNodes({ type: t }));
    const domainMap = groupByDomain(knowledgeNodes, undefined, this.inferenceOptions);

    const codeNodes = CODE_TYPES.flatMap((t) => store.findNodes({ type: t }));
    const codeDomains = groupByDomain(codeNodes, undefined, this.inferenceOptions);

    const allDomains = new Set([...domainMap.keys(), ...codeDomains.keys()]);
    const domains: DomainCoverageScore[] = [];

    for (const domain of allDomains) {
      domains.push(
        scoreDomain(domain, domainMap.get(domain) ?? [], codeDomains.get(domain) ?? [], store)
      );
    }

    // Aggregate over *measured* domains only. Averaging no-denominator zeros
    // into the overall would let an unscanned repo read as a failing grade
    // (#1110). When nothing is measurable the overall grade abstains to 'N/A'.
    const measuredDomains = domains.filter((d) => d.measured);
    const overallScore =
      measuredDomains.length > 0
        ? Math.round(measuredDomains.reduce((sum, d) => sum + d.score, 0) / measuredDomains.length)
        : 0;
    const graphPresent = knowledgeNodes.length > 0 || codeNodes.length > 0;

    return {
      domains,
      overallScore,
      overallGrade: measuredDomains.length > 0 ? toGrade(overallScore) : 'N/A',
      graphPresent,
      measuredDomainCount: measuredDomains.length,
      generatedAt: new Date().toISOString(),
    };
  }
}
