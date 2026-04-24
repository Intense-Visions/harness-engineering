import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode } from '../types.js';
import { KNOWLEDGE_NODE_TYPES } from './knowledgeTypes.js';

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

/** Minimum name similarity (Levenshtein ratio) to consider two nodes as potential contradictions. */
const SIMILARITY_THRESHOLD = 0.8;

/** Compute Levenshtein distance between two strings. */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** Compute Levenshtein similarity ratio (0-1) between two strings. */
function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
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
  detect(store: GraphStore): ContradictionResult {
    // 1. Gather all knowledge nodes
    const nodes = KNOWLEDGE_NODE_TYPES.flatMap((t) => store.findNodes({ type: t }));

    // 2. Group by normalized name (lowercase, trim)
    const byName = new Map<string, GraphNode[]>();
    for (const node of nodes) {
      const key = node.name.toLowerCase().trim();
      const group = byName.get(key) ?? [];
      group.push(node);
      byName.set(key, group);
    }

    // 3. Find contradictions — exact matches within groups + fuzzy matches across groups
    const contradictions: Contradiction[] = [];
    const sourcePairCounts: Record<string, number> = {};
    const seen = new Set<string>();

    const addContradiction = (a: GraphNode, b: GraphNode, similarity: number): void => {
      const sourceA = (a.metadata.source as string) ?? 'unknown';
      const sourceB = (b.metadata.source as string) ?? 'unknown';

      // Skip same source
      if (sourceA === sourceB) return;

      const hashA = a.hash ?? a.id;
      const hashB = b.hash ?? b.id;

      // Only contradicting if content differs
      if (hashA === hashB) return;

      // Deduplicate by node pair
      const pairId = [a.id, b.id].sort().join(':');
      if (seen.has(pairId)) return;
      seen.add(pairId);

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
        similarity,
        conflictType,
        severity,
        description: `"${a.name}" has conflicting definitions from ${sourceA} and ${sourceB}`,
      });
    };

    // 3a. Exact name matches within each group (similarity = 1.0)
    for (const [, group] of byName) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          addContradiction(group[i]!, group[j]!, 1.0);
        }
      }
    }

    // 3b. Fuzzy matches across groups (Levenshtein ratio >= threshold)
    const keys = [...byName.keys()];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const keyA = keys[i]!;
        const keyB = keys[j]!;

        // Quick length check: ratio can't meet threshold if lengths differ too much
        const maxLen = Math.max(keyA.length, keyB.length);
        const minLen = Math.min(keyA.length, keyB.length);
        if (minLen / maxLen < SIMILARITY_THRESHOLD) continue;

        const ratio = levenshteinRatio(keyA, keyB);
        if (ratio < SIMILARITY_THRESHOLD) continue;

        const groupA = byName.get(keyA)!;
        const groupB = byName.get(keyB)!;
        for (const a of groupA) {
          for (const b of groupB) {
            addContradiction(a, b, ratio);
          }
        }
      }
    }

    return { contradictions, sourcePairCounts, totalChecked: nodes.length };
  }
}
