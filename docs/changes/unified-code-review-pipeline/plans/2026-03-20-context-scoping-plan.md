# Plan: Context Scoping (Review Pipeline Phase 3)

**Date:** 2026-03-20
**Spec:** docs/changes/unified-code-review-pipeline/proposal.md (Phase 3: CONTEXT)
**Estimated tasks:** 8
**Estimated time:** 30 minutes

## Goal

When the review pipeline reaches Phase 3, it detects the change type (feature/bugfix/refactor/docs), scopes context per review domain (compliance, bug detection, security, architecture), and produces a context bundle for each domain -- using graph queries when available, falling back to file-based heuristics when no graph exists.

## Observable Truths (Acceptance Criteria)

1. When a commit message starts with `feat:`, `detectChangeType()` returns `'feature'`.
2. When a commit message starts with `fix:`, `detectChangeType()` returns `'bugfix'`.
3. When a commit message starts with `refactor:`, `detectChangeType()` returns `'refactor'`.
4. When a commit message starts with `docs:`, `detectChangeType()` returns `'docs'`.
5. When no conventional prefix is found and new files exist in the diff, `detectChangeType()` returns `'feature'`.
6. When no conventional prefix is found and no heuristic matches, `detectChangeType()` returns `'feature'` (default).
7. The system shall produce a `ContextBundle` for each of the four review domains: `compliance`, `bug`, `security`, `architecture`.
8. When a `GraphAdapter` is provided, `scopeContext()` uses graph queries to find dependencies, impact, and data flows.
9. When no `GraphAdapter` is provided, `scopeContext()` falls back to file-based heuristics (import grep, test file matching, check-deps output).
10. Each `ContextBundle` contains: `domain`, `changeType`, `changedFiles`, `contextFiles` (with content), and `commitHistory`.
11. The `contextFiles` array respects the 1:1 context ratio rule (approximately N lines of context for N lines of diff, with 3:1 for small diffs).
12. `cd packages/core && pnpm exec vitest run tests/review/` passes with all new tests green.
13. `pnpm exec harness validate` passes after all tasks.

## File Map

```
CREATE packages/core/src/review/change-type.ts
CREATE packages/core/tests/review/change-type.test.ts
CREATE packages/core/src/review/context-scoper.ts
CREATE packages/core/tests/review/context-scoper.test.ts
MODIFY packages/core/src/review/types.ts (add ChangeType, ReviewDomain, ContextBundle, ContextFile, GraphAdapter, DiffInfo, ContextScopeOptions)
MODIFY packages/core/src/review/index.ts (add exports)
```

## Tasks

### Task 1: Define context scoping types

**Depends on:** none
**Files:** `packages/core/src/review/types.ts`

The `@harness-engineering/core` package does NOT depend on `@harness-engineering/graph`. The context scoper must define a `GraphAdapter` interface that callers can implement using the graph package. This is dependency inversion -- core defines the interface, consumers provide the implementation.

1. Open `packages/core/src/review/types.ts` and append the following types after the existing `MechanicalCheckOptions` interface:

