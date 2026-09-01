/**
 * MDL knowledge pruning (#1630) — telemetry adapter.
 *
 * Grounds abstract {@link KnowledgeEntry} identities in the real learnings store
 * so the scorer runs over the actual knowledge, not a fixture. Entry identity is
 * the existing content hash; the fallback per-inclusion description cost is the
 * `estimateTokens` proxy over the entry text.
 *
 * Inclusion + outcome telemetry is supplied by the caller. When it is absent the
 * scorer degrades honestly: every entry scores `insufficient-evidence` (the
 * correct first-class verdict) rather than being pruned on missing data.
 */

import { estimateTokens } from '../compaction/envelope';
import { computeEntryHash, parseFrontmatter } from '../state/learnings-content';
import type { KnowledgeEntry } from './types';

/**
 * Turn raw learnings-store entry blocks into scored knowledge entries.
 *
 * Each block's stable id is the existing content hash; tags are read from the
 * `<!-- hash:.. tags:.. -->` frontmatter comment when present; the fallback
 * per-inclusion token cost is `estimateTokens(block)`. Blank blocks are skipped.
 */
export function buildKnowledgeEntriesFromLearnings(
  entryBlocks: readonly string[]
): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  const seen = new Set<string>();
  for (const block of entryBlocks) {
    const text = block.trim();
    if (!text) continue;
    const id = computeEntryHash(text);
    if (seen.has(id)) continue;
    seen.add(id);
    const firstLine = text.split('\n', 1)[0] ?? '';
    const frontmatter = parseFrontmatter(firstLine);
    entries.push({
      id,
      tokensPerInclusion: estimateTokens(text),
      tags: frontmatter?.tags ?? [],
      text,
    });
  }
  return entries;
}
