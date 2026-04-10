# Plan: Phase 1 — MCP Response Compaction Foundation

**Date:** 2026-04-10
**Spec:** docs/changes/mcp-response-compaction/proposal.md
**Estimated tasks:** 8
**Estimated time:** 37 minutes

---

## Goal

Implement the compaction foundation in `packages/core/src/compaction/` — structural strategy, truncation strategy, pipeline composer, and packed envelope type with markdown serializer — all unit-tested against fixtures and exported from the core barrel.

---

## Observable Truths (Acceptance Criteria)

1. The system shall export a `StructuralStrategy` from `packages/core/src/compaction/strategies/structural.ts` that implements `CompactionStrategy`, removing empty fields, collapsing single-item arrays, stripping redundant whitespace, and normalizing JSON — with passing unit tests.
2. The system shall export a `TruncationStrategy` from `packages/core/src/compaction/strategies/truncation.ts` that implements `CompactionStrategy`, truncating to a default budget of 4000 tokens (chars/4) while preserving identifiers, file paths, error messages, and status fields — with passing unit tests.
3. The system shall export a `CompactionPipeline` from `packages/core/src/compaction/pipeline.ts` that composes an ordered array of strategies and applies them in sequence — with passing unit tests.
4. The system shall export a `PackedEnvelope` interface, `serializeEnvelope`, and `estimateTokens` from `packages/core/src/compaction/envelope.ts`, serializing envelopes to the spec's markdown comment format — with passing unit tests.
5. When `packages/core/src/compaction/index.ts` exists, the system shall re-export all compaction symbols.
6. When `packages/core/src/index.ts` is updated, the system shall export `* from './compaction'`.
7. When `npx vitest run packages/core/tests/compaction/` is run, the system shall pass all tests (≥15 total across the four test files).
8. When `harness validate` is run after all tasks complete, the system shall pass.

---

## File Map

```
CREATE packages/core/src/compaction/strategies/structural.ts
CREATE packages/core/src/compaction/strategies/truncation.ts
CREATE packages/core/src/compaction/pipeline.ts
CREATE packages/core/src/compaction/envelope.ts
CREATE packages/core/src/compaction/index.ts
CREATE packages/core/tests/compaction/structural.test.ts
CREATE packages/core/tests/compaction/truncation.test.ts
CREATE packages/core/tests/compaction/pipeline.test.ts
CREATE packages/core/tests/compaction/envelope.test.ts
MODIFY packages/core/src/index.ts  (add barrel export for compaction)
```

---

## Skeleton

1. CompactionStrategy interface + types — embedded in structural.ts (~1 task, ~4 min)
2. StructuralStrategy implementation + tests (~2 tasks, ~10 min)
3. TruncationStrategy implementation + tests (~2 tasks, ~10 min)
4. Pipeline composer + tests (~1 task, ~5 min)
5. Envelope type + serializer + tests (~1 task, ~5 min)
6. Barrel exports + core index wiring (~1 task, ~3 min)

**Estimated total:** 8 tasks, ~37 minutes

_Skeleton approved: yes (standard mode, informational)._

---

## Tasks

### Task 1: Define CompactionStrategy interface and write structural strategy (TDD)

**Depends on:** none
**Files:**

- `packages/core/src/compaction/strategies/structural.ts`
- `packages/core/tests/compaction/structural.test.ts`

**Step 1 — Write the test file first:**

