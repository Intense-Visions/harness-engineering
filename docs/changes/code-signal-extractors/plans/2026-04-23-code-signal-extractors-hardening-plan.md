# Plan: Code Signal Extractors — Hardening

**Date:** 2026-04-23 | **Spec:** docs/changes/code-signal-extractors/plans/2026-04-22-code-signal-extractors-plan.md (parent) | **Tasks:** 7 | **Time:** ~35 min

## Goal

When this plan is complete, the code signal extractors handle edge cases that the initial implementation misses: the `as const` false-positive bug is fixed, the describe-stack misalignment is corrected, JavaScript-specific patterns have fixture coverage, large-file performance has a regression guard, and the tautological integration test actually verifies re-run stability.

## Observable Truths

1. `EnumConstantExtractor` does NOT emit an `as const` record for a plain `const X = {` object when a _different_ `as const` exists elsewhere in the same file
2. `TestDescriptionExtractor` correctly tracks describe-block nesting when multiple `describe` blocks exist at the same level (no stack misalignment)
3. A dedicated `auth.test.js` and `enums.js` JavaScript fixture exists and `EnumConstantExtractor` extracts `Object.freeze` and UPPER_CASE const patterns from it
4. Extractors produce correct output for files with Windows line endings (`\r\n`), empty files, and files containing only comments
5. Running extraction twice writes identical JSONL (verified by reading output from _two separate runs_, not the same file twice)
6. A benchmark test asserts extraction of a 10,000-line synthetic file completes in < 500ms
7. `ApiPathExtractor` Java basePath scanner does not pick up method-level `@RequestMapping` as a class base path

## Uncertainties

- [ASSUMPTION] 500ms threshold for 10k-line benchmark is generous enough for CI; may need tuning.
- [DEFERRABLE] Cross-file re-export resolution — intentionally out of scope for regex-based extractors. Document as known limitation.

## File Map

```
MODIFY packages/graph/src/ingest/extractors/EnumConstantExtractor.ts (fix as-const false positive)
MODIFY packages/graph/src/ingest/extractors/TestDescriptionExtractor.ts (fix describe stack pop)
MODIFY packages/graph/src/ingest/extractors/ApiPathExtractor.ts (fix Java basePath scanner)
CREATE packages/graph/__fixtures__/extractor-project/enums.js
CREATE packages/graph/__fixtures__/extractor-project/auth.test.js
MODIFY packages/graph/tests/ingest/extractors/EnumConstantExtractor.test.ts (add JS + edge case tests)
MODIFY packages/graph/tests/ingest/extractors/TestDescriptionExtractor.test.ts (add nesting test)
MODIFY packages/graph/tests/ingest/extractors/ApiPathExtractor.test.ts (add basePath test)
MODIFY packages/graph/tests/ingest/extractors/integration.test.ts (fix tautological re-run test, add edge cases)
CREATE packages/graph/tests/ingest/extractors/performance.bench.ts (large-file benchmark)
```

## Tasks

### Task 1: Fix `as const` false-positive in EnumConstantExtractor

**Files:** `packages/graph/src/ingest/extractors/EnumConstantExtractor.ts`

**Bug:** Line 63 checks `content.includes('as const')` on the _entire file content_ before inspecting each individual const object. If any object in the file uses `as const`, every `const X = {` in the file passes the guard. The subsequent block-scoped check (lines 66-68) is correct, but the outer guard on line 63 causes unnecessary processing and means a `const X = {` that does NOT have `as const` could still be matched if the block-extraction logic has a boundary error.

Fix: Remove the early `content.includes('as const')` guard entirely. The block-level check on lines 66-68 is sufficient and more precise.

```typescript
// Before (line 62-63):
const constMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*\{/);
if (constMatch && content.includes('as const')) {

// After:
const constMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*\{/);
if (constMatch) {
```

The inner `if (block.includes('as const'))` on line 68 already does the correct scoped check.

**Test:** Add a test with a file containing both an `as const` object AND a plain `const X = {}` — verify only the `as const` one is extracted.

**Commit:** `fix(graph): remove file-wide as-const guard in EnumConstantExtractor`

---

### Task 2: Fix describe-stack misalignment in TestDescriptionExtractor

**Files:** `packages/graph/src/ingest/extractors/TestDescriptionExtractor.ts`

**Bug:** Line 101 pops the describe stack on any line matching `/^\s*\}\s*\)\s*;?\s*$/` — this matches any `})` at any indentation, not just describe closings. In a file with nested callbacks, arrow functions, or `afterEach(() => { ... })`, the stack will pop too early, causing subsequent test descriptions to lose their suite context or produce wrong hierarchical names.

Fix: Track brace depth per describe to pop only when the matching closing brace is found:

```typescript
// Replace simple describeStack: string[] with:
const describeStack: Array<{ name: string; depth: number }> = [];
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]!;

  // Track brace depth
  for (const ch of line) {
    if (ch === '{') braceDepth++;
    if (ch === '}') {
      braceDepth--;
      // Pop describe if we've returned to its opening depth
      if (
        describeStack.length > 0 &&
        braceDepth <= describeStack[describeStack.length - 1]!.depth
      ) {
        describeStack.pop();
      }
    }
  }

  const describeMatch = line.match(/describe\s*\(\s*(['"`])((?:(?!\1).)*)\1/);
  if (describeMatch) {
    describeStack.push({ name: describeMatch[2]!, depth: braceDepth });
  }
  // ... rest of it/test matching uses describeStack.map(d => d.name)
}
```

**Test:** Add a test with nested describes and an `afterEach` block that contains `})` — verify test names preserve correct suite hierarchy.

**Commit:** `fix(graph): use brace-depth tracking for describe stack in TestDescriptionExtractor`

---

### Task 3: Fix Java basePath scanner in ApiPathExtractor

**Files:** `packages/graph/src/ingest/extractors/ApiPathExtractor.ts`

**Bug:** Lines 228-232 scan for `@RequestMapping` to set `basePath`, but the negative check `line.match(/class\s/) === null` only excludes lines that have _both_ `@RequestMapping` and `class` on the same line. In Spring, `@RequestMapping` is typically on a line _above_ the class declaration, so it will be picked up as basePath — which is correct. But a method-level `@RequestMapping` (which can also exist) would _also_ be picked up, overwriting the class basePath.

Fix: Only set basePath from `@RequestMapping` that appears before the first `class` declaration:

```typescript
let basePath = '';
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]!;
  // Stop scanning for basePath once we hit the class body
  if (line.match(/(?:public\s+|private\s+|protected\s+)?class\s/)) break;
  const baseMatch = line.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']\s*\)/);
  if (baseMatch) {
    basePath = baseMatch[1]!;
  }
}
```

**Test:** Add a Java fixture with both class-level and method-level `@RequestMapping` — verify method-level does not corrupt base path.

**Commit:** `fix(graph): limit Java basePath scanner to class-level @RequestMapping`

---

### Task 4: Add JavaScript fixture files and tests

**Files:** `packages/graph/__fixtures__/extractor-project/enums.js`, `packages/graph/__fixtures__/extractor-project/auth.test.js`, `packages/graph/tests/ingest/extractors/EnumConstantExtractor.test.ts`

Create `enums.js`:

```javascript
const OrderStatus = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
});

const PAYMENT_TYPES = {
  CREDIT: 'credit',
  DEBIT: 'debit',
  CASH: 'cash',
};

// This plain object should NOT be extracted (lowercase keys)
const helpers = {
  formatCurrency: (v) => `$${v}`,
  roundAmount: (v) => Math.round(v),
};
```

Create `auth.test.js`:

```javascript
const { describe, it } = require('node:test');

describe('Authentication', () => {
  it('should login with valid credentials', () => {});
  it('should reject invalid password', () => {});
});

describe('Authorization', () => {
  it('should allow admin access', () => {});
});
```

Add test in `EnumConstantExtractor.test.ts`:

```typescript
it('extracts Object.freeze and UPPER_CASE consts from JavaScript', () => {
  const content = readFixture('enums.js');
  const records = extractor.extract(content, 'enums.js', 'javascript');

  expect(records.length).toBeGreaterThanOrEqual(2);
  const names = records.map((r) => r.name);
  expect(names).toContain('OrderStatus');
  expect(names).toContain('PAYMENT_TYPES');
  // helpers should NOT be extracted (lowercase keys)
  expect(names).not.toContain('helpers');
});
```

**Test:** `npx vitest run packages/graph/tests/ingest/extractors/EnumConstantExtractor.test.ts`

**Commit:** `test(graph): add JavaScript fixture files and extraction tests`

---

### Task 5: Fix tautological re-run test and add edge-case tests

**Files:** `packages/graph/tests/ingest/extractors/integration.test.ts`

**Bug:** Lines 166-168 of the integration test read the JSONL file _twice from the same path_ after a single run. This doesn't verify re-run stability — it's a tautology. Fix: write to two different output dirs and compare.

```typescript
it('produces identical JSONL on re-run (stable output)', async () => {
  const runner = createExtractionRunner();
  const dir1 = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-run1-'));
  const dir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-run2-'));

  const store1 = new GraphStore();
  const store2 = new GraphStore();

  await runner.run(FIXTURE_DIR, store1, dir1);
  await runner.run(FIXTURE_DIR, store2, dir2);

  for (const fileName of [
    'test-descriptions.jsonl',
    'enum-constants.jsonl',
    'validation-rules.jsonl',
    'api-paths.jsonl',
  ]) {
    const content1 = await fs.readFile(path.join(dir1, fileName), 'utf-8');
    const content2 = await fs.readFile(path.join(dir2, fileName), 'utf-8');
    expect(content1).toBe(content2);
  }
});
```

Add edge-case tests:

```typescript
it('handles empty files without errors', async () => {
  const emptyProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-empty-file-'));
  await fs.writeFile(path.join(emptyProjectDir, 'empty.ts'), '');
  const runner = createExtractionRunner();
  const result = await runner.run(emptyProjectDir, new GraphStore(), tmpDir);
  expect(result.errors).toEqual([]);
});

