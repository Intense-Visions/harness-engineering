// packages/core/src/state/learnings-relevance.ts

/**
 * Tokenize a string into a deduplicated set of lowercase keywords.
 * Splits on whitespace and punctuation, filters tokens with length <= 1.
 */
export function tokenize(text: string): string[] {
  if (!text || text.trim() === '') return [];
  const tokens = text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((t) => t.length > 1);
  return [...new Set(tokens)];
}

/**
 * Score the relevance of a learning to a context string using Jaccard similarity.
 * Returns |intersection| / |union| (0-1). Returns 0 if both are empty.
 */
export function scoreLearningRelevance(learningText: string, context: string): number {
  const learningTokens = tokenize(learningText);
  const contextTokens = tokenize(context);

  if (learningTokens.length === 0 && contextTokens.length === 0) return 0;
  if (learningTokens.length === 0 || contextTokens.length === 0) return 0;

  const learningSet = new Set(learningTokens);
  const contextSet = new Set(contextTokens);

  let intersection = 0;
  for (const token of learningSet) {
    if (contextSet.has(token)) intersection++;
  }

  const union = new Set([...learningSet, ...contextSet]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Estimate token count from a string (chars / 4, ceiling). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Filter learnings by Jaccard relevance to a context string.
 *
 * - Scores each learning against context
 * - Filters below threshold (default 0.7)
 * - Sorts descending by score
 * - Truncates to fit within token budget (default 1000)
 */
export function filterByRelevance(
  learnings: string[],
  context: string,
  threshold: number = 0.7,
  tokenBudget: number = 1000
): string[] {
  const scored = learnings
    .map((learning) => ({
      text: learning,
      score: scoreLearningRelevance(learning, context),
    }))
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score);

  const result: string[] = [];
  let totalTokens = 0;

  for (const entry of scored) {
    const separator = result.length > 0 ? '\n' : '';
    const entryCost = estimateTokens(entry.text + separator);
    if (totalTokens + entryCost > tokenBudget) break;
    result.push(entry.text);
    totalTokens += entryCost;
  }

  return result;
}
