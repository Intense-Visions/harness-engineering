# Module 4: Entropy Management - Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Entropy Management module providing documentation drift detection, dead code detection, pattern violation detection, and auto-fix utilities.

**Architecture:** Fourth module building on validation, context, and constraints foundations. Uses a Unified Analysis Engine with shared `CodebaseSnapshot` - parse once, analyze many. Reuses `TypeScriptParser` and `DependencyGraph` from constraints module. All operations return `Result<T, EntropyError>`.

**Tech Stack:** TypeScript 5+, Vitest 4+, @typescript-eslint/typescript-estree ^7.0.0, zod ^3.22.0, glob ^10.3.0

---

## File Structure Overview

**Entropy Module:**

- `packages/core/src/entropy/types.ts` - All entropy-specific types
- `packages/core/src/entropy/snapshot.ts` - CodebaseSnapshot builder
- `packages/core/src/entropy/analyzer.ts` - EntropyAnalyzer orchestrator
- `packages/core/src/entropy/detectors/drift.ts` - Documentation drift detection
- `packages/core/src/entropy/detectors/dead-code.ts` - Dead code detection
- `packages/core/src/entropy/detectors/patterns.ts` - Pattern violation detection
- `packages/core/src/entropy/detectors/index.ts` - Detector exports
- `packages/core/src/entropy/fixers/safe-fixes.ts` - Auto-applicable fixes
- `packages/core/src/entropy/fixers/suggestions.ts` - Suggestion generator
- `packages/core/src/entropy/fixers/index.ts` - Fixer exports
- `packages/core/src/entropy/config/schema.ts` - Zod config schemas
- `packages/core/src/entropy/config/patterns.ts` - Built-in patterns
- `packages/core/src/entropy/config/index.ts` - Config exports
- `packages/core/src/entropy/index.ts` - Public exports

**Tests:**

- `packages/core/tests/entropy/snapshot.test.ts`
- `packages/core/tests/entropy/detectors/drift.test.ts`
- `packages/core/tests/entropy/detectors/dead-code.test.ts`
- `packages/core/tests/entropy/detectors/patterns.test.ts`
- `packages/core/tests/entropy/fixers/safe-fixes.test.ts`
- `packages/core/tests/entropy/fixers/suggestions.test.ts`
- `packages/core/tests/entropy/analyzer.test.ts`
- `packages/core/tests/entropy/integration/full-analysis.test.ts`

**Test Fixtures:**

- `packages/core/tests/fixtures/entropy/drift-samples/` - Docs with outdated refs
- `packages/core/tests/fixtures/entropy/dead-code-samples/` - Unused exports/files
- `packages/core/tests/fixtures/entropy/pattern-samples/` - Pattern violations
- `packages/core/tests/fixtures/entropy/valid-project/` - Clean project baseline

---

## Chunk 1: Types and Snapshot Infrastructure

### Task 1: Entropy Module Types

**Files:**

- Create: `packages/core/src/entropy/types.ts`

- [ ] **Step 1: Create entropy types file**

```typescript
// packages/core/src/entropy/types.ts
import type { z } from 'zod';
import type { BaseError } from '../shared/errors';
import type { AST, Import, Export, LanguageParser } from '../shared/parsers';
import type { DependencyGraph } from '../constraints/types';

// ============ Error Types ============

export interface EntropyError extends BaseError {
  code:
    | 'SNAPSHOT_BUILD_FAILED'
    | 'PARSE_ERROR'
    | 'ENTRY_POINT_NOT_FOUND'
    | 'INVALID_CONFIG'
    | 'FIX_FAILED'
    | 'BACKUP_FAILED';
  details: {
    file?: string;
    reason?: string;
    originalError?: Error;
  };
}

// ============ Snapshot Types ============

export interface InternalSymbol {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type';
  line: number;
  references: number;
  calledBy: string[];
}

export interface JSDocComment {
  content: string;
  line: number;
  associatedSymbol?: string;
}

export interface CodeBlock {
  language: string;
  content: string;
  line: number;
}

export interface InlineReference {
  reference: string;
  line: number;
  column: number;
}

export interface SourceFile {
  path: string;
  ast: AST;
  imports: Import[];
  exports: Export[];
  internalSymbols: InternalSymbol[];
  jsDocComments: JSDocComment[];
}

export interface DocumentationFile {
  path: string;
  type: 'markdown' | 'jsdoc' | 'typedoc' | 'text';
  content: string;
  codeBlocks: CodeBlock[];
  inlineRefs: InlineReference[];
}

export interface CodeReference {
  docFile: string;
  line: number;
  column: number;
  reference: string;
  context: 'code-block' | 'inline' | 'link' | 'jsdoc';
  resolvedTo?: string;
}

export interface ExportMap {
  byFile: Map<string, Export[]>;
  byName: Map<string, { file: string; export: Export }[]>;
}

export interface CodebaseSnapshot {
  files: SourceFile[];
  dependencyGraph: DependencyGraph;
  exportMap: ExportMap;
  docs: DocumentationFile[];
  codeReferences: CodeReference[];
  entryPoints: string[];
  rootDir: string;
  config: EntropyConfig;
  buildTime: number;
}

// ============ Config Types ============

export interface DriftConfig {
  docPaths: string[];
  checkApiSignatures: boolean;
  checkExamples: boolean;
  checkStructure: boolean;
  ignorePatterns: string[];
}

export interface DeadCodeConfig {
  entryPoints?: string[];
  includeTypes: boolean;
  includeInternals: boolean;
  ignorePatterns: string[];
  treatDynamicImportsAs: 'used' | 'unknown';
}

export interface EntropyConfig {
  rootDir: string;
  parser?: LanguageParser;
  entryPoints?: string[];
  analyze: {
    drift?: boolean | Partial<DriftConfig>;
    deadCode?: boolean | Partial<DeadCodeConfig>;
    patterns?: boolean | PatternConfig;
  };
  include?: string[];
  exclude?: string[];
  docPaths?: string[];
}

// ============ Drift Types ============

export interface DocumentationDrift {
  type: 'api-signature' | 'example-code' | 'structure';
  docFile: string;
  line: number;
  reference: string;
  context: string;
  issue: 'NOT_FOUND' | 'RENAMED' | 'SIGNATURE_CHANGED' | 'SYNTAX_ERROR' | 'IMPORT_ERROR';
  details: string;
  suggestion?: string;
  possibleMatches?: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DriftReport {
  drifts: DocumentationDrift[];
  stats: {
    docsScanned: number;
    referencesChecked: number;
    driftsFound: number;
    byType: { api: number; example: number; structure: number };
  };
  severity: 'high' | 'medium' | 'low' | 'none';
}

// ============ Dead Code Types ============

export interface DeadExport {
  file: string;
  name: string;
  line: number;
  type: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum';
  isDefault: boolean;
  reason: 'NO_IMPORTERS' | 'IMPORTERS_ALSO_DEAD';
}

export interface DeadFile {
  path: string;
  reason: 'NO_IMPORTERS' | 'NOT_ENTRY_POINT' | 'ALL_EXPORTS_DEAD';
  exportCount: number;
  lineCount: number;
}

export interface DeadInternal {
  file: string;
  name: string;
  line: number;
  type: 'function' | 'class' | 'variable';
  reason: 'NEVER_CALLED' | 'ONLY_CALLED_BY_DEAD';
}

export interface UnusedImport {
  file: string;
  line: number;
  source: string;
  specifiers: string[];
  isFullyUnused: boolean;
}

export interface ReachabilityNode {
  file: string;
  reachable: boolean;
  importedBy: string[];
  imports: string[];
}

export interface DeadCodeReport {
  deadExports: DeadExport[];
  deadFiles: DeadFile[];
  deadInternals: DeadInternal[];
  unusedImports: UnusedImport[];
  stats: {
    filesAnalyzed: number;
    entryPointsUsed: string[];
    totalExports: number;
    deadExportCount: number;
    totalFiles: number;
    deadFileCount: number;
    estimatedDeadLines: number;
  };
  reachabilityTree?: ReachabilityNode;
}

// ============ Pattern Types ============

export interface ConfigPattern {
  name: string;
  description: string;
  severity: 'error' | 'warning';
  files: string[];
  rule:
    | { type: 'must-export'; names: string[] }
    | { type: 'must-export-default'; kind?: 'class' | 'function' | 'object' }
    | { type: 'no-export'; names: string[] }
    | { type: 'must-import'; from: string; names?: string[] }
    | { type: 'no-import'; from: string }
    | {
        type: 'naming';
        match: string;
        convention: 'camelCase' | 'PascalCase' | 'UPPER_SNAKE' | 'kebab-case';
      }
    | { type: 'max-exports'; count: number }
    | { type: 'max-lines'; count: number }
    | { type: 'require-jsdoc'; for: ('function' | 'class' | 'export')[] };
  message?: string;
}

export interface CodePattern {
  name: string;
  description: string;
  severity: 'error' | 'warning';
  check: (file: SourceFile, snapshot: CodebaseSnapshot) => PatternMatch[];
}

export interface PatternMatch {
  line: number;
  column?: number;
  message: string;
  suggestion?: string;
}

export interface PatternConfig {
  patterns: ConfigPattern[];
  customPatterns?: CodePattern[];
  ignoreFiles?: string[];
}

export interface PatternViolation {
  pattern: string;
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

export interface PatternReport {
  violations: PatternViolation[];
  stats: {
    filesChecked: number;
    patternsApplied: number;
    violationCount: number;
    errorCount: number;
    warningCount: number;
  };
  passRate: number;
}

// ============ Fix Types ============

export type FixType =
  | 'unused-imports'
  | 'dead-files'
  | 'trailing-whitespace'
  | 'broken-links'
  | 'sort-imports';

export interface FixConfig {
  dryRun: boolean;
  fixTypes: FixType[];
  createBackup: boolean;
  backupDir?: string;
}

export interface Fix {
  type: FixType;
  file: string;
  description: string;
  action: 'delete-file' | 'delete-lines' | 'replace' | 'insert';
  line?: number;
  oldContent?: string;
  newContent?: string;
  safe: true;
  reversible: boolean;
}

export interface FixResult {
  applied: Fix[];
  skipped: Fix[];
  errors: { fix: Fix; error: string }[];
  stats: {
    filesModified: number;
    filesDeleted: number;
    linesRemoved: number;
    backupPath?: string;
  };
}

// ============ Suggestion Types ============

export interface Suggestion {
  type:
    | 'rename'
    | 'move'
    | 'merge'
    | 'split'
    | 'delete'
    | 'update-docs'
    | 'add-export'
    | 'refactor';
  priority: 'high' | 'medium' | 'low';
  source: 'drift' | 'dead-code' | 'pattern';
  relatedIssues: string[];
  title: string;
  description: string;
  files: string[];
  steps: string[];
  preview?: {
    file: string;
    diff: string;
  };
  whyManual: string;
}

export interface SuggestionReport {
  suggestions: Suggestion[];
  byPriority: {
    high: Suggestion[];
    medium: Suggestion[];
    low: Suggestion[];
  };
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
}

// ============ Report Types ============

export interface EntropyReport {
  snapshot: CodebaseSnapshot;
  drift?: DriftReport;
  deadCode?: DeadCodeReport;
  patterns?: PatternReport;
  summary: {
    totalIssues: number;
    errors: number;
    warnings: number;
    fixableCount: number;
    suggestionCount: number;
  };
  timestamp: string;
  duration: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/entropy/types.ts
git commit -m "feat(core): add entropy module types"
```

---

### Task 2: Entropy Error Helper

**Files:**

- Modify: `packages/core/src/shared/errors.ts`

- [ ] **Step 1: Add createEntropyError helper**

Add to `packages/core/src/shared/errors.ts`:

```typescript
import type { EntropyError } from '../entropy/types';

export function createEntropyError(
  code: EntropyError['code'],
  message: string,
  details: EntropyError['details'] = {},
  suggestions: string[] = []
): EntropyError {
  return { code, message, details, suggestions };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/shared/errors.ts
git commit -m "feat(core): add entropy error helper"
```

---

### Task 3: Test Fixtures Setup

**Files:**

- Create: `packages/core/tests/fixtures/entropy/valid-project/`

- [ ] **Step 1: Create valid-project fixture directories**

```bash
mkdir -p packages/core/tests/fixtures/entropy/valid-project/src
mkdir -p packages/core/tests/fixtures/entropy/valid-project/docs
```

- [ ] **Step 2: Create fixture source files**

```typescript
// packages/core/tests/fixtures/entropy/valid-project/src/index.ts
export { createUser, findUserById } from './user';
export { validateEmail } from './utils';
export type { User } from './types';
```

```typescript
// packages/core/tests/fixtures/entropy/valid-project/src/types.ts
export interface User {
  id: string;
  email: string;
  name: string;
}
```

```typescript
// packages/core/tests/fixtures/entropy/valid-project/src/user.ts
import type { User } from './types';
import { validateEmail } from './utils';

export function createUser(email: string, name: string): User {
  if (!validateEmail(email)) {
    throw new Error('Invalid email');
  }
  return { id: '1', email, name };
}

export function findUserById(id: string): User | null {
  return null;
}
```

```typescript
// packages/core/tests/fixtures/entropy/valid-project/src/utils.ts
export function validateEmail(email: string): boolean {
  return email.includes('@');
}
```

- [ ] **Step 3: Create fixture package.json**

```json
// packages/core/tests/fixtures/entropy/valid-project/package.json
{
  "name": "valid-project",
  "version": "1.0.0",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 4: Create fixture documentation**

````markdown
// packages/core/tests/fixtures/entropy/valid-project/docs/api.md

# API Reference

## User Management

### `createUser(email, name)`

Creates a new user with the given email and name.

```typescript
import { createUser } from './src';

const user = createUser('test@example.com', 'John');
```
````

### `findUserById(id)`

Finds a user by their ID.

```typescript
import { findUserById } from './src';

const user = findUserById('123');
```

## Utilities

### `validateEmail(email)`

Validates an email address format.

````

```markdown
// packages/core/tests/fixtures/entropy/valid-project/README.md
# Valid Project

A sample project for testing entropy detection.

## Usage

```typescript
import { createUser, validateEmail } from './src';

if (validateEmail('test@example.com')) {
  const user = createUser('test@example.com', 'John');
}
````

````

- [ ] **Step 5: Commit fixtures**

```bash
git add packages/core/tests/fixtures/entropy/
git commit -m "test(core): add entropy module test fixtures"
````

---

### Task 4: Snapshot Builder - Entry Point Resolution

**Files:**

- Create: `packages/core/src/entropy/snapshot.ts`
- Create: `packages/core/tests/entropy/snapshot.test.ts`

- [ ] **Step 1: Write failing test for resolveEntryPoints**