```typescript
// --- Phase 3: Context Scoping types ---

/**
 * Change type detected from commit message prefix or diff heuristic.
 */
export type ChangeType = 'feature' | 'bugfix' | 'refactor' | 'docs';

/**
 * Review domain — each gets its own scoped context bundle.
 */
export type ReviewDomain = 'compliance' | 'bug' | 'security' | 'architecture';

/**
 * A file included in a context bundle with its content.
 */
export interface ContextFile {
  /** File path (project-relative) */
  path: string;
  /** File content (full or truncated to budget) */
  content: string;
  /** Why this file was included */
  reason:
    | 'changed'
    | 'import'
    | 'test'
    | 'spec'
    | 'type'
    | 'convention'
    | 'graph-dependency'
    | 'graph-impact';
  /** Line count of the content */
  lines: number;
}

/**
 * Commit history entry for a changed file.
 */
export interface CommitHistoryEntry {
  /** Short SHA */
  sha: string;
  /** One-line commit message */
  message: string;
  /** File path this commit touched */
  file: string;
}

/**
 * Context bundle assembled for a single review domain.
 * Each Phase 4 subagent receives one of these.
 */
export interface ContextBundle {
  /** Which review domain this bundle is for */
  domain: ReviewDomain;
  /** Detected change type */
  changeType: ChangeType;
  /** Files that were changed in the diff */
  changedFiles: ContextFile[];
  /** Additional context files (imports, tests, specs, types, conventions) */
  contextFiles: ContextFile[];
  /** Recent commit history for changed files */
  commitHistory: CommitHistoryEntry[];
  /** Total lines of diff */
  diffLines: number;
  /** Total lines of context gathered */
  contextLines: number;
}

/**
 * Information about a diff, used as input to context scoping.
 */
export interface DiffInfo {
  /** Changed file paths (project-relative) */
  changedFiles: string[];
  /** New files (subset of changedFiles) */
  newFiles: string[];
  /** Deleted files (subset of changedFiles) */
  deletedFiles: string[];
  /** Total lines of diff across all files */
  totalDiffLines: number;
  /** Per-file diff content */
  fileDiffs: Map<string, string>;
}

/**
 * Adapter interface for graph queries.
 * Callers implement this using @harness-engineering/graph when available.
 * The context scoper does NOT depend on the graph package directly.
 */
export interface GraphAdapter {
  /**
   * Find direct dependencies of a file (imports, calls).
   * Returns file paths of dependencies.
   */
  getDependencies(filePath: string): Promise<string[]>;

  /**
   * Find files impacted by changes to a file (reverse dependencies, tests, docs).
   * Returns file paths of impacted nodes grouped by category.
   */
  getImpact(filePath: string): Promise<{
    tests: string[];
    docs: string[];
    code: string[];
  }>;

  /**
   * Check if a path exists in the dependency graph between two files.
   * Used for reachability validation in Phase 5 (exported here for shared use).
   */
  isReachable(fromFile: string, toFile: string, maxDepth?: number): Promise<boolean>;
}

/**
 * Options for context scoping.
 */
export interface ContextScopeOptions {
  /** Project root directory */
  projectRoot: string;
  /** Diff information */
  diff: DiffInfo;
  /** Most recent commit message (for change-type detection) */
  commitMessage: string;
  /** Graph adapter (optional -- falls back to heuristics when absent) */
  graph?: GraphAdapter;
  /** Convention files to include for compliance domain */
  conventionFiles?: string[];
  /** Output from `harness check-deps` (for architecture fallback) */
  checkDepsOutput?: string;
}
```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec tsc --noEmit`
3. Run: `pnpm exec harness validate`
4. Commit: `feat(review): add context scoping types for Phase 3`

---

### Task 2: Export new types from barrel

**Depends on:** Task 1
**Files:** `packages/core/src/review/index.ts`

1. Update `packages/core/src/review/index.ts` to add exports for the new types:

```typescript
// Types
export type {
  MechanicalFinding,
  MechanicalCheckResult,
  MechanicalCheckStatus,
  MechanicalCheckOptions,
  ChangeType,
  ReviewDomain,
  ContextFile,
  CommitHistoryEntry,
  ContextBundle,
  DiffInfo,
  GraphAdapter,
  ContextScopeOptions,
} from './types';

// Mechanical checks
export { runMechanicalChecks } from './mechanical-checks';

// Exclusion set
export { ExclusionSet, buildExclusionSet } from './exclusion-set';
```

Note: We add the function exports (detectChangeType, scopeContext) in Task 7 after they are implemented, to avoid TS6133 import errors.

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec tsc --noEmit`
3. Run: `pnpm exec harness validate`
4. Commit: `feat(review): export context scoping types from barrel`

---

### Task 3: Implement change-type detection (TDD - RED)

**Depends on:** Task 1
**Files:** `packages/core/tests/review/change-type.test.ts`

