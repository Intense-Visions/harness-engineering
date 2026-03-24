# Plan: NLQ Entity Extractor (Phase 3)

**Date:** 2026-03-23
**Spec:** docs/changes/natural-language-graph-queries/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement a pattern-based entity extractor that pulls candidate entity mentions from natural language queries, returning raw strings for downstream resolution.

## Observable Truths (Acceptance Criteria)

1. When a query contains quoted strings like `"AuthMiddleware"`, the extractor shall return `AuthMiddleware` (without quotes) as an entity mention.
2. When a query contains PascalCase or camelCase tokens like `UserService` or `loginHandler`, the extractor shall return them as entity mentions with original casing preserved.
3. When a query contains file paths like `src/auth/middleware.ts`, the extractor shall return the full path as an entity mention.
4. When a query contains significant nouns not consumed by intent keywords or stop words, the extractor shall return them as entity mentions.
5. The extractor shall not return intent keywords (from `INTENT_SIGNALS`) or common stop words as entity mentions.
6. When a query is empty or contains only stop words, the extractor shall return an empty array.
7. The extractor shall deduplicate entity mentions (same string extracted by multiple strategies appears only once).
8. The system shall maintain priority order: quoted strings first, then PascalCase/camelCase, then file paths, then remaining nouns.
9. `npx vitest run tests/nlq/EntityExtractor.test.ts` passes with all tests green.
10. `harness validate` passes.

## File Map

- CREATE `packages/graph/src/nlq/EntityExtractor.ts`
- CREATE `packages/graph/tests/nlq/EntityExtractor.test.ts`
- MODIFY `packages/graph/src/nlq/index.ts` (add EntityExtractor export)

## Tasks

### Task 1: Create EntityExtractor test file with quoted-string and casing extraction tests

**Depends on:** none
**Files:** `packages/graph/tests/nlq/EntityExtractor.test.ts`

1. Create test file `packages/graph/tests/nlq/EntityExtractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EntityExtractor } from '../../src/nlq/EntityExtractor.js';

const extractor = new EntityExtractor();

describe('EntityExtractor', () => {
  describe('quoted strings', () => {
    it('extracts double-quoted strings', () => {
      const result = extractor.extract('what depends on "AuthMiddleware"?');
      expect(result).toContain('AuthMiddleware');
    });

    it('extracts single-quoted strings', () => {
      const result = extractor.extract("where is 'UserService'?");
      expect(result).toContain('UserService');
    });

    it('extracts multiple quoted strings', () => {
      const result = extractor.extract('what connects "AuthMiddleware" to "UserService"?');
      expect(result).toContain('AuthMiddleware');
      expect(result).toContain('UserService');
    });

    it('does not include the quotes themselves', () => {
      const result = extractor.extract('find "AuthMiddleware"');
      expect(result).not.toContain('"AuthMiddleware"');
      expect(result).toContain('AuthMiddleware');
    });
  });

  describe('PascalCase and camelCase tokens', () => {
    it('extracts PascalCase tokens', () => {
      const result = extractor.extract('what calls UserService?');
      expect(result).toContain('UserService');
    });

    it('extracts camelCase tokens', () => {
      const result = extractor.extract('where is loginHandler?');
      expect(result).toContain('loginHandler');
    });

    it('extracts multiple cased tokens', () => {
      const result = extractor.extract('does UserService call loginHandler?');
      expect(result).toContain('UserService');
      expect(result).toContain('loginHandler');
    });

    it('does not extract ALL_CAPS words as camelCase', () => {
      const result = extractor.extract('what is the API?');
      // API is not PascalCase/camelCase — it's all caps
      expect(result).not.toContain('API');
    });
  });

  describe('file paths', () => {
    it('extracts file paths with extensions', () => {
      const result = extractor.extract('what depends on src/auth/middleware.ts?');
      expect(result).toContain('src/auth/middleware.ts');
    });

    it('extracts paths with .js extension', () => {
      const result = extractor.extract('find src/index.js');
      expect(result).toContain('src/index.js');
    });

    it('extracts paths starting with ./', () => {
      const result = extractor.extract('what is ./lib/utils.ts?');
      expect(result).toContain('./lib/utils.ts');
    });
  });

  describe('remaining significant nouns', () => {
    it('extracts nouns not consumed by intent keywords or stop words', () => {
      const result = extractor.extract('what breaks if I change auth?');
      expect(result).toContain('auth');
    });

    it('does not extract stop words', () => {
      const result = extractor.extract('what is the main entry point?');
      expect(result).not.toContain('the');
      expect(result).not.toContain('is');
    });

    it('does not extract intent keywords as entities', () => {
      const result = extractor.extract('find all controllers');
      // 'find' and 'all' are intent keywords for 'find'
      expect(result).not.toContain('find');
      expect(result).not.toContain('all');
      expect(result).toContain('controllers');
    });
  });

  describe('deduplication', () => {
    it('returns each entity only once even if matched by multiple strategies', () => {
      const result = extractor.extract('what calls "UserService" and UserService?');
      const count = result.filter((e) => e === 'UserService').length;
      expect(count).toBe(1);
    });
  });

  describe('priority order', () => {
    it('returns quoted strings before PascalCase tokens', () => {
      const result = extractor.extract('"ZModule" calls AModule');
      const zIdx = result.indexOf('ZModule');
      const aIdx = result.indexOf('AModule');
      expect(zIdx).toBeLessThan(aIdx);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      const result = extractor.extract('');
      expect(result).toEqual([]);
    });

    it('returns empty array for only stop words', () => {
      const result = extractor.extract('the a an is are was were');
      expect(result).toEqual([]);
    });

    it('handles extra whitespace', () => {
      const result = extractor.extract('  what   calls   UserService  ?  ');
      expect(result).toContain('UserService');
    });

    it('strips trailing punctuation from extracted nouns', () => {
      const result = extractor.extract('what about auth?');
      expect(result).toContain('auth');
      expect(result).not.toContain('auth?');
    });

    it('handles queries with only intent keywords', () => {
      const result = extractor.extract('find where locate search');
      expect(result).toEqual([]);
    });
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/nlq/EntityExtractor.test.ts`
3. Observe failure: `Cannot find module '../../src/nlq/EntityExtractor.js'`
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Commit: `test(nlq): add EntityExtractor test suite`

