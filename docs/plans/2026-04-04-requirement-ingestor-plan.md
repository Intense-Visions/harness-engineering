# Plan: RequirementIngestor (Phase 2 of Spec-to-Implementation Traceability)

**Date:** 2026-04-04
**Spec:** docs/changes/spec-to-implementation-traceability/proposal.md
**Phase:** 2 of 8 (RequirementIngestor)
**Depends on:** Phase 1 (Graph Schema) -- completed 2026-04-04
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Extract requirements from spec files (`docs/changes/*/proposal.md`), create `requirement` graph nodes, and link them to related code and test files via convention-based edges.

## Observable Truths (Acceptance Criteria)

1. When a spec at `docs/changes/<feature>/proposal.md` contains an "Observable Truths", "Success Criteria", or "Acceptance Criteria" section with numbered items, the system shall create one `requirement` graph node per item after ingestion.
2. Each requirement node shall have id `req:<spec-hash>:<index>`, type `requirement`, the requirement text as `name`, the spec file as `path`, a `location` with line numbers, and metadata including `specPath`, `index`, `section`, `rawText`, `featureName`, and optional `earsPattern`.
3. Each requirement node shall be linked to its spec document node via a `specifies` edge.
4. When code file nodes matching `packages/*/<feature>*` exist in the graph, the system shall create `requires` edges from the requirement to those files with confidence 0.5.
5. When test file nodes matching `**/tests/**/<feature>*` exist in the graph, the system shall create `verified_by` edges from the requirement to those files with confidence 0.5.
6. When a requirement name contains a function/class name that matches an existing code node, the system shall create a `requires` edge with confidence 0.6.
7. The `ingestSpecs` method shall return an `IngestResult` with accurate node/edge counts, errors array, and duration.
8. When no spec files exist, the system shall return an empty result with zero counts and no errors.
9. When a spec file has no matching section (no Observable Truths / Success Criteria / Acceptance Criteria), the system shall skip it and produce no requirement nodes for that file.
10. `npx vitest run packages/graph/tests/ingest/RequirementIngestor.test.ts` passes with all tests green.
11. `RequirementIngestor` is exported from `packages/graph/src/index.ts`.

## File Map

```
CREATE packages/graph/__fixtures__/sample-project/docs/changes/auth-feature/proposal.md
CREATE packages/graph/src/ingest/RequirementIngestor.ts
CREATE packages/graph/tests/ingest/RequirementIngestor.test.ts
MODIFY packages/graph/src/index.ts (add export)
```

## Tasks

### Task 1: Create spec fixture file for tests

**Depends on:** none
**Files:** `packages/graph/__fixtures__/sample-project/docs/changes/auth-feature/proposal.md`

1. Create directory and fixture file `packages/graph/__fixtures__/sample-project/docs/changes/auth-feature/proposal.md`:

```markdown
# Auth Feature

**Keywords:** auth, authentication, login

## Overview

Authentication feature for the sample project.

## Success Criteria

1. When a user calls AuthService.login with valid credentials, the system shall return a session token
2. When a user calls AuthService.login with invalid credentials, the system shall throw an AuthError
3. The system shall hash passwords using the hashPassword function before storage
4. While the session is active, the system shall validate tokens on every request
5. If the token is expired, then the system shall not grant access

## Technical Design

Uses AuthService and hashPassword from the existing codebase.

## File Layout
```

src/auth-service.ts MODIFY
src/utils/hash.ts MODIFY

```

```

2. Run: `npx harness validate`
3. Commit: `test(graph): add spec fixture for RequirementIngestor tests`

---

### Task 2: Create RequirementIngestor test file (red phase)

**Depends on:** Task 1
**Files:** `packages/graph/tests/ingest/RequirementIngestor.test.ts`

