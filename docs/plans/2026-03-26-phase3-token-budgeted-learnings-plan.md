# Plan: Phase 3 -- Token-Budgeted Learnings

**Date:** 2026-03-26
**Spec:** docs/changes/efficient-context-pipeline/proposal.md (Section 3)
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

`gather_context` loads learnings within a token budget (default 1000 tokens for learnings slice), prioritizing session learnings over global learnings, sorted by recency, and filtered by relevance to the `intent` parameter.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When `gather_context` includes learnings with a `session` parameter, session learnings appear before global learnings in the output array.
2. **Event-driven:** When combined learnings exceed the 1000-token default budget, the output is truncated to fit within the budget (measured as `ceil(chars / 4)`).
3. **Ubiquitous:** The system shall sort learnings by recency (newest first) within each tier.
4. **Event-driven:** When `intent` is provided, learnings whose content or tags match intent keywords are prioritized over non-matching entries within their tier.
5. **State-driven:** While `session` is omitted, only global learnings are loaded (backwards compatible with existing behavior).
6. **Ubiquitous:** All existing `loadRelevantLearnings` tests continue to pass unchanged.
7. **Ubiquitous:** `npx vitest run tests/state/learnings.test.ts` passes with all new and existing tests.

## File Map

```
MODIFY packages/core/src/state/learnings.ts         (add loadBudgetedLearnings, estimateTokens, scoreRelevance, two-tier loading)
MODIFY packages/core/tests/state/learnings.test.ts  (add tests for budgeted loading, relevance, recency, two-tier)
MODIFY packages/core/src/state/index.ts             (export loadBudgetedLearnings)
MODIFY packages/core/src/state/state-manager.ts     (re-export loadBudgetedLearnings)
MODIFY packages/cli/src/mcp/tools/gather-context.ts (wire loadBudgetedLearnings into learnings promise)
```

## Tasks

### Task 1: Add token estimation and relevance scoring helpers to learnings.ts (TDD)

**Depends on:** none
**Files:** `packages/core/src/state/learnings.ts`, `packages/core/tests/state/learnings.test.ts`

1. Add the following test cases to `packages/core/tests/state/learnings.test.ts` (append after the existing `describe` blocks):

```typescript
import {
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
} from '../../src/state/state-manager';

describe('loadBudgetedLearnings', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-budget-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no learnings exist', async () => {
    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should return all learnings when within budget', async () => {
    await appendLearning(tmpDir, 'Short learning A', 'skill-a', 'success');
    await appendLearning(tmpDir, 'Short learning B', 'skill-b', 'success');

    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('should truncate learnings when they exceed token budget', async () => {
    // Each learning is ~30 chars = ~8 tokens. With budget of 20 tokens, only ~2 fit.
    for (let i = 0; i < 10; i++) {
      await appendLearning(
        tmpDir,
        `Learning entry number ${i} with some extra padding text here`,
        'skill-a',
        'success'
      );
    }

    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 20 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThan(10);
      // Verify total chars fits within budget (20 tokens * 4 chars/token = 80 chars)
      const totalChars = result.value.join('\n').length;
      expect(totalChars).toBeLessThanOrEqual(20 * 4);
    }
  });

  it('should sort by recency (newest first)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-01-01 [skill:a]:** Old learning',
        '',
        '- **2026-03-15 [skill:b]:** Middle learning',
        '',
        '- **2026-03-25 [skill:c]:** Recent learning',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, { intent: 'test', tokenBudget: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toContain('Recent learning');
      expect(result.value[1]).toContain('Middle learning');
      expect(result.value[2]).toContain('Old learning');
    }
  });

  it('should prioritize learnings matching intent keywords', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:a]:** Database migration requires downtime',
        '',
        '- **2026-03-25 [skill:b]:** Token budgeting improves context efficiency',
        '',
        '- **2026-03-25 [skill:c]:** Always run linter before commit',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'Implement token budget for learnings',
      tokenBudget: 1000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The token/budget related learning should come first
      expect(result.value[0]).toContain('Token budgeting');
    }
  });
});
```

2. Update the import line at top of test file to include `loadBudgetedLearnings`:

Change existing import:

```typescript
import { appendLearning, loadRelevantLearnings } from '../../src/state/state-manager';
```

to:

```typescript
import {
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
} from '../../src/state/state-manager';
```

3. Run tests: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
4. Observe failure: `loadBudgetedLearnings` is not exported.

5. Add the following to `packages/core/src/state/learnings.ts` after the existing `loadRelevantLearnings` function:

