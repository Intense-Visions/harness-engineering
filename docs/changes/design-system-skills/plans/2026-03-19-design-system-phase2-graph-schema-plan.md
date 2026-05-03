# Plan: Design System Skills — Phase 2: Graph Schema

**Date:** 2026-03-19
**Spec:** docs/changes/design-system-skills/proposal.md
**Phase 1 plan:** docs/changes/design-system-skills/plans/2026-03-19-design-system-phase1-shared-foundation-plan.md
**Estimated tasks:** 8
**Estimated time:** 60 minutes

## Goal

The harness graph understands design concepts natively — tokens, aesthetic intent, and design constraints are first-class nodes; design relationships are first-class edges; `tokens.json` and `DESIGN.md` are auto-ingested into the graph; and `enforce-architecture` can surface design violations alongside layer violations.

## Observable Truths (Acceptance Criteria)

1. `NODE_TYPES` in `packages/graph/src/types.ts` includes `design_token`, `aesthetic_intent`, and `design_constraint`.
2. `EDGE_TYPES` in `packages/graph/src/types.ts` includes `uses_token`, `declares_intent`, `violates_design`, and `platform_binding`.
3. A `DesignIngestor` class exists that can parse a W3C DTCG `tokens.json` file and produce `design_token` nodes with correct `name`, `type`, `value`, and `group` metadata.
4. The same `DesignIngestor` can parse a `DESIGN.md` file and produce an `aesthetic_intent` node (with `style`, `tone`, `differentiator`, `strictness` metadata) and `design_constraint` nodes for each anti-pattern.
5. After ingestion, `design_token` nodes are connected to `platform_binding` edges when platform information is present.
6. After ingestion, the project root gets a `declares_intent` edge to the `aesthetic_intent` node.
7. A `DesignConstraintAdapter` exists that can check components for design violations (hardcoded colors/fonts not in token set) and return structured violation objects with `DESIGN-XXX` codes.
8. The `DesignConstraintAdapter` respects `designStrictness` config: `permissive` -> `info`, `standard` -> `warn`, `strict` -> `error` for a11y violations.
9. The `DesignIngestor` is exported from `packages/graph/src/index.ts` and wired into `KnowledgeIngestor.ingestAll()` (or a parallel `ingestDesign()` method).
10. All existing graph tests still pass (`pnpm test` in packages/graph).
11. New tests cover: token ingestion, DESIGN.md ingestion, constraint checking, severity mapping.
12. TypeScript compiles without errors (`tsc --noEmit`).

## File Map

```
CREATE  packages/graph/src/ingest/DesignIngestor.ts
CREATE  packages/graph/tests/ingest/DesignIngestor.test.ts
CREATE  packages/graph/src/constraints/DesignConstraintAdapter.ts
CREATE  packages/graph/tests/constraints/DesignConstraintAdapter.test.ts
CREATE  packages/graph/__fixtures__/sample-project/design-system/tokens.json
CREATE  packages/graph/__fixtures__/sample-project/design-system/DESIGN.md
MODIFY  packages/graph/src/types.ts (add node types + edge types)
MODIFY  packages/graph/src/index.ts (export new classes)
```

## Tasks

### Task 1: Extend graph node and edge types

**Depends on:** none
**Files:**

- `packages/graph/src/types.ts`

Add the new design-domain node types and edge types to the existing arrays. Use snake_case to match existing convention (e.g., `test_result`, `co_changes_with`).

**Add to `NODE_TYPES` array** (after the `// Structural` comment block, or add a new `// Design` section):

```typescript
// Design
'design_token',
'aesthetic_intent',
'design_constraint',
```

**Add to `EDGE_TYPES` array** (add a new `// Design relationships` section):

```typescript
// Design relationships
'uses_token',
'declares_intent',
'violates_design',
'platform_binding',
```

Note: The spec says `violates` but that conflicts with the existing `violates` edge type (line 56 in types.ts). Use `violates_design` to disambiguate. Similarly, the spec says `DesignToken` / `AestheticIntent` / `DesignConstraint` but the codebase convention is snake_case for type literal values.

