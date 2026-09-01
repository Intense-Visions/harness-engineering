/**
 * MDL knowledge pruning (#1630) — merge/consolidate detector.
 *
 * Overlapping entries whose union compresses better than their sum are merge
 * candidates: keeping both taxes every context that ships them with duplicated
 * content, while a single consolidated entry covers the same ground for fewer
 * tokens at equal measured value. Reuses the existing weighted overlap scorer
 * (`checkOverlap`) rather than inventing a parallel similarity metric.
 *
 * Report-only: this recommends consolidations; it does not rewrite the store.
 */

import { checkOverlap } from '../state/learnings-overlap';
import { CHARS_PER_TOKEN } from '../compaction/envelope';
import type { KnowledgeEntry, MdlConfig } from './types';

/** A recommended consolidation of two or more overlapping entries. */
export interface MergeCandidate {
  /** The entries in this overlap cluster. */
  entryIds: string[];
  /** The overlap score that clustered them (max pairwise). */
  overlapScore: number;
  /** Description length if the entries stay separate (sum of individual content tokens). */
  sumDescriptionLength: number;
  /** Description length of the deduplicated union (the consolidated entry). */
  unionDescriptionLength: number;
  /** Tokens saved by consolidating = sum − union. Only positive candidates are emitted. */
  savings: number;
  /** Always true for emitted candidates; the union compresses better than the sum. */
  recommend: boolean;
}

/** Lowercased alphanumeric word tokens of a text. */
function words(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g);
  return matches ?? [];
}

/** Token cost of a set of unique words under the `chars/token` proxy. */
function tokenCostOfWordSet(wordSet: Set<string>): number {
  let total = 0;
  for (const w of wordSet) {
    // +1 approximates the separating whitespace, matching estimateTokens' chars/4.
    total += Math.ceil((w.length + 1) / CHARS_PER_TOKEN);
  }
  return total;
}

/** Content-token cost of one entry's text (deduplicated word content). */
function entryContentTokens(text: string): number {
  return tokenCostOfWordSet(new Set(words(text)));
}

/**
 * Cluster entries by pairwise overlap (union-find over edges at/above the
 * configured threshold) and, for each multi-entry cluster whose union content is
 * cheaper than the sum of its members, emit a merge candidate.
 *
 * Entries without text cannot be compared and are skipped. Pure over its inputs.
 */
export function findMergeCandidates(
  entries: readonly KnowledgeEntry[],
  config: MdlConfig
): MergeCandidate[] {
  const withText = entries.filter((e): e is KnowledgeEntry & { text: string } =>
    Boolean(e.text && e.text.trim())
  );
  if (withText.length < 2) return [];

  // Union-find over overlap edges.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b));
  };
  for (const e of withText) parent.set(e.id, e.id);

  // Track max pairwise overlap per resulting cluster edge set.
  const pairOverlap = new Map<string, number>();
  for (let i = 0; i < withText.length; i++) {
    for (let j = i + 1; j < withText.length; j++) {
      const a = withText[i]!;
      const b = withText[j]!;
      const score = checkOverlap(a.text, [b.text], { threshold: config.overlapThreshold }).score;
      if (score >= config.overlapThreshold) {
        union(a.id, b.id);
        const key = find(a.id);
        pairOverlap.set(key, Math.max(pairOverlap.get(key) ?? 0, score));
      }
    }
  }

  // Group entries by cluster root.
  const clusters = new Map<string, (KnowledgeEntry & { text: string })[]>();
  for (const e of withText) {
    const root = find(e.id);
    const list = clusters.get(root) ?? [];
    list.push(e);
    clusters.set(root, list);
  }

  const candidates: MergeCandidate[] = [];
  for (const [root, members] of clusters) {
    if (members.length < 2) continue;
    const sumDescriptionLength = members.reduce((acc, m) => acc + entryContentTokens(m.text), 0);
    const unionWords = new Set<string>();
    for (const m of members) for (const w of words(m.text)) unionWords.add(w);
    const unionDescriptionLength = tokenCostOfWordSet(unionWords);
    const savings = sumDescriptionLength - unionDescriptionLength;
    if (savings <= 0) continue;
    candidates.push({
      entryIds: members.map((m) => m.id).sort(),
      overlapScore: pairOverlap.get(root) ?? config.overlapThreshold,
      sumDescriptionLength,
      unionDescriptionLength,
      savings,
      recommend: true,
    });
  }

  // Largest savings first; deterministic tiebreak on the joined ids.
  candidates.sort(
    (a, b) => b.savings - a.savings || a.entryIds.join(',').localeCompare(b.entryIds.join(','))
  );
  return candidates;
}