Create `packages/core/tests/compaction/structural.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { StructuralStrategy } from '../../src/compaction/strategies/structural';

describe('StructuralStrategy', () => {
  const strategy = new StructuralStrategy();

  it('has name "structural" and lossy false', () => {
    expect(strategy.name).toBe('structural');
    expect(strategy.lossy).toBe(false);
  });

  it('removes null and undefined fields from JSON objects', () => {
    const input = JSON.stringify({ a: 1, b: null, c: undefined, d: 'keep' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: 1, d: 'keep' });
    expect('b' in parsed).toBe(false);
  });

  it('removes empty string fields', () => {
    const input = JSON.stringify({ a: 'value', b: '' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ a: 'value' });
  });

  it('removes empty array fields', () => {
    const input = JSON.stringify({ items: [], name: 'test' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ name: 'test' });
  });

  it('removes empty object fields', () => {
    const input = JSON.stringify({ meta: {}, name: 'test' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ name: 'test' });
  });

  it('collapses single-item arrays to scalar values', () => {
    const input = JSON.stringify({ tags: ['only-one'], name: 'test' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed.tags).toBe('only-one');
  });

  it('does not collapse multi-item arrays', () => {
    const input = JSON.stringify({ tags: ['a', 'b'] });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.tags)).toBe(true);
    expect(parsed.tags).toHaveLength(2);
  });

  it('strips redundant whitespace from string values', () => {
    const input = JSON.stringify({ text: '  hello   world  ' });
    const result = strategy.apply(input);
    const parsed = JSON.parse(result);
    expect(parsed.text).toBe('hello world');
  });

  it('returns non-JSON strings unchanged', () => {
    const plain = 'just plain text content here';
    expect(strategy.apply(plain)).toBe(plain);
  });

  it('normalizes pretty-printed JSON to compact form', () => {
    const pretty = JSON.stringify({ a: 1, b: 2 }, null, 2);
    const result = strategy.apply(pretty);
    expect(() => JSON.parse(result)).not.toThrow();
    // Compact form: no newlines in output
    expect(result.includes('\n')).toBe(false);
  });
});
```

**Step 2 — Run to observe failures:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/structural.test.ts 2>&1
```

Expected failure: `Cannot find module '../../src/compaction/strategies/structural'`

**Step 3 — Create the implementation:**

Create `packages/core/src/compaction/strategies/structural.ts`:

```typescript
/**
 * CompactionStrategy — the shared interface for all compaction strategies.
 * Defined here in structural.ts as the foundation type; re-exported from
 * packages/core/src/compaction/index.ts.
 */
export interface CompactionStrategy {
  name: 'structural' | 'truncate' | 'pack' | 'semantic';
  lossy: boolean;
  apply(content: string, budget?: number): string;
}

/**
 * Recursively removes empty/null/undefined fields, collapses single-item arrays,
 * and strips redundant whitespace from string values.
 */
function cleanObject(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;

  if (typeof value === 'string') {
    // Normalize internal whitespace sequences to a single space, trim edges
    return value.replace(/\s+/g, ' ').trim();
  }

  if (Array.isArray(value)) {
    const cleaned = value.map(cleanObject).filter((v) => v !== undefined && v !== '' && v !== null);

    if (cleaned.length === 0) return undefined;
    // Collapse single-item arrays to scalar
    if (cleaned.length === 1) return cleaned[0];
    return cleaned;
  }

  if (typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const result = cleanObject(v);
      if (result !== undefined && result !== '' && !isEmptyObject(result)) {
        cleaned[k] = result;
      }
    }
    if (Object.keys(cleaned).length === 0) return undefined;
    return cleaned;
  }

  return value;
}

function isEmptyObject(v: unknown): boolean {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    Object.keys(v as object).length === 0
  );
}

/**
 * Lossless structural compressor.
 *
 * For valid JSON input:
 * - Removes null, undefined, empty-string, empty-array, and empty-object fields
 * - Collapses single-item arrays to scalar values
 * - Strips redundant whitespace from string values (leading/trailing and internal runs)
 * - Normalizes output to compact JSON (no pretty-printing)
 *
 * For non-JSON input: returns the string unchanged.
 */
export class StructuralStrategy implements CompactionStrategy {
  readonly name = 'structural' as const;
  readonly lossy = false;

  apply(content: string, _budget?: number): string {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Not valid JSON — return as-is
      return content;
    }

    const cleaned = cleanObject(parsed);
    return JSON.stringify(cleaned);
  }
}
```

**Step 4 — Run tests and observe pass:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/structural.test.ts 2>&1
```