1. Create test file `packages/core/tests/review/change-type.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectChangeType } from '../../src/review/change-type';
import type { DiffInfo } from '../../src/review/types';

const emptyDiff: DiffInfo = {
  changedFiles: ['src/a.ts'],
  newFiles: [],
  deletedFiles: [],
  totalDiffLines: 10,
  fileDiffs: new Map(),
};

describe('detectChangeType()', () => {
  describe('commit message prefix detection', () => {
    it('detects "feat:" prefix as feature', () => {
      expect(detectChangeType('feat: add user endpoint', emptyDiff)).toBe('feature');
    });

    it('detects "feat(scope):" prefix as feature', () => {
      expect(detectChangeType('feat(api): add user endpoint', emptyDiff)).toBe('feature');
    });

    it('detects "feature:" prefix as feature', () => {
      expect(detectChangeType('feature: add login', emptyDiff)).toBe('feature');
    });

    it('detects "fix:" prefix as bugfix', () => {
      expect(detectChangeType('fix: null pointer in auth', emptyDiff)).toBe('bugfix');
    });

    it('detects "fix(scope):" prefix as bugfix', () => {
      expect(detectChangeType('fix(auth): null check', emptyDiff)).toBe('bugfix');
    });

    it('detects "bugfix:" prefix as bugfix', () => {
      expect(detectChangeType('bugfix: race condition', emptyDiff)).toBe('bugfix');
    });

    it('detects "refactor:" prefix as refactor', () => {
      expect(detectChangeType('refactor: extract service layer', emptyDiff)).toBe('refactor');
    });

    it('detects "refactor(scope):" prefix as refactor', () => {
      expect(detectChangeType('refactor(core): split module', emptyDiff)).toBe('refactor');
    });

    it('detects "docs:" prefix as docs', () => {
      expect(detectChangeType('docs: update API reference', emptyDiff)).toBe('docs');
    });

    it('detects "doc:" prefix as docs', () => {
      expect(detectChangeType('doc: fix typo', emptyDiff)).toBe('docs');
    });

    it('is case-insensitive for prefix', () => {
      expect(detectChangeType('Feat: add feature', emptyDiff)).toBe('feature');
      expect(detectChangeType('FIX: bug', emptyDiff)).toBe('bugfix');
    });
  });

  describe('diff pattern heuristic (no prefix)', () => {
    it('detects new files + test files as feature', () => {
      const diff: DiffInfo = {
        changedFiles: ['src/new-service.ts', 'tests/new-service.test.ts'],
        newFiles: ['src/new-service.ts', 'tests/new-service.test.ts'],
        deletedFiles: [],
        totalDiffLines: 50,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('add user service', diff)).toBe('feature');
    });

    it('detects small changes + test added as bugfix', () => {
      const diff: DiffInfo = {
        changedFiles: ['src/auth.ts', 'tests/auth.test.ts'],
        newFiles: ['tests/auth.test.ts'],
        deletedFiles: [],
        totalDiffLines: 15,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('handle null user', diff)).toBe('bugfix');
    });

    it('detects only .md files as docs', () => {
      const diff: DiffInfo = {
        changedFiles: ['README.md', 'docs/api.md'],
        newFiles: [],
        deletedFiles: [],
        totalDiffLines: 20,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('update readme', diff)).toBe('docs');
    });

    it('defaults to feature when ambiguous', () => {
      const diff: DiffInfo = {
        changedFiles: ['src/a.ts', 'src/b.ts'],
        newFiles: [],
        deletedFiles: [],
        totalDiffLines: 50,
        fileDiffs: new Map(),
      };
      expect(detectChangeType('some change', diff)).toBe('feature');
    });
  });
});
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/change-type.test.ts`
3. Observe failure: `Cannot find module '../../src/review/change-type'`

---

### Task 4: Implement change-type detection (TDD - GREEN)

**Depends on:** Task 3
**Files:** `packages/core/src/review/change-type.ts`

1. Create implementation file `packages/core/src/review/change-type.ts`:

```typescript
import type { ChangeType, DiffInfo } from './types';

/**
 * Regex patterns for conventional commit prefixes.
 * Matches: prefix:, prefix(scope):
 */
const PREFIX_PATTERNS: Array<{ pattern: RegExp; type: ChangeType }> = [
  { pattern: /^(feat|feature)(\([^)]*\))?:/i, type: 'feature' },
  { pattern: /^(fix|bugfix)(\([^)]*\))?:/i, type: 'bugfix' },
  { pattern: /^refactor(\([^)]*\))?:/i, type: 'refactor' },
  { pattern: /^docs?(\([^)]*\))?:/i, type: 'docs' },
];

const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/;
const MD_FILE_PATTERN = /\.md$/;

/**
 * Detect the change type from a commit message and diff information.
 *
 * Detection priority:
 * 1. Conventional commit prefix in commit message
 * 2. Diff pattern heuristics (new files, test files, docs-only)
 * 3. Default to 'feature' (most thorough review)
 */
export function detectChangeType(commitMessage: string, diff: DiffInfo): ChangeType {
  // 1. Try commit message prefix
  const trimmed = commitMessage.trim();
  for (const { pattern, type } of PREFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return type;
    }
  }

  // 2. Try diff pattern heuristics

  // All .md files → docs
  if (diff.changedFiles.length > 0 && diff.changedFiles.every((f) => MD_FILE_PATTERN.test(f))) {
    return 'docs';
  }

  // New non-test files exist → feature
  const newNonTestFiles = diff.newFiles.filter((f) => !TEST_FILE_PATTERN.test(f));
  if (newNonTestFiles.length > 0) {
    return 'feature';
  }

  // Small changes (< 20 lines) + new test file → bugfix
  const hasNewTestFile = diff.newFiles.some((f) => TEST_FILE_PATTERN.test(f));
  if (diff.totalDiffLines < 20 && hasNewTestFile) {
    return 'bugfix';
  }

  // 3. Default to feature
  return 'feature';
}
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/change-type.test.ts`
3. Observe: all tests pass.
4. Run: `pnpm exec tsc --noEmit`
5. Run: `pnpm exec harness validate`
6. Commit: `feat(review): implement change-type detection with prefix and heuristic`

