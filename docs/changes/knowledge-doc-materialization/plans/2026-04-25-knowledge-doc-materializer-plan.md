# Plan: Knowledge Document Materializer (Phase 2)

**Date:** 2026-04-25 | **Spec:** docs/changes/knowledge-doc-materialization/proposal.md | **Tasks:** 5 | **Time:** ~25 min

## Goal

Create a `KnowledgeDocMaterializer` class that takes `GapEntry[]` from the Phase 1 differential gap report and creates `docs/knowledge/{domain}/*.md` files from graph nodes, with frontmatter that round-trips through `BusinessKnowledgeIngestor`'s `parseFrontmatter()`.

## Observable Truths (Acceptance Criteria)

1. When `materialize(gapEntries, { projectDir, dryRun: false })` is called with gap entries whose nodes have content >= 10 chars and a resolvable domain, the system creates `docs/knowledge/{domain}/{slugified-name}.md` files with correct frontmatter (`type`, `domain`, optional `tags`, optional `related`).
2. When a gap entry has `hasContent: false`, the system skips it and returns a `SkippedEntry` with reason `'no_content'`.
3. When a node looked up via `store.getNode()` has no content or content trimmed < 10 chars, the system skips it with reason `'no_content'`.
4. When a node has no `metadata.domain` and no `node.path` matching `packages/{name}` or `src/{name}`, the system skips it with reason `'no_domain'`.
5. When `dryRun: true`, the system writes nothing to disk and returns all processable entries as skipped with reason `'dry_run'`.
6. When `created.length >= maxDocs` (default 50), remaining entries are skipped with reason `'cap_reached'`.
7. When two gap entries have the same slugified name within the same domain, the second file gets a `-2` suffix (collision resolution up to `-10`).
8. When a materialized doc is read back by `BusinessKnowledgeIngestor`'s frontmatter regex (`/^---\n([\s\S]*?)\n---\n([\s\S]*)$/`), it parses successfully with correct type, domain, and arrays.
9. When a node has type `'business_fact'`, it is mapped to `'business_rule'` in the frontmatter. Any other non-valid type maps to `'business_concept'`.
10. `npx vitest run tests/ingest/KnowledgeDocMaterializer.test.ts` passes (run from `packages/graph/`) with 12 tests covering all behaviors.
11. `KnowledgeDocMaterializer` and its types (`MaterializeOptions`, `MaterializeResult`, `MaterializedDoc`, `SkippedEntry`) are exported from `packages/graph/src/index.ts`.

## Uncertainties

- [ASSUMPTION] The materializer checks `hasContent` from the gap entry first (fast path), then does a secondary check on actual node content length (trimmed < 10 chars) when looking up the node. Both paths produce `'no_content'` skip reason.
- [ASSUMPTION] Tags and related arrays in frontmatter use the bracket format `[item1, item2]` to match `parseFrontmatter()` parsing (`value.startsWith('[') && value.endsWith(']')` path).
- [ASSUMPTION] Node content is written as-is (no transformation) in the body after the `# Title` heading.
- [DEFERRABLE] Whether `resolveCollision` should handle more than 10 suffix attempts. Spec says up to 10. After 10 collisions the method throws.

## File Map

- CREATE `packages/graph/src/ingest/KnowledgeDocMaterializer.ts`
- CREATE `packages/graph/tests/ingest/KnowledgeDocMaterializer.test.ts`
- MODIFY `packages/graph/src/index.ts` (add exports)

## Tasks

### Task 1: Create KnowledgeDocMaterializer with types and helper methods

**Depends on:** none | **Files:** `packages/graph/src/ingest/KnowledgeDocMaterializer.ts`

1. Create `packages/graph/src/ingest/KnowledgeDocMaterializer.ts` with the following content:

```typescript
/**
 * Knowledge Document Materializer
 *
 * Takes GapEntry[] from the differential gap report and creates
 * docs/knowledge/{domain}/*.md files from graph nodes.
 * Frontmatter is compatible with BusinessKnowledgeIngestor's parseFrontmatter().
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphNode, NodeType } from '../types.js';
import type { GraphStore } from '../store/GraphStore.js';
import type { GapEntry } from './KnowledgeStagingAggregator.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MaterializeOptions {
  readonly projectDir: string;
  readonly dryRun: boolean;
  readonly maxDocs?: number; // Default: 50
}

export interface MaterializeResult {
  readonly created: readonly MaterializedDoc[];
  readonly skipped: readonly SkippedEntry[];
}

export interface MaterializedDoc {
  readonly filePath: string; // relative to projectDir
  readonly nodeId: string;
  readonly domain: string;
  readonly name: string;
}

export interface SkippedEntry {
  readonly nodeId: string;
  readonly name: string;
  readonly reason: 'no_content' | 'no_domain' | 'already_documented' | 'dry_run' | 'cap_reached';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_BUSINESS_TYPES = new Set<string>([
  'business_rule',
  'business_process',
  'business_concept',
  'business_term',
  'business_metric',
]);

const DEFAULT_MAX_DOCS = 50;
const MAX_COLLISION_SUFFIX = 10;

// ─── Implementation ─────────────────────────────────────────────────────────

export class KnowledgeDocMaterializer {
  constructor(private readonly store: GraphStore) {}

  async materialize(
    gapEntries: readonly GapEntry[],
    options: MaterializeOptions
  ): Promise<MaterializeResult> {
    const maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;
    const created: MaterializedDoc[] = [];
    const skipped: SkippedEntry[] = [];

    for (const entry of gapEntries) {
      // 1. Skip if no content flag
      if (!entry.hasContent) {
        skipped.push({ nodeId: entry.nodeId, name: entry.name, reason: 'no_content' });
        continue;
      }

      // 2. Look up node
      const node = this.store.getNode(entry.nodeId);
      if (!node || !node.content || node.content.trim().length < 10) {
        skipped.push({ nodeId: entry.nodeId, name: entry.name, reason: 'no_content' });
        continue;
      }

      // 3. Infer domain
      const domain = this.inferDomain(node);
      if (!domain) {
        skipped.push({ nodeId: entry.nodeId, name: entry.name, reason: 'no_domain' });
        continue;
      }

      // 4. Check cap
      if (created.length >= maxDocs) {
        skipped.push({ nodeId: entry.nodeId, name: entry.name, reason: 'cap_reached' });
        continue;
      }

      // 5. Dry run
      if (options.dryRun) {
        skipped.push({ nodeId: entry.nodeId, name: entry.name, reason: 'dry_run' });
        continue;
      }

      // 6. Generate filename, resolve collisions, write
      const domainDir = path.join(options.projectDir, 'docs', 'knowledge', domain);
      await fs.mkdir(domainDir, { recursive: true });

      const basename = this.generateFilename(entry.name);
      const filename = await this.resolveCollision(domainDir, basename);
      const content = this.formatDoc(node, domain);
      const filePath = path.join('docs', 'knowledge', domain, filename);

      await fs.writeFile(path.join(options.projectDir, filePath), content, 'utf-8');

      created.push({ filePath, nodeId: entry.nodeId, domain, name: entry.name });
    }

    return { created, skipped };
  }

  inferDomain(node: GraphNode): string | null {
    // Check metadata.domain first
    if (node.metadata?.domain && typeof node.metadata.domain === 'string') {
      return node.metadata.domain;
    }

    // Check path for packages/{name} or src/{name}
    if (node.path) {
      const pkgMatch = node.path.match(/^packages\/([^/]+)/);
      if (pkgMatch) return pkgMatch[1]!;

      const srcMatch = node.path.match(/^src\/([^/]+)/);
      if (srcMatch) return srcMatch[1]!;
    }

    return null;
  }

  generateFilename(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    return `${slug}.md`;
  }

  async resolveCollision(dir: string, basename: string): Promise<string> {
    const ext = path.extname(basename);
    const stem = path.basename(basename, ext);

    try {
      await fs.access(path.join(dir, basename));
    } catch {
      // File does not exist — no collision
      return basename;
    }

    // File exists — try suffixes
    for (let i = 2; i <= MAX_COLLISION_SUFFIX; i++) {
      const candidate = `${stem}-${i}${ext}`;
      try {
        await fs.access(path.join(dir, candidate));
      } catch {
        return candidate;
      }
    }

    throw new Error(
      `Cannot resolve filename collision for "${basename}" after ${MAX_COLLISION_SUFFIX} attempts`
    );
  }

  formatDoc(node: GraphNode, domain: string): string {
    const mappedType = this.mapNodeType(node);
    const lines: string[] = ['---', `type: ${mappedType}`, `domain: ${domain}`];

    // Tags
    const tags = node.metadata?.tags;
    if (Array.isArray(tags) && tags.length > 0) {
      lines.push(`tags: [${tags.join(', ')}]`);
    }

    // Related
    const related = node.metadata?.related;
    if (Array.isArray(related) && related.length > 0) {
      lines.push(`related: [${related.join(', ')}]`);
    }

    lines.push('---', '', `# ${node.name}`, '', node.content ?? '', '');

    return lines.join('\n');
  }

  mapNodeType(node: GraphNode): NodeType {
    if (VALID_BUSINESS_TYPES.has(node.type)) {
      return node.type;
    }
    if (node.type === 'business_fact') {
      return 'business_rule';
    }
    return 'business_concept';
  }
}
```

2. Run: `cd packages/graph && npx tsc --noEmit` — expect success (no import errors since all types are used).
3. Commit: `feat(graph): add KnowledgeDocMaterializer class with types and helper methods`

### Task 2: Write unit tests — doc creation, frontmatter, and round-trip

**Depends on:** Task 1 | **Files:** `packages/graph/tests/ingest/KnowledgeDocMaterializer.test.ts`

1. Create `packages/graph/tests/ingest/KnowledgeDocMaterializer.test.ts` with the following content:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgeDocMaterializer } from '../../src/ingest/KnowledgeDocMaterializer.js';
import type { GapEntry } from '../../src/ingest/KnowledgeStagingAggregator.js';
import type { GraphNode } from '../../src/types.js';

function makeNode(overrides: Partial<GraphNode> & { id: string; name: string }): GraphNode {
  return {
    type: 'business_rule',
    metadata: { domain: 'payments', source: 'extractor' },
    content: 'This is a sufficiently long content string for testing materialization.',
    ...overrides,
  };
}

function makeGap(overrides: Partial<GapEntry> & { nodeId: string; name: string }): GapEntry {
  return {
    nodeType: 'business_rule',
    source: 'extractor',
    hasContent: true,
    ...overrides,
  };
}

describe('KnowledgeDocMaterializer', () => {
  let store: GraphStore;
  let materializer: KnowledgeDocMaterializer;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    materializer = new KnowledgeDocMaterializer(store);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'materializer-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates doc with correct frontmatter and body from graph node', async () => {
    const node = makeNode({
      id: 'extracted:payments:refund-rules',
      name: 'Refund Rules',
      content: 'Customers may request a refund within 30 days of purchase.',
    });
    store.addNode(node);

    const result = await materializer.materialize([makeGap({ nodeId: node.id, name: node.name })], {
      projectDir: tmpDir,
      dryRun: false,
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.filePath).toBe('docs/knowledge/payments/refund-rules.md');
    expect(result.created[0]!.domain).toBe('payments');

    const content = await fs.readFile(path.join(tmpDir, result.created[0]!.filePath), 'utf-8');
    expect(content).toContain('---\ntype: business_rule\ndomain: payments\n---');
    expect(content).toContain('# Refund Rules');
    expect(content).toContain('Customers may request a refund within 30 days of purchase.');
  });

  it('skips entries where hasContent is false', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:thin',
        name: 'Thin Finding',
        content: 'Has content but gap says no',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:thin', name: 'Thin Finding', hasContent: false })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('no_content');
  });

  it('skips nodes with content less than 10 chars trimmed', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:short',
        name: 'Short Content',
        content: '  tiny  ',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:short', name: 'Short Content' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('no_content');
  });

  it('skips nodes with unresolvable domain', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:unknown:orphan',
        name: 'Orphan Node',
        metadata: { source: 'extractor' }, // no domain
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:unknown:orphan', name: 'Orphan Node' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('no_domain');
  });

  it('creates domain directory when it does not exist', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:billing:invoice-gen',
        name: 'Invoice Generation',
        metadata: { domain: 'billing', source: 'extractor' },
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:billing:invoice-gen', name: 'Invoice Generation' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(1);
    const dirStat = await fs.stat(path.join(tmpDir, 'docs', 'knowledge', 'billing'));
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('handles filename collision with -2 suffix', async () => {
    store.addNode(makeNode({ id: 'node1', name: 'Same Name' }));
    store.addNode(makeNode({ id: 'node2', name: 'Same Name' }));

    const result = await materializer.materialize(
      [
        makeGap({ nodeId: 'node1', name: 'Same Name' }),
        makeGap({ nodeId: 'node2', name: 'Same Name' }),
      ],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(2);
    expect(result.created[0]!.filePath).toBe('docs/knowledge/payments/same-name.md');
    expect(result.created[1]!.filePath).toBe('docs/knowledge/payments/same-name-2.md');
  });

  it('sanitizes filenames — special chars removed, spaces become hyphens', () => {
    expect(materializer.generateFilename('Annual Earning Cap (US)')).toBe(
      'annual-earning-cap-us.md'
    );
    expect(materializer.generateFilename('foo@bar#baz')).toBe('foo-bar-baz.md');
    expect(materializer.generateFilename('  leading-trailing  ')).toBe('leading-trailing.md');
    expect(materializer.generateFilename('a'.repeat(100))).toMatch(/^a{60}\.md$/);
  });

  it('dry run writes nothing and returns skipped with dry_run reason', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:refund',
        name: 'Refund Policy',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:refund', name: 'Refund Policy' })],
      { projectDir: tmpDir, dryRun: true }
    );

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('dry_run');

    // Verify no files written
    await expect(fs.readdir(path.join(tmpDir, 'docs', 'knowledge'))).rejects.toThrow();
  });

  it('maps business_fact to business_rule', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:fact',
        name: 'Tax Rate Fact',
        type: 'business_fact',
      })
    );

    const result = await materializer.materialize(
      [
        makeGap({
          nodeId: 'extracted:payments:fact',
          name: 'Tax Rate Fact',
          nodeType: 'business_fact',
        }),
      ],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(1);
    const content = await fs.readFile(path.join(tmpDir, result.created[0]!.filePath), 'utf-8');
    expect(content).toContain('type: business_rule');
    expect(content).not.toContain('type: business_fact');
  });

  it('round-trip: materialized doc is parseable by BusinessKnowledgeIngestor frontmatter regex', async () => {
    store.addNode(
      makeNode({
        id: 'extracted:payments:round-trip',
        name: 'Round Trip Test',
        metadata: { domain: 'payments', source: 'extractor', tags: ['billing', 'refund'] },
        content: 'This content should survive the round trip through parseFrontmatter.',
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'extracted:payments:round-trip', name: 'Round Trip Test' })],
      { projectDir: tmpDir, dryRun: false }
    );

    const raw = await fs.readFile(path.join(tmpDir, result.created[0]!.filePath), 'utf-8');

    // Use the exact regex from BusinessKnowledgeIngestor.parseFrontmatter()
    const fmRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = raw.match(fmRegex);
    expect(match).not.toBeNull();

    const yamlBlock = match![1]!;
    const body = match![2]!;

    // Parse key-value pairs using the same regex as parseFrontmatter
    const parsed: Record<string, unknown> = {};
    for (const line of yamlBlock.split('\n')) {
      const kvMatch = line.match(/^(\w+):\s*(.+)$/);
      if (!kvMatch) continue;
      const key = kvMatch[1]!;
      const value = kvMatch[2]!.trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        parsed[key] = value
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim());
      } else {
        parsed[key] = value;
      }
    }

    expect(parsed.type).toBe('business_rule');
    expect(parsed.domain).toBe('payments');
    expect(parsed.tags).toEqual(['billing', 'refund']);

    // Body should contain the heading and content
    expect(body).toContain('# Round Trip Test');
    expect(body).toContain('This content should survive the round trip');
  });

  it('respects maxDocs cap', async () => {
    store.addNode(makeNode({ id: 'node-a', name: 'Node A' }));
    store.addNode(makeNode({ id: 'node-b', name: 'Node B' }));
    store.addNode(makeNode({ id: 'node-c', name: 'Node C' }));

    const result = await materializer.materialize(
      [
        makeGap({ nodeId: 'node-a', name: 'Node A' }),
        makeGap({ nodeId: 'node-b', name: 'Node B' }),
        makeGap({ nodeId: 'node-c', name: 'Node C' }),
      ],
      { projectDir: tmpDir, dryRun: false, maxDocs: 2 }
    );

    expect(result.created).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe('cap_reached');
    expect(result.skipped[0]!.name).toBe('Node C');
  });

  it('includes tags in frontmatter when present, omits when not', async () => {
    store.addNode(
      makeNode({
        id: 'with-tags',
        name: 'With Tags',
        metadata: { domain: 'payments', source: 'ext', tags: ['a', 'b'] },
      })
    );
    store.addNode(
      makeNode({
        id: 'no-tags',
        name: 'No Tags',
        metadata: { domain: 'payments', source: 'ext' },
      })
    );

    const result = await materializer.materialize(
      [
        makeGap({ nodeId: 'with-tags', name: 'With Tags' }),
        makeGap({ nodeId: 'no-tags', name: 'No Tags' }),
      ],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(2);

    const withTagsContent = await fs.readFile(
      path.join(tmpDir, result.created[0]!.filePath),
      'utf-8'
    );
    expect(withTagsContent).toContain('tags: [a, b]');

    const noTagsContent = await fs.readFile(
      path.join(tmpDir, result.created[1]!.filePath),
      'utf-8'
    );
    expect(noTagsContent).not.toContain('tags:');
  });

  it('infers domain from node path when metadata.domain is absent', async () => {
    store.addNode(
      makeNode({
        id: 'path-node',
        name: 'Path Inferred',
        path: 'packages/billing/src/invoices.ts',
        metadata: { source: 'extractor' }, // no domain
      })
    );

    const result = await materializer.materialize(
      [makeGap({ nodeId: 'path-node', name: 'Path Inferred' })],
      { projectDir: tmpDir, dryRun: false }
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0]!.domain).toBe('billing');
    expect(result.created[0]!.filePath).toBe('docs/knowledge/billing/path-inferred.md');
  });
});
```

