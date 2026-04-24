import type { GraphStore } from '../store/GraphStore.js';
import type { EdgeType } from '../types.js';
import { KNOWLEDGE_NODE_TYPES } from './knowledgeTypes.js';

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

// --- Scorer ---

export class CoverageScorer {
  score(store: GraphStore): CoverageReport {
    // 1. Collect all knowledge nodes, group by domain
    const knowledgeNodes = KNOWLEDGE_TYPES.flatMap((t) => store.findNodes({ type: t }));

    const domainMap = new Map<string, typeof knowledgeNodes>();
    for (const node of knowledgeNodes) {
      const domain = (node.metadata.domain as string) ?? 'unclassified';
      const group = domainMap.get(domain) ?? [];
      group.push(node);
      domainMap.set(domain, group);
    }

    // 2. Collect code nodes, group by domain
    const codeNodes = CODE_TYPES.flatMap((t) => store.findNodes({ type: t }));

    const codeDomains = new Map<string, typeof codeNodes>();
    for (const node of codeNodes) {
      const domain = (node.metadata.domain as string) ?? this.domainFromPath(node.path);
      const group = codeDomains.get(domain) ?? [];
      group.push(node);
      codeDomains.set(domain, group);
    }

    // 3. Compute per-domain scores
    const allDomains = new Set([...domainMap.keys(), ...codeDomains.keys()]);
    const domains: DomainCoverageScore[] = [];

    for (const domain of allDomains) {
      const knEntries = domainMap.get(domain) ?? [];
      const codeEntries = codeDomains.get(domain) ?? [];

      // Count linked code entities (those with at least one knowledge edge)
      const linkedIds = new Set<string>();
      for (const codeNode of codeEntries) {
        for (const edgeType of KNOWLEDGE_EDGE_TYPES) {
          const edges = store.getEdges({ to: codeNode.id, type: edgeType });
          if (edges.length > 0) {
            linkedIds.add(codeNode.id);
            break;
          }
        }
      }

      // Source breakdown
      const sourceBreakdown: Record<string, number> = {};
      for (const kn of knEntries) {
        const src = (kn.metadata.source as string) ?? 'unknown';
        sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + 1;
      }

      const codeEntities = codeEntries.length;
      const linkedEntities = linkedIds.size;
      const knowledgeEntries = knEntries.length;
      const uniqueSources = Object.keys(sourceBreakdown).length;

      // Score formula:
      //   60% weight: code coverage (linked / total code entities)
      //   20% weight: knowledge depth (capped at 10 entries)
      //   20% weight: source diversity (capped at 3 sources)
      const codeCoverageComponent = codeEntities > 0 ? (linkedEntities / codeEntities) * 60 : 0;
      const knowledgeDepthComponent = Math.min(knowledgeEntries / 10, 1.0) * 20;
      const sourceDiversityComponent = Math.min(uniqueSources / 3, 1.0) * 20;
      const score = Math.round(
        codeCoverageComponent + knowledgeDepthComponent + sourceDiversityComponent
      );

      domains.push({
        domain,
        score,
        knowledgeEntries,
        codeEntities,
        linkedEntities,
        unlinkedEntities: codeEntities - linkedEntities,
        sourceBreakdown,
        grade: toGrade(score),
      });
    }

    // 4. Overall score (average of domain scores, or 0 if no domains)
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

  private domainFromPath(filePath?: string): string {
    if (!filePath) return 'unclassified';
    const parts = filePath.split('/');
    const pkgIdx = parts.indexOf('packages');
    if (pkgIdx >= 0 && parts[pkgIdx + 1]) return parts[pkgIdx + 1]!;
    const srcIdx = parts.indexOf('src');
    if (srcIdx >= 0 && parts[srcIdx + 1]) return parts[srcIdx + 1]!;
    return parts[0] ?? 'unclassified';
  }
}