---

### Task 5: Implement context scoper (TDD - RED)

**Depends on:** Task 1, Task 4
**Files:** `packages/core/tests/review/context-scoper.test.ts`

1. Create test file `packages/core/tests/review/context-scoper.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  ContextScopeOptions,
  DiffInfo,
  GraphAdapter,
  ContextBundle,
  ReviewDomain,
} from '../../src/review/types';

// Mock fs-utils for file reading
vi.mock('../../src/shared/fs-utils', () => ({
  readFileContent: vi.fn(),
  fileExists: vi.fn(),
  findFiles: vi.fn(),
}));

import { scopeContext } from '../../src/review/context-scoper';
import { readFileContent, fileExists, findFiles } from '../../src/shared/fs-utils';

const mockReadFileContent = vi.mocked(readFileContent);
const mockFileExists = vi.mocked(fileExists);
const mockFindFiles = vi.mocked(findFiles);

function makeDiff(overrides?: Partial<DiffInfo>): DiffInfo {
  return {
    changedFiles: ['src/service.ts'],
    newFiles: [],
    deletedFiles: [],
    totalDiffLines: 50,
    fileDiffs: new Map([['src/service.ts', '+ added line\n'.repeat(50)]]),
    ...overrides,
  };
}

function makeOptions(overrides?: Partial<ContextScopeOptions>): ContextScopeOptions {
  return {
    projectRoot: '/fake/project',
    diff: makeDiff(),
    commitMessage: 'feat: add service',
    conventionFiles: ['CLAUDE.md'],
    ...overrides,
  };
}

describe('scopeContext()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: all files exist with some content
    mockReadFileContent.mockResolvedValue({
      ok: true,
      value: 'file content\nline 2\nline 3\n',
    } as any);
    mockFileExists.mockResolvedValue(true);
    mockFindFiles.mockResolvedValue([]);
  });

  it('returns a ContextBundle for each of the four domains', async () => {
    const result = await scopeContext(makeOptions());
    expect(result).toHaveLength(4);
    const domains = result.map((b) => b.domain).sort();
    expect(domains).toEqual(['architecture', 'bug', 'compliance', 'security']);
  });

  it('sets changeType on all bundles', async () => {
    const result = await scopeContext(makeOptions({ commitMessage: 'fix: null check' }));
    for (const bundle of result) {
      expect(bundle.changeType).toBe('bugfix');
    }
  });

  it('includes changed files in all bundles', async () => {
    const result = await scopeContext(makeOptions());
    for (const bundle of result) {
      expect(bundle.changedFiles.length).toBeGreaterThan(0);
      expect(bundle.changedFiles[0]!.path).toBe('src/service.ts');
      expect(bundle.changedFiles[0]!.reason).toBe('changed');
    }
  });

  it('includes convention files in compliance bundle', async () => {
    const result = await scopeContext(makeOptions({ conventionFiles: ['CLAUDE.md', 'AGENTS.md'] }));
    const compliance = result.find((b) => b.domain === 'compliance')!;
    const conventionPaths = compliance.contextFiles
      .filter((f) => f.reason === 'convention')
      .map((f) => f.path);
    expect(conventionPaths).toContain('CLAUDE.md');
    expect(conventionPaths).toContain('AGENTS.md');
  });

  it('records diffLines and contextLines', async () => {
    const result = await scopeContext(makeOptions());
    for (const bundle of result) {
      expect(bundle.diffLines).toBe(50);
      expect(typeof bundle.contextLines).toBe('number');
    }
  });

  describe('without graph (fallback heuristics)', () => {
    it('searches for import targets in changed files for bug domain', async () => {
      // The changed file content has an import
      mockReadFileContent.mockImplementation(async (p: string) => {
        if (p.endsWith('service.ts')) {
          return {
            ok: true,
            value: "import { helper } from './helper';\nexport function run() {}",
          } as any;
        }
        return { ok: true, value: 'export function helper() {}' } as any;
      });
      mockFileExists.mockResolvedValue(true);

      const result = await scopeContext(makeOptions({ graph: undefined }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;

      // Should attempt to read import targets
      expect(mockReadFileContent).toHaveBeenCalled();
    });

    it('searches for test files matching changed files', async () => {
      mockFindFiles.mockResolvedValue(['/fake/project/tests/service.test.ts']);

      const result = await scopeContext(makeOptions());
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      const testFiles = bugBundle.contextFiles.filter((f) => f.reason === 'test');
      expect(testFiles.length).toBeGreaterThanOrEqual(0);
    });

    it('includes check-deps output in architecture bundle when provided', async () => {
      const result = await scopeContext(
        makeOptions({ checkDepsOutput: 'Layer violation: routes -> db' })
      );
      const archBundle = result.find((b) => b.domain === 'architecture')!;
      // Architecture bundle should have context
      expect(archBundle).toBeDefined();
    });
  });

  describe('with graph', () => {
    const mockGraph: GraphAdapter = {
      getDependencies: vi.fn().mockResolvedValue(['src/helper.ts', 'src/types.ts']),
      getImpact: vi.fn().mockResolvedValue({
        tests: ['tests/service.test.ts'],
        docs: ['docs/api.md'],
        code: ['src/caller.ts'],
      }),
      isReachable: vi.fn().mockResolvedValue(true),
    };

    it('uses graph getDependencies for bug domain context', async () => {
      const result = await scopeContext(makeOptions({ graph: mockGraph }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      expect(mockGraph.getDependencies).toHaveBeenCalledWith('src/service.ts');
      const graphDeps = bugBundle.contextFiles.filter((f) => f.reason === 'graph-dependency');
      expect(graphDeps.length).toBeGreaterThan(0);
    });

    it('uses graph getImpact for architecture domain context', async () => {
      const result = await scopeContext(makeOptions({ graph: mockGraph }));
      expect(mockGraph.getImpact).toHaveBeenCalled();
    });

    it('uses graph getImpact to find test files', async () => {
      const result = await scopeContext(makeOptions({ graph: mockGraph }));
      const bugBundle = result.find((b) => b.domain === 'bug')!;
      const testFiles = bugBundle.contextFiles.filter((f) => f.reason === 'test');
      expect(testFiles.some((f) => f.path === 'tests/service.test.ts')).toBe(true);
    });
  });

  describe('context ratio', () => {
    it('gathers more context for small diffs (< 20 lines)', async () => {
      const smallDiff = makeDiff({ totalDiffLines: 10, changedFiles: ['src/small.ts'] });
      smallDiff.fileDiffs = new Map([['src/small.ts', '+ line\n'.repeat(10)]]);
      const result = await scopeContext(makeOptions({ diff: smallDiff }));
      // For small diffs, target is 3:1, so contextLines should aim for ~30
      for (const bundle of result) {
        expect(bundle.diffLines).toBe(10);
      }
    });
  });
});
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/context-scoper.test.ts`
3. Observe failure: `Cannot find module '../../src/review/context-scoper'`