Expected: all 10 tests pass.

**Step 5:**

```
cd /Users/cwarner/Projects/harness-engineering && harness validate 2>&1
```

**Step 6 — Commit:**

```
git add packages/core/src/compaction/strategies/structural.ts packages/core/tests/compaction/structural.test.ts
git commit -m "$(cat <<'EOF'
feat(compaction): add StructuralStrategy and CompactionStrategy interface

Lossless structural compressor removes empty fields, collapses single-item
arrays, strips redundant whitespace, and normalizes JSON. TDD — 10 tests pass.
EOF
)"
```

---

### Task 2: Implement TruncationStrategy with priority-aware budget truncation (TDD)

**Depends on:** Task 1 (imports `CompactionStrategy` from structural.ts)
**Files:**

- `packages/core/src/compaction/strategies/truncation.ts`
- `packages/core/tests/compaction/truncation.test.ts`

**Step 1 — Write the test file first:**

Create `packages/core/tests/compaction/truncation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  TruncationStrategy,
  DEFAULT_TOKEN_BUDGET,
} from '../../src/compaction/strategies/truncation';

describe('TruncationStrategy', () => {
  const strategy = new TruncationStrategy();

  it('has name "truncate" and lossy false', () => {
    expect(strategy.name).toBe('truncate');
    expect(strategy.lossy).toBe(false);
  });

  it('exports DEFAULT_TOKEN_BUDGET of 4000', () => {
    expect(DEFAULT_TOKEN_BUDGET).toBe(4000);
  });

  it('returns content unchanged when within budget', () => {
    const content = 'short content';
    expect(strategy.apply(content)).toBe(content);
  });

  it('truncates content that exceeds default token budget', () => {
    // 4000 tokens * 4 chars/token = 16000 chars budget
    const overBudget = 'x'.repeat(20000);
    const result = strategy.apply(overBudget);
    expect(result.length).toBeLessThan(overBudget.length);
  });

  it('respects a custom budget passed at apply time', () => {
    const content = 'a'.repeat(1000);
    // budget = 100 tokens = 400 chars
    const result = strategy.apply(content, 100);
    expect(result.length).toBeLessThanOrEqual(400 + 50); // small margin for truncation marker
  });

  it('preserves identifier-like tokens (capitalized words, camelCase, paths)', () => {
    // Build a string with high-priority content followed by filler
    const highPriority = 'UserService /src/services/user.ts ERROR: Cannot read property';
    const filler = 'verbose description '.repeat(500);
    const content = highPriority + '\n' + filler;
    const result = strategy.apply(content, 50); // very tight budget
    expect(result).toContain('UserService');
  });

  it('preserves lines containing "error" or "Error" keywords', () => {
    const filler = 'unimportant filler text '.repeat(500);
    const errorLine = 'Error: Connection refused at port 5432';
    const content = filler + '\n' + errorLine;
    const result = strategy.apply(content, 50);
    expect(result.toLowerCase()).toContain('error');
  });

  it('preserves lines containing file paths (contains /)', () => {
    const filler = 'verbose output text '.repeat(500);
    const pathLine = '/src/services/critical-module.ts line 42';
    const content = filler + '\n' + pathLine;
    const result = strategy.apply(content, 50);
    expect(result).toContain('/src/services/critical-module.ts');
  });

  it('appends a truncation marker when content is cut', () => {
    const overBudget = 'word '.repeat(5000);
    const result = strategy.apply(overBudget, 10);
    expect(result).toContain('[truncated');
  });

  it('handles empty string without error', () => {
    expect(strategy.apply('')).toBe('');
  });
});
```

**Step 2 — Run to observe failures:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/truncation.test.ts 2>&1
```

Expected failure: `Cannot find module '../../src/compaction/strategies/truncation'`

**Step 3 — Create the implementation:**

Create `packages/core/src/compaction/strategies/truncation.ts`:

```typescript
import type { CompactionStrategy } from './structural';