1. Create test file `packages/graph/tests/ingest/RequirementIngestor.test.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js';
import { RequirementIngestor } from '../../src/ingest/RequirementIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('RequirementIngestor', () => {
  let store: GraphStore;
  let ingestor: RequirementIngestor;

  beforeEach(async () => {
    store = new GraphStore();
    // Ingest code first so convention-based linking has targets
    const codeIngestor = new CodeIngestor(store);
    await codeIngestor.ingest(FIXTURE_DIR);
    ingestor = new RequirementIngestor(store);
  });

  describe('ingestSpecs', () => {
    it('should create one requirement node per numbered item in Success Criteria section', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      const result = await ingestor.ingestSpecs(specsDir);

      expect(result.nodesAdded).toBe(5);
      expect(result.errors).toHaveLength(0);

      const reqNodes = store.findNodes({ type: 'requirement' });
      expect(reqNodes).toHaveLength(5);
    });

    it('should set correct node id format req:<hash>:<index>', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      for (const node of reqNodes) {
        expect(node.id).toMatch(/^req:[a-f0-9]+:\d+$/);
      }
    });

    it('should populate requirement node metadata correctly', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      const firstReq = reqNodes.find((n) => (n.metadata.index as number) === 1);
      expect(firstReq).toBeDefined();
      expect(firstReq!.type).toBe('requirement');
      expect(firstReq!.name).toContain('AuthService.login');
      expect(firstReq!.name).toContain('valid credentials');
      expect(firstReq!.path).toContain('docs/changes/auth-feature/proposal.md');
      expect(firstReq!.metadata.specPath).toContain('docs/changes/auth-feature/proposal.md');
      expect(firstReq!.metadata.index).toBe(1);
      expect(firstReq!.metadata.section).toBe('Success Criteria');
      expect(firstReq!.metadata.rawText).toMatch(/^1\.\s+When/);
      expect(firstReq!.metadata.featureName).toBe('auth-feature');
    });

    it('should set location with correct line numbers', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      for (const node of reqNodes) {
        expect(node.location).toBeDefined();
        expect(node.location!.fileId).toContain('proposal.md');
        expect(node.location!.startLine).toBeGreaterThan(0);
        expect(node.location!.endLine).toBeGreaterThanOrEqual(node.location!.startLine);
      }
    });

    it('should detect EARS patterns in requirement text', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });

      // "When a user calls..." -> event-driven
      const eventReq = reqNodes.find((n) => (n.metadata.index as number) === 1);
      expect(eventReq!.metadata.earsPattern).toBe('event-driven');

      // "The system shall hash..." -> ubiquitous
      const ubiqReq = reqNodes.find((n) => (n.metadata.index as number) === 3);
      expect(ubiqReq!.metadata.earsPattern).toBe('ubiquitous');

      // "While the session..." -> state-driven
      const stateReq = reqNodes.find((n) => (n.metadata.index as number) === 4);
      expect(stateReq!.metadata.earsPattern).toBe('state-driven');

      // "If the token is expired, then the system shall not..." -> unwanted
      const unwantedReq = reqNodes.find((n) => (n.metadata.index as number) === 5);
      expect(unwantedReq!.metadata.earsPattern).toBe('unwanted');
    });

    it('should create specifies edge from requirement to spec document', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      for (const node of reqNodes) {
        const edges = store.getEdges({ from: node.id, type: 'specifies' });
        expect(edges.length).toBeGreaterThanOrEqual(1);
        // The target should be a document node for the spec
        const docEdge = edges[0]!;
        expect(docEdge.to).toContain('proposal.md');
      }
    });

    it('should return accurate IngestResult with counts and timing', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      const result = await ingestor.ingestSpecs(specsDir);

      expect(result.nodesAdded).toBe(5);
      // At least specifies edges (5) + some convention-based edges
      expect(result.edgesAdded).toBeGreaterThanOrEqual(5);
      expect(result.nodesUpdated).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('convention-based linking', () => {
    it('should create requires edges to code files matching feature name pattern', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      const reqNodes = store.findNodes({ type: 'requirement' });
      // At least one requirement should have a requires edge via keyword overlap
      // (AuthService is mentioned in requirement text and exists as a code node)
      const allRequiresEdges = reqNodes.flatMap((n) =>
        store.getEdges({ from: n.id, type: 'requires' })
      );
      expect(allRequiresEdges.length).toBeGreaterThanOrEqual(1);

      // Check confidence metadata
      for (const edge of allRequiresEdges) {
        expect(edge.confidence).toBeGreaterThanOrEqual(0.5);
        expect(edge.confidence).toBeLessThanOrEqual(0.7);
        expect(edge.metadata).toBeDefined();
        expect(edge.metadata!.method).toBe('convention');
      }
    });

    it('should create requires edge via keyword overlap when requirement mentions a class name', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      // Requirement 1 mentions "AuthService" which is a class in the fixture
      const reqNodes = store.findNodes({ type: 'requirement' });
      const authReq = reqNodes.find((n) => (n.metadata.index as number) === 1);
      expect(authReq).toBeDefined();

      const edges = store.getEdges({ from: authReq!.id, type: 'requires' });
      const authEdge = edges.find((e) => {
        const target = store.getNode(e.to);
        return target?.name === 'AuthService';
      });
      expect(authEdge).toBeDefined();
      expect(authEdge!.confidence).toBe(0.6);
      expect(authEdge!.metadata!.matchReason).toBe('keyword-overlap');
    });

    it('should create requires edge via keyword overlap when requirement mentions a function name', async () => {
      const specsDir = path.join(FIXTURE_DIR, 'docs', 'changes');
      await ingestor.ingestSpecs(specsDir);

      // Requirement 3 mentions "hashPassword" which is a function in the fixture
      const reqNodes = store.findNodes({ type: 'requirement' });
      const hashReq = reqNodes.find((n) => (n.metadata.index as number) === 3);
      expect(hashReq).toBeDefined();

      const edges = store.getEdges({ from: hashReq!.id, type: 'requires' });
      const hashEdge = edges.find((e) => {
        const target = store.getNode(e.to);
        return target?.name === 'hashPassword';
      });
      expect(hashEdge).toBeDefined();
      expect(hashEdge!.confidence).toBe(0.6);
    });
  });

  describe('missing/empty specs', () => {
    it('should return empty result when specs directory does not exist', async () => {
      const result = await ingestor.ingestSpecs('/nonexistent/path');

      expect(result.nodesAdded).toBe(0);
      expect(result.edgesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip spec files without matching sections', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-ingestor-'));
      const featureDir = path.join(tmpDir, 'no-criteria');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        path.join(featureDir, 'proposal.md'),
        '# Feature\n\n## Overview\n\nJust an overview, no criteria.\n'
      );

      try {
        const result = await ingestor.ingestSpecs(tmpDir);
        expect(result.nodesAdded).toBe(0);
        expect(result.edgesAdded).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });

    it('should handle spec with section heading but no numbered items', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-ingestor-'));
      const featureDir = path.join(tmpDir, 'empty-criteria');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        path.join(featureDir, 'proposal.md'),
        '# Feature\n\n## Success Criteria\n\nNo numbered items here.\n'
      );

      try {
        const result = await ingestor.ingestSpecs(tmpDir);
        expect(result.nodesAdded).toBe(0);
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('multiple sections', () => {
    it('should extract requirements from both Observable Truths and Success Criteria sections', async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'req-ingestor-'));
      const featureDir = path.join(tmpDir, 'multi-section');
      await fs.mkdir(featureDir, { recursive: true });
      await fs.writeFile(
        path.join(featureDir, 'proposal.md'),
        [
          '# Feature',
          '',
          '## Observable Truths',
          '',
          '1. The system shall do X',
          '2. The system shall do Y',
          '',
          '## Success Criteria',
          '',
          '1. The system shall do Z',
          '',
        ].join('\n')
      );

      try {
        const result = await ingestor.ingestSpecs(tmpDir);
        expect(result.nodesAdded).toBe(3);

        const reqNodes = store.findNodes({ type: 'requirement' });
        const sections = reqNodes.map((n) => n.metadata.section);
        expect(sections).toContain('Observable Truths');
        expect(sections).toContain('Success Criteria');
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
```