**Verify:**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/graph/tsconfig.json
```

**Verify (Zod schemas still work):**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/ --reporter=verbose 2>&1 | tail -20
```

All existing tests must pass. The Zod `z.enum(NODE_TYPES)` and `z.enum(EDGE_TYPES)` schemas auto-expand to include the new values.

---

### Task 2: Create test fixtures — sample tokens.json and DESIGN.md

**Depends on:** none (parallel with Task 1)
**Files:**

- `packages/graph/__fixtures__/sample-project/design-system/tokens.json`
- `packages/graph/__fixtures__/sample-project/design-system/DESIGN.md`

Create test fixture files that the ingestor and constraint adapter tests will use.

**tokens.json** — W3C DTCG format with 6+ tokens across color, typography, and spacing groups:

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "primary": {
      "$value": "#2563eb",
      "$type": "color",
      "$description": "Primary brand color"
    },
    "primary-contrast": {
      "$value": "#ffffff",
      "$type": "color",
      "$description": "Text on primary"
    },
    "secondary": {
      "$value": "#64748b",
      "$type": "color",
      "$description": "Secondary text and borders"
    },
    "error": {
      "$value": "#dc2626",
      "$type": "color",
      "$description": "Error state"
    }
  },
  "typography": {
    "display": {
      "$value": {
        "fontFamily": "Instrument Serif",
        "fontSize": "3rem",
        "fontWeight": 400,
        "lineHeight": 1.1
      },
      "$type": "typography"
    },
    "body": {
      "$value": {
        "fontFamily": "Geist",
        "fontSize": "1rem",
        "fontWeight": 400,
        "lineHeight": 1.6
      },
      "$type": "typography"
    }
  },
  "spacing": {
    "scale": {
      "$value": ["0.25rem", "0.5rem", "1rem", "1.5rem", "2rem", "3rem", "4rem"],
      "$type": "dimension"
    }
  }
}
```

**DESIGN.md** — matches the spec's DESIGN.md structure:

```markdown
# Design Intent

## Aesthetic Direction

**Style:** Refined minimalism with editorial typography
**Tone:** Professional but warm — not corporate sterile
**Differentiator:** Generous whitespace + oversized serif headings

## Anti-Patterns (project-specific)

- No system/default fonts in user-facing UI
- No purple-gradient-on-white hero sections
- No icon-only buttons without labels

## Platform Notes

- **Web:** Tailwind + shadcn/ui base, custom tokens override defaults
- **Mobile:** iOS-first, Material adaptation for Android

## Strictness Override

level: standard
```

**Verify:** Both files exist and are syntactically valid:

```bash
cd /Users/cwarner/Projects/harness-engineering
node -e "JSON.parse(require('fs').readFileSync('packages/graph/__fixtures__/sample-project/design-system/tokens.json', 'utf8')); console.log('tokens.json OK')"
cat packages/graph/__fixtures__/sample-project/design-system/DESIGN.md | head -5
```

---

### Task 3: TDD RED — Write failing tests for DesignIngestor

**Depends on:** Task 1 (needs new types), Task 2 (needs fixtures)
**Files:** `packages/graph/tests/ingest/DesignIngestor.test.ts`

Write comprehensive tests before implementing. Follow the KnowledgeIngestor test pattern: create a `GraphStore`, call the ingestor, and assert on the resulting nodes/edges.

```typescript
// packages/graph/tests/ingest/DesignIngestor.test.ts
import * as path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { DesignIngestor } from '../../src/ingest/DesignIngestor.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../__fixtures__/sample-project');