export const DEFAULT_TOKEN_BUDGET = 4000;

/** Chars per token estimate — matches spec's `chars/4` formula. */
const CHARS_PER_TOKEN = 4;

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
    // Score each line; preserve original index for stable ordering
    const scored = lines.map((line, idx) => ({ line, idx, score: lineScore(line) }));

    // Sort descending by score, then by original position for ties (stable top-section bias)
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

    const marker = '\n[truncated — prioritized truncation applied]';
    const available = charBudget - marker.length;

    const kept: Array<{ line: string; idx: number }> = [];
    let used = 0;

    for (const item of scored) {
      const lineLen = item.line.length + 1; // +1 for newline
      if (used + lineLen > available) break;
      kept.push({ line: item.line, idx: item.idx });
      used += lineLen;
    }

    // Restore original order for readability
    kept.sort((a, b) => a.idx - b.idx);

    return kept.map((k) => k.line).join('\n') + marker;
  }
}
```

**Step 4 — Run tests and observe pass:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/truncation.test.ts 2>&1
```

Expected: all 10 tests pass.

**Step 5:**

```
cd /Users/cwarner/Projects/harness-engineering && harness validate 2>&1
```

**Step 6 — Commit:**

```
git add packages/core/src/compaction/strategies/truncation.ts packages/core/tests/compaction/truncation.test.ts
git commit -m "$(cat <<'EOF'
feat(compaction): add TruncationStrategy with priority-aware budget truncation

Preserves identifiers, file paths, error lines, and status fields first;
cuts verbose filler last. Default budget: 4000 tokens. TDD — 10 tests pass.
EOF
)"
```

---

### Task 3: Implement CompactionPipeline (TDD)

**Depends on:** Tasks 1 and 2
**Files:**

- `packages/core/src/compaction/pipeline.ts`
- `packages/core/tests/compaction/pipeline.test.ts`

**Step 1 — Write the test file first:**

Create `packages/core/tests/compaction/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { CompactionPipeline } from '../../src/compaction/pipeline';
import type { CompactionStrategy } from '../../src/compaction/strategies/structural';

const makeStrategy = (
  name: 'structural' | 'truncate' | 'pack' | 'semantic',
  transform: (s: string) => string
): CompactionStrategy => ({
  name,
  lossy: false,
  apply: vi.fn().mockImplementation(transform),
});

describe('CompactionPipeline', () => {
  it('applies a single strategy to input', () => {
    const s = makeStrategy('structural', (x) => x.toUpperCase());
    const pipeline = new CompactionPipeline([s]);
    expect(pipeline.apply('hello')).toBe('HELLO');
  });

  it('chains multiple strategies in order', () => {
    const s1 = makeStrategy('structural', (x) => x + '-A');
    const s2 = makeStrategy('truncate', (x) => x + '-B');
    const pipeline = new CompactionPipeline([s1, s2]);
    expect(pipeline.apply('start')).toBe('start-A-B');
  });

  it('passes budget to each strategy', () => {
    const applySpy = vi.fn().mockReturnValue('result');
    const s: CompactionStrategy = { name: 'structural', lossy: false, apply: applySpy };
    const pipeline = new CompactionPipeline([s]);
    pipeline.apply('input', 500);
    expect(applySpy).toHaveBeenCalledWith('input', 500);
  });

  it('returns input unchanged when no strategies are provided', () => {
    const pipeline = new CompactionPipeline([]);
    expect(pipeline.apply('no-op')).toBe('no-op');
  });

  it('exposes the list of strategy names', () => {
    const s1 = makeStrategy('structural', (x) => x);
    const s2 = makeStrategy('truncate', (x) => x);
    const pipeline = new CompactionPipeline([s1, s2]);
    expect(pipeline.strategyNames).toEqual(['structural', 'truncate']);
  });

  it('handles empty string input without error', () => {
    const s = makeStrategy('structural', (x) => x);
    const pipeline = new CompactionPipeline([s]);
    expect(pipeline.apply('')).toBe('');
  });
});
```