2. Run test: `cd packages/graph && npx vitest run tests/ingest/RequirementIngestor.test.ts 2>&1 | tail -20`
3. Observe failure: `RequirementIngestor` module does not exist yet.
4. Run: `npx harness validate`
5. Commit: `test(graph): add RequirementIngestor test suite (red phase)`

---

### Task 3: Implement RequirementIngestor -- spec scanning and requirement extraction

**Depends on:** Task 2
**Files:** `packages/graph/src/ingest/RequirementIngestor.ts`

1. Create `packages/graph/src/ingest/RequirementIngestor.ts`:

```typescript
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GraphStore } from '../store/GraphStore.js';
import type { IngestResult, EdgeType } from '../types.js';
import { hash, emptyResult } from './ingestUtils.js';

/** Section headings that contain numbered requirements. */
const REQUIREMENT_SECTIONS = [
  'Observable Truths',
  'Success Criteria',
  'Acceptance Criteria',
] as const;

/** Regex to match section headings (## or ### level). */
const SECTION_HEADING_RE = /^#{2,3}\s+(.+)$/;

/** Regex to match numbered list items. */
const NUMBERED_ITEM_RE = /^\s*(\d+)\.\s+(.+)$/;

/** EARS pattern detection heuristics. */
function detectEarsPattern(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/^if\b.+\bthen\b.+\bshall not\b/.test(lower)) return 'unwanted';
  if (/^when\b/.test(lower)) return 'event-driven';
  if (/^while\b/.test(lower)) return 'state-driven';
  if (/^where\b/.test(lower)) return 'optional';
  // Ubiquitous: "The system shall..." without conditional prefix
  if (/^the\s+\w+\s+shall\b/.test(lower)) return 'ubiquitous';
  return undefined;
}

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

export class RequirementIngestor {
  constructor(private readonly store: GraphStore) {}

  /**
   * Scan a specs directory for `<feature>/proposal.md` files,
   * extract numbered requirements from recognized sections,
   * and create requirement nodes with convention-based edges.
   */
  async ingestSpecs(specsDir: string): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    let featureDirs: string[];
    try {
      const entries = await fs.readdir(specsDir, { withFileTypes: true });
      featureDirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(specsDir, e.name));
    } catch {
      return emptyResult(Date.now() - start);
    }

    for (const featureDir of featureDirs) {
      const featureName = path.basename(featureDir);
      const specPath = path.join(featureDir, 'proposal.md');

      let content: string;
      try {
        content = await fs.readFile(specPath, 'utf-8');
      } catch {
        continue; // No proposal.md in this directory
      }

      try {
        const specHash = hash(specPath);

        // Create a document node for the spec itself
        const specNodeId = `file:${specPath}`;
        this.store.addNode({
          id: specNodeId,
          type: 'document',
          name: path.basename(specPath),
          path: specPath,
          metadata: { featureName },
        });

        // Parse sections and extract numbered requirements
        const requirements = this.extractRequirements(content, specPath, specHash, featureName);

        for (const req of requirements) {
          this.store.addNode(req.node);
          nodesAdded++;

          // Link requirement -> spec document via 'specifies' edge
          this.store.addEdge({
            from: req.node.id,
            to: specNodeId,
            type: 'specifies',
          });
          edgesAdded++;

          // Convention-based linking
          edgesAdded += this.linkByPathPattern(req.node.id, featureName);
          edgesAdded += this.linkByKeywordOverlap(req.node.id, req.node.name);
        }
      } catch (err) {
        errors.push(`${specPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Parse markdown content and extract numbered items from recognized sections.
   */
  private extractRequirements(
    content: string,
    specPath: string,
    specHash: string,
    featureName: string
  ): Array<{ node: import('../types.js').GraphNode }> {
    const lines = content.split('\n');
    const results: Array<{ node: import('../types.js').GraphNode }> = [];

    let currentSection: string | undefined;
    let inRequirementSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;

      // Check for section heading
      const headingMatch = line.match(SECTION_HEADING_RE);
      if (headingMatch) {
        const heading = headingMatch[1]!.trim();
        const isReqSection = REQUIREMENT_SECTIONS.some(
          (s) => heading.toLowerCase() === s.toLowerCase()
        );
        if (isReqSection) {
          currentSection = heading;
          inRequirementSection = true;
        } else {
          inRequirementSection = false;
        }
        continue;
      }

      if (!inRequirementSection) continue;

      // Check for numbered item
      const itemMatch = line.match(NUMBERED_ITEM_RE);
      if (!itemMatch) continue;

      const index = parseInt(itemMatch[1]!, 10);
      const text = itemMatch[2]!.trim();
      const rawText = line.trim();
      const lineNumber = i + 1; // 1-based

      const nodeId = `req:${specHash}:${index}`;
      const earsPattern = detectEarsPattern(text);

      results.push({
        node: {
          id: nodeId,
          type: 'requirement',
          name: text,
          path: specPath,
          location: {
            fileId: `file:${specPath}`,
            startLine: lineNumber,
            endLine: lineNumber,
          },
          metadata: {
            specPath,
            index,
            section: currentSection!,
            rawText,
            earsPattern,
            featureName,
          },
        },
      });
    }

    return results;
  }

  /**
   * Convention-based linking: match requirement to code/test files
   * by feature name in their path.
   */
  private linkByPathPattern(reqId: string, featureName: string): number {
    let count = 0;
    const fileNodes = this.store.findNodes({ type: 'file' });

    for (const node of fileNodes) {
      if (!node.path) continue;
      const normalizedPath = node.path.replace(/\\/g, '/');

      // Code file pattern: packages/*/<feature>*
      const isCodeMatch =
        normalizedPath.includes('packages/') && path.basename(normalizedPath).includes(featureName);

      // Test file pattern: **/tests/**/<feature>*
      const isTestMatch =
        normalizedPath.includes('/tests/') && path.basename(normalizedPath).includes(featureName);

      if (isCodeMatch && !isTestMatch) {
        this.store.addEdge({
          from: reqId,
          to: node.id,
          type: 'requires',
          confidence: 0.5,
          metadata: { method: 'convention', matchReason: 'path-pattern' },
        });
        count++;
      } else if (isTestMatch) {
        this.store.addEdge({
          from: reqId,
          to: node.id,
          type: 'verified_by',
          confidence: 0.5,
          metadata: { method: 'convention', matchReason: 'path-pattern' },
        });
        count++;
      }
    }

    return count;
  }

  /**
   * Convention-based linking: match requirement text to code nodes
   * by keyword overlap (function/class names appearing in requirement text).
   */
  private linkByKeywordOverlap(reqId: string, reqText: string): number {
    let count = 0;

    for (const nodeType of CODE_NODE_TYPES) {
      const codeNodes = this.store.findNodes({ type: nodeType });
      for (const node of codeNodes) {
        // Skip short names to avoid false positives
        if (node.name.length < 3) continue;

        const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
        if (namePattern.test(reqText)) {
          // Determine edge type: test files get verified_by, code gets requires
          const edgeType: EdgeType =
            node.path && node.path.includes('/tests/') ? 'verified_by' : 'requires';

          this.store.addEdge({
            from: reqId,
            to: node.id,
            type: edgeType,
            confidence: 0.6,
            metadata: { method: 'convention', matchReason: 'keyword-overlap' },
          });
          count++;
        }
      }
    }

    return count;
  }
}
```

2. Run test: `cd packages/graph && npx vitest run tests/ingest/RequirementIngestor.test.ts`
3. Observe: tests pass (or identify and fix failures).
4. Run: `npx harness validate`
5. Commit: `feat(graph): implement RequirementIngestor with spec parsing and convention linking`

---

### Task 4: Fix any test failures and iterate to green

**Depends on:** Task 3
**Files:** `packages/graph/src/ingest/RequirementIngestor.ts`, `packages/graph/tests/ingest/RequirementIngestor.test.ts`

[checkpoint:human-verify] -- Review test output from Task 3. If all tests pass, skip this task.

1. Run: `cd packages/graph && npx vitest run tests/ingest/RequirementIngestor.test.ts 2>&1`
2. For each failing test, identify the root cause by reading the error message.
3. Common adjustments:
   - If fixture `AuthService`/`hashPassword` node names do not match, check what CodeIngestor actually creates from the fixture and adjust test expectations.
   - If line numbers in location are off, verify the fixture markdown line numbering.
   - If EARS pattern detection does not match, adjust the regex heuristics or the fixture text.
   - If `specifies` edge target id format differs, align the document node id format.
4. Fix implementation or test expectations as needed.
5. Run: `cd packages/graph && npx vitest run tests/ingest/RequirementIngestor.test.ts`
6. Observe: all tests pass.
7. Run: `npx harness validate`
8. Commit: `fix(graph): adjust RequirementIngestor tests/implementation for green suite`

---

### Task 5: Export RequirementIngestor from package index

**Depends on:** Task 3
**Files:** `packages/graph/src/index.ts`

1. Add export to `packages/graph/src/index.ts`, after the `KnowledgeIngestor` export line (line 43):

```typescript
export { RequirementIngestor } from './ingest/RequirementIngestor.js';
```

2. Run: `cd packages/graph && npx vitest run`
3. Observe: full test suite passes (all existing tests + new RequirementIngestor tests).
4. Run: `npx harness validate`
5. Commit: `feat(graph): export RequirementIngestor from package index`

---

### Task 6: Run full test suite and typecheck

**Depends on:** Task 5
**Files:** none (verification only)

1. Run: `cd packages/graph && npx tsc --noEmit`
2. Observe: no type errors.
3. Run: `cd packages/graph && npx vitest run`
4. Observe: all tests pass (including the new RequirementIngestor tests).
5. Run: `npx harness validate`
6. If any failures, fix and commit: `fix(graph): resolve typecheck/test issues in RequirementIngestor`

---

### Task 7: Verify observable truths

**Depends on:** Task 6
**Files:** none (verification only)

[checkpoint:human-verify]

Verify each observable truth:

1. **OT1 (nodes created):** Run tests -- `ingestSpecs` creates 5 requirement nodes from the fixture spec with 5 numbered items.
2. **OT2 (node structure):** Run tests -- nodes have `req:<hash>:<index>` ids, correct type, name, path, location, metadata.
3. **OT3 (specifies edge):** Run tests -- each requirement has a `specifies` edge to the spec document node.
4. **OT4 (path-pattern requires):** Convention-based path matching tested if fixture has matching file patterns.
5. **OT5 (path-pattern verified_by):** Convention-based test file matching tested if fixture has matching test patterns.
6. **OT6 (keyword requires):** Tests verify `AuthService` mention creates `requires` edge with confidence 0.6.
7. **OT7 (IngestResult):** Tests verify accurate counts and timing.
8. **OT8 (missing dir):** Tests verify empty result for nonexistent path.
9. **OT9 (no matching section):** Tests verify skip behavior for specs without criteria sections.
10. **OT10 (tests pass):** Full test suite green.
11. **OT11 (exported):** `RequirementIngestor` appears in `packages/graph/src/index.ts` exports.

All observable truths traced to test assertions.