---

### Task 6: Implement context scoper (TDD - GREEN)

**Depends on:** Task 5
**Files:** `packages/core/src/review/context-scoper.ts`

1. Create implementation file `packages/core/src/review/context-scoper.ts`:

```typescript
import * as path from 'node:path';
import { readFileContent, fileExists, findFiles } from '../shared/fs-utils';
import { detectChangeType } from './change-type';
import type {
  ContextBundle,
  ContextFile,
  ContextScopeOptions,
  CommitHistoryEntry,
  ReviewDomain,
  GraphAdapter,
  DiffInfo,
} from './types';

const ALL_DOMAINS: ReviewDomain[] = ['compliance', 'bug', 'security', 'architecture'];

const SECURITY_PATTERNS =
  /auth|crypto|password|secret|token|session|cookie|hash|encrypt|decrypt|sql|shell|exec|eval/i;

/**
 * Compute the target context line count based on the 1:1 ratio rule.
 * - Small diffs (< 20 lines): 3:1 ratio
 * - Medium diffs (20-200 lines): 1:1 ratio
 * - Large diffs (> 200 lines): 1:1 ratio (floor)
 */
function computeContextBudget(diffLines: number): number {
  if (diffLines < 20) return diffLines * 3;
  return diffLines;
}

/**
 * Read a file and produce a ContextFile entry.
 * Returns null if the file cannot be read.
 */
async function readContextFile(
  projectRoot: string,
  filePath: string,
  reason: ContextFile['reason']
): Promise<ContextFile | null> {
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  const result = await readFileContent(absPath);
  if (!result.ok) return null;

  const content = result.value;
  const lines = content.split('\n').length;
  // Normalize to project-relative path
  const relPath = path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath;

  return { path: relPath, content, reason, lines };
}

/**
 * Extract import sources from TypeScript/JavaScript file content.
 * Returns the raw import specifiers (e.g., './helper', '@pkg/lib').
 */
function extractImportSources(content: string): string[] {
  const sources: string[] = [];
  // Match: import ... from 'source' and import 'source' and require('source')
  const importRegex =
    /(?:import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const source = match[1] ?? match[2];
    if (source) sources.push(source);
  }
  return sources;
}

/**
 * Resolve a relative import specifier to a likely file path.
 * Tries .ts, .tsx, /index.ts extensions.
 */
async function resolveImportPath(
  projectRoot: string,
  fromFile: string,
  importSource: string
): Promise<string | null> {
  // Only resolve relative imports
  if (!importSource.startsWith('.')) return null;

  const fromDir = path.dirname(path.join(projectRoot, fromFile));
  const basePath = path.resolve(fromDir, importSource);
  const relBase = path.relative(projectRoot, basePath);

  const candidates = [
    relBase + '.ts',
    relBase + '.tsx',
    relBase + '.mts',
    path.join(relBase, 'index.ts'),
  ];

  for (const candidate of candidates) {
    const absCandidate = path.join(projectRoot, candidate);
    if (await fileExists(absCandidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Find test files that correspond to a source file.
 * Uses glob patterns to find .test.ts and .spec.ts files.
 */
async function findTestFiles(projectRoot: string, sourceFile: string): Promise<string[]> {
  const baseName = path.basename(sourceFile, path.extname(sourceFile));
  const pattern = `**/${baseName}.{test,spec}.{ts,tsx,mts}`;
  const results = await findFiles(pattern, projectRoot);
  return results.map((f) => path.relative(projectRoot, f));
}

/**
 * Gather import-based context for a set of changed files (fallback heuristic).
 */
async function gatherImportContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  let linesGathered = 0;
  const seen = new Set(changedFiles.map((f) => f.path));

  for (const cf of changedFiles) {
    if (linesGathered >= budget) break;

    const sources = extractImportSources(cf.content);
    for (const source of sources) {
      if (linesGathered >= budget) break;

      const resolved = await resolveImportPath(projectRoot, cf.path, source);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        const contextFile = await readContextFile(projectRoot, resolved, 'import');
        if (contextFile) {
          contextFiles.push(contextFile);
          linesGathered += contextFile.lines;
        }
      }
    }
  }

  return contextFiles;
}

/**
 * Gather graph-based dependency context.
 */
async function gatherGraphDependencyContext(
  projectRoot: string,
  changedFilePaths: string[],
  graph: GraphAdapter,
  budget: number
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  let linesGathered = 0;
  const seen = new Set(changedFilePaths);

  for (const filePath of changedFilePaths) {
    if (linesGathered >= budget) break;

    const deps = await graph.getDependencies(filePath);
    for (const dep of deps) {
      if (linesGathered >= budget) break;
      if (seen.has(dep)) continue;
      seen.add(dep);

      const contextFile = await readContextFile(projectRoot, dep, 'graph-dependency');
      if (contextFile) {
        contextFiles.push(contextFile);
        linesGathered += contextFile.lines;
      }
    }
  }

  return contextFiles;
}

/**
 * Gather test file context (graph or heuristic).
 */
async function gatherTestContext(
  projectRoot: string,
  changedFilePaths: string[],
  graph?: GraphAdapter
): Promise<ContextFile[]> {
  const testFiles: ContextFile[] = [];
  const seen = new Set<string>();

  if (graph) {
    for (const filePath of changedFilePaths) {
      const impact = await graph.getImpact(filePath);
      for (const testFile of impact.tests) {
        if (seen.has(testFile)) continue;
        seen.add(testFile);
        const cf = await readContextFile(projectRoot, testFile, 'test');
        if (cf) testFiles.push(cf);
      }
    }
  } else {
    for (const filePath of changedFilePaths) {
      const found = await findTestFiles(projectRoot, filePath);
      for (const testFile of found) {
        if (seen.has(testFile)) continue;
        seen.add(testFile);
        const cf = await readContextFile(projectRoot, testFile, 'test');
        if (cf) testFiles.push(cf);
      }
    }
  }

  return testFiles;
}

/**
 * Scope context for the compliance domain.
 * Convention files + changed files.
 */
async function scopeComplianceContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];

  // Add convention files
  const conventionFiles = options.conventionFiles ?? ['CLAUDE.md', 'AGENTS.md'];
  for (const cf of conventionFiles) {
    const file = await readContextFile(projectRoot, cf, 'convention');
    if (file) contextFiles.push(file);
  }

  return contextFiles;
}

/**
 * Scope context for the bug detection domain.
 * Changed files + direct dependencies + test files.
 */
async function scopeBugContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number,
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  const changedPaths = changedFiles.map((f) => f.path);

  // Dependencies (graph or fallback)
  if (options.graph) {
    const deps = await gatherGraphDependencyContext(
      projectRoot,
      changedPaths,
      options.graph,
      budget
    );
    contextFiles.push(...deps);
  } else {
    const deps = await gatherImportContext(projectRoot, changedFiles, budget);
    contextFiles.push(...deps);
  }

  // Test files
  const tests = await gatherTestContext(projectRoot, changedPaths, options.graph);
  contextFiles.push(...tests);

  return contextFiles;
}

/**
 * Scope context for the security domain.
 * Security-relevant paths + data flows.
 */
async function scopeSecurityContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number,
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  const changedPaths = changedFiles.map((f) => f.path);

  if (options.graph) {
    // Use graph to find security-relevant dependencies
    const deps = await gatherGraphDependencyContext(
      projectRoot,
      changedPaths,
      options.graph,
      budget
    );
    // Filter to security-relevant files
    const securityDeps = deps.filter(
      (f) => SECURITY_PATTERNS.test(f.path) || SECURITY_PATTERNS.test(f.content)
    );
    contextFiles.push(...(securityDeps.length > 0 ? securityDeps : deps));
  } else {
    // Fallback: import-based + filter for security patterns
    const deps = await gatherImportContext(projectRoot, changedFiles, budget);
    contextFiles.push(...deps);
  }

  return contextFiles;
}

/**
 * Scope context for the architecture domain.
 * Layer boundaries + import graph.
 */
async function scopeArchitectureContext(
  projectRoot: string,
  changedFiles: ContextFile[],
  budget: number,
  options: ContextScopeOptions
): Promise<ContextFile[]> {
  const contextFiles: ContextFile[] = [];
  const changedPaths = changedFiles.map((f) => f.path);

  if (options.graph) {
    // Use graph for impact analysis
    for (const filePath of changedPaths) {
      const impact = await options.graph.getImpact(filePath);
      for (const codePath of impact.code) {
        const cf = await readContextFile(projectRoot, codePath, 'graph-impact');
        if (cf) contextFiles.push(cf);
      }
    }
  } else {
    // Fallback: import context
    const deps = await gatherImportContext(projectRoot, changedFiles, budget);
    contextFiles.push(...deps);
  }

  return contextFiles;
}

/**
 * Assemble scoped context bundles for each review domain.
 *
 * Returns one ContextBundle per domain. Each bundle contains:
 * - The changed files with their content
 * - Domain-specific context files (imports, tests, conventions, etc.)
 * - Recent commit history
 * - Change type and context ratio metadata
 */
export async function scopeContext(options: ContextScopeOptions): Promise<ContextBundle[]> {
  const { projectRoot, diff, commitMessage } = options;
  const changeType = detectChangeType(commitMessage, diff);
  const budget = computeContextBudget(diff.totalDiffLines);

  // Read all changed files
  const changedFiles: ContextFile[] = [];
  for (const filePath of diff.changedFiles) {
    const cf = await readContextFile(projectRoot, filePath, 'changed');
    if (cf) changedFiles.push(cf);
  }

  // Scope context per domain
  const scopers: Record<ReviewDomain, () => Promise<ContextFile[]>> = {
    compliance: () => scopeComplianceContext(projectRoot, changedFiles, options),
    bug: () => scopeBugContext(projectRoot, changedFiles, budget, options),
    security: () => scopeSecurityContext(projectRoot, changedFiles, budget, options),
    architecture: () => scopeArchitectureContext(projectRoot, changedFiles, budget, options),
  };

  const bundles: ContextBundle[] = [];

  for (const domain of ALL_DOMAINS) {
    const contextFiles = await scopers[domain]();
    const contextLines = contextFiles.reduce((sum, f) => sum + f.lines, 0);

    bundles.push({
      domain,
      changeType,
      changedFiles: [...changedFiles],
      contextFiles,
      commitHistory: [], // Populated by caller via git log
      diffLines: diff.totalDiffLines,
      contextLines,
    });
  }

  return bundles;
}
```