**Step 2 — Run to observe failures:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/pipeline.test.ts 2>&1
```

Expected failure: `Cannot find module '../../src/compaction/pipeline'`

**Step 3 — Create the implementation:**

Create `packages/core/src/compaction/pipeline.ts`:

```typescript
import type { CompactionStrategy } from './strategies/structural';

/**
 * CompactionPipeline composes an ordered list of CompactionStrategy instances
 * and applies them in sequence, passing the output of each strategy as the
 * input to the next.
 *
 * Budget is forwarded to every strategy unchanged — each strategy applies
 * its own interpretation of the budget.
 */
export class CompactionPipeline {
  private readonly strategies: CompactionStrategy[];

  constructor(strategies: CompactionStrategy[]) {
    this.strategies = strategies;
  }

  /** The ordered list of strategy names in this pipeline. */
  get strategyNames(): string[] {
    return this.strategies.map((s) => s.name);
  }

  /**
   * Apply all strategies in order.
   * @param content — input string
   * @param budget — optional token budget forwarded to each strategy
   */
  apply(content: string, budget?: number): string {
    return this.strategies.reduce((current, strategy) => {
      return strategy.apply(current, budget);
    }, content);
  }
}
```

**Step 4 — Run tests and observe pass:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/pipeline.test.ts 2>&1
```

Expected: all 6 tests pass.

**Step 5:**

```
cd /Users/cwarner/Projects/harness-engineering && harness validate 2>&1
```

**Step 6 — Commit:**

```
git add packages/core/src/compaction/pipeline.ts packages/core/tests/compaction/pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat(compaction): add CompactionPipeline strategy composer

Chains strategies in sequence, forwards budget to each, exposes strategyNames.
TDD — 6 tests pass.
EOF
)"
```

---

### Task 4: Implement PackedEnvelope type and markdown serializer (TDD)

**Depends on:** none (standalone type module)
**Files:**

- `packages/core/src/compaction/envelope.ts`
- `packages/core/tests/compaction/envelope.test.ts`

**Step 1 — Write the test file first:**

Create `packages/core/tests/compaction/envelope.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  serializeEnvelope,
  estimateTokens,
  type PackedEnvelope,
} from '../../src/compaction/envelope';

const makeEnvelope = (overrides: Partial<PackedEnvelope> = {}): PackedEnvelope => ({
  meta: {
    strategy: ['structural', 'truncate'],
    originalTokenEstimate: 4200,
    compactedTokenEstimate: 1100,
    reductionPct: 74,
    cached: false,
  },
  sections: [
    { source: 'gather_context', content: 'some compacted content' },
    { source: 'docs/changes/spec.md', content: 'spec content' },
  ],
  ...overrides,
});

describe('estimateTokens', () => {
  it('estimates tokens as Math.ceil(chars / 4)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(100))).toBe(25);
    expect(estimateTokens('a'.repeat(101))).toBe(26);
  });

  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('serializeEnvelope', () => {
  it('includes the packed comment header with strategy names', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('<!-- packed: structural+truncate');
  });

  it('includes original and compacted token counts in header', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('4200');
    expect(result).toContain('1100');
  });

  it('includes reduction percentage in header', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('-74%');
  });

  it('renders each section with a ### heading using source as label', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('### [gather_context]');
    expect(result).toContain('### [docs/changes/spec.md]');
  });

  it('renders section content after its heading', () => {
    const result = serializeEnvelope(makeEnvelope());
    expect(result).toContain('some compacted content');
    expect(result).toContain('spec content');
  });

  it('appends (cached) to the header when cached is true', () => {
    const envelope = makeEnvelope({ meta: { ...makeEnvelope().meta, cached: true } });
    const result = serializeEnvelope(envelope);
    expect(result).toContain('cached');
  });

  it('handles an envelope with a single section', () => {
    const envelope: PackedEnvelope = {
      meta: {
        strategy: ['structural'],
        originalTokenEstimate: 100,
        compactedTokenEstimate: 80,
        reductionPct: 20,
        cached: false,
      },
      sections: [{ source: 'tool_output', content: 'data' }],
    };
    const result = serializeEnvelope(envelope);
    expect(result).toContain('### [tool_output]');
    expect(result).toContain('data');
  });

  it('handles an envelope with no sections gracefully', () => {
    const envelope = makeEnvelope({ sections: [] });
    const result = serializeEnvelope(envelope);
    expect(result).toContain('<!-- packed:');
  });
});
```