describe('DesignIngestor', () => {
  let store: GraphStore;
  let ingestor: DesignIngestor;

  beforeEach(() => {
    store = new GraphStore();
    ingestor = new DesignIngestor(store);
  });

  describe('ingestTokens', () => {
    it('creates design_token nodes for each token in tokens.json', async () => {
      const tokensPath = path.join(FIXTURE_DIR, 'design-system', 'tokens.json');
      const result = await ingestor.ingestTokens(tokensPath);

      expect(result.errors).toHaveLength(0);
      // 4 colors + 2 typography + 1 spacing = 7 tokens
      expect(result.nodesAdded).toBe(7);

      const tokenNodes = store.findNodes({ type: 'design_token' });
      expect(tokenNodes.length).toBe(7);
    });

    it('sets correct metadata on color tokens', async () => {
      const tokensPath = path.join(FIXTURE_DIR, 'design-system', 'tokens.json');
      await ingestor.ingestTokens(tokensPath);

      const primary = store.getNode('design_token:color.primary');
      expect(primary).not.toBeNull();
      expect(primary!.type).toBe('design_token');
      expect(primary!.name).toBe('color.primary');
      expect(primary!.metadata.tokenType).toBe('color');
      expect(primary!.metadata.value).toBe('#2563eb');
      expect(primary!.metadata.group).toBe('color');
      expect(primary!.metadata.description).toBe('Primary brand color');
    });

    it('sets correct metadata on typography tokens', async () => {
      const tokensPath = path.join(FIXTURE_DIR, 'design-system', 'tokens.json');
      await ingestor.ingestTokens(tokensPath);

      const display = store.getNode('design_token:typography.display');
      expect(display).not.toBeNull();
      expect(display!.metadata.tokenType).toBe('typography');
      expect(display!.metadata.value).toEqual({
        fontFamily: 'Instrument Serif',
        fontSize: '3rem',
        fontWeight: 400,
        lineHeight: 1.1,
      });
      expect(display!.metadata.group).toBe('typography');
    });

    it('returns empty result for missing file', async () => {
      const result = await ingestor.ingestTokens('/nonexistent/tokens.json');
      expect(result.nodesAdded).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('returns error for invalid JSON', async () => {
      // Create a temp file with invalid JSON — use os.tmpdir
      const os = await import('node:os');
      const fs = await import('node:fs/promises');
      const tmpFile = path.join(os.tmpdir(), 'bad-tokens.json');
      await fs.writeFile(tmpFile, '{ invalid json }');
      const result = await ingestor.ingestTokens(tmpFile);
      expect(result.errors.length).toBeGreaterThan(0);
      await fs.unlink(tmpFile);
    });
  });

  describe('ingestDesignIntent', () => {
    it('creates an aesthetic_intent node from DESIGN.md', async () => {
      const designPath = path.join(FIXTURE_DIR, 'design-system', 'DESIGN.md');
      const result = await ingestor.ingestDesignIntent(designPath);

      expect(result.errors).toHaveLength(0);
      expect(result.nodesAdded).toBeGreaterThanOrEqual(1);

      const intentNodes = store.findNodes({ type: 'aesthetic_intent' });
      expect(intentNodes.length).toBe(1);

      const intent = intentNodes[0]!;
      expect(intent.metadata.style).toBe('Refined minimalism with editorial typography');
      expect(intent.metadata.tone).toBe('Professional but warm — not corporate sterile');
      expect(intent.metadata.differentiator).toBe('Generous whitespace + oversized serif headings');
      expect(intent.metadata.strictness).toBe('standard');
    });

    it('creates design_constraint nodes for each anti-pattern', async () => {
      const designPath = path.join(FIXTURE_DIR, 'design-system', 'DESIGN.md');
      await ingestor.ingestDesignIntent(designPath);

      const constraintNodes = store.findNodes({ type: 'design_constraint' });
      expect(constraintNodes.length).toBe(3); // 3 anti-patterns in fixture

      const names = constraintNodes.map((n) => n.name);
      expect(names).toContain('No system/default fonts in user-facing UI');
      expect(names).toContain('No purple-gradient-on-white hero sections');
      expect(names).toContain('No icon-only buttons without labels');
    });

    it('returns empty result for missing file', async () => {
      const result = await ingestor.ingestDesignIntent('/nonexistent/DESIGN.md');
      expect(result.nodesAdded).toBe(0);
    });
  });

  describe('ingestAll', () => {
    it('ingests both tokens and design intent from a design-system directory', async () => {
      const designDir = path.join(FIXTURE_DIR, 'design-system');
      const result = await ingestor.ingestAll(designDir);

      expect(result.errors).toHaveLength(0);
      // 7 tokens + 1 intent + 3 constraints = 11 nodes
      expect(result.nodesAdded).toBe(11);

      // Verify both types exist
      const tokenNodes = store.findNodes({ type: 'design_token' });
      expect(tokenNodes.length).toBe(7);

      const intentNodes = store.findNodes({ type: 'aesthetic_intent' });
      expect(intentNodes.length).toBe(1);

      const constraintNodes = store.findNodes({ type: 'design_constraint' });
      expect(constraintNodes.length).toBe(3);
    });
  });
});
```

**Verify (RED):** Run `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/ingest/DesignIngestor.test.ts` — must FAIL because `DesignIngestor` does not exist yet.

---

### Task 4: Implement DesignIngestor (GREEN)

**Depends on:** Task 3
**Files:** `packages/graph/src/ingest/DesignIngestor.ts`

Create the `DesignIngestor` class following the `KnowledgeIngestor` pattern: constructor takes `GraphStore`, methods return `IngestResult`.

Key implementation details:

1. **`ingestTokens(tokensPath: string): Promise<IngestResult>`**
   - Read and JSON.parse the file. On missing file, return `emptyResult()`. On parse error, return result with error string.
   - Walk the DTCG structure recursively. Tokens are objects with `$value` and `$type` keys. Groups are objects without `$value`.
   - For each token, create a `design_token` node with:
     - `id`: `design_token:{group}.{name}` (e.g., `design_token:color.primary`)
     - `type`: `'design_token'`
     - `name`: `{group}.{name}` (dotted path)
     - `path`: the tokens file path
     - `metadata`: `{ tokenType: $type, value: $value, group: topLevelKey, description: $description }`

2. **`ingestDesignIntent(designPath: string): Promise<IngestResult>`**
   - Read the DESIGN.md file. On missing, return `emptyResult()`.
   - Parse with regex:
     - `**Style:** (.+)` -> `style`
     - `**Tone:** (.+)` -> `tone`
     - `**Differentiator:** (.+)` -> `differentiator`
     - `level:\s*(.+)` -> `strictness` (from Strictness Override section)
   - Create one `aesthetic_intent` node:
     - `id`: `aesthetic_intent:project`
     - `metadata`: `{ style, tone, differentiator, strictness }`
   - Parse anti-patterns section: lines starting with `- ` after `## Anti-Patterns` heading.
   - For each anti-pattern, create a `design_constraint` node:
     - `id`: `design_constraint:{hash(text)}`
     - `name`: the anti-pattern text (without leading `- `)
     - `metadata`: `{ rule: text, severity: 'warn', scope: 'project' }`

3. **`ingestAll(designDir: string): Promise<IngestResult>`**
   - Call `ingestTokens(path.join(designDir, 'tokens.json'))` and `ingestDesignIntent(path.join(designDir, 'DESIGN.md'))` in parallel.
   - Merge results using the same `mergeResults` helper pattern from KnowledgeIngestor.

Use the same `emptyResult()` and `mergeResults()` helper pattern as `KnowledgeIngestor`. Import `hash` using `crypto.createHash('md5')`.

**Verify (GREEN):**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/ingest/DesignIngestor.test.ts
```

All tests must pass.

**Verify (no regressions):**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/
```

All existing graph tests still pass.

---

### Task 5: TDD RED — Write failing tests for DesignConstraintAdapter

**Depends on:** Task 1 (needs new types)
**Files:** `packages/graph/tests/constraints/DesignConstraintAdapter.test.ts`

Write tests for the design constraint checker. This adapter queries the graph for `design_token` nodes and checks component files for hardcoded values that should use tokens.

```typescript
// packages/graph/tests/constraints/DesignConstraintAdapter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import {
  DesignConstraintAdapter,
  type DesignViolation,
} from '../../src/constraints/DesignConstraintAdapter.js';

describe('DesignConstraintAdapter', () => {
  let store: GraphStore;
  let adapter: DesignConstraintAdapter;

  function seedTokens(): void {
    store.addNode({
      id: 'design_token:color.primary',
      type: 'design_token',
      name: 'color.primary',
      metadata: { tokenType: 'color', value: '#2563eb', group: 'color' },
    });
    store.addNode({
      id: 'design_token:color.error',
      type: 'design_token',
      name: 'color.error',
      metadata: { tokenType: 'color', value: '#dc2626', group: 'color' },
    });
    store.addNode({
      id: 'design_token:typography.body',
      type: 'design_token',
      name: 'typography.body',
      metadata: {
        tokenType: 'typography',
        value: { fontFamily: 'Geist', fontSize: '1rem', fontWeight: 400, lineHeight: 1.6 },
        group: 'typography',
      },
    });
  }

  function seedConstraints(): void {
    store.addNode({
      id: 'design_constraint:no-system-fonts',
      type: 'design_constraint',
      name: 'No system/default fonts in user-facing UI',
      metadata: {
        rule: 'No system/default fonts in user-facing UI',
        severity: 'warn',
        scope: 'project',
      },
    });
  }

  beforeEach(() => {
    store = new GraphStore();
    adapter = new DesignConstraintAdapter(store);
  });

  describe('checkForHardcodedColors', () => {
    it('detects hardcoded hex colors that are NOT in the token set', () => {
      seedTokens();

      // This source uses #3b82f6 which is NOT a token value
      const source = 'const style = { color: "#3b82f6", background: "#ffffff" };';
      const violations = adapter.checkForHardcodedColors(source, 'src/components/Button.tsx');

      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0]!.code).toMatch(/^DESIGN-/);
      expect(violations[0]!.file).toBe('src/components/Button.tsx');
      expect(violations[0]!.message).toContain('#3b82f6');
    });

    it('does NOT flag colors that match token values', () => {
      seedTokens();

      // Uses #2563eb which IS the primary token value
      const source = 'const style = { color: "#2563eb" };';
      const violations = adapter.checkForHardcodedColors(source, 'src/components/Button.tsx');

      expect(violations).toHaveLength(0);
    });

    it('returns empty for source with no hex colors', () => {
      seedTokens();

      const source = 'export function Button() { return <button>Click</button>; }';
      const violations = adapter.checkForHardcodedColors(source, 'src/components/Button.tsx');

      expect(violations).toHaveLength(0);
    });
  });

  describe('checkForHardcodedFonts', () => {
    it('detects font families not in the token set', () => {
      seedTokens();

      const source = "const style = { fontFamily: 'Inter' };";
      const violations = adapter.checkForHardcodedFonts(source, 'src/components/Card.tsx');

      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations[0]!.code).toMatch(/^DESIGN-/);
    });

    it('does NOT flag font families that match token values', () => {
      seedTokens();

      const source = "const style = { fontFamily: 'Geist' };";
      const violations = adapter.checkForHardcodedFonts(source, 'src/components/Card.tsx');

      expect(violations).toHaveLength(0);
    });
  });

  describe('severity mapping', () => {
    it('maps violations to info severity for permissive strictness', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx', 'permissive');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]!.severity).toBe('info');
    });

    it('maps violations to warn severity for standard strictness', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx', 'standard');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]!.severity).toBe('warn');
    });

    it('maps violations to error severity for strict strictness', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx', 'strict');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]!.severity).toBe('error');
    });

    it('defaults to standard strictness when not specified', () => {
      seedTokens();

      const source = 'const style = { color: "#3b82f6" };';
      const violations = adapter.checkForHardcodedColors(source, 'test.tsx');

      expect(violations[0]!.severity).toBe('warn');
    });
  });

  describe('checkAll', () => {
    it('combines color and font violations', () => {
      seedTokens();

      const source = `
        const style = {
          color: "#3b82f6",
          fontFamily: "Arial"
        };
      `;
      const violations = adapter.checkAll(source, 'test.tsx');

      expect(violations.length).toBeGreaterThanOrEqual(2);
      const codes = violations.map((v) => v.code);
      expect(codes.some((c) => c.includes('DESIGN-001'))).toBe(true); // hardcoded color
      expect(codes.some((c) => c.includes('DESIGN-002'))).toBe(true); // hardcoded font
    });
  });
});
```

**Verify (RED):** Run `cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/constraints/DesignConstraintAdapter.test.ts` — must FAIL because `DesignConstraintAdapter` does not exist yet.

---

### Task 6: Implement DesignConstraintAdapter (GREEN)

**Depends on:** Task 5
**Files:** `packages/graph/src/constraints/DesignConstraintAdapter.ts`

Create the adapter following the `GraphConstraintAdapter` pattern: constructor takes `GraphStore`, methods query the graph and return violation objects.

```typescript
export interface DesignViolation {
  code: string; // e.g., 'DESIGN-001'
  file: string;
  message: string;
  severity: 'error' | 'warn' | 'info';
  value?: string; // the offending value
  suggestion?: string; // nearest token suggestion
}

export type DesignStrictness = 'strict' | 'standard' | 'permissive';
```

Key implementation:

1. **`checkForHardcodedColors(source, file, strictness?)`**
   - Query `store.findNodes({ type: 'design_token' })` and filter to `tokenType === 'color'` to get the token color set.
   - Extract hex values from the source string using `/#[0-9a-fA-F]{3,8}\b/g`.
   - For each extracted hex, check if it exists in the token color set (case-insensitive compare). If NOT, create a `DesignViolation` with code `DESIGN-001`.
   - Map severity based on strictness: `permissive` -> `info`, `standard` -> `warn` (default), `strict` -> `error`.

2. **`checkForHardcodedFonts(source, file, strictness?)`**
   - Query typography tokens and extract `fontFamily` values from their `value` metadata.
   - Extract font family names from source using `fontFamily:\s*['"]([^'"]+)['"]/g` and similar patterns.
   - For each extracted font, check if it matches any token font family. If NOT, create a `DesignViolation` with code `DESIGN-002`.

3. **`checkAll(source, file, strictness?)`**
   - Call both `checkForHardcodedColors` and `checkForHardcodedFonts`, concatenate results.

4. **Severity mapping helper:**
   ```typescript
   private mapSeverity(strictness: DesignStrictness = 'standard'): DesignViolation['severity'] {
     switch (strictness) {
       case 'permissive': return 'info';
       case 'standard': return 'warn';
       case 'strict': return 'error';
     }
   }
   ```

**Verify (GREEN):**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/constraints/DesignConstraintAdapter.test.ts
```

**Verify (no regressions):**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/
```

---

### Task 7: Wire exports and integrate with KnowledgeIngestor

**Depends on:** Tasks 4 and 6
**Files:**

- `packages/graph/src/index.ts`
- `packages/graph/src/ingest/KnowledgeIngestor.ts` (optional integration)

Add exports to `packages/graph/src/index.ts`:

```typescript
// Design Ingest
export { DesignIngestor } from './ingest/DesignIngestor.js';

// Design Constraints
export { DesignConstraintAdapter } from './constraints/DesignConstraintAdapter.js';
export type { DesignViolation, DesignStrictness } from './constraints/DesignConstraintAdapter.js';
```

Optionally, add a `ingestDesign` call to `KnowledgeIngestor.ingestAll()` so that when the full knowledge ingest runs, design data is also ingested. This requires:

- Import `DesignIngestor` in KnowledgeIngestor
- In `ingestAll()`, check if `design-system/tokens.json` or a config-specified `tokenPath` exists
- If found, create a `DesignIngestor` and call `ingestAll(designDir)`, merge results

However, this integration is optional for Phase 2 — the `DesignIngestor` can be called standalone. The key requirement is that it is exported and usable.

**Verify:**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/graph/tsconfig.json
```

**Verify (full test suite):**

```bash
cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/
```

---

### Task 8: Final validation — all tests pass, types compile, exports work

**Depends on:** Tasks 1-7
**Files:** none (verification only)

Run the following checks in order:

1. **TypeScript compiles (graph package):**

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx tsc --noEmit -p packages/graph/tsconfig.json
   ```

2. **All graph package tests pass:**

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/ --reporter=verbose
   ```

3. **New design ingestor tests pass:**

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/ingest/DesignIngestor.test.ts --reporter=verbose
   ```

4. **New design constraint tests pass:**

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && npx vitest run packages/graph/tests/constraints/DesignConstraintAdapter.test.ts --reporter=verbose
   ```

5. **Full monorepo test suite (check for cascading breakage from type changes):**

   ```bash
   cd /Users/cwarner/Projects/harness-engineering && pnpm test 2>&1 | tail -30
   ```

   Note: Adding to `NODE_TYPES` and `EDGE_TYPES` may break tests that assert on exact counts (e.g., tests checking `NODE_TYPES.length`). If so, update those count assertions. Per learnings: "Persona count tests are fragile (hardcoded numbers)".

6. **Verify exports exist:**
   ```bash
   cd /Users/cwarner/Projects/harness-engineering && node -e "
     // Verify the new types are accessible
     // This just checks TypeScript compiled and exports resolve
     console.log('Checking graph package exports...');
     // After build, verify the new classes are importable
   "
   ```

**Done when:** All 5 checks pass. 7 new files created. No test regressions. TypeScript compiles. New node/edge types are in the graph schema. DesignIngestor ingests tokens.json and DESIGN.md. DesignConstraintAdapter detects hardcoded colors/fonts. Severity respects strictness config.

## Dependency Graph

```
Task 1 (types)     ──────────────────┬──> Task 3 (ingestor tests) ──> Task 4 (ingestor impl) ──┐
Task 2 (fixtures)  ──────────────────┘                                                          ├──> Task 7 (exports) ──> Task 8 (validate)
Task 1 (types)     ──> Task 5 (constraint tests) ──> Task 6 (constraint impl) ─────────────────┘

Wave 1 (parallel): Tasks 1, 2
Wave 2 (parallel): Tasks 3, 5 (after Task 1; Task 3 also needs Task 2)
Wave 3 (parallel): Tasks 4, 6 (TDD GREEN — after their respective RED tests)
Wave 4 (sequential): Task 7 (needs Tasks 4 + 6)
Wave 5 (sequential): Task 8 (final gate)
```

Tasks 1 and 2 are independent and can run in parallel. Tasks 3 and 5 both depend on Task 1 for the new types. Tasks 4 and 6 are the GREEN implementations. Task 7 wires everything together. Task 8 validates the whole thing.

## Notes

- The existing `violates` edge type is already in `EDGE_TYPES`. The spec says the new design edge should also be called `VIOLATES` but that would collide. Using `violates_design` to disambiguate.
- The `PLATFORM_BINDING` edge type from the spec is included but not heavily used in Phase 2 — the DesignIngestor creates the edge type but the actual platform binding logic is deferred to Phase 5 (implementation skills). The type must exist now so the schema is forward-compatible.
- Per learnings: `glob` package (not `fast-glob`); CICheckName count changes cascade to orchestrator/MCP tests; persona count tests are fragile. Watch for `NODE_TYPES.length` assertions.
- The `DesignConstraintAdapter` intentionally does NOT modify the `enforce-architecture` skill YAML/SKILL.md in this phase. That wiring happens in Phase 6 (Integration). This phase only creates the adapter and exports it. The enforce-architecture skill already has a "Graph-Enhanced Context" section in its SKILL.md that describes how to use graph queries — the design constraint adapter is the code backing for future design-specific queries.
- The `enforce-architecture` skill references `harness check-deps` CLI command. Wiring the `DesignConstraintAdapter` into that CLI command is Phase 6 scope. Phase 2 delivers the graph schema + adapter code.
