import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode, NodeType } from '../types.js';

export type ConflictType =
  | 'value_mismatch'
  | 'definition_conflict'
  | 'status_divergence'
  | 'temporal_conflict';

export interface ContradictionEntry {
  readonly nodeId: string;
  readonly source: string;
  readonly name: string;
  readonly content: string;
  readonly lastModified?: string | undefined;
}

export interface Contradiction {
  readonly id: string;
  readonly entityA: ContradictionEntry;
  readonly entityB: ContradictionEntry;
  readonly similarity: number;
  readonly conflictType: ConflictType;
  readonly severity: 'critical' | 'high' | 'medium';
  readonly description: string;
}

export interface ContradictionResult {
  readonly contradictions: readonly Contradiction[];
  readonly sourcePairCounts: Record<string, number>;
  readonly totalChecked: number;
}

function classifyConflict(a: GraphNode, b: GraphNode): ConflictType {
  const factTypes: ReadonlySet<string> = new Set([
    'business_fact',
    'business_metric',
    'design_token',
  ]);
  const termTypes: ReadonlySet<string> = new Set(['business_term', 'business_concept']);

  if (factTypes.has(a.type) || factTypes.has(b.type)) return 'value_mismatch';
  if (termTypes.has(a.type) || termTypes.has(b.type)) return 'definition_conflict';

  // Check temporal
  if (a.lastModified && b.lastModified && a.lastModified !== b.lastModified)
    return 'temporal_conflict';

  return 'status_divergence';
}

export class ContradictionDetector {
  /** Node types to check for contradictions. */
  private static readonly KNOWLEDGE_TYPES: readonly NodeType[] = [
    'business_fact',
    'business_rule',
    'business_process',
    'business_term',
    'business_concept',
    'business_metric',
    'design_token',
    'design_constraint',
    'aesthetic_intent',
    'image_annotation',
  ];

  detect(store: GraphStore): ContradictionResult {
    // 1. Gather all knowledge nodes
    const nodes = ContradictionDetector.KNOWLEDGE_TYPES.flatMap((t) =>
      store.findNodes({ type: t })
    );

    // 2. Group by normalized name (lowercase, trim)
    const byName = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      const key = node.name.toLowerCase().trim();
      const group = byName.get(key) ?? [];
      group.push(node);
      byName.set(key, group);
    }

    // 3. Find contradictions within each group
    const contradictions: Contradiction[] = [];
    const sourcePairCounts: Record<string, number> = {};

    for (const [, group] of byName) {
      if (group.length < 2) continue;

      // Check pairs with different sources and different content
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]!;
          const b = group[j]!;
          const sourceA = (a.metadata.source as string) ?? 'unknown';
          const sourceB = (b.metadata.source as string) ?? 'unknown';

          // Skip same source
          if (sourceA === sourceB) continue;

          const hashA = a.hash ?? a.id;
          const hashB = b.hash ?? b.id;

          // Only contradicting if content differs
          if (hashA === hashB) continue;

          const conflictType = classifyConflict(a, b);
          const severity =
            conflictType === 'value_mismatch'
              ? 'critical'
              : conflictType === 'definition_conflict'
                ? 'high'
                : 'medium';

          const pairKey = [sourceA, sourceB].sort().join('\u2194');
          sourcePairCounts[pairKey] = (sourcePairCounts[pairKey] ?? 0) + 1;

          contradictions.push({
            id: `contradiction:${a.id}:${b.id}`,
            entityA: {
              nodeId: a.id,
              source: sourceA,
              name: a.name,
              content: a.content ?? '',
              lastModified: a.lastModified,
            },
            entityB: {
              nodeId: b.id,
              source: sourceB,
              name: b.name,
              content: b.content ?? '',
              lastModified: b.lastModified,
            },
            similarity: 1.0, // exact name match
            conflictType,
            severity,
            description: `"${a.name}" has conflicting definitions from ${sourceA} and ${sourceB}`,
          });
        }
      }
    }

    return { contradictions, sourcePairCounts, totalChecked: nodes.length };
  }
}