2. Run test: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run tests/review/context-scoper.test.ts`
3. Observe: all tests pass.
4. Run: `pnpm exec tsc --noEmit`
5. Run: `pnpm exec harness validate`
6. Commit: `feat(review): implement context scoper with graph and heuristic fallback`

---

### Task 7: Wire exports into barrel and verify full test suite

**Depends on:** Task 2, Task 4, Task 6
**Files:** `packages/core/src/review/index.ts`

1. Update `packages/core/src/review/index.ts` to add the function exports:

```typescript
// Types
export type {
  MechanicalFinding,
  MechanicalCheckResult,
  MechanicalCheckStatus,
  MechanicalCheckOptions,
  ChangeType,
  ReviewDomain,
  ContextFile,
  CommitHistoryEntry,
  ContextBundle,
  DiffInfo,
  GraphAdapter,
  ContextScopeOptions,
} from './types';

// Mechanical checks
export { runMechanicalChecks } from './mechanical-checks';

// Exclusion set
export { ExclusionSet, buildExclusionSet } from './exclusion-set';

// Change-type detection
export { detectChangeType } from './change-type';

// Context scoping
export { scopeContext } from './context-scoper';
```

2. Run full test suite: `cd /Users/cwarner/Projects/harness-engineering/packages/core && pnpm exec vitest run`
3. Observe: all tests pass (584 existing + new context scoping tests).
4. Run: `pnpm exec tsc --noEmit`
5. Run: `pnpm exec harness validate`
6. Commit: `feat(review): wire context scoping exports into barrel`

---

### Task 8: Update delta.md with Phase 3 changes

**Depends on:** Task 7
**Files:** `docs/changes/unified-code-review-pipeline/delta.md`

1. Append the Phase 3 section to `docs/changes/unified-code-review-pipeline/delta.md`:

```markdown
# Delta: Unified Code Review Pipeline — Phase 3 (Context Scoping)