```typescript
/** Estimate token count from a string (chars / 4, ceiling). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Score how relevant a learning entry is to a given intent.
 * Returns a number 0-1. Higher = more relevant.
 * Uses keyword overlap between intent words and entry text.
 */
export function scoreRelevance(entry: string, intent: string): number {
  if (!intent || intent.trim() === '') return 0;
  const intentWords = intent
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip short words like "a", "to", "in"
  if (intentWords.length === 0) return 0;
  const entryLower = entry.toLowerCase();
  const matches = intentWords.filter((word) => entryLower.includes(word));
  return matches.length / intentWords.length;
}

/**
 * Parse date from a learning entry. Returns the date string or null.
 * Entries look like: "- **2026-03-25 [skill:X]:** content"
 * or heading format: "## 2026-03-25 — Task 3: ..."
 */
function parseDateFromEntry(entry: string): string | null {
  const match = entry.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export interface BudgetedLearningsOptions {
  intent: string;
  tokenBudget?: number;
  skill?: string;
  session?: string;
  stream?: string;
}

/**
 * Load learnings with token budget, two-tier loading, recency sorting, and relevance filtering.
 *
 * - Session learnings (primary): always loaded first if session is provided
 * - Global learnings (secondary): loaded to fill remaining budget
 * - Sorted by recency (newest first) within each tier
 * - Filtered by relevance to intent (matching entries prioritized)
 * - Capped at tokenBudget (default 1000 tokens)
 */
export async function loadBudgetedLearnings(
  projectPath: string,
  options: BudgetedLearningsOptions
): Promise<Result<string[], Error>> {
  const { intent, tokenBudget = 1000, skill, session, stream } = options;
  const charBudget = tokenBudget * 4;

  const sortByRecencyAndRelevance = (entries: string[]): string[] => {
    return [...entries].sort((a, b) => {
      const dateA = parseDateFromEntry(a) ?? '0000-00-00';
      const dateB = parseDateFromEntry(b) ?? '0000-00-00';
      // Primary sort: date descending (newest first)
      const dateCompare = dateB.localeCompare(dateA);
      if (dateCompare !== 0) return dateCompare;
      // Secondary sort: relevance descending
      return scoreRelevance(b, intent) - scoreRelevance(a, intent);
    });
  };

  const allEntries: string[] = [];

  // Tier 1: Session learnings (primary)
  if (session) {
    const sessionResult = await loadRelevantLearnings(projectPath, skill, stream, session);
    if (sessionResult.ok) {
      allEntries.push(...sortByRecencyAndRelevance(sessionResult.value));
    }
  }

  // Tier 2: Global learnings (secondary)
  const globalResult = await loadRelevantLearnings(projectPath, skill, stream);
  if (globalResult.ok) {
    allEntries.push(...sortByRecencyAndRelevance(globalResult.value));
  }

  // Apply token budget: greedily add entries until budget exhausted
  const budgeted: string[] = [];
  let totalChars = 0;
  for (const entry of allEntries) {
    const entryChars = entry.length + (budgeted.length > 0 ? 1 : 0); // +1 for newline separator
    if (totalChars + entryChars > charBudget && budgeted.length > 0) break;
    budgeted.push(entry);
    totalChars += entryChars;
  }

  return Ok(budgeted);
}
```

Note: The `Ok` import already exists at the top of `learnings.ts`.

6. Run tests: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
7. Observe: all tests pass (existing 7 + new 5 = 12 total).
8. Run: `harness validate`
9. Commit: `feat(state): add loadBudgetedLearnings with token budget, recency sort, and relevance scoring`

---

### Task 2: Add two-tier loading tests (session + global) (TDD)

**Depends on:** Task 1
**Files:** `packages/core/tests/state/learnings.test.ts`

1. Add the following test cases inside the existing `loadBudgetedLearnings` describe block in `packages/core/tests/state/learnings.test.ts`:

```typescript
it('should load session learnings before global learnings (two-tier)', async () => {
  // Create global learnings
  const globalDir = path.join(tmpDir, '.harness');
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(
    path.join(globalDir, 'learnings.md'),
    ['# Learnings', '', '- **2026-03-25 [skill:a]:** Global learning one', ''].join('\n')
  );

  // Create session learnings
  const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, 'learnings.md'),
    ['# Learnings', '', '- **2026-03-24 [skill:b]:** Session learning one', ''].join('\n')
  );

  const result = await loadBudgetedLearnings(tmpDir, {
    intent: 'test',
    tokenBudget: 1000,
    session: 'test-session',
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.length).toBe(2);
    // Session learnings come first regardless of date
    expect(result.value[0]).toContain('Session learning');
    expect(result.value[1]).toContain('Global learning');
  }
});

it('should fall back to global only when session is omitted', async () => {
  // Create global learnings
  const globalDir = path.join(tmpDir, '.harness');
  fs.mkdirSync(globalDir, { recursive: true });
  fs.writeFileSync(
    path.join(globalDir, 'learnings.md'),
    ['# Learnings', '', '- **2026-03-25 [skill:a]:** Global only learning', ''].join('\n')
  );

  // Also create session learnings (should NOT be loaded)
  const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir, 'learnings.md'),
    ['# Learnings', '', '- **2026-03-24 [skill:b]:** Session learning ignored', ''].join('\n')
  );

  const result = await loadBudgetedLearnings(tmpDir, {
    intent: 'test',
    tokenBudget: 1000,
    // no session parameter
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.length).toBe(1);
    expect(result.value[0]).toContain('Global only learning');
  }
});

it('should respect budget across both tiers', async () => {
  // Create global learnings (many entries)
  const globalDir = path.join(tmpDir, '.harness');
  fs.mkdirSync(globalDir, { recursive: true });
  const globalEntries = Array.from(
    { length: 5 },
    (_, i) =>
      `- **2026-03-${String(20 + i).padStart(2, '0')} [skill:a]:** Global learning ${i} with padding text`
  ).join('\n\n');
  fs.writeFileSync(path.join(globalDir, 'learnings.md'), `# Learnings\n\n${globalEntries}\n`);

  // Create session learnings (many entries)
  const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionEntries = Array.from(
    { length: 5 },
    (_, i) =>
      `- **2026-03-${String(20 + i).padStart(2, '0')} [skill:b]:** Session learning ${i} with padding text`
  ).join('\n\n');
  fs.writeFileSync(path.join(sessionDir, 'learnings.md'), `# Learnings\n\n${sessionEntries}\n`);

  // Very tight budget: should only fit a few
  const result = await loadBudgetedLearnings(tmpDir, {
    intent: 'test',
    tokenBudget: 50, // 200 chars
    session: 'test-session',
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.length).toBeLessThan(10);
    const totalChars = result.value.join('\n').length;
    expect(totalChars).toBeLessThanOrEqual(200);
  }
});
```

2. Run tests: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
3. Observe: all tests pass (existing 7 + 5 from Task 1 + 3 new = 15 total).
4. Run: `harness validate`
5. Commit: `test(state): add two-tier loading tests for loadBudgetedLearnings`

---

### Task 3: Export loadBudgetedLearnings from core barrel files

**Depends on:** Task 1
**Files:** `packages/core/src/state/index.ts`, `packages/core/src/state/state-manager.ts`

1. In `packages/core/src/state/index.ts`, change the learnings export line from:

```typescript
export { clearLearningsCache, appendLearning, loadRelevantLearnings } from './learnings';
```

to:

```typescript
export {
  clearLearningsCache,
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
} from './learnings';
```

Also add below the existing `type` export for learnings (add after the `Learning accumulation` comment block):

```typescript
export type { BudgetedLearningsOptions } from './learnings';
```

2. In `packages/core/src/state/state-manager.ts`, change the learnings export line from:

```typescript
export { clearLearningsCache, appendLearning, loadRelevantLearnings } from './learnings';
```

to:

```typescript
export {
  clearLearningsCache,
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
} from './learnings';
```

3. Run: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
4. Observe: all tests still pass.
5. Run: `harness validate`
6. Commit: `feat(state): export loadBudgetedLearnings from core barrel files`

---

### Task 4: Wire loadBudgetedLearnings into gather_context

**Depends on:** Task 3
**Files:** `packages/cli/src/mcp/tools/gather-context.ts`

1. In `packages/cli/src/mcp/tools/gather-context.ts`, change the `learningsPromise` block (lines 87-91) from:

```typescript
const learningsPromise = includeSet.has('learnings')
  ? import('@harness-engineering/core').then((core) =>
      core.loadRelevantLearnings(projectPath, input.skill, undefined, input.session)
    )
  : Promise.resolve(null);
```

to:

```typescript
const learningsPromise = includeSet.has('learnings')
  ? import('@harness-engineering/core').then((core) =>
      core.loadBudgetedLearnings(projectPath, {
        intent: input.intent,
        tokenBudget: 1000,
        skill: input.skill,
        session: input.session,
      })
    )
  : Promise.resolve(null);
```

2. Add `learningsBudget` to the `gatherContextDefinition.inputSchema.properties` (optional, for future override):

After the `tokenBudget` property, add:

```typescript
      learningsBudget: {
        type: 'number',
        description: 'Token budget for learnings slice (default 1000). Separate from graph tokenBudget.',
      },
```

3. Update the `handleGatherContext` input type to include:

```typescript
  learningsBudget?: number;
```

4. Update the learningsPromise to use `input.learningsBudget ?? 1000` instead of hardcoded `1000`:

```typescript
const learningsPromise = includeSet.has('learnings')
  ? import('@harness-engineering/core').then((core) =>
      core.loadBudgetedLearnings(projectPath, {
        intent: input.intent,
        tokenBudget: input.learningsBudget ?? 1000,
        skill: input.skill,
        session: input.session,
      })
    )
  : Promise.resolve(null);
```

5. Run: `harness validate`
6. Commit: `feat(gather-context): wire token-budgeted learnings with two-tier loading`

---

## Traceability

| Observable Truth                     | Delivered by                                    |
| ------------------------------------ | ----------------------------------------------- |
| 1. Session learnings before global   | Task 1 (implementation), Task 2 (two-tier test) |
| 2. Token budget truncation           | Task 1 (truncation test + impl)                 |
| 3. Recency sort                      | Task 1 (recency test + impl)                    |
| 4. Relevance filtering               | Task 1 (relevance test + impl)                  |
| 5. Backwards compatible (no session) | Task 2 (fallback test)                          |
| 6. Existing tests pass               | Task 1 (no changes to existing tests)           |
| 7. All tests pass                    | Task 2 (final count verified)                   |