```typescript
// packages/core/tests/entropy/snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { resolveEntryPoints } from '../../src/entropy/snapshot';
import { join } from 'path';

describe('resolveEntryPoints', () => {
  const fixturesDir = join(__dirname, '../fixtures/entropy/valid-project');

  it('should resolve entry points from package.json exports', async () => {
    const result = await resolveEntryPoints(fixturesDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value.some((e) => e.includes('index.ts'))).toBe(true);
    }
  });

  it('should use explicit entry points when provided', async () => {
    const result = await resolveEntryPoints(fixturesDir, ['src/user.ts']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toContain('user.ts');
    }
  });

  it('should fall back to conventions when no package.json', async () => {
    const result = await resolveEntryPoints(join(fixturesDir, 'src'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some((e) => e.includes('index.ts'))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test snapshot.test.ts`
Expected: FAIL - "Cannot find module"

- [ ] **Step 3: Implement resolveEntryPoints**

```typescript
// packages/core/src/entropy/snapshot.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  EntropyConfig,
  SourceFile,
  DocumentationFile,
  CodeReference,
  ExportMap,
} from './types';
import { createEntropyError } from '../shared/errors';
import type { LanguageParser } from '../shared/parsers';
import { TypeScriptParser } from '../shared/parsers';
import { readFileContent, findFiles, fileExists } from '../shared/fs-utils';
import { buildDependencyGraph } from '../constraints/dependencies';
import { join, resolve, relative } from 'path';

/**
 * Resolve entry points for dead code analysis
 */
export async function resolveEntryPoints(
  rootDir: string,
  explicitEntries?: string[]
): Promise<Result<string[], EntropyError>> {
  // 1. Use explicit entries if provided
  if (explicitEntries && explicitEntries.length > 0) {
    const resolved = explicitEntries.map((e) => resolve(rootDir, e));
    return Ok(resolved);
  }

  // 2. Try package.json
  const pkgPath = join(rootDir, 'package.json');
  if (await fileExists(pkgPath)) {
    const pkgContent = await readFileContent(pkgPath);
    if (pkgContent.ok) {
      try {
        const pkg = JSON.parse(pkgContent.value);
        const entries: string[] = [];

        // Check exports field
        if (pkg.exports) {
          if (typeof pkg.exports === 'string') {
            entries.push(resolve(rootDir, pkg.exports));
          } else if (typeof pkg.exports === 'object') {
            for (const value of Object.values(pkg.exports)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        // Check main field
        if (pkg.main && entries.length === 0) {
          entries.push(resolve(rootDir, pkg.main));
        }

        // Check bin field
        if (pkg.bin) {
          if (typeof pkg.bin === 'string') {
            entries.push(resolve(rootDir, pkg.bin));
          } else if (typeof pkg.bin === 'object') {
            for (const value of Object.values(pkg.bin)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        if (entries.length > 0) {
          return Ok(entries);
        }
      } catch {
        // Invalid JSON, fall through to conventions
      }
    }
  }

  // 3. Fall back to conventions
  const conventions = ['src/index.ts', 'src/main.ts', 'index.ts', 'main.ts'];
  for (const conv of conventions) {
    const convPath = join(rootDir, conv);
    if (await fileExists(convPath)) {
      return Ok([convPath]);
    }
  }

  return Err(
    createEntropyError(
      'ENTRY_POINT_NOT_FOUND',
      'Could not resolve entry points',
      { reason: 'No package.json exports/main and no conventional entry files found' },
      [
        'Add "exports" or "main" to package.json',
        'Create src/index.ts',
        'Specify entryPoints in config',
      ]
    )
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test snapshot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/snapshot.ts packages/core/tests/entropy/snapshot.test.ts
git commit -m "feat(core): implement entry point resolution"
```

---

### Task 5: Snapshot Builder - Documentation Parsing

**Files:**

- Modify: `packages/core/src/entropy/snapshot.ts`
- Modify: `packages/core/tests/entropy/snapshot.test.ts`

- [ ] **Step 1: Write failing test for parseDocumentationFile**

```typescript
// Add to packages/core/tests/entropy/snapshot.test.ts

describe('parseDocumentationFile', () => {
  const fixturesDir = join(__dirname, '../fixtures/entropy/valid-project');

  it('should parse markdown file and extract code blocks', async () => {
    const result = await parseDocumentationFile(join(fixturesDir, 'README.md'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('markdown');
      expect(result.value.codeBlocks.length).toBeGreaterThan(0);
      expect(result.value.codeBlocks[0].language).toBe('typescript');
    }
  });

  it('should extract inline references', async () => {
    const result = await parseDocumentationFile(join(fixturesDir, 'docs/api.md'));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.inlineRefs.length).toBeGreaterThan(0);
      expect(result.value.inlineRefs.some((r) => r.reference === 'createUser')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test snapshot.test.ts`
Expected: FAIL - parseDocumentationFile not exported

- [ ] **Step 3: Implement parseDocumentationFile**

````typescript
// Add to packages/core/src/entropy/snapshot.ts

/**
 * Extract code blocks from markdown content
 */
function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  let lineNumber = 1;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const langMatch = line.match(/```(\w*)/);
      const language = langMatch?.[1] || 'text';

      // Find closing ```
      let codeContent = '';
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        codeContent += lines[j] + '\n';
        j++;
      }

      blocks.push({
        language,
        content: codeContent.trim(),
        line: i + 1,
      });

      i = j; // Skip to end of code block
    }
  }

  return blocks;
}

/**
 * Extract inline backtick references from markdown
 */
function extractInlineRefs(content: string): InlineReference[] {
  const refs: InlineReference[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regex = /`([^`]+)`/g;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const reference = match[1];
      // Filter out code snippets, keep likely symbol references
      if (reference.match(/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*(\(.*\))?$/)) {
        refs.push({
          reference: reference.replace(/\(.*\)$/, ''), // Remove function parens
          line: i + 1,
          column: match.index,
        });
      }
    }
  }

  return refs;
}

/**
 * Parse a documentation file
 */
export async function parseDocumentationFile(
  path: string
): Promise<Result<DocumentationFile, EntropyError>> {
  const contentResult = await readFileContent(path);
  if (!contentResult.ok) {
    return Err(
      createEntropyError(
        'PARSE_ERROR',
        `Failed to read documentation file: ${path}`,
        { file: path },
        ['Check that the file exists']
      )
    );
  }

  const content = contentResult.value;
  const type = path.endsWith('.md') ? 'markdown' : 'text';

  return Ok({
    path,
    type,
    content,
    codeBlocks: extractCodeBlocks(content),
    inlineRefs: extractInlineRefs(content),
  });
}
````

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test snapshot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/snapshot.ts packages/core/tests/entropy/snapshot.test.ts
git commit -m "feat(core): implement documentation file parsing"
```

---

### Task 6: Snapshot Builder - Full Snapshot

**Files:**

- Modify: `packages/core/src/entropy/snapshot.ts`
- Modify: `packages/core/tests/entropy/snapshot.test.ts`

- [ ] **Step 1: Write failing test for buildSnapshot**

```typescript
// Add to packages/core/tests/entropy/snapshot.test.ts
import { buildSnapshot } from '../../src/entropy/snapshot';
import { TypeScriptParser } from '../../src/shared/parsers';

describe('buildSnapshot', () => {
  const fixturesDir = join(__dirname, '../fixtures/entropy/valid-project');
  const parser = new TypeScriptParser();

  it('should build complete snapshot', async () => {
    const result = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { drift: true, deadCode: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md', 'README.md'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files.length).toBeGreaterThan(0);
      expect(result.value.docs.length).toBeGreaterThan(0);
      expect(result.value.entryPoints.length).toBeGreaterThan(0);
      expect(result.value.exportMap.byName.size).toBeGreaterThan(0);
    }
  });

  it('should build export map indexed by name', async () => {
    const result = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exportMap.byName.has('createUser')).toBe(true);
      expect(result.value.exportMap.byName.has('validateEmail')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test snapshot.test.ts`
Expected: FAIL - buildSnapshot not implemented

- [ ] **Step 3: Implement buildSnapshot**

```typescript
// Add to packages/core/src/entropy/snapshot.ts

import type { InternalSymbol, JSDocComment } from './types';

/**
 * Extract internal (non-exported) symbols from AST
 */
function extractInternalSymbols(ast: AST): InternalSymbol[] {
  const symbols: InternalSymbol[] = [];
  const body = ast.body as any;

  if (!body?.body) return symbols;

  for (const node of body.body) {
    // Function declarations not exported
    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      symbols.push({
        name: node.id.name,
        type: 'function',
        line: node.loc?.start?.line || 0,
        references: 0, // Would need usage analysis
        calledBy: [],
      });
    }
    // Variable declarations not exported
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations || []) {
        if (decl.id?.name) {
          symbols.push({
            name: decl.id.name,
            type: 'variable',
            line: node.loc?.start?.line || 0,
            references: 0,
            calledBy: [],
          });
        }
      }
    }
    // Class declarations not exported
    if (node.type === 'ClassDeclaration' && node.id?.name) {
      symbols.push({
        name: node.id.name,
        type: 'class',
        line: node.loc?.start?.line || 0,
        references: 0,
        calledBy: [],
      });
    }
  }

  return symbols;
}

/**
 * Extract JSDoc comments from AST
 */
function extractJSDocComments(ast: AST): JSDocComment[] {
  const comments: JSDocComment[] = [];
  const body = ast.body as any;

  // Check for comments array in AST
  if (body?.comments) {
    for (const comment of body.comments) {
      if (comment.type === 'Block' && comment.value?.startsWith('*')) {
        comments.push({
          content: comment.value,
          line: comment.loc?.start?.line || 0,
          associatedSymbol: undefined, // Would need position correlation
        });
      }
    }
  }

  return comments;
}

/**
 * Build ExportMap from source files
 */
function buildExportMap(files: SourceFile[]): ExportMap {
  const byFile = new Map<string, Export[]>();
  const byName = new Map<string, { file: string; export: Export }[]>();

  for (const file of files) {
    byFile.set(file.path, file.exports);

    for (const exp of file.exports) {
      const existing = byName.get(exp.name) || [];
      existing.push({ file: file.path, export: exp });
      byName.set(exp.name, existing);
    }
  }

  return { byFile, byName };
}

/**
 * Extract code references from all documentation
 */
function extractAllCodeReferences(docs: DocumentationFile[]): CodeReference[] {
  const refs: CodeReference[] = [];

  for (const doc of docs) {
    // From inline refs
    for (const inlineRef of doc.inlineRefs) {
      refs.push({
        docFile: doc.path,
        line: inlineRef.line,
        column: inlineRef.column,
        reference: inlineRef.reference,
        context: 'inline',
      });
    }

    // From code blocks (extract identifiers)
    for (const block of doc.codeBlocks) {
      if (
        block.language === 'typescript' ||
        block.language === 'ts' ||
        block.language === 'javascript' ||
        block.language === 'js'
      ) {
        // Extract import statements
        const importRegex = /import\s+\{([^}]+)\}\s+from/g;
        let match;
        while ((match = importRegex.exec(block.content)) !== null) {
          const names = match[1].split(',').map((n) => n.trim());
          for (const name of names) {
            refs.push({
              docFile: doc.path,
              line: block.line,
              column: 0,
              reference: name,
              context: 'code-block',
            });
          }
        }
      }
    }
  }

  return refs;
}

/**
 * Build a complete CodebaseSnapshot
 */
export async function buildSnapshot(
  config: EntropyConfig
): Promise<Result<CodebaseSnapshot, EntropyError>> {
  const startTime = Date.now();
  const parser = config.parser || new TypeScriptParser();
  const rootDir = resolve(config.rootDir);

  // Resolve entry points
  const entryPointsResult = await resolveEntryPoints(rootDir, config.entryPoints);
  if (!entryPointsResult.ok) {
    return Err(entryPointsResult.error);
  }

  // Find source files
  const includePatterns = config.include || ['**/*.ts', '**/*.tsx'];
  const excludePatterns = config.exclude || [
    'node_modules/**',
    'dist/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ];

  let sourceFilePaths: string[] = [];
  for (const pattern of includePatterns) {
    const files = await findFiles(pattern, rootDir);
    sourceFilePaths.push(...files);
  }

  // Filter out excluded
  sourceFilePaths = sourceFilePaths.filter((f) => {
    const rel = relative(rootDir, f);
    return !excludePatterns.some((p) => minimatch(rel, p));
  });

  // Parse source files
  const files: SourceFile[] = [];
  for (const filePath of sourceFilePaths) {
    const parseResult = await parser.parseFile(filePath);
    if (!parseResult.ok) continue;

    const importsResult = parser.extractImports(parseResult.value);
    const exportsResult = parser.extractExports(parseResult.value);
    const internalSymbols = extractInternalSymbols(parseResult.value);
    const jsDocComments = extractJSDocComments(parseResult.value);

    files.push({
      path: filePath,
      ast: parseResult.value,
      imports: importsResult.ok ? importsResult.value : [],
      exports: exportsResult.ok ? exportsResult.value : [],
      internalSymbols,
      jsDocComments,
    });
  }

  // Build dependency graph
  const graphResult = await buildDependencyGraph(sourceFilePaths, parser);
  const dependencyGraph = graphResult.ok ? graphResult.value : { nodes: [], edges: [] };

  // Find and parse documentation
  const docPatterns = config.docPaths || ['docs/**/*.md', 'README.md', '**/README.md'];
  let docFilePaths: string[] = [];
  for (const pattern of docPatterns) {
    const docFiles = await findFiles(pattern, rootDir);
    docFilePaths.push(...docFiles);
  }
  docFilePaths = [...new Set(docFilePaths)]; // Dedupe

  const docs: DocumentationFile[] = [];
  for (const docPath of docFilePaths) {
    const docResult = await parseDocumentationFile(docPath);
    if (docResult.ok) {
      docs.push(docResult.value);
    }
  }

  // Build export map and extract code references
  const exportMap = buildExportMap(files);
  const codeReferences = extractAllCodeReferences(docs);

  const buildTime = Date.now() - startTime;

  return Ok({
    files,
    dependencyGraph,
    exportMap,
    docs,
    codeReferences,
    entryPoints: entryPointsResult.value,
    rootDir,
    config,
    buildTime,
  });
}
```

- [ ] **Step 4: Add minimatch import at top of file**

```typescript
import { minimatch } from 'glob';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test snapshot.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/entropy/snapshot.ts packages/core/tests/entropy/snapshot.test.ts
git commit -m "feat(core): implement CodebaseSnapshot builder"
```

---

## Chunk 2: Documentation Drift Detector

### Task 7: Drift Detector - Fuzzy Matching Utilities

**Files:**

- Create: `packages/core/src/entropy/detectors/drift.ts`
- Create: `packages/core/tests/entropy/detectors/drift.test.ts`

