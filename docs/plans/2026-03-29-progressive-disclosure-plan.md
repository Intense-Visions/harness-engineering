# Plan: Progressive Disclosure in Context Assembly

**Date:** 2026-03-29
**Spec:** docs/changes/claude-mem-patterns/progressive-disclosure/proposal.md
**Estimated tasks:** 8
**Estimated time:** 35 minutes

## Goal

Refactor the learnings retrieval pipeline into a 3-layer progressive disclosure system (index scan, summary expansion, full fetch) so that `gather_context` can retrieve learnings at variable depth, reducing internal token waste during scoring.

## Observable Truths (Acceptance Criteria)

1. When `gather_context` is called with `depth: "index"`, the system shall return one-line summaries for all learnings entries, consuming less than 50% of the tokens used by the current full-load approach for the same file.
2. When `gather_context` is called with `depth: "summary"` (the default), the system shall produce equivalent output to today's behavior with no regression in context quality.
3. The system shall preserve existing frontmatter on entries that `appendLearning` does not modify (round-trip safety).
4. While a learnings.md file contains no frontmatter annotations, the system shall behave identically to current behavior (backward compatibility).
5. When `appendLearning` writes a new entry, the entry shall include a `<!-- hash:<8-char-hex> tags:<comma-separated> -->` frontmatter comment preceding the bullet.
6. `cd packages/core && npx vitest run tests/state/learnings.test.ts` shall pass with all existing tests plus new progressive-disclosure tests.
7. `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts` shall pass with depth parameter tests.

## File Map

- MODIFY `packages/core/src/state/learnings.ts` (add frontmatter write in appendLearning, add parseFrontmatter/extractIndexEntry helpers, add LearningsIndexEntry type, refactor loadRelevantLearnings to support index-only mode, add loadIndexEntries function)
- MODIFY `packages/core/src/state/index.ts` (export new types and functions)
- MODIFY `packages/core/src/state/state-manager.ts` (re-export new functions)
- MODIFY `packages/core/tests/state/learnings.test.ts` (add tests for frontmatter, index scan, depth modes)
- MODIFY `packages/cli/src/mcp/tools/gather-context.ts` (add depth parameter to definition and handler, pass through to loadBudgetedLearnings)
- MODIFY `packages/cli/tests/mcp/tools/gather-context.test.ts` (add depth parameter tests)
- CREATE `packages/core/scripts/backfill-learnings-frontmatter.ts` (migration script)

## Tasks

### Task 1: Add frontmatter types and parsing helpers (TDD)

**Depends on:** none
**Files:** `packages/core/src/state/learnings.ts`, `packages/core/tests/state/learnings.test.ts`

1. Add tests to `packages/core/tests/state/learnings.test.ts`:

```typescript
import {
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
  parseFrontmatter,
  extractIndexEntry,
} from '../../src/state/state-manager';

describe('parseFrontmatter', () => {
  it('should extract hash and tags from frontmatter comment', () => {
    const result = parseFrontmatter('<!-- hash:a1b2c3d4 tags:auth,middleware -->');
    expect(result).toEqual({ hash: 'a1b2c3d4', tags: ['auth', 'middleware'] });
  });

  it('should return null for line without frontmatter', () => {
    const result = parseFrontmatter('- **2026-03-15 [skill:a]:** Some learning');
    expect(result).toBeNull();
  });

  it('should handle hash-only frontmatter (no tags)', () => {
    const result = parseFrontmatter('<!-- hash:a1b2c3d4 -->');
    expect(result).toEqual({ hash: 'a1b2c3d4', tags: [] });
  });
});

describe('extractIndexEntry', () => {
  it('should extract first line of a multi-line entry as summary', () => {
    const entry =
      '- **2026-03-15 [skill:harness-execution] [outcome:success]:** JWT middleware handles refresh tokens correctly when the token is expired\n  Additional detail here about the implementation';
    const result = extractIndexEntry(entry);
    expect(result.summary).toContain('JWT middleware handles refresh tokens');
    expect(result.summary).not.toContain('Additional detail');
  });

  it('should use full entry when entry is single line', () => {
    const entry = '- **2026-03-15 [skill:a]:** Short learning';
    const result = extractIndexEntry(entry);
    expect(result.summary).toBe(entry);
  });

  it('should extract tags from skill and outcome markers', () => {
    const entry = '- **2026-03-15 [skill:harness-tdd] [outcome:gotcha]:** Something';
    const result = extractIndexEntry(entry);
    expect(result.tags).toContain('harness-tdd');
    expect(result.tags).toContain('gotcha');
  });

  it('should compute hash from entry content', () => {
    const entry = '- **2026-03-15 [skill:a]:** Some learning';
    const result = extractIndexEntry(entry);
    expect(result.hash).toMatch(/^[a-f0-9]{8}$/);
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
3. Observe failures: `parseFrontmatter` and `extractIndexEntry` not exported.

4. Add types and helper functions to `packages/core/src/state/learnings.ts`:

```typescript
import * as crypto from 'crypto';