it('handles files with only comments', async () => {
  const commentDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-comments-'));
  await fs.writeFile(path.join(commentDir, 'comments.ts'), '// just a comment\n/* block */\n');
  const runner = createExtractionRunner();
  const result = await runner.run(commentDir, new GraphStore(), tmpDir);
  expect(result.errors).toEqual([]);
});

it('handles Windows line endings', async () => {
  const winDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extractor-crlf-'));
  const content = 'export enum Status {\r\n  ACTIVE,\r\n  INACTIVE,\r\n}\r\n';
  await fs.writeFile(path.join(winDir, 'status.ts'), content);
  const runner = createExtractionRunner();
  const store = new GraphStore();
  await runner.run(winDir, store, tmpDir);
  const terms = store.findNodes({ type: 'business_term' });
  expect(terms.length).toBeGreaterThanOrEqual(1);
});
```

**Test:** `npx vitest run packages/graph/tests/ingest/extractors/integration.test.ts`

**Commit:** `test(graph): fix tautological re-run test and add edge-case coverage`

---

### Task 6: Add large-file performance benchmark

**Files:** `packages/graph/tests/ingest/extractors/performance.bench.ts`

Create a vitest bench file that generates a synthetic 10,000-line TypeScript file containing a mix of enums, test descriptions, validation schemas, and routes, then asserts all 4 extractors complete within budget.

```typescript
import { describe, bench } from 'vitest';
import { EnumConstantExtractor } from '../../../src/ingest/extractors/EnumConstantExtractor.js';
import { TestDescriptionExtractor } from '../../../src/ingest/extractors/TestDescriptionExtractor.js';
import { ValidationRuleExtractor } from '../../../src/ingest/extractors/ValidationRuleExtractor.js';
import { ApiPathExtractor } from '../../../src/ingest/extractors/ApiPathExtractor.js';

function generateLargeFile(lines: number): string {
  const chunks: string[] = [];
  for (let i = 0; i < lines / 10; i++) {
    chunks.push(`export enum Status${i} { A, B, C }`);
    chunks.push(`describe('Suite ${i}', () => {`);
    chunks.push(`  it('should do thing ${i}', () => {});`);
    chunks.push(`});`);
    chunks.push(`const Schema${i} = z.object({ field: z.string().min(1) });`);
    chunks.push(`router.get('/api/resource${i}', handler);`);
    chunks.push(`// padding line`);
    chunks.push(`// padding line`);
    chunks.push(`// padding line`);
    chunks.push(`// padding line`);
  }
  return chunks.join('\n');
}

const largeContent = generateLargeFile(10_000);

describe('Extractor performance (10k lines)', () => {
  bench(
    'EnumConstantExtractor',
    () => {
      new EnumConstantExtractor().extract(largeContent, 'large.ts', 'typescript');
    },
    { time: 500 }
  );

  bench(
    'TestDescriptionExtractor',
    () => {
      new TestDescriptionExtractor().extract(largeContent, 'large.ts', 'typescript');
    },
    { time: 500 }
  );

  bench(
    'ValidationRuleExtractor',
    () => {
      new ValidationRuleExtractor().extract(largeContent, 'large.ts', 'typescript');
    },
    { time: 500 }
  );

  bench(
    'ApiPathExtractor',
    () => {
      new ApiPathExtractor().extract(largeContent, 'large.ts', 'typescript');
    },
    { time: 500 }
  );
});
```

**Test:** `npx vitest bench packages/graph/tests/ingest/extractors/performance.bench.ts`

**Commit:** `test(graph): add 10k-line performance benchmark for extractors`

---

### Task 7: Run full test suite and verify green

**Files:** None (verification only)

1. `cd packages/graph && npx vitest run tests/ingest/extractors/`
2. Verify all existing 49 tests still pass
3. Verify new tests pass
4. `npx vitest bench tests/ingest/extractors/performance.bench.ts` — verify benchmark runs

**Commit:** None (verification task)

---

## Task Sequence

```
Tasks 1, 2, 3: Bug fixes (independent — parallelizable)
  ↓
Task 4: JS fixtures + tests (depends: 1 for as-const fix)
  ↓
Task 5: Integration test fixes + edge cases (depends: 1, 2 for corrected behavior)
Task 6: Performance benchmark (no deps — parallelizable with 5)
  ↓
Task 7: Full suite verification (depends: all above)
```

**Parallel opportunities:** Tasks 1, 2, 3 are independent bug fixes. Tasks 5 and 6 are independent of each other.