2. Run: `cd packages/graph && npx vitest run tests/ingest/KnowledgeDocMaterializer.test.ts` — observe results (all 13 tests should pass).
3. Commit: `test(graph): add unit tests for KnowledgeDocMaterializer`

### Task 3: Export KnowledgeDocMaterializer and types from index.ts

**Depends on:** Task 1 | **Files:** `packages/graph/src/index.ts`

1. In `packages/graph/src/index.ts`, after the existing `KnowledgeStagingAggregator` export block (around line 86-92), add:

```typescript
export { KnowledgeDocMaterializer } from './ingest/KnowledgeDocMaterializer.js';
export type {
  MaterializeOptions,
  MaterializeResult,
  MaterializedDoc,
  SkippedEntry,
} from './ingest/KnowledgeDocMaterializer.js';
```

2. Run: `cd packages/graph && npx tsc --noEmit` — expect success.
3. Commit: `feat(graph): export KnowledgeDocMaterializer and types from package index`

### Task 4: Run full test suite and verify

**Depends on:** Tasks 1, 2, 3 | **Files:** none (verification only)

`[checkpoint:human-verify]` — Verify all tests pass and no regressions.

1. Run: `cd packages/graph && npx vitest run tests/ingest/KnowledgeDocMaterializer.test.ts` — all 13 tests should pass.
2. Run: `cd packages/graph && npx vitest run tests/ingest/KnowledgeStagingAggregator.test.ts` — all 7 existing tests should pass (no regression).
3. Run: `cd packages/graph && npx vitest run tests/ingest/BusinessKnowledgeIngestor.test.ts` — all existing tests should pass (no regression).
4. Run: `cd packages/graph && npx tsc --noEmit` — expect success.
5. If any test fails, fix the issue in the relevant file and re-run.