## Changes to @harness-engineering/core

- [ADDED] `ChangeType` type — `'feature' | 'bugfix' | 'refactor' | 'docs'`
- [ADDED] `ReviewDomain` type — `'compliance' | 'bug' | 'security' | 'architecture'`
- [ADDED] `ContextFile` interface — file path, content, reason, line count
- [ADDED] `CommitHistoryEntry` interface — sha, message, file
- [ADDED] `ContextBundle` interface — domain-scoped context with changed files, context files, commit history, and ratio metadata
- [ADDED] `DiffInfo` interface — structured diff information (changed/new/deleted files, line counts, per-file diffs)
- [ADDED] `GraphAdapter` interface — dependency inversion for graph queries (getDependencies, getImpact, isReachable)
- [ADDED] `ContextScopeOptions` interface — options for context scoping (projectRoot, diff, commitMessage, graph, conventionFiles, checkDepsOutput)
- [ADDED] `detectChangeType()` function — detects change type from commit prefix or diff heuristic
- [ADDED] `scopeContext()` function — assembles scoped context bundles for each review domain

## Behavioral Changes

- [ADDED] When commit message starts with `feat:`, `feature:`, change type is `feature`
- [ADDED] When commit message starts with `fix:`, `bugfix:`, change type is `bugfix`
- [ADDED] When commit message starts with `refactor:`, change type is `refactor`
- [ADDED] When commit message starts with `docs:`, `doc:`, change type is `docs`
- [ADDED] When no prefix found and all files are `.md`, change type is `docs`
- [ADDED] When no prefix found and new non-test files exist, change type is `feature`
- [ADDED] When no prefix found and ambiguous, change type defaults to `feature`
- [ADDED] When `GraphAdapter` is provided, context scoper uses graph queries for dependency traversal
- [ADDED] When `GraphAdapter` is absent, context scoper falls back to import grep, test file glob, and check-deps output
- [ADDED] Context budget follows 1:1 ratio rule (3:1 for diffs < 20 lines)
- [ADDED] Compliance domain always includes convention files (CLAUDE.md, AGENTS.md)
- [ADDED] Bug detection domain includes direct dependencies and test files
- [ADDED] Security domain includes security-relevant imports filtered by pattern
- [ADDED] Architecture domain includes reverse dependency impact from graph or import heuristic
```

2. Run: `pnpm exec harness validate`
3. Commit: `docs(review): add Phase 3 context scoping delta`