- [ ] **Step 1: Create drift-samples test fixture**

```bash
mkdir -p packages/core/tests/fixtures/entropy/drift-samples/src
mkdir -p packages/core/tests/fixtures/entropy/drift-samples/docs
```

```typescript
// packages/core/tests/fixtures/entropy/drift-samples/src/user.ts
export function findUserById(id: string) {
  return null;
}
export function createNewUser(name: string) {
  return { id: '1', name };
}
```

```markdown
// packages/core/tests/fixtures/entropy/drift-samples/docs/api.md

# API

## `getUserById(id)`

Gets a user by ID.

## `createUser(name)`

Creates a user.

## See [missing-file.ts](../src/missing-file.ts)
```

- [ ] **Step 2: Write failing test for fuzzy matching**

```typescript
// packages/core/tests/entropy/detectors/drift.test.ts
import { describe, it, expect } from 'vitest';
import { findPossibleMatches, levenshteinDistance } from '../../../src/entropy/detectors/drift';

describe('fuzzy matching', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should calculate distance for similar strings', () => {
      expect(levenshteinDistance('getUserById', 'findUserById')).toBeLessThan(10);
    });
  });

  describe('findPossibleMatches', () => {
    const exports = ['findUserById', 'createNewUser', 'validateEmail', 'User'];

    it('should find similar names', () => {
      const matches = findPossibleMatches('getUserById', exports);
      expect(matches).toContain('findUserById');
    });

    it('should find prefix matches', () => {
      const matches = findPossibleMatches('createUser', exports);
      expect(matches).toContain('createNewUser');
    });

    it('should return empty for no matches', () => {
      const matches = findPossibleMatches('totallyDifferent', exports);
      expect(matches.length).toBe(0);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/core && pnpm test drift.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 4: Implement fuzzy matching utilities**

```typescript
// packages/core/src/entropy/detectors/drift.ts
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  DriftConfig,
  DriftReport,
  DocumentationDrift,
} from '../types';
import { createEntropyError } from '../../shared/errors';
import { fileExists } from '../../shared/fs-utils';
import { dirname, join, resolve } from 'path';

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find possible matches for a reference in a list of exports
 */