### Task 5: Fix any test failures and finalize

**Depends on:** Task 4 | **Files:** varies based on failures

1. If Task 4 revealed test failures, apply fixes to the implementation or tests.
2. Run: `cd packages/graph && npx vitest run tests/ingest/KnowledgeDocMaterializer.test.ts` — confirm all pass.
3. Commit (if changes needed): `fix(graph): resolve test issues in KnowledgeDocMaterializer`

## Dependency Graph

```
Task 1 (implementation) ──┬──> Task 2 (tests)    ──┐
                          ├──> Task 3 (exports)   ──┤
                          │                         v
                          └──────────────────> Task 4 (verify) ──> Task 5 (fix)
```

Tasks 2 and 3 can run in parallel after Task 1.

## Traceability

| Observable Truth                         | Delivered By             |
| ---------------------------------------- | ------------------------ |
| 1. Creates docs with correct frontmatter | Task 1, Task 2 (test 1)  |
| 2. Skips hasContent=false                | Task 1, Task 2 (test 2)  |
| 3. Skips thin content                    | Task 1, Task 2 (test 3)  |
| 4. Skips unresolvable domain             | Task 1, Task 2 (test 4)  |
| 5. Dry run writes nothing                | Task 1, Task 2 (test 8)  |
| 6. Respects maxDocs cap                  | Task 1, Task 2 (test 11) |
| 7. Collision resolution                  | Task 1, Task 2 (test 6)  |
| 8. Round-trip with parseFrontmatter      | Task 1, Task 2 (test 10) |
| 9. business_fact mapping                 | Task 1, Task 2 (test 9)  |
| 10. All tests pass                       | Task 4                   |
| 11. Exports from index.ts                | Task 3                   |