---

### Task 2: Implement EntityExtractor with quoted-string and PascalCase/camelCase extraction

**Depends on:** Task 1
**Files:** `packages/graph/src/nlq/EntityExtractor.ts`

1. Create implementation `packages/graph/src/nlq/EntityExtractor.ts`:

```typescript
import type { Intent } from './types.js';

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
    const allConsumed = new Set([...quotedConsumed, ...casingConsumed, ...pathConsumed]);
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

      add(cleaned);
    }

    return result;
  }
}
```

2. Run test: `cd packages/graph && npx vitest run tests/nlq/EntityExtractor.test.ts`
3. Observe: all tests pass
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Commit: `feat(nlq): implement EntityExtractor with 4-strategy pattern extraction`

---

### Task 3: Add file-path and remaining-noun edge-case tests, fix any failures

**Depends on:** Task 2
**Files:** `packages/graph/tests/nlq/EntityExtractor.test.ts`

1. Add additional test cases to the existing test file to cover edge cases not yet tested:

```typescript
// Add inside the 'file paths' describe block:
it('does not extract plain words without slashes as file paths', () => {
  const result = extractor.extract('what is middleware?');
  // 'middleware' should come from noun extraction, not file path extraction
  expect(result).toContain('middleware');
});

// Add inside the 'remaining significant nouns' describe block:
it('extracts multi-word entity context', () => {
  const result = extractor.extract('what breaks if I change the database layer?');
  expect(result).toContain('database');
  expect(result).toContain('layer');
});

// Add a new describe block:
describe('mixed strategies', () => {
  it('extracts entities from all strategies in one query', () => {
    const result = extractor.extract(
      'what depends on "AuthMiddleware" at src/auth/middleware.ts and calls UserService for auth?'
    );
    expect(result).toContain('AuthMiddleware');
    expect(result).toContain('UserService');
    expect(result).toContain('src/auth/middleware.ts');
    expect(result).toContain('auth');
  });

  it('handles query with only a file path', () => {
    const result = extractor.extract('src/index.ts');
    expect(result).toContain('src/index.ts');
  });

  it('handles query with only a PascalCase token', () => {
    const result = extractor.extract('UserService');
    expect(result).toContain('UserService');
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/nlq/EntityExtractor.test.ts`
3. Observe: all tests pass (if any fail, adjust the implementation in EntityExtractor.ts)
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Commit: `test(nlq): add edge-case and mixed-strategy tests for EntityExtractor`

---

### Task 4: Export EntityExtractor from nlq/index.ts

**Depends on:** Task 2
**Files:** `packages/graph/src/nlq/index.ts`

1. Modify `packages/graph/src/nlq/index.ts` to add the EntityExtractor export. Add after the existing `IntentClassifier` export line:

```typescript
export { EntityExtractor } from './EntityExtractor.js';
```

2. Run existing tests to verify no regressions: `cd packages/graph && npx vitest run tests/nlq/`
3. Observe: all tests pass (types, IntentClassifier, EntityExtractor)
4. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
5. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness check-deps`
6. Commit: `feat(nlq): export EntityExtractor from nlq barrel`

---

### Task 5: Final verification -- run full NLQ test suite and validate

**Depends on:** Tasks 1-4
**Files:** none (verification only)

[checkpoint:human-verify] -- Verify all EntityExtractor tests pass and exports are correct.

1. Run full NLQ test suite: `cd packages/graph && npx vitest run tests/nlq/`
2. Observe: all tests pass (types.test.ts, IntentClassifier.test.ts, EntityExtractor.test.ts)
3. Run: `cd /Users/cwarner/Projects/harness-engineering && npx harness validate`
4. Verify the EntityExtractor can be imported from the barrel: check that `packages/graph/src/nlq/index.ts` exports `EntityExtractor`.
5. No commit needed -- this is a verification checkpoint.
