import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { NodeType } from '../types.js';
import { hash } from './ingestUtils.js';

export interface LinkResult {
  readonly factsCreated: number;
  readonly conceptsClustered: number;
  readonly duplicatesMerged: number;
  readonly stagedForReview: number;
  readonly errors: readonly string[];
}

export interface HeuristicPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly signal: string;
  readonly confidence: number;
  readonly nodeType: NodeType;
}

interface Candidate {
  id: string;
  sourceNodeId: string;
  sourceNodeType: string;
  name: string;
  content: string;
  confidence: number;
  pattern: string;
  signal: string;
  nodeType: NodeType;
}

/**
 * Heuristic pattern registry for detecting business knowledge signals
 * in connector-ingested content (issues, conversations, documents).
 */
const HEURISTIC_PATTERNS: readonly HeuristicPattern[] = [
  {
    name: 'business-rule-imperative',
    pattern:
      /\b(?:must|shall|required)\b.*\b(?:system|service|api|user|data|app|application|client|server|process|handler|module)\b/i,
    signal: 'Business rule',
    confidence: 0.7,
    nodeType: 'business_fact',
  },
  {
    name: 'sla-slo-pattern',
    pattern:
      /(?:\b\d+(?:\.\d+)?%\s*(?:availability|uptime|success\s*rate)|\bunder\s+\d+\s*(?:ms|seconds?|minutes?|hours?)\b|\b(?:SLA|SLO)\b|\b99(?:\.\d+)?%\b)/i,
    signal: 'Business constraint (SLA/SLO)',
    confidence: 0.8,
    nodeType: 'business_fact',
  },
  {
    name: 'monetary-amount',
    pattern:
      /\$[\d,]+(?:\.\d{2})?\s*(?:\b(?:cost|revenue|budget|price|fee|license|subscription|annual|monthly)\b)?/i,
    signal: 'Business fact (monetary)',
    confidence: 0.6,
    nodeType: 'business_fact',
  },
  {
    name: 'acceptance-criteria',
    pattern: /\b(?:Given\b.*\bWhen\b.*\bThen\b|\[[ x]\])/i,
    signal: 'Business rule (acceptance criteria)',
    confidence: 0.8,
    nodeType: 'business_fact',
  },
  {
    name: 'regulatory-reference',
    pattern: /\b(?:GDPR|SOC\s*2|PCI(?:\s*-?\s*DSS)?|HIPAA|CCPA|FERPA|SOX)\b/i,
    signal: 'Business rule (regulatory)',
    confidence: 0.9,
    nodeType: 'business_fact',
  },
];

/** Node types that KnowledgeLinker scans for business signals. */
const SCANNABLE_TYPES = ['issue', 'conversation', 'document'] as const;

/**
 * Post-processing linker that scans connector-ingested nodes for business
 * knowledge signals using heuristic pattern detection with confidence scoring.
 *
 * Three-stage pipeline:
 * 1. Scan: Apply heuristic patterns to issue/conversation/document nodes
 * 2. Cluster: Group related extractions (skeleton -- full implementation in Phase C)
 * 3. Promote: Create business_fact nodes for high-confidence, stage medium-confidence
 */
export class KnowledgeLinker {
  constructor(
    private readonly store: GraphStore,
    private readonly outputDir?: string
  ) {}

