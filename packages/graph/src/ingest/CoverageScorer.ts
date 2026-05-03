import type { GraphStore } from '../store/GraphStore.js';
import type { EdgeType, GraphNode, NodeType } from '../types.js';
import { KNOWLEDGE_NODE_TYPES } from './knowledgeTypes.js';
import { inferDomain, type DomainInferenceOptions } from './domain-inference.js';

// --- Exported result types ---

export interface DomainCoverageScore {
  readonly domain: string;
  readonly score: number;
  readonly knowledgeEntries: number;
  readonly codeEntities: number;
  readonly linkedEntities: number;
  readonly unlinkedEntities: number;
  readonly sourceBreakdown: Record<string, number>;
  readonly grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface CoverageReport {
  readonly domains: readonly DomainCoverageScore[];
  readonly overallScore: number;
  readonly overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
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

  return {
    domain,
    score,
    knowledgeEntries,
    codeEntities,
    linkedEntities,
    unlinkedEntities: codeEntities - linkedEntities,
    sourceBreakdown,
    grade: toGrade(score),
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

    const overallScore =
      domains.length > 0
        ? Math.round(domains.reduce((sum, d) => sum + d.score, 0) / domains.length)
        : 0;

    return {
      domains,
      overallScore,
      overallGrade: toGrade(overallScore),
      generatedAt: new Date().toISOString(),
    };
  }
}