export function findPossibleMatches(
  reference: string,
  exportNames: string[],
  maxDistance: number = 5
): string[] {
  const matches: { name: string; score: number }[] = [];
  const refLower = reference.toLowerCase();

  for (const name of exportNames) {
    const nameLower = name.toLowerCase();

    // Exact match (case-insensitive)
    if (nameLower === refLower) {
      matches.push({ name, score: 0 });
      continue;
    }

    // Prefix/suffix match
    if (nameLower.includes(refLower) || refLower.includes(nameLower)) {
      matches.push({ name, score: 1 });
      continue;
    }

    // Levenshtein distance
    const distance = levenshteinDistance(refLower, nameLower);
    if (distance <= maxDistance) {
      matches.push({ name, score: distance });
    }
  }

  return matches
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((m) => m.name);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test drift.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/entropy/detectors/drift.ts packages/core/tests/entropy/detectors/drift.test.ts packages/core/tests/fixtures/entropy/drift-samples/
git commit -m "feat(core): implement fuzzy matching for drift detection"
```

---

### Task 8: Drift Detector - API Signature Detection

**Files:**

- Modify: `packages/core/src/entropy/detectors/drift.ts`
- Modify: `packages/core/tests/entropy/detectors/drift.test.ts`

- [ ] **Step 1: Write failing test for detectApiDrift**

```typescript
// Add to packages/core/tests/entropy/detectors/drift.test.ts
import { detectDocDrift } from '../../../src/entropy/detectors/drift';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

describe('detectDocDrift', () => {
  const parser = new TypeScriptParser();
  const driftFixtures = join(__dirname, '../../fixtures/entropy/drift-samples');

  it('should detect API signature drift', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: driftFixtures,
      parser,
      analyze: { drift: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = detectDocDrift(snapshotResult.value, {
      checkApiSignatures: true,
      checkExamples: false,
      checkStructure: false,
      docPaths: [],
      ignorePatterns: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.drifts.length).toBeGreaterThan(0);

      const apiDrifts = result.value.drifts.filter((d) => d.type === 'api-signature');
      expect(apiDrifts.some((d) => d.reference === 'getUserById')).toBe(true);
      expect(apiDrifts.some((d) => d.possibleMatches?.includes('findUserById'))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test drift.test.ts`
Expected: FAIL - detectDocDrift not implemented

- [ ] **Step 3: Implement detectDocDrift for API signatures**

```typescript
// Add to packages/core/src/entropy/detectors/drift.ts

const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  docPaths: [],
  checkApiSignatures: true,
  checkExamples: true,
  checkStructure: true,
  ignorePatterns: [],
};

/**
 * Check API signature drift - docs reference symbols that don't exist
 */
function checkApiSignatureDrift(
  snapshot: CodebaseSnapshot,
  config: DriftConfig
): DocumentationDrift[] {
  const drifts: DocumentationDrift[] = [];
  const exportNames = Array.from(snapshot.exportMap.byName.keys());

  for (const ref of snapshot.codeReferences) {
    if (config.ignorePatterns.some((p) => ref.reference.match(new RegExp(p)))) {
      continue;
    }

    // Check if reference exists in exports
    if (!snapshot.exportMap.byName.has(ref.reference)) {
      const possibleMatches = findPossibleMatches(ref.reference, exportNames);
      const confidence = possibleMatches.length > 0 ? 'high' : 'medium';

      drifts.push({
        type: 'api-signature',
        docFile: ref.docFile,
        line: ref.line,
        reference: ref.reference,
        context: ref.context,
        issue: possibleMatches.length > 0 ? 'RENAMED' : 'NOT_FOUND',
        details:
          possibleMatches.length > 0
            ? `Symbol "${ref.reference}" not found. Similar: ${possibleMatches.join(', ')}`
            : `Symbol "${ref.reference}" not found in codebase`,
        suggestion:
          possibleMatches.length > 0
            ? `Did you mean "${possibleMatches[0]}"?`
            : 'Remove reference or add the missing export',
        possibleMatches: possibleMatches.length > 0 ? possibleMatches : undefined,
        confidence,
      });
    }
  }

  return drifts;
}

/**
 * Detect documentation drift in a codebase
 */
export function detectDocDrift(
  snapshot: CodebaseSnapshot,
  config?: Partial<DriftConfig>
): Result<DriftReport, EntropyError> {
  const fullConfig = { ...DEFAULT_DRIFT_CONFIG, ...config };
  const drifts: DocumentationDrift[] = [];

  // Check API signature drift
  if (fullConfig.checkApiSignatures) {
    drifts.push(...checkApiSignatureDrift(snapshot, fullConfig));
  }

  // Calculate stats
  const apiDrifts = drifts.filter((d) => d.type === 'api-signature').length;
  const exampleDrifts = drifts.filter((d) => d.type === 'example-code').length;
  const structureDrifts = drifts.filter((d) => d.type === 'structure').length;

  const severity =
    drifts.length === 0
      ? 'none'
      : drifts.length <= 3
        ? 'low'
        : drifts.length <= 10
          ? 'medium'
          : 'high';

  return Ok({
    drifts,
    stats: {
      docsScanned: snapshot.docs.length,
      referencesChecked: snapshot.codeReferences.length,
      driftsFound: drifts.length,
      byType: { api: apiDrifts, example: exampleDrifts, structure: structureDrifts },
    },
    severity,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test drift.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/detectors/drift.ts packages/core/tests/entropy/detectors/drift.test.ts
git commit -m "feat(core): implement API signature drift detection"
```

---

### Task 9: Drift Detector - Structure Drift

**Files:**

- Modify: `packages/core/src/entropy/detectors/drift.ts`
- Modify: `packages/core/tests/entropy/detectors/drift.test.ts`

- [ ] **Step 1: Write failing test for structure drift**

```typescript
// Add to drift.test.ts describe('detectDocDrift')

it('should detect structure drift (broken file links)', async () => {
  const snapshotResult = await buildSnapshot({
    rootDir: driftFixtures,
    parser,
    analyze: { drift: true },
    include: ['src/**/*.ts'],
    docPaths: ['docs/**/*.md'],
  });

  expect(snapshotResult.ok).toBe(true);
  if (!snapshotResult.ok) return;

  const result = detectDocDrift(snapshotResult.value, {
    checkApiSignatures: false,
    checkExamples: false,
    checkStructure: true,
    docPaths: [],
    ignorePatterns: [],
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    const structureDrifts = result.value.drifts.filter((d) => d.type === 'structure');
    expect(structureDrifts.some((d) => d.reference.includes('missing-file.ts'))).toBe(true);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test drift.test.ts`
Expected: FAIL - structure drift not detected

- [ ] **Step 3: Implement structure drift detection**

```typescript
// Add to packages/core/src/entropy/detectors/drift.ts

/**
 * Extract file/directory links from markdown content
 */
function extractFileLinks(content: string, docPath: string): { link: string; line: number }[] {
  const links: { link: string; line: number }[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Markdown links: [text](path)
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(line)) !== null) {
      const linkPath = match[2];
      // Only check relative paths to files (not URLs)
      if (
        !linkPath.startsWith('http') &&
        !linkPath.startsWith('#') &&
        (linkPath.includes('.') || linkPath.startsWith('..'))
      ) {
        links.push({ link: linkPath, line: i + 1 });
      }
    }
  }

  return links;
}

/**
 * Check structure drift - docs reference files/directories that don't exist
 */
async function checkStructureDrift(
  snapshot: CodebaseSnapshot,
  config: DriftConfig
): Promise<DocumentationDrift[]> {
  const drifts: DocumentationDrift[] = [];

  for (const doc of snapshot.docs) {
    const fileLinks = extractFileLinks(doc.content, doc.path);

    for (const { link, line } of fileLinks) {
      const resolvedPath = resolve(dirname(doc.path), link);
      const exists = await fileExists(resolvedPath);

      if (!exists) {
        drifts.push({
          type: 'structure',
          docFile: doc.path,
          line,
          reference: link,
          context: 'link',
          issue: 'NOT_FOUND',
          details: `File "${link}" referenced in documentation does not exist`,
          suggestion: 'Update the link or remove the reference',
          confidence: 'high',
        });
      }
    }
  }

  return drifts;
}

// Update detectDocDrift to include structure drift
export async function detectDocDrift(
  snapshot: CodebaseSnapshot,
  config?: Partial<DriftConfig>
): Promise<Result<DriftReport, EntropyError>> {
  const fullConfig = { ...DEFAULT_DRIFT_CONFIG, ...config };
  const drifts: DocumentationDrift[] = [];

  // Check API signature drift
  if (fullConfig.checkApiSignatures) {
    drifts.push(...checkApiSignatureDrift(snapshot, fullConfig));
  }

  // Check structure drift
  if (fullConfig.checkStructure) {
    drifts.push(...(await checkStructureDrift(snapshot, fullConfig)));
  }

  // Calculate stats
  const apiDrifts = drifts.filter((d) => d.type === 'api-signature').length;
  const exampleDrifts = drifts.filter((d) => d.type === 'example-code').length;
  const structureDrifts = drifts.filter((d) => d.type === 'structure').length;

  const severity =
    drifts.length === 0
      ? 'none'
      : drifts.length <= 3
        ? 'low'
        : drifts.length <= 10
          ? 'medium'
          : 'high';

  return Ok({
    drifts,
    stats: {
      docsScanned: snapshot.docs.length,
      referencesChecked: snapshot.codeReferences.length,
      driftsFound: drifts.length,
      byType: { api: apiDrifts, example: exampleDrifts, structure: structureDrifts },
    },
    severity,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test drift.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/detectors/drift.ts packages/core/tests/entropy/detectors/drift.test.ts
git commit -m "feat(core): implement structure drift detection"
```

---

### Task 10: Detector Index Exports

**Files:**

- Create: `packages/core/src/entropy/detectors/index.ts`

- [ ] **Step 1: Create detectors index**

```typescript
// packages/core/src/entropy/detectors/index.ts
export { detectDocDrift, findPossibleMatches, levenshteinDistance } from './drift';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/entropy/detectors/index.ts
git commit -m "feat(core): add detector exports"
```

---

## Chunk 3: Dead Code Detector

### Task 11: Dead Code Test Fixtures

**Files:**

- Create: `packages/core/tests/fixtures/entropy/dead-code-samples/`

- [ ] **Step 1: Create dead-code-samples fixture**

```bash
mkdir -p packages/core/tests/fixtures/entropy/dead-code-samples/src
```

```typescript
// packages/core/tests/fixtures/entropy/dead-code-samples/src/index.ts
export { usedFunction } from './used';
// Note: unusedFunction from ./unused is NOT exported here
```

```typescript
// packages/core/tests/fixtures/entropy/dead-code-samples/src/used.ts
import { helper } from './helper';

export function usedFunction() {
  return helper();
}
```

```typescript
// packages/core/tests/fixtures/entropy/dead-code-samples/src/helper.ts
export function helper() {
  return 'helper';
}

// This is never called
export function unusedHelper() {
  return 'unused';
}
```

```typescript
// packages/core/tests/fixtures/entropy/dead-code-samples/src/unused.ts
// This entire file is dead - nothing imports from it
export function unusedFunction() {
  return 'unused';
}

export function anotherUnused() {
  return 'also unused';
}
```

```typescript
// packages/core/tests/fixtures/entropy/dead-code-samples/src/with-unused-import.ts
import { helper, unusedHelper } from './helper';
// unusedHelper is imported but never used

export function wrapper() {
  return helper();
}
```

```json
// packages/core/tests/fixtures/entropy/dead-code-samples/package.json
{
  "name": "dead-code-samples",
  "version": "1.0.0",
  "main": "src/index.ts"
}
```

- [ ] **Step 2: Commit fixtures**

```bash
git add packages/core/tests/fixtures/entropy/dead-code-samples/
git commit -m "test(core): add dead code detection fixtures"
```

---

### Task 12: Dead Code Detector - Reachability Analysis

**Files:**

- Create: `packages/core/src/entropy/detectors/dead-code.ts`
- Create: `packages/core/tests/entropy/detectors/dead-code.test.ts`

- [ ] **Step 1: Write failing test for reachability**

```typescript
// packages/core/tests/entropy/detectors/dead-code.test.ts
import { describe, it, expect } from 'vitest';
import { detectDeadCode, buildReachabilityMap } from '../../../src/entropy/detectors/dead-code';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

describe('buildReachabilityMap', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

  it('should mark entry points as reachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // Entry point should be reachable
    const indexFile = snapshotResult.value.entryPoints[0];
    expect(reachability.get(indexFile)).toBe(true);
  });

  it('should mark transitively imported files as reachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // Files imported from entry point should be reachable
    const usedFile = snapshotResult.value.files.find((f) => f.path.includes('used.ts'));
    const helperFile = snapshotResult.value.files.find((f) => f.path.includes('helper.ts'));

    expect(usedFile).toBeDefined();
    expect(helperFile).toBeDefined();
    expect(reachability.get(usedFile!.path)).toBe(true);
    expect(reachability.get(helperFile!.path)).toBe(true);
  });

  it('should mark orphan files as unreachable', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const reachability = buildReachabilityMap(snapshotResult.value);

    // unused.ts is not imported by anything
    const unusedFile = snapshotResult.value.files.find((f) => f.path.includes('unused.ts'));
    expect(unusedFile).toBeDefined();
    expect(reachability.get(unusedFile!.path)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test dead-code.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement buildReachabilityMap**

```typescript
// packages/core/src/entropy/detectors/dead-code.ts
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  DeadCodeConfig,
  DeadCodeReport,
  DeadExport,
  DeadFile,
  DeadInternal,
  UnusedImport,
  ReachabilityNode,
} from '../types';
import { dirname, resolve, relative } from 'path';

const DEFAULT_DEAD_CODE_CONFIG: DeadCodeConfig = {
  includeTypes: true,
  includeInternals: true,
  ignorePatterns: [],
  treatDynamicImportsAs: 'used',
};

/**
 * Resolve import source to absolute path
 */
function resolveImportToFile(
  importSource: string,
  fromFile: string,
  snapshot: CodebaseSnapshot
): string | null {
  if (!importSource.startsWith('.')) {
    return null; // External package
  }

  const fromDir = dirname(fromFile);
  let resolved = resolve(fromDir, importSource);

  // Try with .ts extension
  if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
    const withTs = resolved + '.ts';
    if (snapshot.files.some((f) => f.path === withTs)) {
      return withTs;
    }
    const withIndex = resolve(resolved, 'index.ts');
    if (snapshot.files.some((f) => f.path === withIndex)) {
      return withIndex;
    }
  }

  if (snapshot.files.some((f) => f.path === resolved)) {
    return resolved;
  }

  return null;
}

/**
 * Build a map of file reachability from entry points
 */
export function buildReachabilityMap(snapshot: CodebaseSnapshot): Map<string, boolean> {
  const reachability = new Map<string, boolean>();

  // Initialize all files as unreachable
  for (const file of snapshot.files) {
    reachability.set(file.path, false);
  }

  // BFS from entry points
  const queue = [...snapshot.entryPoints];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    // Mark as reachable
    reachability.set(current, true);

    // Find the source file
    const sourceFile = snapshot.files.find((f) => f.path === current);
    if (!sourceFile) continue;

    // Add all imports to queue
    for (const imp of sourceFile.imports) {
      const resolved = resolveImportToFile(imp.source, current, snapshot);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return reachability;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test dead-code.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/detectors/dead-code.ts packages/core/tests/entropy/detectors/dead-code.test.ts
git commit -m "feat(core): implement file reachability analysis"
```

---

### Task 13: Dead Code Detector - Dead Export Detection

**Files:**

- Modify: `packages/core/src/entropy/detectors/dead-code.ts`
- Modify: `packages/core/tests/entropy/detectors/dead-code.test.ts`

- [ ] **Step 1: Write failing test for dead exports**

```typescript
// Add to dead-code.test.ts

describe('detectDeadCode', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

  it('should detect dead exports', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // unusedHelper in helper.ts is exported but never imported
      expect(result.value.deadExports.some((e) => e.name === 'unusedHelper')).toBe(true);

      // Functions in unused.ts are dead
      expect(result.value.deadExports.some((e) => e.name === 'unusedFunction')).toBe(true);
    }
  });

  it('should detect dead files', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // unused.ts is a dead file
      expect(result.value.deadFiles.some((f) => f.path.includes('unused.ts'))).toBe(true);
    }
  });

  it('should detect unused imports', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { deadCode: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDeadCode(snapshotResult.value);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // with-unused-import.ts imports unusedHelper but doesn't use it
      const unusedImport = result.value.unusedImports.find((i) =>
        i.file.includes('with-unused-import.ts')
      );
      expect(unusedImport).toBeDefined();
      expect(unusedImport?.specifiers).toContain('unusedHelper');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test dead-code.test.ts`
Expected: FAIL - detectDeadCode not fully implemented

- [ ] **Step 3: Implement detectDeadCode**

```typescript
// Add to packages/core/src/entropy/detectors/dead-code.ts

/**
 * Build a map of which exports are imported by which files
 */
function buildExportUsageMap(snapshot: CodebaseSnapshot): Map<string, Set<string>> {
  // Map: "file:exportName" -> Set of files that import it
  const usageMap = new Map<string, Set<string>>();

  for (const file of snapshot.files) {
    for (const imp of file.imports) {
      const resolved = resolveImportToFile(imp.source, file.path, snapshot);
      if (!resolved) continue;

      // Track each imported specifier
      for (const spec of imp.specifiers) {
        const key = `${resolved}:${spec}`;
        const importers = usageMap.get(key) || new Set();
        importers.add(file.path);
        usageMap.set(key, importers);
      }

      // Track default imports
      if (imp.default) {
        const key = `${resolved}:default`;
        const importers = usageMap.get(key) || new Set();
        importers.add(file.path);
        usageMap.set(key, importers);
      }

      // Track namespace imports (marks all exports as used)
      if (imp.namespace) {
        const key = `${resolved}:*`;
        const importers = usageMap.get(key) || new Set();
        importers.add(file.path);
        usageMap.set(key, importers);
      }
    }
  }

  return usageMap;
}

/**
 * Find dead exports in the codebase
 */
function findDeadExports(
  snapshot: CodebaseSnapshot,
  reachability: Map<string, boolean>,
  usageMap: Map<string, Set<string>>,
  config: DeadCodeConfig
): DeadExport[] {
  const deadExports: DeadExport[] = [];

  for (const file of snapshot.files) {
    const isReachable = reachability.get(file.path) ?? false;

    for (const exp of file.exports) {
      // Skip if configured to ignore types and this is a type export
      if (!config.includeTypes && exp.type === 'named' && exp.name.match(/^[A-Z]/)) {
        continue; // Heuristic: PascalCase often indicates types
      }

      const key = `${file.path}:${exp.name}`;
      const namespaceKey = `${file.path}:*`;
      const importers = usageMap.get(key) || new Set();
      const namespaceImporters = usageMap.get(namespaceKey) || new Set();

      // Check if this export is used
      const isUsed = importers.size > 0 || namespaceImporters.size > 0;

      if (!isUsed) {
        // Check if importers are themselves dead
        const reason = !isReachable ? 'IMPORTERS_ALSO_DEAD' : 'NO_IMPORTERS';

        deadExports.push({
          file: file.path,
          name: exp.name,
          line: exp.location.line,
          type: exp.type === 'default' ? 'function' : 'variable', // Simplified
          isDefault: exp.type === 'default',
          reason,
        });
      }
    }
  }

  return deadExports;
}

/**
 * Count lines in AST body (estimate from AST location data)
 */
function countLinesFromAST(ast: AST): number {
  const body = ast.body as any;
  if (body?.loc?.end?.line) {
    return body.loc.end.line;
  }
  return 0;
}

/**
 * Find dead files (unreachable from entry points)
 */
function findDeadFiles(snapshot: CodebaseSnapshot, reachability: Map<string, boolean>): DeadFile[] {
  const deadFiles: DeadFile[] = [];

  for (const file of snapshot.files) {
    const isReachable = reachability.get(file.path) ?? false;

    if (!isReachable) {
      const lineCount = countLinesFromAST(file.ast);

      deadFiles.push({
        path: file.path,
        reason: 'NO_IMPORTERS',
        exportCount: file.exports.length,
        lineCount,
      });
    }
  }

  return deadFiles;
}

/**
 * Check if an identifier is used in an AST body
 */
function isIdentifierUsedInAST(name: string, ast: AST): boolean {
  const body = ast.body as any;
  const bodyStr = JSON.stringify(body);
  // Simple heuristic: check if the identifier appears in the AST
  // More accurate would be to walk the AST and check Identifier nodes
  return bodyStr.includes(`"name":"${name}"`);
}

/**
 * Find unused imports in files
 */
function findUnusedImports(snapshot: CodebaseSnapshot): UnusedImport[] {
  const unusedImports: UnusedImport[] = [];

  for (const file of snapshot.files) {
    for (const imp of file.imports) {
      const unusedSpecifiers: string[] = [];

      for (const spec of imp.specifiers) {
        // Check if specifier is re-exported
        const isReExported = file.exports.some((e) => e.name === spec);
        if (isReExported) continue;

        // Check if specifier is used in the file's AST
        const isUsed = isIdentifierUsedInAST(spec, file.ast);
        if (!isUsed) {
          unusedSpecifiers.push(spec);
        }
      }

      if (unusedSpecifiers.length > 0) {
        unusedImports.push({
          file: file.path,
          line: imp.location.line,
          source: imp.source,
          specifiers: unusedSpecifiers,
          isFullyUnused: unusedSpecifiers.length === imp.specifiers.length,
        });
      }
    }
  }

  return unusedImports;
}

/**
 * Find dead internal symbols (not exported, not used)
 */
function findDeadInternals(
  snapshot: CodebaseSnapshot,
  reachability: Map<string, boolean>
): DeadInternal[] {
  const deadInternals: DeadInternal[] = [];

  for (const file of snapshot.files) {
    const isReachable = reachability.get(file.path) ?? false;
    if (!isReachable) continue; // Skip unreachable files entirely

    for (const symbol of file.internalSymbols) {
      // Check if this symbol is used anywhere in the file
      const isUsed = isIdentifierUsedInAST(symbol.name, file.ast);

      // Also check if it's referenced in other files that import from this file
      // (For now, simplified: just check local usage)
      if (!isUsed || symbol.references === 0) {
        deadInternals.push({
          file: file.path,
          name: symbol.name,
          line: symbol.line,
          type: symbol.type === 'type' ? 'variable' : symbol.type,
          reason: 'NEVER_CALLED',
        });
      }
    }
  }

  return deadInternals;
}

/**
 * Detect dead code in a codebase
 */
export async function detectDeadCode(
  snapshot: CodebaseSnapshot,
  config?: Partial<DeadCodeConfig>
): Promise<Result<DeadCodeReport, EntropyError>> {
  const fullConfig = { ...DEFAULT_DEAD_CODE_CONFIG, ...config };

  // Build reachability map
  const reachability = buildReachabilityMap(snapshot);

  // Build export usage map
  const usageMap = buildExportUsageMap(snapshot);

  // Find dead code
  const deadExports = findDeadExports(snapshot, reachability, usageMap, fullConfig);
  const deadFiles = findDeadFiles(snapshot, reachability);
  const unusedImports = findUnusedImports(snapshot);
  const deadInternals = fullConfig.includeInternals
    ? findDeadInternals(snapshot, reachability)
    : [];

  // Calculate stats
  const totalExports = snapshot.files.reduce((sum, f) => sum + f.exports.length, 0);
  const estimatedDeadLines = deadFiles.reduce((sum, f) => sum + f.lineCount, 0);

  return Ok({
    deadExports,
    deadFiles,
    deadInternals,
    unusedImports,
    stats: {
      filesAnalyzed: snapshot.files.length,
      entryPointsUsed: snapshot.entryPoints,
      totalExports,
      deadExportCount: deadExports.length,
      totalFiles: snapshot.files.length,
      deadFileCount: deadFiles.length,
      estimatedDeadLines,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test dead-code.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/detectors/dead-code.ts packages/core/tests/entropy/detectors/dead-code.test.ts
git commit -m "feat(core): implement dead code detection"
```

---

### Task 14: Update Detector Exports

**Files:**

- Modify: `packages/core/src/entropy/detectors/index.ts`

- [ ] **Step 1: Add dead-code exports**

```typescript
// packages/core/src/entropy/detectors/index.ts
export { detectDocDrift, findPossibleMatches, levenshteinDistance } from './drift';
export { detectDeadCode, buildReachabilityMap } from './dead-code';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/entropy/detectors/index.ts
git commit -m "feat(core): export dead code detector"
```

---

_End of Chunk 3_

---

## Chunk 4: Pattern Violation Detector

### Task 15: Pattern Test Fixtures

**Files:**

- Create: `packages/core/tests/fixtures/entropy/pattern-samples/`

- [ ] **Step 1: Create pattern-samples fixture**

```bash
mkdir -p packages/core/tests/fixtures/entropy/pattern-samples/src/services
mkdir -p packages/core/tests/fixtures/entropy/pattern-samples/src/utils
```

```typescript
// packages/core/tests/fixtures/entropy/pattern-samples/src/index.ts
export { UserService } from './services/user-service';
export { helper } from './utils/helper';
```

```typescript
// packages/core/tests/fixtures/entropy/pattern-samples/src/services/user-service.ts
// Follows pattern: services must export default class
export default class UserService {
  getUser(id: string) {
    return null;
  }
}
export { UserService };
```

```typescript
// packages/core/tests/fixtures/entropy/pattern-samples/src/services/bad-service.ts
// VIOLATES pattern: services must export default class
// This exports a function, not a class
export function BadService() {
  return { getUser: () => null };
}
```

```typescript
// packages/core/tests/fixtures/entropy/pattern-samples/src/utils/helper.ts
// VIOLATES pattern: utils should use camelCase naming
export function Helper_Function() {
  return 'helper';
}

export const HELPER_VALUE = 42;

// Missing JSDoc - violates require-jsdoc pattern
export function helper() {
  return 'ok';
}
```

```typescript
// packages/core/tests/fixtures/entropy/pattern-samples/src/utils/too-many-exports.ts
// VIOLATES pattern: max 5 exports per file
export const a = 1;
export const b = 2;
export const c = 3;
export const d = 4;
export const e = 5;
export const f = 6;
export const g = 7;
```

```json
// packages/core/tests/fixtures/entropy/pattern-samples/package.json
{
  "name": "pattern-samples",
  "version": "1.0.0",
  "main": "src/index.ts"
}
```

- [ ] **Step 2: Commit fixtures**

```bash
git add packages/core/tests/fixtures/entropy/pattern-samples/
git commit -m "test(core): add pattern violation test fixtures"
```

---

### Task 16: Pattern Config Schema

**Files:**

- Create: `packages/core/src/entropy/config/schema.ts`
- Create: `packages/core/tests/entropy/config/schema.test.ts`

- [ ] **Step 1: Write failing test for config validation**

```typescript
// packages/core/tests/entropy/config/schema.test.ts
import { describe, it, expect } from 'vitest';
import { validatePatternConfig, EntropyConfigSchema } from '../../../src/entropy/config/schema';

describe('validatePatternConfig', () => {
  it('should validate valid pattern config', () => {
    const config = {
      patterns: [
        {
          name: 'must-export-default',
          description: 'Services must export default class',
          severity: 'error' as const,
          files: ['src/services/**/*.ts'],
          rule: { type: 'must-export-default' as const, kind: 'class' as const },
        },
      ],
    };

    const result = validatePatternConfig(config);
    expect(result.ok).toBe(true);
  });

  it('should reject invalid severity', () => {
    const config = {
      patterns: [
        {
          name: 'test',
          description: 'Test',
          severity: 'invalid' as any,
          files: ['*.ts'],
          rule: { type: 'must-export-default' as const },
        },
      ],
    };

    const result = validatePatternConfig(config);
    expect(result.ok).toBe(false);
  });

  it('should validate naming convention pattern', () => {
    const config = {
      patterns: [
        {
          name: 'camelCase-functions',
          description: 'Functions must be camelCase',
          severity: 'warning' as const,
          files: ['src/**/*.ts'],
          rule: {
            type: 'naming' as const,
            match: '^[a-z]',
            convention: 'camelCase' as const,
          },
        },
      ],
    };

    const result = validatePatternConfig(config);
    expect(result.ok).toBe(true);
  });
});

describe('EntropyConfigSchema', () => {
  it('should validate full entropy config', () => {
    const config = {
      rootDir: '/project',
      analyze: {
        drift: true,
        deadCode: { includeTypes: false },
        patterns: {
          patterns: [],
        },
      },
    };

    const result = EntropyConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test schema.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement config schema**

```typescript
// packages/core/src/entropy/config/schema.ts
import { z } from 'zod';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type { EntropyError, PatternConfig } from '../types';
import { createEntropyError } from '../../shared/errors';

// Rule type schemas
const MustExportRuleSchema = z.object({
  type: z.literal('must-export'),
  names: z.array(z.string()),
});

const MustExportDefaultRuleSchema = z.object({
  type: z.literal('must-export-default'),
  kind: z.enum(['class', 'function', 'object']).optional(),
});

const NoExportRuleSchema = z.object({
  type: z.literal('no-export'),
  names: z.array(z.string()),
});

const MustImportRuleSchema = z.object({
  type: z.literal('must-import'),
  from: z.string(),
  names: z.array(z.string()).optional(),
});

const NoImportRuleSchema = z.object({
  type: z.literal('no-import'),
  from: z.string(),
});

const NamingRuleSchema = z.object({
  type: z.literal('naming'),
  match: z.string(),
  convention: z.enum(['camelCase', 'PascalCase', 'UPPER_SNAKE', 'kebab-case']),
});

const MaxExportsRuleSchema = z.object({
  type: z.literal('max-exports'),
  count: z.number().positive(),
});

const MaxLinesRuleSchema = z.object({
  type: z.literal('max-lines'),
  count: z.number().positive(),
});

const RequireJSDocRuleSchema = z.object({
  type: z.literal('require-jsdoc'),
  for: z.array(z.enum(['function', 'class', 'export'])),
});

// Combined rule schema
const RuleSchema = z.discriminatedUnion('type', [
  MustExportRuleSchema,
  MustExportDefaultRuleSchema,
  NoExportRuleSchema,
  MustImportRuleSchema,
  NoImportRuleSchema,
  NamingRuleSchema,
  MaxExportsRuleSchema,
  MaxLinesRuleSchema,
  RequireJSDocRuleSchema,
]);

// ConfigPattern schema
const ConfigPatternSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  severity: z.enum(['error', 'warning']),
  files: z.array(z.string()),
  rule: RuleSchema,
  message: z.string().optional(),
});

// PatternConfig schema
export const PatternConfigSchema = z.object({
  patterns: z.array(ConfigPatternSchema),
  customPatterns: z.array(z.any()).optional(), // Code patterns are functions, can't validate
  ignoreFiles: z.array(z.string()).optional(),
});

// DriftConfig schema
const DriftConfigSchema = z.object({
  docPaths: z.array(z.string()),
  checkApiSignatures: z.boolean(),
  checkExamples: z.boolean(),
  checkStructure: z.boolean(),
  ignorePatterns: z.array(z.string()),
});

// DeadCodeConfig schema
const DeadCodeConfigSchema = z.object({
  entryPoints: z.array(z.string()).optional(),
  includeTypes: z.boolean(),
  includeInternals: z.boolean(),
  ignorePatterns: z.array(z.string()),
  treatDynamicImportsAs: z.enum(['used', 'unknown']),
});

// Full EntropyConfig schema
export const EntropyConfigSchema = z.object({
  rootDir: z.string(),
  parser: z.any().optional(), // LanguageParser instance, can't validate
  entryPoints: z.array(z.string()).optional(),
  analyze: z.object({
    drift: z.union([z.boolean(), DriftConfigSchema.partial()]).optional(),
    deadCode: z.union([z.boolean(), DeadCodeConfigSchema.partial()]).optional(),
    patterns: z.union([z.boolean(), PatternConfigSchema]).optional(),
  }),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  docPaths: z.array(z.string()).optional(),
});

/**
 * Validate pattern config
 */
export function validatePatternConfig(config: unknown): Result<PatternConfig, EntropyError> {
  const result = PatternConfigSchema.safeParse(config);

  if (!result.success) {
    return Err(
      createEntropyError(
        'INVALID_CONFIG',
        'Pattern configuration is invalid',
        { reason: result.error.message },
        ['Check pattern config structure', 'Ensure all required fields are present']
      )
    );
  }

  return Ok(result.data as PatternConfig);
}
```

- [ ] **Step 4: Create config index**

```typescript
// packages/core/src/entropy/config/index.ts
export { validatePatternConfig, PatternConfigSchema, EntropyConfigSchema } from './schema';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/core && pnpm test schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/entropy/config/ packages/core/tests/entropy/config/
git commit -m "feat(core): implement pattern config schema validation"
```

---

### Task 17: Pattern Detector - Config-based Patterns

**Files:**

- Create: `packages/core/src/entropy/detectors/patterns.ts`
- Create: `packages/core/tests/entropy/detectors/patterns.test.ts`

- [ ] **Step 1: Write failing test for config pattern matching**

```typescript
// packages/core/tests/entropy/detectors/patterns.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectPatternViolations,
  checkConfigPattern,
} from '../../../src/entropy/detectors/patterns';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';
import type { ConfigPattern, SourceFile, CodebaseSnapshot } from '../../../src/entropy/types';

describe('checkConfigPattern', () => {
  it('should detect max-exports violation', () => {
    const pattern: ConfigPattern = {
      name: 'max-exports',
      description: 'Max 5 exports per file',
      severity: 'error',
      files: ['**/*.ts'],
      rule: { type: 'max-exports', count: 5 },
    };

    const mockFile: Partial<SourceFile> = {
      path: '/project/src/utils/too-many.ts',
      exports: [
        { name: 'a', type: 'named', location: { file: '', line: 1, column: 0 }, isReExport: false },
        { name: 'b', type: 'named', location: { file: '', line: 2, column: 0 }, isReExport: false },
        { name: 'c', type: 'named', location: { file: '', line: 3, column: 0 }, isReExport: false },
        { name: 'd', type: 'named', location: { file: '', line: 4, column: 0 }, isReExport: false },
        { name: 'e', type: 'named', location: { file: '', line: 5, column: 0 }, isReExport: false },
        { name: 'f', type: 'named', location: { file: '', line: 6, column: 0 }, isReExport: false },
        { name: 'g', type: 'named', location: { file: '', line: 7, column: 0 }, isReExport: false },
      ],
    };

    const violations = checkConfigPattern(pattern, mockFile as SourceFile, '/project');
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('7 exports');
  });

  it('should detect must-export-default violation', () => {
    const pattern: ConfigPattern = {
      name: 'must-export-default-class',
      description: 'Services must export default class',
      severity: 'error',
      files: ['src/services/**/*.ts'],
      rule: { type: 'must-export-default', kind: 'class' },
    };

    const mockFile: Partial<SourceFile> = {
      path: '/project/src/services/bad-service.ts',
      exports: [
        {
          name: 'BadService',
          type: 'named',
          location: { file: '', line: 1, column: 0 },
          isReExport: false,
        },
      ],
    };

    const violations = checkConfigPattern(pattern, mockFile as SourceFile, '/project');
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain('default');
  });

  it('should pass when pattern is satisfied', () => {
    const pattern: ConfigPattern = {
      name: 'max-exports',
      description: 'Max 5 exports per file',
      severity: 'error',
      files: ['**/*.ts'],
      rule: { type: 'max-exports', count: 5 },
    };

    const mockFile: Partial<SourceFile> = {
      path: '/project/src/valid.ts',
      exports: [
        { name: 'a', type: 'named', location: { file: '', line: 1, column: 0 }, isReExport: false },
        { name: 'b', type: 'named', location: { file: '', line: 2, column: 0 }, isReExport: false },
      ],
    };

    const violations = checkConfigPattern(pattern, mockFile as SourceFile, '/project');
    expect(violations.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test patterns.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement checkConfigPattern**

```typescript
// packages/core/src/entropy/detectors/patterns.ts
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  PatternConfig,
  PatternReport,
  PatternViolation,
  ConfigPattern,
  CodePattern,
  PatternMatch,
  SourceFile,
} from '../types';
import { minimatch } from 'glob';
import { relative } from 'path';

/**
 * Check if a file matches a glob pattern
 */
function fileMatchesPattern(filePath: string, pattern: string, rootDir: string): boolean {
  const relativePath = relative(rootDir, filePath);
  return minimatch(relativePath, pattern);
}

/**
 * Check a single config pattern against a file
 */
export function checkConfigPattern(
  pattern: ConfigPattern,
  file: SourceFile,
  rootDir: string
): PatternMatch[] {
  const matches: PatternMatch[] = [];

  // Check if file matches any of the pattern's file globs
  const fileMatches = pattern.files.some((glob) => fileMatchesPattern(file.path, glob, rootDir));
  if (!fileMatches) {
    return matches; // Pattern doesn't apply to this file
  }

  const rule = pattern.rule;

  switch (rule.type) {
    case 'must-export': {
      for (const name of rule.names) {
        const hasExport = file.exports.some((e) => e.name === name);
        if (!hasExport) {
          matches.push({
            line: 1,
            message: pattern.message || `Missing required export: "${name}"`,
            suggestion: `Add export for "${name}"`,
          });
        }
      }
      break;
    }

    case 'must-export-default': {
      const hasDefault = file.exports.some((e) => e.type === 'default');
      if (!hasDefault) {
        matches.push({
          line: 1,
          message: pattern.message || 'File must have a default export',
          suggestion: 'Add a default export',
        });
      }
      break;
    }

    case 'no-export': {
      for (const name of rule.names) {
        const hasExport = file.exports.some((e) => e.name === name);
        if (hasExport) {
          const exp = file.exports.find((e) => e.name === name)!;
          matches.push({
            line: exp.location.line,
            message: pattern.message || `Forbidden export: "${name}"`,
            suggestion: `Remove export "${name}"`,
          });
        }
      }
      break;
    }

    case 'must-import': {
      const hasImport = file.imports.some(
        (i) => i.source === rule.from || i.source.endsWith(rule.from)
      );
      if (!hasImport) {
        matches.push({
          line: 1,
          message: pattern.message || `Missing required import from "${rule.from}"`,
          suggestion: `Add import from "${rule.from}"`,
        });
      }
      break;
    }

    case 'no-import': {
      const forbiddenImport = file.imports.find(
        (i) => i.source === rule.from || i.source.endsWith(rule.from)
      );
      if (forbiddenImport) {
        matches.push({
          line: forbiddenImport.location.line,
          message: pattern.message || `Forbidden import from "${rule.from}"`,
          suggestion: `Remove import from "${rule.from}"`,
        });
      }
      break;
    }

    case 'naming': {
      const regex = new RegExp(rule.match);
      for (const exp of file.exports) {
        if (!regex.test(exp.name)) {
          let expected = '';
          switch (rule.convention) {
            case 'camelCase':
              expected = 'camelCase (e.g., myFunction)';
              break;
            case 'PascalCase':
              expected = 'PascalCase (e.g., MyClass)';
              break;
            case 'UPPER_SNAKE':
              expected = 'UPPER_SNAKE_CASE (e.g., MY_CONSTANT)';
              break;
            case 'kebab-case':
              expected = 'kebab-case (e.g., my-component)';
              break;
          }
          matches.push({
            line: exp.location.line,
            message:
              pattern.message || `"${exp.name}" does not follow ${rule.convention} convention`,
            suggestion: `Rename to follow ${expected}`,
          });
        }
      }
      break;
    }

    case 'max-exports': {
      if (file.exports.length > rule.count) {
        matches.push({
          line: 1,
          message:
            pattern.message || `File has ${file.exports.length} exports, max is ${rule.count}`,
          suggestion: `Split into multiple files or reduce exports to ${rule.count}`,
        });
      }
      break;
    }

    case 'max-lines': {
      // Would need actual line count from file content
      // For now, skip this check (would need AST end location)
      break;
    }

    case 'require-jsdoc': {
      // Would need to check JSDoc comments on exports
      // For now, check if jsDocComments is empty
      if (file.jsDocComments.length === 0 && file.exports.length > 0) {
        matches.push({
          line: 1,
          message: pattern.message || 'Exported symbols require JSDoc documentation',
          suggestion: 'Add JSDoc comments to exports',
        });
      }
      break;
    }
  }

  return matches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test patterns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/detectors/patterns.ts packages/core/tests/entropy/detectors/patterns.test.ts
git commit -m "feat(core): implement config pattern checking"
```

---

### Task 18: Pattern Detector - Full Detection

**Files:**

- Modify: `packages/core/src/entropy/detectors/patterns.ts`
- Modify: `packages/core/tests/entropy/detectors/patterns.test.ts`

- [ ] **Step 1: Write failing test for detectPatternViolations**

```typescript
// Add to patterns.test.ts

describe('detectPatternViolations', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/entropy/pattern-samples');

  it('should detect pattern violations across codebase', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: {
        patterns: {
          patterns: [
            {
              name: 'max-exports',
              description: 'Max 5 exports per file',
              severity: 'error' as const,
              files: ['**/*.ts'],
              rule: { type: 'max-exports' as const, count: 5 },
            },
          ],
        },
      },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = detectPatternViolations(snapshotResult.value, {
      patterns: [
        {
          name: 'max-exports',
          description: 'Max 5 exports per file',
          severity: 'error',
          files: ['**/*.ts'],
          rule: { type: 'max-exports', count: 5 },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.length).toBeGreaterThan(0);
      expect(result.value.violations.some((v) => v.file.includes('too-many-exports.ts'))).toBe(
        true
      );
    }
  });

  it('should calculate correct stats', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: fixturesDir,
      parser,
      analyze: { patterns: true },
      include: ['src/**/*.ts'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = detectPatternViolations(snapshotResult.value, {
      patterns: [
        {
          name: 'max-exports',
          description: 'Max 5 exports',
          severity: 'error',
          files: ['**/*.ts'],
          rule: { type: 'max-exports', count: 5 },
        },
        {
          name: 'must-export-default',
          description: 'Must export default',
          severity: 'warning',
          files: ['src/services/**/*.ts'],
          rule: { type: 'must-export-default' },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stats.patternsApplied).toBe(2);
      expect(result.value.stats.filesChecked).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test patterns.test.ts`
Expected: FAIL - detectPatternViolations not implemented

- [ ] **Step 3: Implement detectPatternViolations**

```typescript
// Add to packages/core/src/entropy/detectors/patterns.ts

/**
 * Check code patterns (custom functions)
 */
function checkCodePatterns(
  patterns: CodePattern[],
  file: SourceFile,
  snapshot: CodebaseSnapshot
): PatternViolation[] {
  const violations: PatternViolation[] = [];

  for (const pattern of patterns) {
    const matches = pattern.check(file, snapshot);
    for (const match of matches) {
      violations.push({
        pattern: pattern.name,
        file: file.path,
        line: match.line,
        column: match.column,
        severity: pattern.severity,
        message: match.message,
        suggestion: match.suggestion,
      });
    }
  }

  return violations;
}

/**
 * Detect pattern violations in a codebase
 */
export function detectPatternViolations(
  snapshot: CodebaseSnapshot,
  config: PatternConfig
): Result<PatternReport, EntropyError> {
  const violations: PatternViolation[] = [];
  const ignorePatterns = config.ignoreFiles || [];

  for (const file of snapshot.files) {
    // Check if file should be ignored
    const relativePath = relative(snapshot.rootDir, file.path);
    const isIgnored = ignorePatterns.some((p) => minimatch(relativePath, p));
    if (isIgnored) continue;

    // Check config patterns
    for (const pattern of config.patterns) {
      const matches = checkConfigPattern(pattern, file, snapshot.rootDir);
      for (const match of matches) {
        violations.push({
          pattern: pattern.name,
          file: file.path,
          line: match.line,
          column: match.column,
          severity: pattern.severity,
          message: match.message,
          suggestion: match.suggestion,
        });
      }
    }

    // Check code patterns
    if (config.customPatterns) {
      violations.push(...checkCodePatterns(config.customPatterns, file, snapshot));
    }
  }

  // Calculate stats
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const passRate =
    snapshot.files.length > 0
      ? (snapshot.files.length - violations.length) / snapshot.files.length
      : 1;

  return Ok({
    violations,
    stats: {
      filesChecked: snapshot.files.length,
      patternsApplied: config.patterns.length + (config.customPatterns?.length || 0),
      violationCount: violations.length,
      errorCount,
      warningCount,
    },
    passRate: Math.max(0, passRate),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test patterns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/detectors/patterns.ts packages/core/tests/entropy/detectors/patterns.test.ts
git commit -m "feat(core): implement pattern violation detection"
```

---

### Task 19: Update Detector Exports

**Files:**

- Modify: `packages/core/src/entropy/detectors/index.ts`

- [ ] **Step 1: Add pattern detector exports**

```typescript
// packages/core/src/entropy/detectors/index.ts
export { detectDocDrift, findPossibleMatches, levenshteinDistance } from './drift';
export { detectDeadCode, buildReachabilityMap } from './dead-code';
export { detectPatternViolations, checkConfigPattern } from './patterns';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/entropy/detectors/index.ts
git commit -m "feat(core): export pattern violation detector"
```

---

_End of Chunk 4_

---

## Chunk 5: Fixers and Suggestions

### Task 20: Safe Fixes - Unused Import Removal

**Files:**

- Create: `packages/core/src/entropy/fixers/safe-fixes.ts`
- Create: `packages/core/tests/entropy/fixers/safe-fixes.test.ts`

- [ ] **Step 1: Write failing test for safe fixes**

```typescript
// packages/core/tests/entropy/fixers/safe-fixes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFixes, applyFixes, previewFix } from '../../../src/entropy/fixers/safe-fixes';
import type { DeadCodeReport, Fix, FixConfig } from '../../../src/entropy/types';
import { join } from 'path';
import { writeFile, rm, mkdir } from 'fs/promises';

describe('createFixes', () => {
  it('should create fix for dead files', () => {
    const deadCodeReport: DeadCodeReport = {
      deadExports: [],
      deadFiles: [
        { path: '/project/src/unused.ts', reason: 'NO_IMPORTERS', exportCount: 2, lineCount: 50 },
      ],
      deadInternals: [],
      unusedImports: [],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: ['/project/src/index.ts'],
        totalExports: 20,
        deadExportCount: 2,
        totalFiles: 10,
        deadFileCount: 1,
        estimatedDeadLines: 50,
      },
    };

    const fixes = createFixes(deadCodeReport, {
      fixTypes: ['dead-files'],
      dryRun: false,
      createBackup: true,
    });

    expect(fixes.length).toBe(1);
    expect(fixes[0].type).toBe('dead-files');
    expect(fixes[0].action).toBe('delete-file');
    expect(fixes[0].file).toBe('/project/src/unused.ts');
    expect(fixes[0].safe).toBe(true);
    expect(fixes[0].reversible).toBe(true);
  });

  it('should filter by fixTypes config', () => {
    const deadCodeReport: DeadCodeReport = {
      deadExports: [],
      deadFiles: [
        { path: '/project/src/unused.ts', reason: 'NO_IMPORTERS', exportCount: 2, lineCount: 50 },
      ],
      deadInternals: [],
      unusedImports: [
        {
          file: '/project/src/used.ts',
          line: 1,
          source: './helper',
          specifiers: ['unused'],
          isFullyUnused: false,
        },
      ],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: [],
        totalExports: 20,
        deadExportCount: 0,
        totalFiles: 10,
        deadFileCount: 1,
        estimatedDeadLines: 50,
      },
    };

    // Only request unused-imports fixes, not dead-files
    const fixes = createFixes(deadCodeReport, {
      fixTypes: ['unused-imports'],
      dryRun: false,
      createBackup: false,
    });

    expect(fixes.every((f) => f.type === 'unused-imports')).toBe(true);
    expect(fixes.some((f) => f.type === 'dead-files')).toBe(false);
  });
});

describe('previewFix', () => {
  it('should show what a fix would do', () => {
    const fix: Fix = {
      type: 'dead-files',
      file: '/project/src/unused.ts',
      description: 'Delete dead file',
      action: 'delete-file',
      safe: true,
      reversible: true,
    };

    const preview = previewFix(fix);

    expect(preview).toContain('unused.ts');
    expect(preview).toContain('delete');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test safe-fixes.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement safe fixes**

```typescript
// packages/core/src/entropy/fixers/safe-fixes.ts
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type {
  EntropyError,
  DeadCodeReport,
  DriftReport,
  Fix,
  FixConfig,
  FixResult,
  FixType,
} from '../types';
import { createEntropyError } from '../../shared/errors';
import { readFile, writeFile, rm, mkdir, copyFile } from 'fs/promises';
import { dirname, basename, join } from 'path';

const DEFAULT_FIX_CONFIG: FixConfig = {
  dryRun: false,
  fixTypes: ['unused-imports', 'dead-files'],
  createBackup: true,
  backupDir: '.entropy-backups',
};

/**
 * Create fixes for dead files
 */
function createDeadFileFixes(deadCodeReport: DeadCodeReport): Fix[] {
  return deadCodeReport.deadFiles.map((file) => ({
    type: 'dead-files' as FixType,
    file: file.path,
    description: `Delete dead file (${file.reason}): ${basename(file.path)}`,
    action: 'delete-file' as const,
    safe: true,
    reversible: true,
  }));
}

/**
 * Create fixes for unused imports
 */
function createUnusedImportFixes(deadCodeReport: DeadCodeReport): Fix[] {
  return deadCodeReport.unusedImports.map((imp) => ({
    type: 'unused-imports' as FixType,
    file: imp.file,
    description: `Remove unused import: ${imp.specifiers.join(', ')} from ${imp.source}`,
    action: 'delete-lines' as const,
    line: imp.line,
    safe: true,
    reversible: true,
  }));
}

/**
 * Create fixes from dead code report
 */
export function createFixes(deadCodeReport: DeadCodeReport, config?: Partial<FixConfig>): Fix[] {
  const fullConfig = { ...DEFAULT_FIX_CONFIG, ...config };
  const fixes: Fix[] = [];

  if (fullConfig.fixTypes.includes('dead-files')) {
    fixes.push(...createDeadFileFixes(deadCodeReport));
  }

  if (fullConfig.fixTypes.includes('unused-imports')) {
    fixes.push(...createUnusedImportFixes(deadCodeReport));
  }

  return fixes;
}

/**
 * Preview what a fix would do
 */
export function previewFix(fix: Fix): string {
  switch (fix.action) {
    case 'delete-file':
      return `Would delete file: ${fix.file}`;
    case 'delete-lines':
      return `Would delete line ${fix.line} in ${fix.file}: ${fix.description}`;
    case 'replace':
      return `Would replace in ${fix.file}:\n  - ${fix.oldContent}\n  + ${fix.newContent}`;
    case 'insert':
      return `Would insert at line ${fix.line} in ${fix.file}:\n  + ${fix.newContent}`;
    default:
      return `Would apply fix: ${fix.description}`;
  }
}

/**
 * Create backup of a file
 */
async function createBackup(
  filePath: string,
  backupDir: string
): Promise<Result<string, EntropyError>> {
  const backupPath = join(backupDir, `${Date.now()}-${basename(filePath)}`);

  try {
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(filePath, backupPath);
    return Ok(backupPath);
  } catch (e) {
    return Err(
      createEntropyError(
        'BACKUP_FAILED',
        `Failed to create backup: ${filePath}`,
        { file: filePath, originalError: e as Error },
        ['Check file permissions', 'Ensure backup directory is writable']
      )
    );
  }
}

/**
 * Apply a single fix
 */
async function applySingleFix(
  fix: Fix,
  config: FixConfig
): Promise<Result<Fix, { fix: Fix; error: string }>> {
  if (config.dryRun) {
    return Ok(fix);
  }

  try {
    switch (fix.action) {
      case 'delete-file':
        if (config.createBackup && config.backupDir) {
          const backupResult = await createBackup(fix.file, config.backupDir);
          if (!backupResult.ok) {
            return Err({ fix, error: backupResult.error.message });
          }
        }
        await rm(fix.file);
        break;

      case 'delete-lines':
        if (fix.line !== undefined) {
          const content = await readFile(fix.file, 'utf-8');
          const lines = content.split('\n');
          lines.splice(fix.line - 1, 1); // Remove line (1-indexed)
          await writeFile(fix.file, lines.join('\n'));
        }
        break;

      case 'replace':
        if (fix.oldContent && fix.newContent !== undefined) {
          const content = await readFile(fix.file, 'utf-8');
          const newContent = content.replace(fix.oldContent, fix.newContent);
          await writeFile(fix.file, newContent);
        }
        break;

      case 'insert':
        if (fix.line !== undefined && fix.newContent) {
          const content = await readFile(fix.file, 'utf-8');
          const lines = content.split('\n');
          lines.splice(fix.line - 1, 0, fix.newContent);
          await writeFile(fix.file, lines.join('\n'));
        }
        break;
    }

    return Ok(fix);
  } catch (e) {
    return Err({ fix, error: (e as Error).message });
  }
}

/**
 * Apply fixes to codebase
 */
export async function applyFixes(
  fixes: Fix[],
  config?: Partial<FixConfig>
): Promise<Result<FixResult, EntropyError>> {
  const fullConfig = { ...DEFAULT_FIX_CONFIG, ...config };

  const applied: Fix[] = [];
  const skipped: Fix[] = [];
  const errors: { fix: Fix; error: string }[] = [];

  let filesModified = 0;
  let filesDeleted = 0;
  let linesRemoved = 0;

  for (const fix of fixes) {
    // Filter by fixTypes
    if (!fullConfig.fixTypes.includes(fix.type)) {
      skipped.push(fix);
      continue;
    }

    const result = await applySingleFix(fix, fullConfig);

    if (result.ok) {
      applied.push(result.value);

      if (fix.action === 'delete-file') {
        filesDeleted++;
      } else {
        filesModified++;
      }

      if (fix.action === 'delete-lines') {
        linesRemoved++;
      }
    } else {
      errors.push(result.error);
    }
  }

  return Ok({
    applied,
    skipped,
    errors,
    stats: {
      filesModified,
      filesDeleted,
      linesRemoved,
      backupPath: fullConfig.createBackup ? fullConfig.backupDir : undefined,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test safe-fixes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/fixers/safe-fixes.ts packages/core/tests/entropy/fixers/safe-fixes.test.ts
git commit -m "feat(core): implement safe fixes for dead code"
```

---

### Task 21: Suggestion Generator

**Files:**

- Create: `packages/core/src/entropy/fixers/suggestions.ts`
- Create: `packages/core/tests/entropy/fixers/suggestions.test.ts`

- [ ] **Step 1: Write failing test for suggestions**

```typescript
// packages/core/tests/entropy/fixers/suggestions.test.ts
import { describe, it, expect } from 'vitest';
import { generateSuggestions } from '../../../src/entropy/fixers/suggestions';
import type { DriftReport, DeadCodeReport, PatternReport } from '../../../src/entropy/types';

describe('generateSuggestions', () => {
  it('should generate suggestions from drift report', () => {
    const driftReport: DriftReport = {
      drifts: [
        {
          type: 'api-signature',
          docFile: '/project/docs/api.md',
          line: 10,
          reference: 'getUserById',
          context: 'inline',
          issue: 'RENAMED',
          details: 'Symbol renamed',
          possibleMatches: ['findUserById'],
          confidence: 'high',
        },
      ],
      stats: {
        docsScanned: 5,
        referencesChecked: 20,
        driftsFound: 1,
        byType: { api: 1, example: 0, structure: 0 },
      },
      severity: 'low',
    };

    const suggestions = generateSuggestions({ drift: driftReport });

    expect(suggestions.suggestions.length).toBeGreaterThan(0);
    expect(suggestions.suggestions[0].source).toBe('drift');
    expect(suggestions.suggestions[0].type).toBe('update-docs');
  });

  it('should generate suggestions from dead code report', () => {
    const deadCodeReport: DeadCodeReport = {
      deadExports: [
        {
          file: '/project/src/utils.ts',
          name: 'unusedHelper',
          line: 50,
          type: 'function',
          isDefault: false,
          reason: 'NO_IMPORTERS',
        },
      ],
      deadFiles: [],
      deadInternals: [],
      unusedImports: [],
      stats: {
        filesAnalyzed: 10,
        entryPointsUsed: [],
        totalExports: 20,
        deadExportCount: 1,
        totalFiles: 10,
        deadFileCount: 0,
        estimatedDeadLines: 0,
      },
    };

    const suggestions = generateSuggestions({ deadCode: deadCodeReport });

    expect(suggestions.suggestions.length).toBeGreaterThan(0);
    expect(suggestions.suggestions[0].source).toBe('dead-code');
    expect(suggestions.suggestions[0].type).toBe('delete');
  });

  it('should generate suggestions from pattern violations', () => {
    const patternReport: PatternReport = {
      violations: [
        {
          pattern: 'max-exports',
          file: '/project/src/utils.ts',
          line: 1,
          severity: 'warning',
          message: 'Too many exports',
          suggestion: 'Split into multiple files',
        },
      ],
      stats: {
        filesChecked: 10,
        patternsApplied: 3,
        violationCount: 1,
        errorCount: 0,
        warningCount: 1,
      },
      passRate: 0.9,
    };

    const suggestions = generateSuggestions({ patterns: patternReport });

    expect(suggestions.suggestions.length).toBeGreaterThan(0);
    expect(suggestions.suggestions[0].source).toBe('pattern');
    expect(suggestions.suggestions[0].type).toBe('refactor');
  });

  it('should prioritize suggestions correctly', () => {
    const driftReport: DriftReport = {
      drifts: [
        {
          type: 'api-signature',
          docFile: '/project/docs/api.md',
          line: 10,
          reference: 'func1',
          context: 'inline',
          issue: 'NOT_FOUND',
          details: 'Not found',
          confidence: 'high',
        },
        {
          type: 'api-signature',
          docFile: '/project/docs/api.md',
          line: 20,
          reference: 'func2',
          context: 'inline',
          issue: 'NOT_FOUND',
          details: 'Not found',
          confidence: 'low',
        },
      ],
      stats: {
        docsScanned: 1,
        referencesChecked: 2,
        driftsFound: 2,
        byType: { api: 2, example: 0, structure: 0 },
      },
      severity: 'medium',
    };

    const suggestions = generateSuggestions({ drift: driftReport });

    expect(suggestions.byPriority.high.length).toBeGreaterThan(0);
    expect(suggestions.byPriority.low.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test suggestions.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement suggestion generator**

```typescript
// packages/core/src/entropy/fixers/suggestions.ts
import type {
  DriftReport,
  DeadCodeReport,
  PatternReport,
  Suggestion,
  SuggestionReport,
  DocumentationDrift,
  DeadExport,
  DeadFile,
  PatternViolation,
} from '../types';
import { basename, dirname } from 'path';

interface SuggestionInput {
  drift?: DriftReport;
  deadCode?: DeadCodeReport;
  patterns?: PatternReport;
}

/**
 * Generate suggestions from drift report
 */
function suggestionsFromDrift(drift: DriftReport): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const d of drift.drifts) {
    const priority =
      d.confidence === 'high' ? 'high' : d.confidence === 'medium' ? 'medium' : 'low';

    if (d.issue === 'RENAMED' && d.possibleMatches?.length) {
      suggestions.push({
        type: 'update-docs',
        priority,
        source: 'drift',
        relatedIssues: [`${d.docFile}:${d.line}`],
        title: `Update documentation reference: ${d.reference}`,
        description: `Documentation references "${d.reference}" which may have been renamed to "${d.possibleMatches[0]}"`,
        files: [d.docFile],
        steps: [
          `Open ${basename(d.docFile)}`,
          `Find reference to "${d.reference}" on line ${d.line}`,
          `Replace with "${d.possibleMatches[0]}"`,
          'Verify the documentation is accurate',
        ],
        whyManual: 'Requires verification that the suggested rename is semantically correct',
      });
    } else if (d.issue === 'NOT_FOUND') {
      suggestions.push({
        type: 'update-docs',
        priority,
        source: 'drift',
        relatedIssues: [`${d.docFile}:${d.line}`],
        title: `Fix or remove broken reference: ${d.reference}`,
        description: `Documentation references "${d.reference}" which does not exist in the codebase`,
        files: [d.docFile],
        steps: [
          `Open ${basename(d.docFile)}`,
          `Find reference to "${d.reference}" on line ${d.line}`,
          'Either remove the reference or add the missing symbol',
        ],
        whyManual: 'Requires decision about whether to remove docs or add implementation',
      });
    }
  }

  return suggestions;
}

/**
 * Generate suggestions from dead code report
 */
function suggestionsFromDeadCode(deadCode: DeadCodeReport): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Group dead exports by file
  const deadExportsByFile = new Map<string, DeadExport[]>();
  for (const exp of deadCode.deadExports) {
    const existing = deadExportsByFile.get(exp.file) || [];
    existing.push(exp);
    deadExportsByFile.set(exp.file, existing);
  }

  for (const [file, exports] of deadExportsByFile) {
    if (exports.length >= 3) {
      // Multiple dead exports - suggest reviewing the file
      suggestions.push({
        type: 'refactor',
        priority: 'medium',
        source: 'dead-code',
        relatedIssues: exports.map((e) => `${file}:${e.line}`),
        title: `Review file with ${exports.length} unused exports`,
        description: `${basename(file)} has ${exports.length} exports that are never imported`,
        files: [file],
        steps: [
          `Open ${basename(file)}`,
          `Review exports: ${exports.map((e) => e.name).join(', ')}`,
          'Remove unused exports or document why they should be kept',
        ],
        whyManual: 'Requires judgment about whether exports are intentionally public API',
      });
    } else {
      // Individual dead exports
      for (const exp of exports) {
        suggestions.push({
          type: 'delete',
          priority: 'low',
          source: 'dead-code',
          relatedIssues: [`${file}:${exp.line}`],
          title: `Remove unused export: ${exp.name}`,
          description: `Export "${exp.name}" in ${basename(file)} is never imported`,
          files: [file],
          steps: [`Open ${basename(file)}`, `Remove or unexport "${exp.name}" at line ${exp.line}`],
          whyManual: 'Verify export is not part of public API before removing',
        });
      }
    }
  }

  // Suggest deleting dead files
  for (const file of deadCode.deadFiles) {
    suggestions.push({
      type: 'delete',
      priority: 'medium',
      source: 'dead-code',
      relatedIssues: [file.path],
      title: `Consider removing dead file: ${basename(file.path)}`,
      description: `${basename(file.path)} has ${file.exportCount} exports but is never imported`,
      files: [file.path],
      steps: [
        `Review ${basename(file.path)} to confirm it's not needed`,
        'Check git history for why it was added',
        'Delete the file if confirmed unnecessary',
      ],
      whyManual: 'File deletion is irreversible and requires human judgment',
    });
  }

  return suggestions;
}

/**
 * Generate suggestions from pattern violations
 */
function suggestionsFromPatterns(patterns: PatternReport): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const violation of patterns.violations) {
    const priority = violation.severity === 'error' ? 'high' : 'medium';

    suggestions.push({
      type: 'refactor',
      priority,
      source: 'pattern',
      relatedIssues: [`${violation.file}:${violation.line}`],
      title: `Fix pattern violation: ${violation.pattern}`,
      description: violation.message,
      files: [violation.file],
      steps: [
        `Open ${basename(violation.file)}`,
        `Go to line ${violation.line}`,
        violation.suggestion || 'Apply the required pattern',
      ],
      whyManual: 'Pattern fixes often require architectural decisions',
    });
  }

  return suggestions;
}

/**
 * Estimate total effort
 */
function estimateEffort(suggestions: Suggestion[]): 'trivial' | 'small' | 'medium' | 'large' {
  const count = suggestions.length;
  const highPriority = suggestions.filter((s) => s.priority === 'high').length;

  if (count === 0) return 'trivial';
  if (count <= 3 && highPriority === 0) return 'trivial';
  if (count <= 10) return 'small';
  if (count <= 30) return 'medium';
  return 'large';
}

/**
 * Generate suggestions from analysis reports
 */
export function generateSuggestions(input: SuggestionInput): SuggestionReport {
  const suggestions: Suggestion[] = [];

  if (input.drift) {
    suggestions.push(...suggestionsFromDrift(input.drift));
  }

  if (input.deadCode) {
    suggestions.push(...suggestionsFromDeadCode(input.deadCode));
  }

  if (input.patterns) {
    suggestions.push(...suggestionsFromPatterns(input.patterns));
  }

  // Group by priority
  const byPriority = {
    high: suggestions.filter((s) => s.priority === 'high'),
    medium: suggestions.filter((s) => s.priority === 'medium'),
    low: suggestions.filter((s) => s.priority === 'low'),
  };

  return {
    suggestions,
    byPriority,
    estimatedEffort: estimateEffort(suggestions),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test suggestions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/fixers/suggestions.ts packages/core/tests/entropy/fixers/suggestions.test.ts
git commit -m "feat(core): implement suggestion generator"
```

---

### Task 22: Fixer Exports

**Files:**

- Create: `packages/core/src/entropy/fixers/index.ts`

- [ ] **Step 1: Create fixer exports**

```typescript
// packages/core/src/entropy/fixers/index.ts
export { createFixes, applyFixes, previewFix } from './safe-fixes';
export { generateSuggestions } from './suggestions';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/entropy/fixers/index.ts
git commit -m "feat(core): export fixers and suggestions"
```

---

_End of Chunk 5_

---

## Chunk 6: Analyzer Orchestrator and Module Exports

### Task 23: EntropyAnalyzer Orchestrator

**Files:**

- Create: `packages/core/src/entropy/analyzer.ts`
- Create: `packages/core/tests/entropy/analyzer.test.ts`

- [ ] **Step 1: Write failing test for analyzer**

```typescript
// packages/core/tests/entropy/analyzer.test.ts
import { describe, it, expect } from 'vitest';
import { EntropyAnalyzer } from '../../src/entropy/analyzer';
import { TypeScriptParser } from '../../src/shared/parsers';
import { join } from 'path';

describe('EntropyAnalyzer', () => {
  const parser = new TypeScriptParser();
  const validProjectDir = join(__dirname, '../fixtures/entropy/valid-project');
  const driftSamplesDir = join(__dirname, '../fixtures/entropy/drift-samples');

  it('should analyze codebase and produce report', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: validProjectDir,
      parser,
      analyze: {
        drift: true,
        deadCode: true,
      },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md', 'README.md'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.snapshot).toBeDefined();
      expect(result.value.drift).toBeDefined();
      expect(result.value.deadCode).toBeDefined();
      expect(result.value.summary).toBeDefined();
      expect(result.value.timestamp).toBeDefined();
    }
  });

  it('should only run requested analyzers', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: validProjectDir,
      parser,
      analyze: {
        drift: false,
        deadCode: true,
        patterns: false,
      },
      include: ['src/**/*.ts'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.drift).toBeUndefined();
      expect(result.value.deadCode).toBeDefined();
      expect(result.value.patterns).toBeUndefined();
    }
  });

  it('should calculate summary stats', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: driftSamplesDir,
      parser,
      analyze: {
        drift: true,
        deadCode: true,
      },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.summary.totalIssues).toBeGreaterThanOrEqual(0);
      expect(typeof result.value.summary.errors).toBe('number');
      expect(typeof result.value.summary.warnings).toBe('number');
      expect(typeof result.value.duration).toBe('number');
    }
  });

  it('should generate suggestions when requested', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: driftSamplesDir,
      parser,
      analyze: {
        drift: true,
        deadCode: true,
      },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    const result = await analyzer.analyze();

    expect(result.ok).toBe(true);
    if (result.ok) {
      const suggestions = analyzer.getSuggestions();
      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions.suggestions)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm test analyzer.test.ts`
Expected: FAIL - Cannot find module

- [ ] **Step 3: Implement EntropyAnalyzer**

```typescript
// packages/core/src/entropy/analyzer.ts
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type {
  EntropyError,
  EntropyConfig,
  EntropyReport,
  CodebaseSnapshot,
  DriftConfig,
  DriftReport,
  DeadCodeConfig,
  DeadCodeReport,
  PatternReport,
  PatternConfig,
  SuggestionReport,
} from './types';
import { createEntropyError } from '../shared/errors';
import { buildSnapshot } from './snapshot';
import { detectDocDrift } from './detectors/drift';
import { detectDeadCode } from './detectors/dead-code';
import { detectPatternViolations } from './detectors/patterns';
import { generateSuggestions } from './fixers/suggestions';
import { TypeScriptParser } from '../shared/parsers';

/**
 * Main entropy analysis orchestrator
 */
export class EntropyAnalyzer {
  private config: EntropyConfig;
  private snapshot?: CodebaseSnapshot;
  private report?: EntropyReport;

  constructor(config: EntropyConfig) {
    this.config = {
      ...config,
      parser: config.parser || new TypeScriptParser(),
    };
  }

  /**
   * Run full entropy analysis
   */
  async analyze(): Promise<Result<EntropyReport, EntropyError>> {
    const startTime = Date.now();

    // Build snapshot
    const snapshotResult = await buildSnapshot(this.config);
    if (!snapshotResult.ok) {
      return Err(snapshotResult.error);
    }
    this.snapshot = snapshotResult.value;

    // Run requested analyzers
    let driftReport: DriftReport | undefined;
    let deadCodeReport: DeadCodeReport | undefined;
    let patternReport: PatternReport | undefined;

    // Drift detection
    if (this.config.analyze.drift) {
      const driftConfig =
        typeof this.config.analyze.drift === 'object' ? this.config.analyze.drift : {};
      const result = await detectDocDrift(this.snapshot, driftConfig);
      if (result.ok) {
        driftReport = result.value;
      }
    }

    // Dead code detection
    if (this.config.analyze.deadCode) {
      const deadCodeConfig =
        typeof this.config.analyze.deadCode === 'object' ? this.config.analyze.deadCode : {};
      const result = await detectDeadCode(this.snapshot, deadCodeConfig);
      if (result.ok) {
        deadCodeReport = result.value;
      }
    }

    // Pattern detection
    if (this.config.analyze.patterns) {
      const patternConfig: PatternConfig =
        typeof this.config.analyze.patterns === 'object'
          ? this.config.analyze.patterns
          : { patterns: [] };
      const result = detectPatternViolations(this.snapshot, patternConfig);
      if (result.ok) {
        patternReport = result.value;
      }
    }

    // Calculate summary
    const driftIssues = driftReport?.drifts.length || 0;
    const deadCodeIssues =
      (deadCodeReport?.deadExports.length || 0) +
      (deadCodeReport?.deadFiles.length || 0) +
      (deadCodeReport?.unusedImports.length || 0);
    const patternIssues = patternReport?.violations.length || 0;
    const patternErrors = patternReport?.stats.errorCount || 0;
    const patternWarnings = patternReport?.stats.warningCount || 0;

    const totalIssues = driftIssues + deadCodeIssues + patternIssues;

    // Calculate fixable count
    const fixableCount =
      (deadCodeReport?.deadFiles.length || 0) + (deadCodeReport?.unusedImports.length || 0);

    // Generate suggestions count
    const suggestions = generateSuggestions({
      drift: driftReport,
      deadCode: deadCodeReport,
      patterns: patternReport,
    });

    const duration = Date.now() - startTime;

    this.report = {
      snapshot: this.snapshot,
      drift: driftReport,
      deadCode: deadCodeReport,
      patterns: patternReport,
      summary: {
        totalIssues,
        errors: patternErrors,
        warnings: patternWarnings + driftIssues,
        fixableCount,
        suggestionCount: suggestions.suggestions.length,
      },
      timestamp: new Date().toISOString(),
      duration,
    };

    return Ok(this.report);
  }

  /**
   * Get the built snapshot (must call analyze first)
   */
  getSnapshot(): CodebaseSnapshot | undefined {
    return this.snapshot;
  }

  /**
   * Get the last report (must call analyze first)
   */
  getReport(): EntropyReport | undefined {
    return this.report;
  }

  /**
   * Generate suggestions from the last analysis
   */
  getSuggestions(): SuggestionReport {
    if (!this.report) {
      return {
        suggestions: [],
        byPriority: { high: [], medium: [], low: [] },
        estimatedEffort: 'trivial',
      };
    }

    return generateSuggestions({
      drift: this.report.drift,
      deadCode: this.report.deadCode,
      patterns: this.report.patterns,
    });
  }

  /**
   * Build snapshot without running analysis
   */
  async buildSnapshot(): Promise<Result<CodebaseSnapshot, EntropyError>> {
    const result = await buildSnapshot(this.config);
    if (result.ok) {
      this.snapshot = result.value;
    }
    return result;
  }

  /**
   * Run drift detection only (snapshot must be built first)
   */
  async detectDrift(config?: Partial<DriftConfig>): Promise<Result<DriftReport, EntropyError>> {
    if (!this.snapshot) {
      return Err(
        createEntropyError(
          'SNAPSHOT_BUILD_FAILED',
          'Snapshot not built. Call buildSnapshot() first.',
          {}
        )
      );
    }
    return detectDocDrift(this.snapshot, config);
  }

  /**
   * Run dead code detection only (snapshot must be built first)
   */
  async detectDeadCode(
    config?: Partial<DeadCodeConfig>
  ): Promise<Result<DeadCodeReport, EntropyError>> {
    if (!this.snapshot) {
      return Err(
        createEntropyError(
          'SNAPSHOT_BUILD_FAILED',
          'Snapshot not built. Call buildSnapshot() first.',
          {}
        )
      );
    }
    return detectDeadCode(this.snapshot, config);
  }

  /**
   * Run pattern detection only (snapshot must be built first)
   */
  detectPatterns(config: PatternConfig): Result<PatternReport, EntropyError> {
    if (!this.snapshot) {
      return Err(
        createEntropyError(
          'SNAPSHOT_BUILD_FAILED',
          'Snapshot not built. Call buildSnapshot() first.',
          {}
        )
      );
    }
    return detectPatternViolations(this.snapshot, config);
  }
}

/**
 * Convenience function for quick analysis
 */
export async function analyzeEntropy(
  config: EntropyConfig
): Promise<Result<EntropyReport, EntropyError>> {
  const analyzer = new EntropyAnalyzer(config);
  return analyzer.analyze();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm test analyzer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entropy/analyzer.ts packages/core/tests/entropy/analyzer.test.ts
git commit -m "feat(core): implement EntropyAnalyzer orchestrator"
```

---

### Task 24: Module Public Exports

**Files:**

- Create: `packages/core/src/entropy/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create entropy module exports**

```typescript
// packages/core/src/entropy/index.ts

// Main analyzer
export { EntropyAnalyzer, analyzeEntropy } from './analyzer';

// Snapshot
export { buildSnapshot, resolveEntryPoints, parseDocumentationFile } from './snapshot';

// Detectors
export { detectDocDrift, findPossibleMatches, levenshteinDistance } from './detectors/drift';
export { detectDeadCode, buildReachabilityMap } from './detectors/dead-code';
export { detectPatternViolations, checkConfigPattern } from './detectors/patterns';

// Fixers
export { createFixes, applyFixes, previewFix } from './fixers/safe-fixes';
export { generateSuggestions } from './fixers/suggestions';

// Config
export { validatePatternConfig, PatternConfigSchema, EntropyConfigSchema } from './config/schema';

// Types
export type {
  // Error types
  EntropyError,

  // Snapshot types
  InternalSymbol,
  JSDocComment,
  CodeBlock,
  InlineReference,
  SourceFile,
  DocumentationFile,
  CodeReference,
  ExportMap,
  CodebaseSnapshot,

  // Config types
  DriftConfig,
  DeadCodeConfig,
  EntropyConfig,

  // Drift types
  DocumentationDrift,
  DriftReport,

  // Dead code types
  DeadExport,
  DeadFile,
  DeadInternal,
  UnusedImport,
  ReachabilityNode,
  DeadCodeReport,

  // Pattern types
  ConfigPattern,
  CodePattern,
  PatternMatch,
  PatternConfig,
  PatternViolation,
  PatternReport,

  // Fix types
  FixType,
  FixConfig,
  Fix,
  FixResult,

  // Suggestion types
  Suggestion,
  SuggestionReport,

  // Report types
  EntropyReport,
} from './types';
```

- [ ] **Step 2: Update main package exports**

Add to `packages/core/src/index.ts`:

```typescript
// Entropy module
export * from './entropy';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/entropy/index.ts packages/core/src/index.ts
git commit -m "feat(core): export entropy module public API"
```

---

### Task 25: Integration Test

**Files:**

- Create: `packages/core/tests/entropy/integration/full-analysis.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// packages/core/tests/entropy/integration/full-analysis.test.ts
import { describe, it, expect } from 'vitest';
import { EntropyAnalyzer, analyzeEntropy } from '../../../src/entropy';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';

describe('Entropy Module Integration', () => {
  const parser = new TypeScriptParser();

  describe('full analysis workflow', () => {
    const validProjectDir = join(__dirname, '../../fixtures/entropy/valid-project');

    it('should run complete analysis and generate actionable output', async () => {
      const analyzer = new EntropyAnalyzer({
        rootDir: validProjectDir,
        parser,
        analyze: {
          drift: true,
          deadCode: true,
          patterns: {
            patterns: [
              {
                name: 'max-exports',
                description: 'Max 10 exports per file',
                severity: 'warning',
                files: ['**/*.ts'],
                rule: { type: 'max-exports', count: 10 },
              },
            ],
          },
        },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md', 'README.md'],
      });

      // Run analysis
      const result = await analyzer.analyze();
      expect(result.ok).toBe(true);

      if (!result.ok) return;

      // Verify report structure
      const report = result.value;
      expect(report.snapshot).toBeDefined();
      expect(report.snapshot.files.length).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.duration).toBeGreaterThan(0);

      // Verify snapshot has expected data
      expect(report.snapshot.exportMap.byName.size).toBeGreaterThan(0);
      expect(report.snapshot.entryPoints.length).toBeGreaterThan(0);

      // Verify suggestions are generated
      const suggestions = analyzer.getSuggestions();
      expect(suggestions.byPriority).toBeDefined();
      expect(suggestions.estimatedEffort).toBeDefined();
    });

    it('should work with convenience function', async () => {
      const result = await analyzeEntropy({
        rootDir: validProjectDir,
        parser,
        analyze: {
          deadCode: true,
        },
        include: ['src/**/*.ts'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deadCode).toBeDefined();
      }
    });
  });

  describe('drift detection in isolation', () => {
    const driftSamplesDir = join(__dirname, '../../fixtures/entropy/drift-samples');

    it('should detect API drift between docs and code', async () => {
      const result = await analyzeEntropy({
        rootDir: driftSamplesDir,
        parser,
        analyze: {
          drift: {
            checkApiSignatures: true,
            checkStructure: true,
            checkExamples: false,
            docPaths: [],
            ignorePatterns: [],
          },
        },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.drift) {
        // Should find some drift in the test fixtures
        expect(result.value.drift.stats.docsScanned).toBeGreaterThan(0);
      }
    });
  });

  describe('dead code detection in isolation', () => {
    const deadCodeDir = join(__dirname, '../../fixtures/entropy/dead-code-samples');

    it('should detect dead files and exports', async () => {
      const result = await analyzeEntropy({
        rootDir: deadCodeDir,
        parser,
        analyze: {
          deadCode: {
            includeTypes: true,
            includeInternals: false,
            ignorePatterns: [],
            treatDynamicImportsAs: 'used',
          },
        },
        include: ['src/**/*.ts'],
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.deadCode) {
        expect(result.value.deadCode.stats.filesAnalyzed).toBeGreaterThan(0);
        // Fixture should have dead code
        expect(
          result.value.deadCode.deadFiles.length + result.value.deadCode.deadExports.length
        ).toBeGreaterThan(0);
      }
    });
  });

  describe('pattern detection in isolation', () => {
    const patternSamplesDir = join(__dirname, '../../fixtures/entropy/pattern-samples');

    it('should detect pattern violations', async () => {
      const result = await analyzeEntropy({
        rootDir: patternSamplesDir,
        parser,
        analyze: {
          patterns: {
            patterns: [
              {
                name: 'max-exports',
                description: 'Max 5 exports',
                severity: 'error',
                files: ['**/*.ts'],
                rule: { type: 'max-exports', count: 5 },
              },
            ],
          },
        },
        include: ['src/**/*.ts'],
      });

      expect(result.ok).toBe(true);
      if (result.ok && result.value.patterns) {
        expect(result.value.patterns.stats.patternsApplied).toBe(1);
        // Fixture should have violations
        expect(result.value.patterns.violations.length).toBeGreaterThan(0);
      }
    });
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd packages/core && pnpm test full-analysis.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/entropy/integration/full-analysis.test.ts
git commit -m "test(core): add entropy module integration tests"
```

---

### Task 26: Documentation and Version Bump

**Files:**

- Modify: `packages/core/README.md`
- Modify: `packages/core/package.json`
- Modify: `packages/core/CHANGELOG.md`

- [ ] **Step 1: Add usage examples to README**

Add to `packages/core/README.md` under a new "Entropy Management" section:

````markdown
## Entropy Management

Detect and fix codebase entropy: documentation drift, dead code, and pattern violations.

### Quick Analysis

```typescript
import { analyzeEntropy } from '@harness-engineering/core';

const result = await analyzeEntropy({
  rootDir: './src',
  analyze: {
    drift: true,
    deadCode: true,
    patterns: {
      patterns: [
        {
          name: 'max-exports',
          description: 'Limit exports per file',
          severity: 'warning',
          files: ['**/*.ts'],
          rule: { type: 'max-exports', count: 10 },
        },
      ],
    },
  },
  include: ['**/*.ts'],
  docPaths: ['docs/**/*.md'],
});

if (result.ok) {
  console.log(`Found ${result.value.summary.totalIssues} issues`);
  console.log(`${result.value.summary.fixableCount} can be auto-fixed`);
}
```
````

### Full Analyzer Workflow

```typescript
import { EntropyAnalyzer, createFixes, applyFixes } from '@harness-engineering/core';

const analyzer = new EntropyAnalyzer({
  rootDir: './src',
  analyze: { drift: true, deadCode: true },
});

// Run analysis
const report = await analyzer.analyze();
if (!report.ok) throw new Error(report.error.message);

// Get suggestions for manual fixes
const suggestions = analyzer.getSuggestions();
console.log(`${suggestions.suggestions.length} suggestions generated`);

// Auto-fix safe issues
if (report.value.deadCode) {
  const fixes = createFixes(report.value.deadCode, {
    fixTypes: ['unused-imports', 'dead-files'],
    dryRun: true, // Preview first
  });

  console.log(
    'Preview:',
    fixes.map((f) => f.description)
  );

  // Apply for real
  await applyFixes(fixes, { dryRun: false, createBackup: true });
}
```

````

- [ ] **Step 2: Update CHANGELOG**

Add to `packages/core/CHANGELOG.md`:

```markdown
## [0.4.0] - YYYY-MM-DD (set on release)

### Added
- Entropy Management module for detecting codebase entropy
- Documentation drift detection (API signatures, examples, structure)
- Dead code detection (files, exports, unused imports)
- Pattern violation detection (config-based and code-based)
- Auto-fix utilities for safe fixes
- Suggestion generator for manual fixes
- EntropyAnalyzer orchestrator for full analysis
- CodebaseSnapshot builder for efficient multi-pass analysis
````

- [ ] **Step 3: Bump version in package.json**

Update `packages/core/package.json`:

```json
{
  "version": "0.4.0"
}
```

- [ ] **Step 4: Commit documentation updates**

```bash
git add packages/core/README.md packages/core/CHANGELOG.md packages/core/package.json
git commit -m "docs(core): add entropy module documentation and bump to v0.4.0"
```

---

### Task 27: Run Full Test Suite

**Files:** None (validation only)

- [ ] **Step 1: Run all entropy tests**

Run: `cd packages/core && pnpm test entropy`
Expected: All tests pass

- [ ] **Step 2: Run full test suite**

Run: `cd packages/core && pnpm test`
Expected: All tests pass, >80% coverage

- [ ] **Step 3: Run type check**

Run: `cd packages/core && pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Run linting**

Run: `cd packages/core && pnpm lint`
Expected: No errors

- [ ] **Step 5: Build package**

Run: `cd packages/core && pnpm build`
Expected: Build succeeds

---

### Task 28: Final Commit and Tag

**Files:** None (git operations only)

- [ ] **Step 1: Verify all changes are committed**

Run: `git status`
Expected: Clean working tree

- [ ] **Step 2: Create release tag**

```bash
git tag -a @harness-engineering/core@0.4.0 -m "Release @harness-engineering/core v0.4.0 - Entropy Management"
```

- [ ] **Step 3: Push (if requested)**

```bash
git push origin main --tags
```

---

_End of Chunk 6_

---

## Success Criteria

Module 4 is complete when:

- [x] All APIs implemented and exported
- [x] Test coverage >80% for all files
- [x] All tests passing in CI
- [x] TypeScript compiles without errors
- [x] README updated with usage examples
- [x] CHANGELOG documents all changes
- [x] Version set to 0.4.0
- [x] Release tagged: `@harness-engineering/core@0.4.0`
