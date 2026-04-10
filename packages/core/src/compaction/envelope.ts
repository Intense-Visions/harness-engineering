/**
 * PackedEnvelope — the structured result of applying a compaction pipeline
 * to one or more tool responses or content sections.
 *
 * Serialized as structured markdown for readability by AI agents.
 * Example output:
 *
 *   <!-- packed: structural+truncate | 4200→1100 tokens (-74%) -->
 *   ### [gather_context]
 *   ...compacted content...
 *
 *   ### [docs/changes/spec.md]
 *   ...compacted content...
 */
export interface PackedEnvelope {
  meta: {
    /** Ordered list of strategy names applied. */
    strategy: string[];
    /** Estimated token count of the original input (chars / 4). */
    originalTokenEstimate: number;
    /** Estimated token count after compaction. */
    compactedTokenEstimate: number;
    /** Reduction percentage: (1 - compacted/original) * 100, rounded. */
    reductionPct: number;
    /** Whether this result was served from cache. */
    cached: boolean;
  };
  sections: Array<{
    /** Tool name, file path, or section label — used as the section heading. */
    source: string;
    /** Compacted content for this section. */
    content: string;
  }>;
}

/**
 * Estimates token count using the chars/4 heuristic from the spec.
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Serializes a PackedEnvelope to the spec's structured markdown format:
 *
 *   <!-- packed: structural+truncate | 4200→1100 tokens (-74%) [cached] -->
 *   ### [source-name]
 *   content
 */
export function serializeEnvelope(envelope: PackedEnvelope): string {
  const { meta, sections } = envelope;

  const strategyLabel = meta.strategy.length > 0 ? meta.strategy.join('+') : 'none';
  const cachedLabel = meta.cached ? ' [cached]' : '';
  const header = `<!-- packed: ${strategyLabel} | ${meta.originalTokenEstimate}→${meta.compactedTokenEstimate} tokens (-${meta.reductionPct}%)${cachedLabel} -->`;

  if (sections.length === 0) {
    return header;
  }

  const body = sections
    .map((section) => `### [${section.source}]\n${section.content}`)
    .join('\n\n');

  return `${header}\n${body}`;
}