**Step 2 — Run to observe failures:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/envelope.test.ts 2>&1
```

Expected failure: `Cannot find module '../../src/compaction/envelope'`

**Step 3 — Create the implementation:**

Create `packages/core/src/compaction/envelope.ts`:

```typescript
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

  const strategyLabel = meta.strategy.join('+');
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
```

**Step 4 — Run tests and observe pass:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/envelope.test.ts 2>&1
```

Expected: all 11 tests pass.

**Step 5:**

```
cd /Users/cwarner/Projects/harness-engineering && harness validate 2>&1
```

**Step 6 — Commit:**

```
git add packages/core/src/compaction/envelope.ts packages/core/tests/compaction/envelope.test.ts
git commit -m "$(cat <<'EOF'
feat(compaction): add PackedEnvelope type and markdown serializer

Implements serializeEnvelope (spec comment-header format) and estimateTokens
(chars/4 heuristic). TDD — 11 tests pass.
EOF
)"
```

---

### Task 5: Create compaction barrel and wire into core index

**Depends on:** Tasks 1, 2, 3, 4
**Files:**

- `packages/core/src/compaction/index.ts` (create)
- `packages/core/src/index.ts` (modify — add compaction export)

**Step 1 — Create the compaction barrel:**

Create `packages/core/src/compaction/index.ts`:

```typescript
/**
 * Compaction module — strategies, pipeline, and envelope types for
 * reducing MCP tool response token consumption.
 */
export type { CompactionStrategy } from './strategies/structural';
export { StructuralStrategy } from './strategies/structural';

export { TruncationStrategy, DEFAULT_TOKEN_BUDGET } from './strategies/truncation';

export { CompactionPipeline } from './pipeline';

export type { PackedEnvelope } from './envelope';
export { serializeEnvelope, estimateTokens } from './envelope';
```

**Step 2 — Add compaction export to core index:**

In `packages/core/src/index.ts`, after the `export * from './adoption';` block (around line 159) and before the `export const VERSION` line, add:

```typescript
/**
 * Compaction module for reducing MCP tool response token consumption.
 */
export * from './compaction';
```

The exact insertion point (line 159 in `/Users/cwarner/Projects/harness-engineering/packages/core/src/index.ts`):

```typescript
// BEFORE (existing content at bottom of adoption block):
  type DailyAdoption,
} from './adoption';

/**
 * The current version of the Harness Engineering core library.
```

Insert the compaction export between the adoption export and the VERSION comment.

**Step 3 — Run the full compaction test suite:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/ 2>&1
```

Expected: all tests across all four test files pass (≥ 37 tests total).

**Step 4 — Run the full core test suite to verify no regressions:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run 2>&1 | tail -20
```

Expected: all previously passing tests still pass.

**Step 5:**

```
cd /Users/cwarner/Projects/harness-engineering && harness validate 2>&1
```

**Step 6 — Commit:**

```
git add packages/core/src/compaction/index.ts packages/core/src/index.ts
git commit -m "$(cat <<'EOF'
feat(compaction): wire compaction barrel into core index

All four compaction modules (structural, truncation, pipeline, envelope)
are now exported from @harness-engineering/core.
EOF
)"
```

---

### Task 6: Run full validation sweep and verify observable truths

