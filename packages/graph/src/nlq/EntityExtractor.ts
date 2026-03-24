/**
 * All intent keywords from INTENT_SIGNALS, collected into a single set
 * for fast lookup. These tokens are excluded from "remaining noun" extraction.
 */
const INTENT_KEYWORDS: ReadonlySet<string> = new Set([
  // impact
  'break',
  'breaks',
  'affect',
  'affects',
  'affected',
  'impact',
  'change',
  'depend',
  'depends',
  'blast',
  'radius',
  'risk',
  'delete',
  'remove',
  'modify',
  'happens',
  // find
  'find',
  'where',
  'locate',
  'search',
  'list',
  'all',
  'every',
  'show',
  // relationships
  'connect',
  'connects',
  'call',
  'calls',
  'import',
  'imports',
  'use',
  'uses',
  'link',
  'neighbor',
  'caller',
  'callers',
  'callee',
  'callees',
  // explain
  'describe',
  'explain',
  'tell',
  'about',
  'overview',
  'summary',
  'work',
  'works',
  // anomaly
  'wrong',
  'problem',
  'problems',
  'anomaly',
  'anomalies',
  'smell',
  'smells',
  'issue',
  'issues',
  'outlier',
  'hotspot',
  'hotspots',
  'suspicious',
]);

/**
 * Common English stop words to exclude from entity extraction.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'its',
  'they',
  'them',
  'their',
  'this',
  'that',
  'these',
  'those',
  'and',
  'or',
  'but',
  'if',
  'then',
  'else',
  'when',
  'while',
  'for',
  'of',
  'at',
  'by',
  'to',
  'in',
  'on',
  'with',
  'from',
  'up',
  'out',
  'not',
  'no',
  'nor',
  'so',
  'too',
  'very',
  'just',
  'also',
  'what',
  'who',
  'how',
  'which',
  'where',
  'why',
  'there',
  'here',
  'any',
  'some',
  'each',
  'than',
  'like',
  'get',
  'give',
  'go',
  'make',
  'see',
  'know',
  'take',
]);

/**
 * Regex for PascalCase: starts uppercase, has at least one lowercase letter following.
 * Must have at least 2 "parts" (e.g. UserService, not USER or User alone unless mixed).
 */
const PASCAL_OR_CAMEL_RE = /\b([A-Z][a-z]+[A-Za-z]*[a-z][A-Za-z]*|[a-z]+[A-Z][A-Za-z]*)\b/g;

/**
 * Regex for file paths: sequences containing / and ending with a file extension.
 */
const FILE_PATH_RE = /(?:\.\/|[a-zA-Z0-9_-]+\/)[a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10}/g;

/**
 * Regex for quoted strings (double or single quotes).
 */
const QUOTED_RE = /["']([^"']+)["']/g;

/**
 * Pattern-based entity extractor.
 *
 * Extracts candidate entity mentions from natural language queries using
 * four strategies in priority order:
 * 1. Quoted strings
 * 2. PascalCase/camelCase tokens
 * 3. File paths
 * 4. Remaining significant nouns (after stop-word and intent-keyword removal)
 *
 * Returns deduplicated raw strings. These are NOT resolved to graph nodes --
 * that is the responsibility of EntityResolver (Phase 4).
 */
export class EntityExtractor {
  /**
   * Extract candidate entity mentions from a natural language query.
   *
   * @param query - The natural language query to extract entities from
   * @returns Array of raw entity strings in priority order, deduplicated
   */
  extract(query: string): readonly string[] {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const seen = new Set<string>();
    const result: string[] = [];

    const add = (entity: string): void => {
      if (!seen.has(entity)) {
        seen.add(entity);
        result.push(entity);
      }
    };

    // Strategy 1: Quoted strings
    const quotedConsumed = new Set<string>();
    for (const match of trimmed.matchAll(QUOTED_RE)) {
      const inner = match[1]!.trim();
      if (inner.length > 0) {
        add(inner);
        quotedConsumed.add(inner);
      }
    }

    // Strategy 2: PascalCase/camelCase tokens
    const casingConsumed = new Set<string>();
    for (const match of trimmed.matchAll(PASCAL_OR_CAMEL_RE)) {
      const token = match[0]!;
      if (!quotedConsumed.has(token)) {
        add(token);
        casingConsumed.add(token);
      }
    }

    // Strategy 3: File paths
    const pathConsumed = new Set<string>();
    for (const match of trimmed.matchAll(FILE_PATH_RE)) {
      const path = match[0]!;
      add(path);
      pathConsumed.add(path);
    }

    // Strategy 4: Remaining significant nouns
    // Expand multi-word quoted strings into individual words for consumption tracking
    const quotedWords = new Set<string>();
    for (const q of quotedConsumed) {
      for (const w of q.split(/\s+/)) {
        if (w.length > 0) quotedWords.add(w);
      }
    }
    const allConsumed = new Set([
      ...quotedConsumed,
      ...quotedWords,
      ...casingConsumed,
      ...pathConsumed,
    ]);
    const words = trimmed.split(/\s+/);

    for (const raw of words) {
      // Strip punctuation from edges
      const cleaned = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
      if (cleaned.length === 0) continue;

      const lower = cleaned.toLowerCase();

      // Skip if already consumed by earlier strategies
      if (allConsumed.has(cleaned)) continue;

      // Skip stop words and intent keywords
      if (STOP_WORDS.has(lower)) continue;
      if (INTENT_KEYWORDS.has(lower)) continue;

      // Skip ALL_CAPS tokens (acronyms like API, HTTP) — not entity mentions
      if (cleaned === cleaned.toUpperCase() && /^[A-Z]+$/.test(cleaned)) continue;

      add(cleaned);
    }

    return result;
  }
}
