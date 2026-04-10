import type { CompactionStrategy } from './structural';

export const DEFAULT_TOKEN_BUDGET = 4000;

/** Chars per token estimate — matches spec's `chars/4` formula. */
const CHARS_PER_TOKEN = 4;

/** Truncation marker appended when lines are cut. */
const TRUNCATION_MARKER = '\n[truncated — prioritized truncation applied]';

/**
 * Priority score for a line of text.
 * Higher score = more important = preserved first when budget is tight.
 *
 * Priority rules (from spec):
 * - File paths (contains '/')           → very high
 * - Error/status indicators             → very high
 * - Identifiers (PascalCase, camelCase) → high
 * - Short lines (< 40 chars)            → medium (likely a label or key)
 * - Everything else                     → low
 */
function lineScore(line: string): number {
  let score = 0;
  if (/\/[\w./-]/.test(line)) score += 40; // file path
  if (/error|Error|ERROR|fail|FAIL|status/i.test(line)) score += 35; // error/status
  if (/\b[A-Z][a-z]+[A-Z]/.test(line) || /\b[a-z]+[A-Z]/.test(line)) score += 20; // camelCase/PascalCase
  if (line.trim().length < 40) score += 10; // short line (label-like)
  return score;
}

/** Select lines to keep within charBudget, preserving original order. */
function selectLines(lines: string[], charBudget: number): Array<{ line: string; idx: number }> {
  const scored = lines.map((line, idx) => ({ line, idx, score: lineScore(line) }));

  // Sort descending by score, then by original position for ties (stable top-section bias)
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  const kept: Array<{ line: string; idx: number }> = [];
  let used = 0;

  for (const item of scored) {
    const lineLen = item.line.length + 1; // +1 for newline
    if (used + lineLen > charBudget) break;
    kept.push({ line: item.line, idx: item.idx });
    used += lineLen;
  }

  // Restore original order for readability
  kept.sort((a, b) => a.idx - b.idx);
  return kept;
}

/**
 * Prioritized budget truncation.
 *
 * Splits content into lines, scores each line for semantic priority, and
 * rebuilds output within the token budget by including the highest-priority
 * lines first. A truncation marker is appended when lines are cut.
 *
 * Default budget: 4000 tokens (4000 * 4 = 16 000 chars).
 */
export class TruncationStrategy implements CompactionStrategy {
  readonly name = 'truncate' as const;
  readonly lossy = false;

  apply(content: string, budget: number = DEFAULT_TOKEN_BUDGET): string {
    if (!content) return content;

    const charBudget = budget * CHARS_PER_TOKEN;
    if (content.length <= charBudget) return content;

    const lines = content.split('\n');
    const available = charBudget - TRUNCATION_MARKER.length;
    const kept = selectLines(lines, available);

    return kept.map((k) => k.line).join('\n') + TRUNCATION_MARKER;
  }
}