[checkpoint:human-verify]

**Depends on:** Tasks 1–5
**Files:** none (read-only verification task)

This task verifies that every observable truth from the acceptance criteria is demonstrably met before marking Phase 1 complete.

**Step 1 — Run full compaction test suite:**

```
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/core/tests/compaction/ --reporter=verbose 2>&1
```

Confirm: ≥ 37 tests across 4 test files, all passing.

**Step 2 — Verify compaction exports are accessible from the core barrel:**

```
cd /Users/cwarner/Projects/harness-engineering && node -e "
const core = require('./packages/core/dist/index.js');
const names = ['StructuralStrategy','TruncationStrategy','DEFAULT_TOKEN_BUDGET','CompactionPipeline','serializeEnvelope','estimateTokens'];
for (const n of names) {
  console.log(n, typeof core[n] !== 'undefined' ? 'OK' : 'MISSING');
}
" 2>&1
```

Note: If `dist/` is not built yet, run `cd /Users/cwarner/Projects/harness-engineering/packages/core && npm run build` first, then re-run the check. Confirm all 6 names print `OK`.

**Step 3 — Run full harness validate:**

```
cd /Users/cwarner/Projects/harness-engineering && harness validate 2>&1
```

Confirm: `validation passed`

**Step 4 — Quick smoke test of serialize output format:**

```
cd /Users/cwarner/Projects/harness-engineering && node -e "
const { serializeEnvelope } = require('./packages/core/dist/index.js');
const result = serializeEnvelope({
  meta: { strategy: ['structural','truncate'], originalTokenEstimate: 4200, compactedTokenEstimate: 1100, reductionPct: 74, cached: false },
  sections: [{ source: 'gather_context', content: 'example' }]
});
console.log(result);
" 2>&1
```

Expected output (matches spec format):

```
<!-- packed: structural+truncate | 4200→1100 tokens (-74%) -->
### [gather_context]
example
```

**Step 5 — Human review:** Verify the output above matches the spec's markdown format exactly. If any observable truth is not met, return to the relevant task and fix before proceeding to Phase 2.

---

## Observable Truth Traceability

| Observable Truth                                              | Delivered By                 |
| ------------------------------------------------------------- | ---------------------------- |
| 1. StructuralStrategy exported, passes tests                  | Tasks 1, 5                   |
| 2. TruncationStrategy exported, passes tests                  | Tasks 2, 5                   |
| 3. CompactionPipeline exported, passes tests                  | Tasks 3, 5                   |
| 4. PackedEnvelope, serializeEnvelope, estimateTokens exported | Tasks 4, 5                   |
| 5. compaction/index.ts barrel exports                         | Task 5                       |
| 6. core/index.ts exports compaction                           | Task 5                       |
| 7. npx vitest run passes ≥ 15 tests                           | Tasks 1–4                    |
| 8. harness validate passes                                    | All tasks (included in each) |

---

## Notes and Conventions

- **Test location:** `packages/core/tests/compaction/` — mirrors the `packages/core/tests/pricing/` pattern (`packages/core/src/pricing/tests/pricing.test.ts` is at `packages/core/tests/pricing/pricing.test.ts`).
- **Import paths in tests:** Use `../../src/compaction/...` — consistent with how `packages/core/tests/pricing/pricing.test.ts:2` imports from `../../src/pricing/pricing`.
- **No external dependencies added.** All four modules use only TypeScript builtins and types — no additions to `package.json`.
- **`CompactionStrategy` interface location:** Defined in `structural.ts` and re-exported through the barrel. This avoids a separate `types.ts` file (matching the `pricing/pricing.ts` pattern where types live alongside their implementations, with `types.ts` used only for data-shape interfaces that would create circular imports).
- **Single-item array collapsing:** The structural strategy collapses `["x"]` → `"x"`. This is lossless in the context of compaction (source attribution is preserved at the envelope level), but callers who depend on array type-checking must be aware. The spec explicitly calls for this behavior.