  async link(): Promise<LinkResult> {
    const errors: string[] = [];
    let factsCreated = 0;
    let conceptsClustered = 0;
    let duplicatesMerged = 0;
    let stagedForReview = 0;

    // Stage 1: Scan
    const candidates: Candidate[] = [];
    for (const type of SCANNABLE_TYPES) {
      const nodes = this.store.findNodes({ type });
      for (const node of nodes) {
        if (!node.content) continue;
        try {
          const matches = this.scanPatterns(node.content, node.id, type);

          // Apply reaction confidence boost for conversation nodes
          for (const match of matches) {
            if (type === 'conversation' && node.metadata.reactions) {
              const reactions = node.metadata.reactions as Record<string, number>;
              const totalReactions = Object.values(reactions).reduce(
                (sum, count) => sum + count,
                0
              );
              if (totalReactions > 0) {
                // Round to 2 decimal places to avoid floating point precision issues
                match.confidence = Math.min(1.0, Math.round((match.confidence + 0.1) * 100) / 100);
              }
            }
            candidates.push(match);
          }
        } catch (err) {
          errors.push(
            `Scan failed for ${node.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    // Write extraction records to JSONL for audit trail
    await this.writeJsonl(candidates);

    // Stage 2: Cluster -- group by source node, create business_concept for 3+ extractions
    const sourceGroups = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const group = sourceGroups.get(candidate.sourceNodeId) ?? [];
      group.push(candidate);
      sourceGroups.set(candidate.sourceNodeId, group);
    }

    for (const [sourceNodeId, group] of sourceGroups) {
      if (group.length >= 3) {
        const conceptId = `concept:linker:${hash(sourceNodeId)}`;
        this.store.addNode({
          id: conceptId,
          type: 'business_concept',
          name: `Business concept cluster from ${sourceNodeId}`,
          metadata: {
            source: 'knowledge-linker',
            sources: [sourceNodeId],
            factCount: group.length,
          },
        });
        conceptsClustered++;
      }
    }

    // Stage 3: Promote
    const stagedCandidates: Candidate[] = [];

    for (const candidate of candidates) {
      if (candidate.confidence >= 0.8) {
        // Check for duplicates: look for existing business_fact with same content
        const existingFacts = this.store.findNodes({ type: 'business_fact' });
        const duplicate = existingFacts.find(
          (f) => f.content === candidate.content && f.id !== candidate.id
        );

        if (duplicate) {
          // Merge: add source to existing node's sources
          const existingSources = (duplicate.metadata.sources as string[]) ?? [];
          if (!existingSources.includes(candidate.sourceNodeId)) {
            existingSources.push(candidate.sourceNodeId);
            duplicate.metadata.sources = existingSources;
          }
          duplicatesMerged++;
          continue;
        }

        // Check if this exact candidate was already created
        const existing = this.store.getNode(candidate.id);
        if (existing) {
          duplicatesMerged++;
          continue;
        }

        this.store.addNode({
          id: candidate.id,
          type: candidate.nodeType,
          name: candidate.name,
          content: candidate.content,
          metadata: {
            source: 'knowledge-linker',
            pattern: candidate.pattern,
            signal: candidate.signal,
            confidence: candidate.confidence,
            sourceNodeId: candidate.sourceNodeId,
            sourceNodeType: candidate.sourceNodeType,
            sources: [candidate.sourceNodeId],
          },
        });

        // Create governs edge from fact to source node
        this.store.addEdge({
          from: candidate.id,
          to: candidate.sourceNodeId,
          type: 'governs',
          confidence: candidate.confidence,
          metadata: { source: 'knowledge-linker' },
        });

        factsCreated++;
      } else if (candidate.confidence >= 0.5) {
        stagedCandidates.push(candidate);
        stagedForReview++;
      }
      // < 0.5: discard (no action)
    }

    // Write staged candidates to separate JSONL
    await this.writeStagedJsonl(stagedCandidates);

    return {
      factsCreated,
      conceptsClustered,
      duplicatesMerged,
      stagedForReview,
      errors,
    };
  }

  /**
   * Write candidates to JSONL file for audit trail.
   */
  private async writeJsonl(candidates: readonly Candidate[]): Promise<void> {
    if (!this.outputDir) return;
    await fs.mkdir(this.outputDir, { recursive: true });
    const filePath = path.join(this.outputDir, 'linker.jsonl');
    const lines = candidates.map((c) =>
      JSON.stringify({
        id: c.id,
        sourceNodeId: c.sourceNodeId,
        sourceNodeType: c.sourceNodeType,
        name: c.name,
        confidence: c.confidence,
        pattern: c.pattern,
        signal: c.signal,
        nodeType: c.nodeType,
      })
    );
    await fs.writeFile(filePath, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
  }

  /**
   * Write medium-confidence candidates to staged JSONL for human review.
   */
  private async writeStagedJsonl(candidates: readonly Candidate[]): Promise<void> {
    if (!this.outputDir || candidates.length === 0) return;
    const stagedDir = path.join(this.outputDir, 'staged');
    await fs.mkdir(stagedDir, { recursive: true });
    const filePath = path.join(stagedDir, 'linker-staged.jsonl');
    const lines = candidates.map((c) =>
      JSON.stringify({
        id: c.id,
        sourceNodeId: c.sourceNodeId,
        sourceNodeType: c.sourceNodeType,
        name: c.name,
        confidence: c.confidence,
        pattern: c.pattern,
        signal: c.signal,
        nodeType: c.nodeType,
      })
    );
    await fs.writeFile(filePath, lines.join('\n') + '\n');
  }

  /**
   * Apply heuristic patterns to content and return candidate extractions.
   */
  private scanPatterns(content: string, nodeId: string, nodeType: string): Candidate[] {
    const candidates: Candidate[] = [];
    for (const heuristic of HEURISTIC_PATTERNS) {
      if (heuristic.pattern.test(content)) {
        const candidateId = `extracted:linker:${hash(nodeId + ':' + heuristic.name)}`;
        candidates.push({
          id: candidateId,
          sourceNodeId: nodeId,
          sourceNodeType: nodeType,
          name: `${heuristic.signal} from ${nodeId}`,
          content,
          confidence: heuristic.confidence,
          pattern: heuristic.name,
          signal: heuristic.signal,
          nodeType: heuristic.nodeType,
        });
      }
    }
    return candidates;
  }
}