export interface LearningsFrontmatter {
  hash: string;
  tags: string[];
}

export interface LearningsIndexEntry {
  hash: string;
  tags: string[];
  summary: string;
  fullText: string;
}

/** Parse a frontmatter comment line: <!-- hash:XXXX tags:a,b --> */
export function parseFrontmatter(line: string): LearningsFrontmatter | null {
  const match = line.match(/^<!--\s+hash:([a-f0-9]+)(?:\s+tags:([^\s]+))?\s+-->/);
  if (!match) return null;
  const hash = match[1]!;
  const tags = match[2] ? match[2].split(',').filter(Boolean) : [];
  return { hash, tags };
}

/** Compute an 8-char hex hash of the entry text. */
function computeEntryHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/**
 * Extract a lightweight index entry from a full learning entry.
 * Summary = first line only. Tags extracted from [skill:X] and [outcome:Y] markers.
 * Hash computed from full entry text.
 */
export function extractIndexEntry(entry: string): LearningsIndexEntry {
  const lines = entry.split('\n');
  const summary = lines[0] ?? entry;
  const tags: string[] = [];
  const skillMatch = entry.match(/\[skill:([^\]]+)\]/);
  if (skillMatch?.[1]) tags.push(skillMatch[1]);
  const outcomeMatch = entry.match(/\[outcome:([^\]]+)\]/);
  if (outcomeMatch?.[1]) tags.push(outcomeMatch[1]);
  return {
    hash: computeEntryHash(entry),
    tags,
    summary,
    fullText: entry,
  };
}
```

5. Export from `packages/core/src/state/state-manager.ts` — add `parseFrontmatter`, `extractIndexEntry` to the re-export block from `'./learnings'`.
6. Export from `packages/core/src/state/index.ts` — add `parseFrontmatter`, `extractIndexEntry` to exports, and `LearningsFrontmatter`, `LearningsIndexEntry` to type exports.
7. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
8. Observe: all tests pass (existing 15 + new 7).
9. Commit: `feat(learnings): add frontmatter parsing and index entry extraction helpers`

---

### Task 2: Add frontmatter annotation to appendLearning (TDD)

**Depends on:** Task 1
**Files:** `packages/core/src/state/learnings.ts`, `packages/core/tests/state/learnings.test.ts`

1. Add tests to `packages/core/tests/state/learnings.test.ts`:

```typescript
describe('appendLearning with frontmatter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-fm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write frontmatter comment before tagged entry', async () => {
    await appendLearning(tmpDir, 'Auth tokens expire silently', 'harness-tdd', 'gotcha');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const lines = content.split('\n');
    // Find the frontmatter line
    const fmLine = lines.find((l) => l.startsWith('<!-- hash:'));
    expect(fmLine).toBeDefined();
    expect(fmLine).toMatch(/^<!-- hash:[a-f0-9]{8} tags:harness-tdd,gotcha -->/);
  });

  it('should write frontmatter with skill-only tag when no outcome', async () => {
    await appendLearning(tmpDir, 'Use strict mode', 'harness-execution');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const fmLine = content.split('\n').find((l) => l.startsWith('<!-- hash:'));
    expect(fmLine).toBeDefined();
    expect(fmLine).toMatch(/tags:harness-execution -->/);
  });

  it('should write frontmatter with no tags when no skill/outcome', async () => {
    await appendLearning(tmpDir, 'Simple learning');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    const fmLine = content.split('\n').find((l) => l.startsWith('<!-- hash:'));
    expect(fmLine).toBeDefined();
    expect(fmLine).toMatch(/^<!-- hash:[a-f0-9]{8} -->/);
  });

  it('should preserve existing entries when appending new one', async () => {
    await appendLearning(tmpDir, 'First learning', 'skill-a', 'success');
    await appendLearning(tmpDir, 'Second learning', 'skill-b', 'gotcha');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('First learning');
    expect(content).toContain('Second learning');
    const fmLines = content.split('\n').filter((l) => l.startsWith('<!-- hash:'));
    expect(fmLines.length).toBe(2);
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
3. Observe failures: frontmatter lines not found.

4. Modify `appendLearning` in `packages/core/src/state/learnings.ts`. Change the entry construction to prepend a frontmatter comment:

Replace the existing entry-building block (lines 36-43) with:

```typescript
// Build tags list for frontmatter
const fmTags: string[] = [];
if (skillName) fmTags.push(skillName);
if (outcome) fmTags.push(outcome);

let bulletLine: string;
if (skillName && outcome) {
  bulletLine = `- **${timestamp} [skill:${skillName}] [outcome:${outcome}]:** ${learning}`;
} else if (skillName) {
  bulletLine = `- **${timestamp} [skill:${skillName}]:** ${learning}`;
} else {
  bulletLine = `- **${timestamp}:** ${learning}`;
}

const hash = crypto.createHash('sha256').update(bulletLine).digest('hex').slice(0, 8);
const tagsStr = fmTags.length > 0 ? ` tags:${fmTags.join(',')}` : '';
const frontmatter = `<!-- hash:${hash}${tagsStr} -->`;
const entry = `\n${frontmatter}\n${bulletLine}\n`;
```

Add `import * as crypto from 'crypto';` at top of file (if not added in Task 1).

5. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
6. Observe: all tests pass, including existing tests that check for `[skill:]` and `[outcome:]` content.
7. Commit: `feat(learnings): write frontmatter hash+tags annotation on new entries`

---

### Task 3: Teach loadRelevantLearnings to parse frontmatter-annotated entries (TDD)

**Depends on:** Task 2
**Files:** `packages/core/src/state/learnings.ts`, `packages/core/tests/state/learnings.test.ts`

1. Add tests to `packages/core/tests/state/learnings.test.ts`:

```typescript
describe('loadRelevantLearnings with frontmatter entries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-fm-load-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should parse entries that have frontmatter comments (not treat them as separate entries)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:harness-tdd,gotcha -->',
        '- **2026-03-25 [skill:harness-tdd] [outcome:gotcha]:** Token refresh fails silently',
        '',
        '<!-- hash:e5f6a7b8 tags:harness-execution,success -->',
        '- **2026-03-24 [skill:harness-execution] [outcome:success]:** Middleware setup works',
        '',
      ].join('\n')
    );

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // Entries should NOT include the frontmatter comment line
      expect(result.value[0]).not.toContain('<!-- hash:');
      expect(result.value[0]).toContain('Token refresh fails silently');
    }
  });

  it('should handle mixed entries (some with frontmatter, some without)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:skill-a -->',
        '- **2026-03-25 [skill:skill-a]:** With frontmatter',
        '',
        '- **2026-03-24 [skill:skill-b]:** Without frontmatter',
        '',
      ].join('\n')
    );

    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
3. Observe: likely failure — frontmatter comments currently get absorbed into entry text or treated as separate blocks.

4. Modify the parsing loop in `loadRelevantLearnings` (the `else` branch starting at line 224) to skip frontmatter comment lines. Replace the parsing block:

```typescript
const content = fs.readFileSync(learningsPath, 'utf-8');
const lines = content.split('\n');
entries = [];
let currentBlock: string[] = [];

for (const line of lines) {
  if (line.startsWith('# ')) continue;

  // Skip frontmatter comment lines — they are metadata, not entry content
  if (/^<!--\s+hash:[a-f0-9]+/.test(line)) continue;

  const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
  const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

  if (isDatedBullet || isHeading) {
    if (currentBlock.length > 0) {
      entries.push(currentBlock.join('\n'));
    }
    currentBlock = [line];
  } else if (line.trim() !== '' && currentBlock.length > 0) {
    currentBlock.push(line);
  }
}

if (currentBlock.length > 0) {
  entries.push(currentBlock.join('\n'));
}
```

5. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
6. Observe: all tests pass.
7. Commit: `feat(learnings): skip frontmatter comments during entry parsing for backward compatibility`

---

### Task 4: Implement loadIndexEntries for index-scan layer (TDD)

**Depends on:** Task 3
**Files:** `packages/core/src/state/learnings.ts`, `packages/core/tests/state/learnings.test.ts`, `packages/core/src/state/index.ts`, `packages/core/src/state/state-manager.ts`

1. Add tests to `packages/core/tests/state/learnings.test.ts`:

```typescript
import {
  // ... existing imports ...
  loadIndexEntries,
} from '../../src/state/state-manager';

describe('loadIndexEntries', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-index-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return empty array when no learnings file', async () => {
    const result = await loadIndexEntries(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('should return index entries with summaries (first line only)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:skill-a,gotcha -->',
        '- **2026-03-25 [skill:skill-a] [outcome:gotcha]:** Auth tokens expire silently',
        '  More detail about the auth token issue that is not needed for index',
        '',
        '- **2026-03-24 [skill:skill-b]:** Simple one-liner',
        '',
      ].join('\n')
    );

    const result = await loadIndexEntries(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // First entry: has frontmatter, should use it
      expect(result.value[0]!.hash).toBe('a1b2c3d4');
      expect(result.value[0]!.tags).toEqual(['skill-a', 'gotcha']);
      expect(result.value[0]!.summary).toContain('Auth tokens expire silently');
      expect(result.value[0]!.summary).not.toContain('More detail');
      // Second entry: no frontmatter, hash computed on read
      expect(result.value[1]!.hash).toMatch(/^[a-f0-9]{8}$/);
      expect(result.value[1]!.summary).toContain('Simple one-liner');
    }
  });

  it('should use frontmatter tags when available', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:abcd1234 tags:auth,middleware -->',
        '- **2026-03-25 [skill:auth] [outcome:decision]:** Use middleware pattern',
        '',
      ].join('\n')
    );

    const result = await loadIndexEntries(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.tags).toEqual(['auth', 'middleware']);
    }
  });

  it('should consume fewer tokens than loading full entries', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    const entries = Array.from({ length: 10 }, (_, i) =>
      [
        `<!-- hash:${String(i).padStart(8, '0')} tags:skill-${i} -->`,
        `- **2026-03-${String(20 + (i % 10)).padStart(2, '0')} [skill:skill-${i}]:** Learning ${i} short summary`,
        `  This is a much longer detailed explanation that spans multiple words and provides context about learning ${i}. It includes technical details, code references, and implementation notes that are not needed for the index scan layer.`,
      ].join('\n')
    ).join('\n\n');
    fs.writeFileSync(path.join(harnessDir, 'learnings.md'), `# Learnings\n\n${entries}\n`);

    const indexResult = await loadIndexEntries(tmpDir);
    const fullResult = await loadRelevantLearnings(tmpDir);
    expect(indexResult.ok).toBe(true);
    expect(fullResult.ok).toBe(true);
    if (indexResult.ok && fullResult.ok) {
      const indexTokens = Math.ceil(indexResult.value.map((e) => e.summary).join('\n').length / 4);
      const fullTokens = Math.ceil(fullResult.value.join('\n').length / 4);
      expect(indexTokens).toBeLessThan(fullTokens * 0.5);
    }
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
3. Observe failures: `loadIndexEntries` not exported.

4. Add `loadIndexEntries` to `packages/core/src/state/learnings.ts`:

```typescript
/**
 * Load lightweight index entries from a learnings file.
 * Returns summaries (first line) with hash and tags for each entry.
 * Uses frontmatter when available; computes hash and extracts tags on-the-fly when not.
 *
 * This is Layer 1 of the progressive disclosure pipeline.
 */
export async function loadIndexEntries(
  projectPath: string,
  skillName?: string,
  stream?: string,
  session?: string
): Promise<Result<LearningsIndexEntry[], Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream, session);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok([]);
    }

    const content = fs.readFileSync(learningsPath, 'utf-8');
    const lines = content.split('\n');
    const indexEntries: LearningsIndexEntry[] = [];
    let pendingFrontmatter: LearningsFrontmatter | null = null;
    let currentBlock: string[] = [];

    for (const line of lines) {
      if (line.startsWith('# ')) continue;

      const fm = parseFrontmatter(line);
      if (fm) {
        pendingFrontmatter = fm;
        continue;
      }

      const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
      const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

      if (isDatedBullet || isHeading) {
        if (currentBlock.length > 0) {
          // Flush previous block — pendingFrontmatter was already consumed
          // so this block has no frontmatter (it was consumed by the previous entry)
        }
        // Start new entry
        const fullText = line; // We only need first line for summary
        if (pendingFrontmatter) {
          indexEntries.push({
            hash: pendingFrontmatter.hash,
            tags: pendingFrontmatter.tags,
            summary: line,
            fullText: '', // Placeholder — full text not loaded in index mode
          });
          pendingFrontmatter = null;
        } else {
          const idx = extractIndexEntry(line);
          indexEntries.push({
            hash: idx.hash,
            tags: idx.tags,
            summary: line,
            fullText: '',
          });
        }
        currentBlock = [line];
      } else if (line.trim() !== '' && currentBlock.length > 0) {
        currentBlock.push(line);
      }
    }

    if (skillName) {
      const filtered = indexEntries.filter(
        (e) => e.tags.includes(skillName) || e.summary.includes(`[skill:${skillName}]`)
      );
      return Ok(filtered);
    }

    return Ok(indexEntries);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load index entries: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
```

5. Export `loadIndexEntries` from `packages/core/src/state/state-manager.ts` and `packages/core/src/state/index.ts`.
6. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
7. Observe: all tests pass.
8. Commit: `feat(learnings): add loadIndexEntries for progressive disclosure Layer 1`

---

### Task 5: Add depth parameter to loadBudgetedLearnings (TDD)

**Depends on:** Task 4
**Files:** `packages/core/src/state/learnings.ts`, `packages/core/tests/state/learnings.test.ts`

1. Add tests to `packages/core/tests/state/learnings.test.ts`:

```typescript
describe('loadBudgetedLearnings with depth', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-learnings-depth-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return summaries only when depth is "index"', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '<!-- hash:a1b2c3d4 tags:skill-a -->',
        '- **2026-03-25 [skill:skill-a]:** Auth token handling summary',
        '  Detailed explanation of auth token issue with code examples and edge cases that spans many words',
        '',
        '<!-- hash:e5f6a7b8 tags:skill-b -->',
        '- **2026-03-24 [skill:skill-b]:** Middleware ordering matters',
        '  Long explanation of middleware order dependencies and how they affect request processing pipeline',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'auth tokens',
      tokenBudget: 1000,
      depth: 'index',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      // Summaries should not contain the detail lines
      result.value.forEach((entry) => {
        expect(entry).not.toContain('Detailed explanation');
        expect(entry).not.toContain('Long explanation');
      });
    }
  });

  it('should return full entries when depth is "summary" (default behavior)', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:a]:** Learning with detail',
        '  Extra detail line',
        '',
      ].join('\n')
    );

    const result = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]).toContain('Extra detail line');
    }
  });

  it('should default to "summary" depth when not specified', async () => {
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'learnings.md'),
      [
        '# Learnings',
        '',
        '- **2026-03-25 [skill:a]:** Full entry with detail',
        '  Detail preserved',
        '',
      ].join('\n')
    );

    const resultDefault = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
    });
    const resultExplicit = await loadBudgetedLearnings(tmpDir, {
      intent: 'test',
      tokenBudget: 1000,
      depth: 'summary',
    });
    expect(resultDefault.ok).toBe(true);
    expect(resultExplicit.ok).toBe(true);
    if (resultDefault.ok && resultExplicit.ok) {
      expect(resultDefault.value).toEqual(resultExplicit.value);
    }
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
3. Observe failures: `depth` property not recognized on options.

4. Modify `BudgetedLearningsOptions` in `packages/core/src/state/learnings.ts`:

```typescript
export interface BudgetedLearningsOptions {
  intent: string;
  tokenBudget?: number;
  skill?: string;
  session?: string;
  stream?: string;
  depth?: 'index' | 'summary' | 'full';
}
```

5. Modify `loadBudgetedLearnings` to branch on depth. At the start of the function, after destructuring, add depth handling:

```typescript
const { intent, tokenBudget = 1000, skill, session, stream, depth = 'summary' } = options;

// Layer 1: Index-only mode — return summaries, skip full text loading
if (depth === 'index') {
  const indexEntries: LearningsIndexEntry[] = [];

  if (session) {
    const sessionResult = await loadIndexEntries(projectPath, skill, stream, session);
    if (sessionResult.ok) indexEntries.push(...sessionResult.value);
  }

  const globalResult = await loadIndexEntries(projectPath, skill, stream);
  if (globalResult.ok) {
    const sessionHashes = new Set(indexEntries.map((e) => e.hash));
    const uniqueGlobal = globalResult.value.filter((e) => !sessionHashes.has(e.hash));
    indexEntries.push(...uniqueGlobal);
  }

  // Apply token budget to summaries
  const budgeted: string[] = [];
  let totalTokens = 0;
  for (const entry of indexEntries) {
    const separator = budgeted.length > 0 ? '\n' : '';
    const entryCost = estimateTokens(entry.summary + separator);
    if (totalTokens + entryCost > tokenBudget) break;
    budgeted.push(entry.summary);
    totalTokens += entryCost;
  }

  return Ok(budgeted);
}

// Layer 2 ("summary") and Layer 3 ("full"): existing full-text behavior
```

The rest of the function body remains unchanged (the existing recency/relevance sort and budget logic).

6. Run test: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
7. Observe: all tests pass.
8. Commit: `feat(learnings): add depth parameter to loadBudgetedLearnings for progressive disclosure`

---

### Task 6: Add depth parameter to gather_context MCP tool (TDD)

**Depends on:** Task 5
**Files:** `packages/cli/src/mcp/tools/gather-context.ts`, `packages/cli/tests/mcp/tools/gather-context.test.ts`

1. Add tests to `packages/cli/tests/mcp/tools/gather-context.test.ts`:

```typescript
describe('depth parameter', () => {
  it('definition includes depth property with enum values', () => {
    const props = gatherContextDefinition.inputSchema.properties;
    expect(props).toHaveProperty('depth');
    expect(props.depth.enum).toEqual(['index', 'summary', 'full']);
  });

  it('passes depth through to learnings loading', async () => {
    // Integration test: verify depth parameter is accepted without error
    const response = await handleGatherContext({
      path: '/nonexistent/project-depth-test',
      intent: 'test depth parameter',
      include: ['learnings'],
      depth: 'index',
    });
    expect(response.isError).toBeUndefined();
    const output = JSON.parse(response.content[0]!.text);
    // Should not error — learnings returns empty for nonexistent path
    expect(Array.isArray(output.learnings)).toBe(true);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts`
3. Observe failures: `depth` not in definition, not accepted by handler.

4. Modify `packages/cli/src/mcp/tools/gather-context.ts`:

Add `depth` to the definition's properties:

```typescript
      depth: {
        type: 'string',
        enum: ['index', 'summary', 'full'],
        description:
          'Retrieval depth for learnings. "index" returns one-line summaries, "summary" (default) returns full entries, "full" returns entries with linked context.',
      },
```

Add `depth` to the handler input type:

```typescript
  depth?: 'index' | 'summary' | 'full';
```

Pass `depth` through to `loadBudgetedLearnings` in the learnings promise:

```typescript
const learningsPromise = includeSet.has('learnings')
  ? import('@harness-engineering/core').then((core) =>
      core.loadBudgetedLearnings(projectPath, {
        intent: input.intent,
        tokenBudget: input.learningsBudget ?? 1000,
        ...(input.skill !== undefined && { skill: input.skill }),
        ...(input.session !== undefined && { session: input.session }),
        ...(input.depth !== undefined && { depth: input.depth }),
      })
    )
  : Promise.resolve(null);
```

5. Run test: `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts`
6. Observe: all tests pass.
7. Commit: `feat(gather-context): add depth parameter for progressive disclosure retrieval`

---

### Task 7: Create backfill migration script

**Depends on:** Task 1
**Files:** `packages/core/scripts/backfill-learnings-frontmatter.ts`

[checkpoint:human-verify] -- Verify tasks 1-6 are complete and tests pass before running migration against real files.

1. Create `packages/core/scripts/backfill-learnings-frontmatter.ts`:

```typescript
#!/usr/bin/env npx tsx
/**
 * Backfill existing learnings.md entries with frontmatter hash comments.
 *
 * Non-destructive: adds <!-- hash:XXXX tags:a,b --> comments before entries
 * that do not already have them. Does not modify entry content.
 *
 * Usage: npx tsx packages/core/scripts/backfill-learnings-frontmatter.ts <path-to-learnings.md>
 */
import * as fs from 'fs';
import * as crypto from 'crypto';

function computeHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

function extractTags(line: string): string[] {
  const tags: string[] = [];
  const skillMatch = line.match(/\[skill:([^\]]+)\]/);
  if (skillMatch?.[1]) tags.push(skillMatch[1]);
  const outcomeMatch = line.match(/\[outcome:([^\]]+)\]/);
  if (outcomeMatch?.[1]) tags.push(outcomeMatch[1]);
  return tags;
}

function backfill(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const output: string[] = [];
  let modified = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
    const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

    if (isDatedBullet || isHeading) {
      // Check if previous non-empty line is already a frontmatter comment
      const prevLine = output.length > 0 ? output[output.length - 1] : '';
      const hasFrontmatter = prevLine !== undefined && /^<!--\s+hash:[a-f0-9]+/.test(prevLine);

      if (!hasFrontmatter) {
        const hash = computeHash(line);
        const tags = extractTags(line);
        const tagsStr = tags.length > 0 ? ` tags:${tags.join(',')}` : '';
        output.push(`<!-- hash:${hash}${tagsStr} -->`);
        modified++;
      }
    }

    output.push(line);
  }

  fs.writeFileSync(filePath, output.join('\n'));
  console.log(`Backfilled ${modified} entries in ${filePath}`);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx backfill-learnings-frontmatter.ts <path-to-learnings.md>');
  process.exit(1);
}

backfill(filePath);
```

2. Test manually: create a temp learnings file, run the script, verify output:
   ```
   echo '# Learnings\n\n- **2026-03-25 [skill:a]:** Test entry\n' > /tmp/test-learnings.md
   npx tsx packages/core/scripts/backfill-learnings-frontmatter.ts /tmp/test-learnings.md
   cat /tmp/test-learnings.md
   ```
3. Verify output contains `<!-- hash:XXXXXXXX tags:a -->` before the entry.
4. Commit: `feat(learnings): add backfill migration script for frontmatter annotations`

---

### Task 8: End-to-end integration verification

**Depends on:** Tasks 1-7
**Files:** none (verification only)

[checkpoint:human-verify] -- Final verification before considering the feature complete.

1. Run all core learnings tests: `cd packages/core && npx vitest run tests/state/learnings.test.ts`
2. Run all core tests: `cd packages/core && npx vitest run`
3. Run gather-context tests: `cd packages/cli && npx vitest run tests/mcp/tools/gather-context.test.ts`
4. Run typecheck: `cd packages/core && npx tsc --noEmit`
5. Run typecheck: `cd packages/cli && npx tsc --noEmit`
6. Verify observable truths:
   - Truth 1: "index" depth returns summaries at < 50% token cost -- verified by Task 4 test "should consume fewer tokens"
   - Truth 2: "summary" depth matches current behavior -- verified by Task 5 test "default to summary depth"
   - Truth 3: Round-trip safety -- verified by Task 2 test "preserve existing entries"
   - Truth 4: Backward compatibility -- verified by Task 3 test "mixed entries"
   - Truth 5: appendLearning writes frontmatter -- verified by Task 2 tests
   - Truth 6: Core tests pass -- verified by steps 1-2
   - Truth 7: CLI tests pass -- verified by step 3
7. Commit: no commit (verification only)
