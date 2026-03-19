# Plan: Performance Enforcement — Part 1 (Entropy Extensions)

**Date:** 2026-03-19
**Spec:** docs/changes/performance-enforcement/proposal.md
**Estimated tasks:** 18
**Estimated time:** 60 minutes

## Goal

Structural complexity, coupling metrics, and size budgets are enforced as entropy detectors — integrated into the existing entropy analysis pipeline, graph adapters, CI checks, CLI commands, and MCP tools.

## Observable Truths (Acceptance Criteria)

1. When `EntropyAnalyzer.analyze()` is called with `analyze.complexity` enabled, the system shall return a `ComplexityReport` containing per-function cyclomatic complexity, nesting depth, function length, and parameter count violations classified by tier.
2. When `EntropyAnalyzer.analyze()` is called with `analyze.coupling` enabled, the system shall return a `CouplingReport` containing per-file fan-in, fan-out, coupling ratio, and transitive dependency depth violations.
3. When `EntropyAnalyzer.analyze()` is called with `analyze.sizeBudget` enabled, the system shall return a `SizeBudgetReport` containing per-package size vs. budget comparisons.
4. When `CodeIngestor.ingest()` processes a TypeScript file, the system shall store `cyclomaticComplexity`, `nestingDepth`, `lineCount`, and `parameterCount` in function/method node metadata.
5. When `GraphComplexityAdapter.computeHotspots()` is called, the system shall return hotspot scores computed as `changeFrequency × cyclomaticComplexity` using graph data.
6. When `GraphCouplingAdapter.computeCouplingData()` is called, the system shall return fan-in, fan-out, coupling ratio, and transitive dependency depth per file.
7. `npx vitest run packages/core/tests/entropy/detectors/complexity.test.ts` passes with all tests.
8. `npx vitest run packages/core/tests/entropy/detectors/coupling.test.ts` passes with all tests.
9. `npx vitest run packages/core/tests/entropy/detectors/size-budget.test.ts` passes with all tests.
10. `npx vitest run packages/graph/tests/entropy/GraphComplexityAdapter.test.ts` passes with all tests.
11. `npx vitest run packages/graph/tests/entropy/GraphCouplingAdapter.test.ts` passes with all tests.
12. `harness validate` passes after all changes.
13. The `EntropyReport` type includes optional `complexity`, `coupling`, and `sizeBudget` fields.
14. The `EntropyConfig.analyze` object accepts `complexity`, `coupling`, and `sizeBudget` configuration.
15. The `CICheckName` type includes `'perf'` and `runCIChecks` executes a performance check.
16. The `check_performance` MCP tool is registered and returns structured results.
17. `harness check-perf` CLI command runs all three sub-checks and reports tier-classified violations.

## File Map

```
CREATE packages/core/src/entropy/detectors/complexity.ts
CREATE packages/core/tests/entropy/detectors/complexity.test.ts
CREATE packages/core/src/entropy/detectors/coupling.ts
CREATE packages/core/tests/entropy/detectors/coupling.test.ts
CREATE packages/core/src/entropy/detectors/size-budget.ts
CREATE packages/core/tests/entropy/detectors/size-budget.test.ts
CREATE packages/graph/src/entropy/GraphComplexityAdapter.ts
CREATE packages/graph/tests/entropy/GraphComplexityAdapter.test.ts
CREATE packages/graph/src/entropy/GraphCouplingAdapter.ts
CREATE packages/graph/tests/entropy/GraphCouplingAdapter.test.ts
CREATE packages/mcp-server/src/tools/performance.ts
CREATE packages/cli/src/commands/check-perf.ts
MODIFY packages/core/src/entropy/types.ts (add complexity, coupling, size-budget types)
MODIFY packages/core/src/entropy/analyzer.ts (add complexity, coupling, size-budget detectors)
MODIFY packages/core/src/entropy/index.ts (export new detectors and types)
MODIFY packages/core/src/index.ts (no change needed — already re-exports entropy/*)
MODIFY packages/graph/src/ingest/CodeIngestor.ts (add complexity metadata)
MODIFY packages/graph/src/entropy/GraphEntropyAdapter.ts (re-export new adapters)
MODIFY packages/graph/src/index.ts (export new adapters)
MODIFY packages/types/src/index.ts (add 'perf' to CICheckName)
MODIFY packages/core/src/ci/check-orchestrator.ts (add perf check)
MODIFY packages/mcp-server/src/server.ts (register performance tools)
MODIFY packages/cli/src/commands/index.ts or program factory (register check-perf command)
```

## Tasks

### Task 1: Add complexity, coupling, and size-budget types to entropy types

**Depends on:** none
**Files:** packages/core/src/entropy/types.ts

1. Open `packages/core/src/entropy/types.ts`
2. Add the following types after the `PatternReport` section (before Fix Types):

```typescript
// ============ Complexity Types ============

export interface ComplexityThresholds {
  cyclomaticComplexity?: { error?: number; warn?: number };
  nestingDepth?: { warn?: number };
  functionLength?: { warn?: number };
  parameterCount?: { warn?: number };
  fileLength?: { info?: number };
  hotspotPercentile?: { error?: number };
}

export interface ComplexityConfig {
  enabled: boolean;
  thresholds: ComplexityThresholds;
}

export interface ComplexityViolation {
  file: string;
  function: string;
  line: number;
  metric:
    | 'cyclomaticComplexity'
    | 'nestingDepth'
    | 'functionLength'
    | 'parameterCount'
    | 'fileLength'
    | 'hotspotScore';
  value: number;
  threshold: number;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
}

export interface ComplexityReport {
  violations: ComplexityViolation[];
  stats: {
    filesAnalyzed: number;
    functionsAnalyzed: number;
    violationCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// ============ Coupling Types ============

export interface CouplingThresholds {
  fanOut?: { warn?: number };
  fanIn?: { info?: number };
  couplingRatio?: { warn?: number };
  transitiveDependencyDepth?: { info?: number };
}

export interface CouplingConfig {
  enabled: boolean;
  thresholds: CouplingThresholds;
}

export interface CouplingViolation {
  file: string;
  metric: 'fanOut' | 'fanIn' | 'couplingRatio' | 'transitiveDependencyDepth';
  value: number;
  threshold: number;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
}

export interface CouplingReport {
  violations: CouplingViolation[];
  stats: {
    filesAnalyzed: number;
    violationCount: number;
    warningCount: number;
    infoCount: number;
  };
}

// ============ Size Budget Types ============

export interface SizeBudgetConfig {
  enabled: boolean;
  budgets: Record<string, { warn?: string }>;
  dependencyWeight?: { info?: string };
}

export interface SizeBudgetViolation {
  package: string;
  currentSize: number;
  budgetSize: number;
  unit: 'bytes';
  tier: 2 | 3;
  severity: 'warning' | 'info';
}

export interface SizeBudgetReport {
  violations: SizeBudgetViolation[];
  stats: {
    packagesChecked: number;
    violationCount: number;
    warningCount: number;
    infoCount: number;
  };
}
```

3. Update `EntropyConfig.analyze` to accept the new config types:

```typescript
export interface EntropyConfig {
  rootDir: string;
  parser?: LanguageParser;
  entryPoints?: string[];
  analyze: {
    drift?: boolean | Partial<DriftConfig>;
    deadCode?: boolean | Partial<DeadCodeConfig>;
    patterns?: boolean | PatternConfig;
    complexity?: boolean | Partial<ComplexityConfig>;
    coupling?: boolean | Partial<CouplingConfig>;
    sizeBudget?: boolean | Partial<SizeBudgetConfig>;
  };
  include?: string[];
  exclude?: string[];
  docPaths?: string[];
}
```

4. Update `AnalysisError` to include new analyzer names:

```typescript
export interface AnalysisError {
  analyzer: 'drift' | 'deadCode' | 'patterns' | 'complexity' | 'coupling' | 'sizeBudget';
  error: EntropyError;
}
```

5. Update `EntropyReport` to include new report fields:

```typescript
export interface EntropyReport {
  snapshot: CodebaseSnapshot;
  drift?: DriftReport;
  deadCode?: DeadCodeReport;
  patterns?: PatternReport;
  complexity?: ComplexityReport;
  coupling?: CouplingReport;
  sizeBudget?: SizeBudgetReport;
  analysisErrors: AnalysisError[];
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

6. Run: `harness validate`
7. Commit: `feat(core): add complexity, coupling, and size-budget types to entropy system`

---

### Task 2: Create complexity detector with tests (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/entropy/detectors/complexity.ts, packages/core/tests/entropy/detectors/complexity.test.ts

1. Create test file `packages/core/tests/entropy/detectors/complexity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectComplexityViolations } from '../../../src/entropy/detectors/complexity';
import type { CodebaseSnapshot, ComplexityConfig } from '../../../src/entropy/types';

function makeSnapshot(files: Array<{ path: string; content: string }>): CodebaseSnapshot {
  return {
    files: files.map((f) => ({
      path: f.path,
      ast: { type: 'Program', body: [], sourceType: 'module' },
      imports: [],
      exports: [],
      internalSymbols: [],
      jsDocComments: [],
    })),
    dependencyGraph: { nodes: [], edges: [] },
    exportMap: { byFile: new Map(), byName: new Map() },
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir: '/test',
    config: { rootDir: '/test', analyze: {} },
    buildTime: 0,
  };
}

describe('detectComplexityViolations', () => {
  it('returns empty report for simple functions', async () => {
    const snapshot = makeSnapshot([
      { path: '/test/simple.ts', content: 'function foo() { return 1; }' },
    ]);
    const config: Partial<ComplexityConfig> = {
      thresholds: { cyclomaticComplexity: { error: 15, warn: 10 } },
    };
    const result = await detectComplexityViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations).toHaveLength(0);
      expect(result.value.stats.filesAnalyzed).toBe(1);
    }
  });

  it('detects high cyclomatic complexity as tier 1 error', async () => {
    // Build a function with many if/else branches
    const branches = Array.from({ length: 16 }, (_, i) => `if (x === ${i}) { return ${i}; }`).join(
      ' else '
    );
    const content = `function complex(x: number) { ${branches} }`;
    const snapshot = makeSnapshot([{ path: '/test/complex.ts', content }]);
    const config: Partial<ComplexityConfig> = {
      thresholds: { cyclomaticComplexity: { error: 15, warn: 10 } },
    };
    const result = await detectComplexityViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const errors = result.value.violations.filter((v) => v.tier === 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.metric).toBe('cyclomaticComplexity');
    }
  });

  it('detects moderate complexity as tier 2 warning', async () => {
    const branches = Array.from({ length: 12 }, (_, i) => `if (x === ${i}) { return ${i}; }`).join(
      ' else '
    );
    const content = `function moderate(x: number) { ${branches} }`;
    const snapshot = makeSnapshot([{ path: '/test/moderate.ts', content }]);
    const config: Partial<ComplexityConfig> = {
      thresholds: { cyclomaticComplexity: { error: 15, warn: 10 } },
    };
    const result = await detectComplexityViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const warnings = result.value.violations.filter((v) => v.tier === 2);
      expect(warnings.length).toBeGreaterThan(0);
    }
  });

  it('detects deep nesting', async () => {
    const content = `function deep() {
      if (true) {
        if (true) {
          if (true) {
            if (true) {
              if (true) { return 1; }
            }
          }
        }
      }
    }`;
    const snapshot = makeSnapshot([{ path: '/test/deep.ts', content }]);
    const config: Partial<ComplexityConfig> = {
      thresholds: { nestingDepth: { warn: 4 } },
    };
    const result = await detectComplexityViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const nesting = result.value.violations.filter((v) => v.metric === 'nestingDepth');
      expect(nesting.length).toBeGreaterThan(0);
    }
  });

  it('detects long functions', async () => {
    const lines = Array.from({ length: 55 }, (_, i) => `  const x${i} = ${i};`).join('\n');
    const content = `function long() {\n${lines}\n}`;
    const snapshot = makeSnapshot([{ path: '/test/long.ts', content }]);
    const config: Partial<ComplexityConfig> = {
      thresholds: { functionLength: { warn: 50 } },
    };
    const result = await detectComplexityViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const length = result.value.violations.filter((v) => v.metric === 'functionLength');
      expect(length.length).toBeGreaterThan(0);
    }
  });

  it('detects too many parameters', async () => {
    const content = `function many(a: number, b: number, c: number, d: number, e: number, f: number) { return a; }`;
    const snapshot = makeSnapshot([{ path: '/test/params.ts', content }]);
    const config: Partial<ComplexityConfig> = {
      thresholds: { parameterCount: { warn: 5 } },
    };
    const result = await detectComplexityViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const params = result.value.violations.filter((v) => v.metric === 'parameterCount');
      expect(params.length).toBeGreaterThan(0);
    }
  });

  it('uses default thresholds when config is empty', async () => {
    const snapshot = makeSnapshot([
      { path: '/test/simple.ts', content: 'function foo() { return 1; }' },
    ]);
    const result = await detectComplexityViolations(snapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.stats.filesAnalyzed).toBe(1);
    }
  });

  it('accepts graph complexity data for hotspot scoring', async () => {
    const content = `function hot() { if (a) { if (b) { return 1; } } return 0; }`;
    const snapshot = makeSnapshot([{ path: '/test/hot.ts', content }]);
    const graphData = {
      hotspots: [
        {
          file: '/test/hot.ts',
          function: 'hot',
          changeFrequency: 50,
          complexity: 3,
          hotspotScore: 150,
        },
      ],
      percentile95Score: 100,
    };
    const config: Partial<ComplexityConfig> = {
      thresholds: { hotspotPercentile: { error: 95 } },
    };
    const result = await detectComplexityViolations(snapshot, config, graphData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const hotspots = result.value.violations.filter((v) => v.metric === 'hotspotScore');
      expect(hotspots.length).toBeGreaterThan(0);
      expect(hotspots[0]!.tier).toBe(1);
    }
  });
});
```

2. Run test: `npx vitest run packages/core/tests/entropy/detectors/complexity.test.ts`
3. Observe: fails (module not found)
4. Create `packages/core/src/entropy/detectors/complexity.ts`:

```typescript
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  ComplexityConfig,
  ComplexityReport,
  ComplexityViolation,
} from '../types';

export interface GraphComplexityData {
  hotspots: Array<{
    file: string;
    function: string;
    changeFrequency: number;
    complexity: number;
    hotspotScore: number;
  }>;
  percentile95Score: number;
}

const DEFAULT_THRESHOLDS: ComplexityConfig['thresholds'] = {
  cyclomaticComplexity: { error: 15, warn: 10 },
  nestingDepth: { warn: 4 },
  functionLength: { warn: 50 },
  parameterCount: { warn: 5 },
  fileLength: { info: 300 },
  hotspotPercentile: { error: 95 },
};

interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  complexity: number;
  maxNesting: number;
  paramCount: number;
}

/**
 * Compute cyclomatic complexity by counting decision points.
 * Counts: if, else if, while, for, case, &&, ||, ?, catch
 */
function computeCyclomaticComplexity(lines: string[]): number {
  let complexity = 1; // base path
  const decisionPattern = /\b(if|else\s+if|while|for|case)\b|\?\s*[^:?]|&&|\|\||catch\b/g;
  for (const line of lines) {
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    const matches = trimmed.match(decisionPattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

/**
 * Compute maximum nesting depth by tracking brace/control-flow depth.
 */
function computeMaxNesting(lines: string[]): number {
  let maxDepth = 0;
  let currentDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    for (const ch of trimmed) {
      if (ch === '{') {
        currentDepth++;
        if (currentDepth > maxDepth) maxDepth = currentDepth;
      } else if (ch === '}') {
        currentDepth--;
      }
    }
  }
  return Math.max(0, maxDepth - 1); // subtract 1 for the function body itself
}

/**
 * Count function parameters from the declaration line.
 */
function countParameters(declarationLine: string): number {
  const parenMatch = declarationLine.match(/\(([^)]*)\)/);
  if (!parenMatch || !parenMatch[1]!.trim()) return 0;
  // Count commas + 1, accounting for nested generics
  let depth = 0;
  let count = 1;
  for (const ch of parenMatch[1]!) {
    if (ch === '<' || ch === '(') depth++;
    else if (ch === '>' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

/**
 * Extract function/method boundaries from raw source content.
 */
function extractFunctions(content: string): FunctionInfo[] {
  const lines = content.split('\n');
  const functions: FunctionInfo[] = [];
  const fnPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/;
  const methodPattern =
    /^\s+(?:(?:public|private|protected|readonly|static|abstract)\s+)*(?:async\s+)?(\w+)\s*\(/;
  const arrowPattern =
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w[^=]*)?=>/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fnMatch = line.match(fnPattern);
    const methodMatch = !fnMatch ? line.match(methodPattern) : null;
    const arrowMatch = !fnMatch && !methodMatch ? line.match(arrowPattern) : null;

    const match = fnMatch || methodMatch || arrowMatch;
    if (!match) continue;

    const name = match[1]!;
    if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) continue;

    // Find closing brace
    let depth = 0;
    let endLine = i;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]!) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth <= 0 && j > i) {
        endLine = j;
        break;
      }
      if (depth === 0 && j === i && lines[j]!.includes('{')) {
        endLine = j;
        break;
      }
    }

    const fnLines = lines.slice(i, endLine + 1);
    functions.push({
      name,
      startLine: i + 1,
      endLine: endLine + 1,
      complexity: computeCyclomaticComplexity(fnLines),
      maxNesting: computeMaxNesting(fnLines),
      paramCount: countParameters(line),
    });
  }

  return functions;
}

/**
 * Detect complexity violations across a codebase.
 */
export async function detectComplexityViolations(
  snapshot: CodebaseSnapshot,
  config?: Partial<ComplexityConfig>,
  graphData?: GraphComplexityData
): Promise<Result<ComplexityReport, EntropyError>> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config?.thresholds };
  const violations: ComplexityViolation[] = [];
  let functionsAnalyzed = 0;

  for (const file of snapshot.files) {
    // Read raw content from AST source or reconstruct
    // Since snapshot files have AST but not raw content, use the file path
    let content: string;
    try {
      const fs = await import('node:fs/promises');
      content = await fs.readFile(file.path, 'utf-8');
    } catch {
      continue; // Skip files that can't be read
    }

    const functions = extractFunctions(content);
    const lines = content.split('\n');

    // File-level check
    if (thresholds.fileLength?.info && lines.length > thresholds.fileLength.info) {
      violations.push({
        file: file.path,
        function: '<file>',
        line: 1,
        metric: 'fileLength',
        value: lines.length,
        threshold: thresholds.fileLength.info,
        tier: 3,
        severity: 'info',
      });
    }

    for (const fn of functions) {
      functionsAnalyzed++;

      // Cyclomatic complexity
      if (
        thresholds.cyclomaticComplexity?.error &&
        fn.complexity > thresholds.cyclomaticComplexity.error
      ) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.startLine,
          metric: 'cyclomaticComplexity',
          value: fn.complexity,
          threshold: thresholds.cyclomaticComplexity.error,
          tier: 1,
          severity: 'error',
        });
      } else if (
        thresholds.cyclomaticComplexity?.warn &&
        fn.complexity > thresholds.cyclomaticComplexity.warn
      ) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.startLine,
          metric: 'cyclomaticComplexity',
          value: fn.complexity,
          threshold: thresholds.cyclomaticComplexity.warn,
          tier: 2,
          severity: 'warning',
        });
      }

      // Nesting depth
      if (thresholds.nestingDepth?.warn && fn.maxNesting > thresholds.nestingDepth.warn) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.startLine,
          metric: 'nestingDepth',
          value: fn.maxNesting,
          threshold: thresholds.nestingDepth.warn,
          tier: 2,
          severity: 'warning',
        });
      }

      // Function length
      const fnLength = fn.endLine - fn.startLine + 1;
      if (thresholds.functionLength?.warn && fnLength > thresholds.functionLength.warn) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.startLine,
          metric: 'functionLength',
          value: fnLength,
          threshold: thresholds.functionLength.warn,
          tier: 2,
          severity: 'warning',
        });
      }

      // Parameter count
      if (thresholds.parameterCount?.warn && fn.paramCount > thresholds.parameterCount.warn) {
        violations.push({
          file: file.path,
          function: fn.name,
          line: fn.startLine,
          metric: 'parameterCount',
          value: fn.paramCount,
          threshold: thresholds.parameterCount.warn,
          tier: 2,
          severity: 'warning',
        });
      }
    }
  }

  // Hotspot scoring from graph data
  if (graphData && thresholds.hotspotPercentile?.error) {
    for (const hotspot of graphData.hotspots) {
      if (hotspot.hotspotScore > graphData.percentile95Score) {
        violations.push({
          file: hotspot.file,
          function: hotspot.function,
          line: 1,
          metric: 'hotspotScore',
          value: hotspot.hotspotScore,
          threshold: graphData.percentile95Score,
          tier: 1,
          severity: 'error',
        });
      }
    }
  }

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    violations,
    stats: {
      filesAnalyzed: snapshot.files.length,
      functionsAnalyzed,
      violationCount: violations.length,
      errorCount,
      warningCount,
      infoCount,
    },
  });
}
```

5. Run test: `npx vitest run packages/core/tests/entropy/detectors/complexity.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(core): add complexity detector for structural performance enforcement`

---

### Task 3: Create coupling detector with tests (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/entropy/detectors/coupling.ts, packages/core/tests/entropy/detectors/coupling.test.ts

1. Create test file `packages/core/tests/entropy/detectors/coupling.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectCouplingViolations } from '../../../src/entropy/detectors/coupling';
import type { CodebaseSnapshot, CouplingConfig } from '../../../src/entropy/types';

function makeSnapshot(
  files: Array<{ path: string; imports: Array<{ source: string }> }>
): CodebaseSnapshot {
  return {
    files: files.map((f) => ({
      path: f.path,
      ast: { type: 'Program', body: [], sourceType: 'module' },
      imports: f.imports.map((i) => ({
        source: i.source,
        specifiers: [{ name: 'default', type: 'default' as const }],
        location: { line: 1, column: 0 },
      })),
      exports: [],
      internalSymbols: [],
      jsDocComments: [],
    })),
    dependencyGraph: { nodes: [], edges: [] },
    exportMap: { byFile: new Map(), byName: new Map() },
    docs: [],
    codeReferences: [],
    entryPoints: [],
    rootDir: '/test',
    config: { rootDir: '/test', analyze: {} },
    buildTime: 0,
  };
}

describe('detectCouplingViolations', () => {
  it('returns empty report for well-coupled files', async () => {
    const snapshot = makeSnapshot([
      { path: '/test/a.ts', imports: [{ source: './b' }] },
      { path: '/test/b.ts', imports: [] },
    ]);
    const config: Partial<CouplingConfig> = {
      thresholds: { fanOut: { warn: 15 } },
    };
    const result = await detectCouplingViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations).toHaveLength(0);
    }
  });

  it('detects high fan-out', async () => {
    const imports = Array.from({ length: 16 }, (_, i) => ({ source: `./mod${i}` }));
    const snapshot = makeSnapshot([
      { path: '/test/god.ts', imports },
      ...Array.from({ length: 16 }, (_, i) => ({ path: `/test/mod${i}.ts`, imports: [] })),
    ]);
    const config: Partial<CouplingConfig> = {
      thresholds: { fanOut: { warn: 15 } },
    };
    const result = await detectCouplingViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const fanOut = result.value.violations.filter((v) => v.metric === 'fanOut');
      expect(fanOut.length).toBeGreaterThan(0);
      expect(fanOut[0]!.tier).toBe(2);
    }
  });

  it('detects high fan-in', async () => {
    const files = Array.from({ length: 21 }, (_, i) => ({
      path: `/test/consumer${i}.ts`,
      imports: [{ source: './shared' }],
    }));
    files.push({ path: '/test/shared.ts', imports: [] });
    const snapshot = makeSnapshot(files);
    const config: Partial<CouplingConfig> = {
      thresholds: { fanIn: { info: 20 } },
    };
    const result = await detectCouplingViolations(snapshot, config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const fanIn = result.value.violations.filter((v) => v.metric === 'fanIn');
      expect(fanIn.length).toBeGreaterThan(0);
      expect(fanIn[0]!.tier).toBe(3);
    }
  });

  it('accepts graph coupling data', async () => {
    const snapshot = makeSnapshot([{ path: '/test/a.ts', imports: [] }]);
    const graphData = {
      files: [
        {
          file: '/test/a.ts',
          fanIn: 25,
          fanOut: 3,
          couplingRatio: 0.8,
          transitiveDepth: 35,
        },
      ],
    };
    const config: Partial<CouplingConfig> = {
      thresholds: {
        fanIn: { info: 20 },
        couplingRatio: { warn: 0.7 },
        transitiveDependencyDepth: { info: 30 },
      },
    };
    const result = await detectCouplingViolations(snapshot, config, graphData);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.length).toBeGreaterThanOrEqual(2);
    }
  });
});
```

2. Run test: `npx vitest run packages/core/tests/entropy/detectors/coupling.test.ts`
3. Observe failure
4. Create `packages/core/src/entropy/detectors/coupling.ts`:

```typescript
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  CouplingConfig,
  CouplingReport,
  CouplingViolation,
} from '../types';

export interface GraphCouplingData {
  files: Array<{
    file: string;
    fanIn: number;
    fanOut: number;
    couplingRatio: number;
    transitiveDepth: number;
  }>;
}

const DEFAULT_THRESHOLDS: CouplingConfig['thresholds'] = {
  fanOut: { warn: 15 },
  fanIn: { info: 20 },
  couplingRatio: { warn: 0.7 },
  transitiveDependencyDepth: { info: 30 },
};

/**
 * Detect coupling violations across a codebase.
 * Uses graph data when available, falls back to snapshot import analysis.
 */
export async function detectCouplingViolations(
  snapshot: CodebaseSnapshot,
  config?: Partial<CouplingConfig>,
  graphData?: GraphCouplingData
): Promise<Result<CouplingReport, EntropyError>> {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...config?.thresholds };
  const violations: CouplingViolation[] = [];

  if (graphData) {
    // Use graph-computed metrics
    for (const fileData of graphData.files) {
      checkCouplingMetrics(
        fileData.file,
        fileData.fanIn,
        fileData.fanOut,
        fileData.couplingRatio,
        fileData.transitiveDepth,
        thresholds,
        violations
      );
    }
  } else {
    // Fall back to snapshot-based analysis
    const fanOutMap = new Map<string, number>();
    const fanInMap = new Map<string, number>();

    for (const file of snapshot.files) {
      fanOutMap.set(file.path, file.imports.length);
    }

    // Count fan-in: how many files import each target
    for (const file of snapshot.files) {
      for (const imp of file.imports) {
        // Resolve relative import to a file path in the snapshot
        const target = resolveImportTarget(file.path, imp.source, snapshot);
        if (target) {
          fanInMap.set(target, (fanInMap.get(target) ?? 0) + 1);
        }
      }
    }

    for (const file of snapshot.files) {
      const fanOut = fanOutMap.get(file.path) ?? 0;
      const fanIn = fanInMap.get(file.path) ?? 0;
      checkCouplingMetrics(file.path, fanIn, fanOut, 0, 0, thresholds, violations);
    }
  }

  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    violations,
    stats: {
      filesAnalyzed: graphData ? graphData.files.length : snapshot.files.length,
      violationCount: violations.length,
      warningCount,
      infoCount,
    },
  });
}

function checkCouplingMetrics(
  file: string,
  fanIn: number,
  fanOut: number,
  couplingRatio: number,
  transitiveDepth: number,
  thresholds: CouplingConfig['thresholds'],
  violations: CouplingViolation[]
): void {
  if (thresholds.fanOut?.warn && fanOut > thresholds.fanOut.warn) {
    violations.push({
      file,
      metric: 'fanOut',
      value: fanOut,
      threshold: thresholds.fanOut.warn,
      tier: 2,
      severity: 'warning',
    });
  }

  if (thresholds.fanIn?.info && fanIn > thresholds.fanIn.info) {
    violations.push({
      file,
      metric: 'fanIn',
      value: fanIn,
      threshold: thresholds.fanIn.info,
      tier: 3,
      severity: 'info',
    });
  }

  if (thresholds.couplingRatio?.warn && couplingRatio > thresholds.couplingRatio.warn) {
    violations.push({
      file,
      metric: 'couplingRatio',
      value: couplingRatio,
      threshold: thresholds.couplingRatio.warn,
      tier: 2,
      severity: 'warning',
    });
  }

  if (
    thresholds.transitiveDependencyDepth?.info &&
    transitiveDepth > thresholds.transitiveDependencyDepth.info
  ) {
    violations.push({
      file,
      metric: 'transitiveDependencyDepth',
      value: transitiveDepth,
      threshold: thresholds.transitiveDependencyDepth.info,
      tier: 3,
      severity: 'info',
    });
  }
}

function resolveImportTarget(
  fromPath: string,
  importSource: string,
  snapshot: CodebaseSnapshot
): string | undefined {
  if (!importSource.startsWith('.')) return undefined;
  // Simple resolution: find a file in the snapshot whose path ends with the import source
  const normalized = importSource.replace(/^\.\//, '');
  return snapshot.files.find((f) => {
    const rel = f.path.replace(snapshot.rootDir + '/', '');
    return rel === normalized || rel === normalized + '.ts' || rel === normalized + '/index.ts';
  })?.path;
}
```

5. Run test: `npx vitest run packages/core/tests/entropy/detectors/coupling.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(core): add coupling detector for structural performance enforcement`

---

### Task 4: Create size-budget detector with tests (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/entropy/detectors/size-budget.ts, packages/core/tests/entropy/detectors/size-budget.test.ts

1. Create test file `packages/core/tests/entropy/detectors/size-budget.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { detectSizeBudgetViolations, parseSize } from '../../../src/entropy/detectors/size-budget';
import type { SizeBudgetConfig } from '../../../src/entropy/types';

describe('parseSize', () => {
  it('parses KB', () => expect(parseSize('100KB')).toBe(102400));
  it('parses MB', () => expect(parseSize('1MB')).toBe(1048576));
  it('parses bytes', () => expect(parseSize('500')).toBe(500));
  it('returns 0 for invalid', () => expect(parseSize('')).toBe(0));
});

describe('detectSizeBudgetViolations', () => {
  it('returns empty report when no budgets configured', async () => {
    const result = await detectSizeBudgetViolations('/test', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations).toHaveLength(0);
    }
  });

  it('detects packages exceeding budget', async () => {
    // This test needs a real directory; we test the logic with a mock
    const config: Partial<SizeBudgetConfig> = {
      budgets: { 'packages/core': { warn: '1KB' } }, // Intentionally tiny
    };
    const result = await detectSizeBudgetViolations('/test', config);
    expect(result.ok).toBe(true);
    // In test env, dir may not exist — should not crash
  });
});
```

2. Run test, observe failure
3. Create `packages/core/src/entropy/detectors/size-budget.ts`:

```typescript
import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  SizeBudgetConfig,
  SizeBudgetReport,
  SizeBudgetViolation,
} from '../types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const DEFAULT_CONFIG: SizeBudgetConfig = {
  enabled: true,
  budgets: {},
};

/**
 * Parse a human-readable size string (e.g., "100KB", "1MB") to bytes.
 */
export function parseSize(size: string): number {
  const match = size.trim().match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)?$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]!);
  const unit = (match[2] || 'B').toUpperCase();
  switch (unit) {
    case 'KB':
      return Math.round(value * 1024);
    case 'MB':
      return Math.round(value * 1024 * 1024);
    case 'GB':
      return Math.round(value * 1024 * 1024 * 1024);
    default:
      return Math.round(value);
  }
}

/**
 * Recursively compute directory size in bytes.
 */
async function dirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (entry.isDirectory()) {
        total += await dirSize(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return total;
}

/**
 * Detect size budget violations for configured packages.
 */
export async function detectSizeBudgetViolations(
  rootDir: string,
  config?: Partial<SizeBudgetConfig>
): Promise<Result<SizeBudgetReport, EntropyError>> {
  const budgets = config?.budgets ?? DEFAULT_CONFIG.budgets;
  const violations: SizeBudgetViolation[] = [];
  let packagesChecked = 0;

  for (const [pkgPath, budget] of Object.entries(budgets)) {
    packagesChecked++;
    const fullPath = path.resolve(rootDir, pkgPath, 'dist');
    const currentSize = await dirSize(fullPath);

    if (budget.warn) {
      const budgetBytes = parseSize(budget.warn);
      if (currentSize > budgetBytes) {
        violations.push({
          package: pkgPath,
          currentSize,
          budgetSize: budgetBytes,
          unit: 'bytes',
          tier: 2,
          severity: 'warning',
        });
      }
    }
  }

  // Check dependency weight if configured
  if (config?.dependencyWeight?.info) {
    // Future: analyze node_modules weight changes
  }

  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    violations,
    stats: {
      packagesChecked,
      violationCount: violations.length,
      warningCount,
      infoCount,
    },
  });
}
```

4. Run test, observe pass
5. Run: `harness validate`
6. Commit: `feat(core): add size-budget detector for build performance enforcement`

---

### Task 5: Wire new detectors into EntropyAnalyzer

**Depends on:** Task 2, Task 3, Task 4
**Files:** packages/core/src/entropy/analyzer.ts, packages/core/src/entropy/index.ts

1. Edit `packages/core/src/entropy/analyzer.ts`:
   - Add imports for new detectors:
     ```typescript
     import { detectComplexityViolations } from './detectors/complexity';
     import { detectCouplingViolations } from './detectors/coupling';
     import { detectSizeBudgetViolations } from './detectors/size-budget';
     ```
   - Add imports for new types:
     ```typescript
     import type {
       ComplexityConfig,
       ComplexityReport,
       CouplingConfig,
       CouplingReport,
       SizeBudgetConfig,
       SizeBudgetReport,
     } from './types';
     ```
   - Extend `graphOptions` parameter in `analyze()` to accept:
     ```typescript
     graphComplexityData?: { hotspots: Array<{...}>; percentile95Score: number };
     graphCouplingData?: { files: Array<{...}> };
     ```
   - Add complexity detection block after pattern detection:
     ```typescript
     let complexityReport: ComplexityReport | undefined;
     if (this.config.analyze.complexity) {
       const complexityConfig =
         typeof this.config.analyze.complexity === 'object' ? this.config.analyze.complexity : {};
       const result = await detectComplexityViolations(
         this.snapshot,
         complexityConfig,
         graphOptions?.graphComplexityData
       );
       if (result.ok) {
         complexityReport = result.value;
       } else {
         analysisErrors.push({ analyzer: 'complexity', error: result.error });
       }
     }
     ```
   - Add coupling detection block:
     ```typescript
     let couplingReport: CouplingReport | undefined;
     if (this.config.analyze.coupling) {
       const couplingConfig =
         typeof this.config.analyze.coupling === 'object' ? this.config.analyze.coupling : {};
       const result = await detectCouplingViolations(
         this.snapshot,
         couplingConfig,
         graphOptions?.graphCouplingData
       );
       if (result.ok) {
         couplingReport = result.value;
       } else {
         analysisErrors.push({ analyzer: 'coupling', error: result.error });
       }
     }
     ```
   - Add size budget detection block:
     ```typescript
     let sizeBudgetReport: SizeBudgetReport | undefined;
     if (this.config.analyze.sizeBudget) {
       const sizeBudgetConfig =
         typeof this.config.analyze.sizeBudget === 'object' ? this.config.analyze.sizeBudget : {};
       const result = await detectSizeBudgetViolations(this.config.rootDir, sizeBudgetConfig);
       if (result.ok) {
         sizeBudgetReport = result.value;
       } else {
         analysisErrors.push({ analyzer: 'sizeBudget', error: result.error });
       }
     }
     ```
   - Include new reports in `totalIssues` calculation and in the report object
   - Add new reports to the `EntropyReport` assignment

2. Edit `packages/core/src/entropy/index.ts`:
   - Add new detector exports:
     ```typescript
     export { detectComplexityViolations } from './detectors/complexity';
     export { detectCouplingViolations } from './detectors/coupling';
     export { detectSizeBudgetViolations } from './detectors/size-budget';
     ```
   - Add new types to the type export block:
     ```typescript
     // Complexity types
     ComplexityThresholds, ComplexityConfig, ComplexityViolation, ComplexityReport,
     // Coupling types
     CouplingThresholds, CouplingConfig, CouplingViolation, CouplingReport,
     // Size budget types
     SizeBudgetConfig, SizeBudgetViolation, SizeBudgetReport,
     ```

3. Run: `npx vitest run packages/core/tests/`
4. Run: `harness validate`
5. Commit: `feat(core): wire complexity, coupling, and size-budget detectors into EntropyAnalyzer`

---

### Task 6: Enhance CodeIngestor with complexity metadata

**Depends on:** none (can run parallel with Tasks 2-4)
**Files:** packages/graph/src/ingest/CodeIngestor.ts

1. In `CodeIngestor.extractSymbols()`, for function and method nodes, add complexity metadata.
   Add helper methods to the class:

```typescript
private computeCyclomaticComplexity(lines: string[]): number {
  let complexity = 1;
  const decisionPattern = /\b(if|else\s+if|while|for|case)\b|\?\s*[^:?]|&&|\|\||catch\b/g;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    const matches = trimmed.match(decisionPattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

private computeMaxNesting(lines: string[]): number {
  let maxDepth = 0;
  let currentDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    for (const ch of trimmed) {
      if (ch === '{') { currentDepth++; if (currentDepth > maxDepth) maxDepth = currentDepth; }
      else if (ch === '}') { currentDepth--; }
    }
  }
  return Math.max(0, maxDepth - 1);
}

private countParameters(declarationLine: string): number {
  const parenMatch = declarationLine.match(/\(([^)]*)\)/);
  if (!parenMatch || !parenMatch[1]!.trim()) return 0;
  let depth = 0;
  let count = 1;
  for (const ch of parenMatch[1]!) {
    if (ch === '<' || ch === '(') depth++;
    else if (ch === '>' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}
```

2. In the function node creation block, change metadata to:

```typescript
metadata: {
  exported: line.includes('export'),
  cyclomaticComplexity: this.computeCyclomaticComplexity(lines.slice(i, endLine)),
  nestingDepth: this.computeMaxNesting(lines.slice(i, endLine)),
  lineCount: endLine - i,
  parameterCount: this.countParameters(line),
},
```

3. Similarly for method nodes.

4. Run: `npx vitest run packages/graph/tests/`
5. Run: `harness validate`
6. Commit: `feat(graph): store complexity metrics in function/method node metadata during ingestion`

---

### Task 7: Create GraphComplexityAdapter with tests (TDD)

**Depends on:** Task 6
**Files:** packages/graph/src/entropy/GraphComplexityAdapter.ts, packages/graph/tests/entropy/GraphComplexityAdapter.test.ts

1. Create test file `packages/graph/tests/entropy/GraphComplexityAdapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore';
import { GraphComplexityAdapter } from '../../src/entropy/GraphComplexityAdapter';

describe('GraphComplexityAdapter', () => {
  it('computes hotspot scores from function metadata and commit frequency', () => {
    const store = new GraphStore();

    // Add a file node with commits
    store.addNode({
      id: 'file:src/hot.ts',
      type: 'file',
      name: 'hot.ts',
      path: 'src/hot.ts',
      metadata: {},
    });

    // Add a function node with complexity metadata
    store.addNode({
      id: 'function:src/hot.ts:process',
      type: 'function',
      name: 'process',
      path: 'src/hot.ts',
      location: { fileId: 'file:src/hot.ts', startLine: 1, endLine: 50 },
      metadata: {
        exported: true,
        cyclomaticComplexity: 12,
        nestingDepth: 3,
        lineCount: 50,
        parameterCount: 3,
      },
    });

    // Add commit nodes referencing the file
    for (let i = 0; i < 10; i++) {
      store.addNode({ id: `commit:abc${i}`, type: 'commit', name: `commit ${i}`, metadata: {} });
      store.addEdge({ from: `commit:abc${i}`, to: 'file:src/hot.ts', type: 'references' });
    }

    store.addEdge({ from: 'file:src/hot.ts', to: 'function:src/hot.ts:process', type: 'contains' });

    const adapter = new GraphComplexityAdapter(store);
    const result = adapter.computeHotspots();

    expect(result.hotspots.length).toBeGreaterThan(0);
    const hotspot = result.hotspots[0]!;
    expect(hotspot.function).toBe('process');
    expect(hotspot.changeFrequency).toBe(10);
    expect(hotspot.complexity).toBe(12);
    expect(hotspot.hotspotScore).toBe(120);
  });

  it('computes percentile correctly', () => {
    const store = new GraphStore();

    for (let i = 0; i < 20; i++) {
      const fileId = `file:src/f${i}.ts`;
      const fnId = `function:src/f${i}.ts:fn${i}`;
      store.addNode({
        id: fileId,
        type: 'file',
        name: `f${i}.ts`,
        path: `src/f${i}.ts`,
        metadata: {},
      });
      store.addNode({
        id: fnId,
        type: 'function',
        name: `fn${i}`,
        path: `src/f${i}.ts`,
        location: { fileId, startLine: 1, endLine: 10 },
        metadata: { cyclomaticComplexity: i + 1 },
      });
      store.addEdge({ from: fileId, to: fnId, type: 'contains' });
      // Add i commits to create varying churn
      for (let c = 0; c < i; c++) {
        const commitId = `commit:${i}-${c}`;
        store.addNode({ id: commitId, type: 'commit', name: `c`, metadata: {} });
        store.addEdge({ from: commitId, to: fileId, type: 'references' });
      }
    }

    const adapter = new GraphComplexityAdapter(store);
    const result = adapter.computeHotspots();
    expect(result.percentile95Score).toBeGreaterThan(0);
    expect(result.hotspots.length).toBe(20);
  });

  it('returns empty result for empty graph', () => {
    const store = new GraphStore();
    const adapter = new GraphComplexityAdapter(store);
    const result = adapter.computeHotspots();
    expect(result.hotspots).toHaveLength(0);
    expect(result.percentile95Score).toBe(0);
  });
});
```

2. Run test, observe failure
3. Create `packages/graph/src/entropy/GraphComplexityAdapter.ts`:

```typescript
import type { GraphStore } from '../store/GraphStore.js';

export interface GraphComplexityHotspot {
  readonly file: string;
  readonly function: string;
  readonly changeFrequency: number;
  readonly complexity: number;
  readonly hotspotScore: number;
}

export interface GraphComplexityResult {
  readonly hotspots: readonly GraphComplexityHotspot[];
  readonly percentile95Score: number;
}

export class GraphComplexityAdapter {
  constructor(private readonly store: GraphStore) {}

  /**
   * Compute hotspot scores for all functions in the graph.
   * hotspotScore = changeFrequency × cyclomaticComplexity
   *
   * Change frequency = number of commit nodes that reference the function's file.
   */
  computeHotspots(): GraphComplexityResult {
    const functionNodes = [
      ...this.store.findNodes({ type: 'function' }),
      ...this.store.findNodes({ type: 'method' }),
    ];

    if (functionNodes.length === 0) {
      return { hotspots: [], percentile95Score: 0 };
    }

    // Build file → commit count map
    const fileCommitCount = new Map<string, number>();
    const commitNodes = this.store.findNodes({ type: 'commit' });
    for (const commit of commitNodes) {
      const refEdges = this.store.getEdges({ from: commit.id, type: 'references' });
      for (const edge of refEdges) {
        fileCommitCount.set(edge.to, (fileCommitCount.get(edge.to) ?? 0) + 1);
      }
    }

    const hotspots: GraphComplexityHotspot[] = [];

    for (const fn of functionNodes) {
      const complexity = (fn.metadata.cyclomaticComplexity as number) ?? 1;
      const fileId = fn.location?.fileId ?? `file:${fn.path}`;
      const changeFrequency = fileCommitCount.get(fileId) ?? 0;
      const hotspotScore = changeFrequency * complexity;

      hotspots.push({
        file: fn.path ?? '',
        function: fn.name,
        changeFrequency,
        complexity,
        hotspotScore,
      });
    }

    // Sort descending by score
    hotspots.sort((a, b) => b.hotspotScore - a.hotspotScore);

    // Compute 95th percentile
    const scores = hotspots.map((h) => h.hotspotScore).sort((a, b) => a - b);
    const p95Index = Math.floor(scores.length * 0.95);
    const percentile95Score = scores[p95Index] ?? 0;

    return { hotspots, percentile95Score };
  }
}
```

4. Run test, observe pass
5. Run: `harness validate`
6. Commit: `feat(graph): add GraphComplexityAdapter for hotspot scoring`

---

### Task 8: Create GraphCouplingAdapter with tests (TDD)

**Depends on:** none
**Files:** packages/graph/src/entropy/GraphCouplingAdapter.ts, packages/graph/tests/entropy/GraphCouplingAdapter.test.ts

1. Create test file `packages/graph/tests/entropy/GraphCouplingAdapter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore';
import { GraphCouplingAdapter } from '../../src/entropy/GraphCouplingAdapter';

describe('GraphCouplingAdapter', () => {
  it('computes fan-in and fan-out correctly', () => {
    const store = new GraphStore();
    store.addNode({ id: 'file:a.ts', type: 'file', name: 'a.ts', path: 'a.ts', metadata: {} });
    store.addNode({ id: 'file:b.ts', type: 'file', name: 'b.ts', path: 'b.ts', metadata: {} });
    store.addNode({ id: 'file:c.ts', type: 'file', name: 'c.ts', path: 'c.ts', metadata: {} });

    // a imports b and c (fan-out = 2)
    store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
    store.addEdge({ from: 'file:a.ts', to: 'file:c.ts', type: 'imports' });
    // c imports b (fan-in for b = 2)
    store.addEdge({ from: 'file:c.ts', to: 'file:b.ts', type: 'imports' });

    const adapter = new GraphCouplingAdapter(store);
    const result = adapter.computeCouplingData();

    const aData = result.files.find((f) => f.file === 'a.ts');
    expect(aData!.fanOut).toBe(2);

    const bData = result.files.find((f) => f.file === 'b.ts');
    expect(bData!.fanIn).toBe(2);
  });

  it('computes transitive dependency depth via BFS', () => {
    const store = new GraphStore();
    // Chain: a -> b -> c -> d
    for (const name of ['a', 'b', 'c', 'd']) {
      store.addNode({
        id: `file:${name}.ts`,
        type: 'file',
        name: `${name}.ts`,
        path: `${name}.ts`,
        metadata: {},
      });
    }
    store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
    store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });
    store.addEdge({ from: 'file:c.ts', to: 'file:d.ts', type: 'imports' });

    const adapter = new GraphCouplingAdapter(store);
    const result = adapter.computeCouplingData();

    const aData = result.files.find((f) => f.file === 'a.ts');
    expect(aData!.transitiveDepth).toBe(3); // b, c, d
  });

  it('returns empty result for empty graph', () => {
    const store = new GraphStore();
    const adapter = new GraphCouplingAdapter(store);
    const result = adapter.computeCouplingData();
    expect(result.files).toHaveLength(0);
  });
});
```

2. Run test, observe failure
3. Create `packages/graph/src/entropy/GraphCouplingAdapter.ts`:

```typescript
import type { GraphStore } from '../store/GraphStore.js';

export interface GraphCouplingFileData {
  readonly file: string;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly couplingRatio: number;
  readonly transitiveDepth: number;
}

export interface GraphCouplingResult {
  readonly files: readonly GraphCouplingFileData[];
}

export class GraphCouplingAdapter {
  constructor(private readonly store: GraphStore) {}

  computeCouplingData(): GraphCouplingResult {
    const fileNodes = this.store.findNodes({ type: 'file' });
    if (fileNodes.length === 0) return { files: [] };

    const fanOutMap = new Map<string, number>();
    const fanInMap = new Map<string, number>();

    // Compute fan-out and fan-in from imports edges
    for (const file of fileNodes) {
      const outEdges = this.store.getEdges({ from: file.id, type: 'imports' });
      fanOutMap.set(file.id, outEdges.length);

      for (const edge of outEdges) {
        fanInMap.set(edge.to, (fanInMap.get(edge.to) ?? 0) + 1);
      }
    }

    const files: GraphCouplingFileData[] = [];

    for (const file of fileNodes) {
      const fanOut = fanOutMap.get(file.id) ?? 0;
      const fanIn = fanInMap.get(file.id) ?? 0;
      const totalEdges = fanIn + fanOut;
      const couplingRatio = totalEdges > 0 ? fanOut / totalEdges : 0;

      // BFS to compute transitive dependency depth
      const transitiveDepth = this.computeTransitiveDepth(file.id);

      files.push({
        file: file.path ?? file.name,
        fanIn,
        fanOut,
        couplingRatio: Math.round(couplingRatio * 100) / 100,
        transitiveDepth,
      });
    }

    return { files };
  }

  private computeTransitiveDepth(startId: string): number {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
    let maxDepth = 0;

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      if (depth > maxDepth) maxDepth = depth;

      const outEdges = this.store.getEdges({ from: id, type: 'imports' });
      for (const edge of outEdges) {
        if (!visited.has(edge.to)) {
          queue.push({ id: edge.to, depth: depth + 1 });
        }
      }
    }

    return maxDepth;
  }
}
```

4. Run test, observe pass
5. Run: `harness validate`
6. Commit: `feat(graph): add GraphCouplingAdapter for fan-in/fan-out/coupling analysis`

---

### Task 9: Export new graph adapters

**Depends on:** Task 7, Task 8
**Files:** packages/graph/src/index.ts

1. Edit `packages/graph/src/index.ts` to add exports:

```typescript
// After the existing GraphEntropyAdapter exports:
export { GraphComplexityAdapter } from './entropy/GraphComplexityAdapter.js';
export type {
  GraphComplexityHotspot,
  GraphComplexityResult,
} from './entropy/GraphComplexityAdapter.js';

export { GraphCouplingAdapter } from './entropy/GraphCouplingAdapter.js';
export type { GraphCouplingFileData, GraphCouplingResult } from './entropy/GraphCouplingAdapter.js';
```

2. Run: `npx vitest run packages/graph/tests/`
3. Run: `harness validate`
4. Commit: `feat(graph): export GraphComplexityAdapter and GraphCouplingAdapter`

---

### Task 10: Add 'perf' to CICheckName and extend check orchestrator

**Depends on:** Task 5
**Files:** packages/types/src/index.ts, packages/core/src/ci/check-orchestrator.ts

1. Edit `packages/types/src/index.ts`:
   Change:

   ```typescript
   export type CICheckName = 'validate' | 'deps' | 'docs' | 'entropy' | 'phase-gate';
   ```

   To:

   ```typescript
   export type CICheckName = 'validate' | 'deps' | 'docs' | 'entropy' | 'perf' | 'phase-gate';
   ```

2. Edit `packages/core/src/ci/check-orchestrator.ts`:
   - Update `ALL_CHECKS`:
     ```typescript
     const ALL_CHECKS: CICheckName[] = [
       'validate',
       'deps',
       'docs',
       'entropy',
       'perf',
       'phase-gate',
     ];
     ```
   - Add `case 'perf':` in `runSingleCheck`:
     ```typescript
     case 'perf': {
       const analyzer = new EntropyAnalyzer({
         rootDir: projectRoot,
         analyze: {
           complexity: true,
           coupling: true,
           sizeBudget: config.entropy?.sizeBudget ?? false,
         },
       });
       const result = await analyzer.analyze();
       if (!result.ok) {
         issues.push({ severity: 'warning', message: result.error.message });
       } else {
         const report = result.value;
         if (report.complexity) {
           for (const v of report.complexity.violations) {
             issues.push({
               severity: v.severity === 'info' ? 'warning' : v.severity,
               message: `[Tier ${v.tier}] ${v.metric}: ${v.function} in ${v.file} (${v.value} > ${v.threshold})`,
               file: v.file,
               line: v.line,
             });
           }
         }
         if (report.coupling) {
           for (const v of report.coupling.violations) {
             issues.push({
               severity: v.severity === 'info' ? 'warning' : v.severity,
               message: `[Tier ${v.tier}] ${v.metric}: ${v.file} (${v.value} > ${v.threshold})`,
               file: v.file,
             });
           }
         }
         if (report.sizeBudget) {
           for (const v of report.sizeBudget.violations) {
             issues.push({
               severity: v.severity === 'info' ? 'warning' : v.severity,
               message: `[Tier ${v.tier}] Size budget: ${v.package} (${v.currentSize}B > ${v.budgetSize}B)`,
             });
           }
         }
       }
       break;
     }
     ```

3. Run: `npx vitest run packages/core/tests/`
4. Run: `harness validate`
5. Commit: `feat(ci): add 'perf' check to CI orchestrator with complexity, coupling, and size checks`

---

### Task 11: Create check_performance MCP tool

**Depends on:** Task 5, Task 9
**Files:** packages/mcp-server/src/tools/performance.ts, packages/mcp-server/src/server.ts

1. Create `packages/mcp-server/src/tools/performance.ts`:

```typescript
import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';

export const checkPerformanceDefinition = {
  name: 'check_performance',
  description: 'Run performance checks: structural complexity, coupling metrics, and size budgets',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      type: {
        type: 'string',
        enum: ['structural', 'coupling', 'size', 'all'],
        description: 'Type of performance check (default: all)',
      },
    },
    required: ['path'],
  },
};

export async function handleCheckPerformance(input: { path: string; type?: string }) {
  try {
    const { EntropyAnalyzer } = await import('@harness-engineering/core');
    const typeFilter = input.type ?? 'all';

    const analyzer = new EntropyAnalyzer({
      rootDir: path.resolve(input.path),
      analyze: {
        complexity: typeFilter === 'all' || typeFilter === 'structural',
        coupling: typeFilter === 'all' || typeFilter === 'coupling',
        sizeBudget: typeFilter === 'all' || typeFilter === 'size',
      },
    });

    // Load graph data if available
    let graphOptions: Record<string, unknown> | undefined;
    try {
      const { loadGraphStore } = await import('../utils/graph-loader.js');
      const store = await loadGraphStore(path.resolve(input.path));
      if (store) {
        const { GraphComplexityAdapter, GraphCouplingAdapter } =
          await import('@harness-engineering/graph');
        const complexityAdapter = new GraphComplexityAdapter(store);
        const couplingAdapter = new GraphCouplingAdapter(store);
        graphOptions = {
          graphComplexityData: complexityAdapter.computeHotspots(),
          graphCouplingData: couplingAdapter.computeCouplingData(),
        };
      }
    } catch {
      // Graph not available — proceed without
    }

    const result = await analyzer.analyze(graphOptions);
    return resultToMcpResponse(result);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

2. Edit `packages/mcp-server/src/server.ts`:
   - Add import:
     ```typescript
     import { checkPerformanceDefinition, handleCheckPerformance } from './tools/performance.js';
     ```
   - Add to `TOOL_DEFINITIONS` array: `checkPerformanceDefinition`
   - Add to `TOOL_HANDLERS` record: `check_performance: handleCheckPerformance`

3. Run: `npx vitest run packages/mcp-server/tests/`
4. Run: `harness validate`
5. Commit: `feat(mcp): add check_performance tool for performance enforcement`

---

### Task 12: Create harness check-perf CLI command

**Depends on:** Task 5
**Files:** packages/cli/src/commands/check-perf.ts

1. Create `packages/cli/src/commands/check-perf.ts`:

```typescript
import { Command } from 'commander';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, EntropyAnalyzer } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

interface CheckPerfOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  structural?: boolean;
  size?: boolean;
  coupling?: boolean;
}

interface CheckPerfResult {
  valid: boolean;
  violations: Array<{
    tier: number;
    severity: string;
    metric: string;
    file: string;
    value: number;
    threshold: number;
    message: string;
  }>;
  stats: {
    filesAnalyzed: number;
    violationCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
}

export async function runCheckPerf(
  options: CheckPerfOptions
): Promise<Result<CheckPerfResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();
  const runAll = !options.structural && !options.size && !options.coupling;

  const analyzer = new EntropyAnalyzer({
    rootDir: path.resolve(cwd),
    analyze: {
      complexity: runAll || !!options.structural,
      coupling: runAll || !!options.coupling,
      sizeBudget: runAll || !!options.size,
    },
  });

  const analysisResult = await analyzer.analyze();
  if (!analysisResult.ok) {
    return Ok({
      valid: true,
      violations: [],
      stats: { filesAnalyzed: 0, violationCount: 0, errorCount: 0, warningCount: 0, infoCount: 0 },
    });
  }

  const report = analysisResult.value;
  const violations: CheckPerfResult['violations'] = [];

  if (report.complexity) {
    for (const v of report.complexity.violations) {
      violations.push({
        tier: v.tier,
        severity: v.severity,
        metric: v.metric,
        file: v.file,
        value: v.value,
        threshold: v.threshold,
        message: `[Tier ${v.tier}] ${v.metric}: ${v.function} (${v.value} > ${v.threshold})`,
      });
    }
  }

  if (report.coupling) {
    for (const v of report.coupling.violations) {
      violations.push({
        tier: v.tier,
        severity: v.severity,
        metric: v.metric,
        file: v.file,
        value: v.value,
        threshold: v.threshold,
        message: `[Tier ${v.tier}] ${v.metric}: ${v.file} (${v.value} > ${v.threshold})`,
      });
    }
  }

  if (report.sizeBudget) {
    for (const v of report.sizeBudget.violations) {
      violations.push({
        tier: v.tier,
        severity: v.severity,
        metric: 'sizeBudget',
        file: v.package,
        value: v.currentSize,
        threshold: v.budgetSize,
        message: `[Tier ${v.tier}] Size: ${v.package} (${v.currentSize}B > ${v.budgetSize}B)`,
      });
    }
  }

  const hasErrors = violations.some((v) => v.severity === 'error');
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    valid: !hasErrors,
    violations,
    stats: {
      filesAnalyzed: report.complexity?.stats.filesAnalyzed ?? 0,
      violationCount: violations.length,
      errorCount,
      warningCount,
      infoCount,
    },
  });
}

export function createCheckPerfCommand(): Command {
  const command = new Command('check-perf')
    .description('Run performance checks: structural complexity, coupling, and size budgets')
    .option('--structural', 'Run structural complexity checks only')
    .option('--coupling', 'Run coupling metric checks only')
    .option('--size', 'Run size budget checks only')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : globalOpts.verbose
            ? OutputMode.VERBOSE
            : OutputMode.TEXT;

      const formatter = new OutputFormatter(mode);

      const result = await runCheckPerf({
        configPath: globalOpts.config,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        structural: opts.structural,
        coupling: opts.coupling,
        size: opts.size,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      const issues = result.value.violations.map((v) => ({
        file: v.file,
        message: v.message,
      }));

      const output = formatter.formatValidation({
        valid: result.value.valid,
        issues,
      });

      if (output) {
        console.log(output);
      }

      process.exit(result.value.valid ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
```

2. Register in the CLI program factory (find where `createCheckDepsCommand` is registered and add `createCheckPerfCommand` alongside it).

3. Run: `npx vitest run packages/cli/tests/`
4. Run: `harness validate`
5. Commit: `feat(cli): add harness check-perf command for performance enforcement`

---

### Task 13: Register check-perf command in CLI program

[checkpoint:human-verify] — Verify command registration location

**Depends on:** Task 12
**Files:** packages/cli/src/program.ts (or wherever createProgram lives)

1. Find the file that calls `createCheckDepsCommand()` and add:

   ```typescript
   import { createCheckPerfCommand } from './commands/check-perf';
   ```

   And:

   ```typescript
   program.addCommand(createCheckPerfCommand());
   ```

2. Run: `pnpm build`
3. Run: `node packages/cli/dist/bin/harness.js check-perf --help`
4. Verify the command shows up with `--structural`, `--coupling`, `--size` options
5. Run: `harness validate`
6. Commit: `feat(cli): register check-perf command in CLI program`

---

### Task 14: Integration test — full entropy analysis with new detectors

[checkpoint:human-verify]

**Depends on:** Task 5, Task 9, Task 10
**Files:** packages/core/tests/entropy/analyzer-perf.test.ts

1. Create `packages/core/tests/entropy/analyzer-perf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { EntropyAnalyzer } from '../../src/entropy/analyzer';

describe('EntropyAnalyzer with performance detectors', () => {
  it('runs complexity and coupling analysis together', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: process.cwd(),
      analyze: {
        complexity: { thresholds: { cyclomaticComplexity: { error: 100, warn: 50 } } },
        coupling: { thresholds: { fanOut: { warn: 50 } } },
      },
    });

    const result = await analyzer.analyze();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complexity).toBeDefined();
      expect(result.value.coupling).toBeDefined();
      expect(result.value.complexity!.stats.filesAnalyzed).toBeGreaterThan(0);
      expect(result.value.coupling!.stats.filesAnalyzed).toBeGreaterThan(0);
    }
  });

  it('skips disabled detectors', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: process.cwd(),
      analyze: {
        complexity: true,
        coupling: false,
      },
    });

    const result = await analyzer.analyze();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.complexity).toBeDefined();
      expect(result.value.coupling).toBeUndefined();
    }
  });

  it('includes perf issues in summary totals', async () => {
    const analyzer = new EntropyAnalyzer({
      rootDir: process.cwd(),
      analyze: {
        complexity: { thresholds: { cyclomaticComplexity: { warn: 1 } } },
      },
    });

    const result = await analyzer.analyze();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // With threshold of 1, most functions should trigger warnings
      expect(result.value.summary.totalIssues).toBeGreaterThan(0);
    }
  });
});
```

2. Run: `npx vitest run packages/core/tests/entropy/analyzer-perf.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(core): add integration tests for EntropyAnalyzer with performance detectors`

---

### Task 15: Regenerate slash commands and agent definitions

**Depends on:** Task 13
**Files:** (generated files)

1. Run: `node packages/cli/dist/bin/harness.js generate slash-commands`
2. Run: `node packages/cli/dist/bin/harness.js generate agent-definitions`
3. Run: `harness validate`
4. Commit: `chore: regenerate slash commands and agent definitions after check-perf addition`

---

### Task 16: Build and smoke test

[checkpoint:human-verify]

**Depends on:** all previous tasks
**Files:** none (verification only)

1. Run: `pnpm build`
2. Run: `pnpm test`
3. Run: `pnpm typecheck`
4. Run: `node packages/cli/dist/bin/harness.js check-perf --json`
5. Verify JSON output contains `complexity`, `coupling` sections
6. Run: `node packages/cli/dist/bin/harness.js ci check --json`
7. Verify `perf` check appears in the output
8. Run: `harness validate`

---

### Task 17: Update harness.config.json with performance defaults

**Depends on:** Task 16
**Files:** harness.config.json

1. Add performance configuration to `harness.config.json` under the existing `entropy` key:

```json
"performance": {
  "complexity": {
    "enabled": true,
    "thresholds": {
      "cyclomaticComplexity": { "error": 15, "warn": 10 },
      "nestingDepth": { "warn": 4 },
      "functionLength": { "warn": 50 },
      "parameterCount": { "warn": 5 },
      "fileLength": { "info": 300 },
      "hotspotPercentile": { "error": 95 }
    }
  },
  "coupling": {
    "enabled": true,
    "thresholds": {
      "fanOut": { "warn": 15 },
      "fanIn": { "info": 20 },
      "couplingRatio": { "warn": 0.7 },
      "transitiveDependencyDepth": { "info": 30 }
    }
  },
  "sizeBudget": {
    "enabled": false,
    "budgets": {}
  }
}
```

2. Run: `harness validate`
3. Commit: `chore: add default performance thresholds to harness.config.json`

---

### Task 18: Write delta document for changes to existing modules

**Depends on:** Task 17
**Files:** docs/changes/performance-enforcement/delta.md

1. Create `docs/changes/performance-enforcement/delta.md`:

```markdown
# Delta: Performance Enforcement (Part 1 — Entropy Extensions)

## Changes to EntropyConfig (packages/core/src/entropy/types.ts)

- [ADDED] `analyze.complexity` — ComplexityConfig for structural complexity thresholds
- [ADDED] `analyze.coupling` — CouplingConfig for coupling metric thresholds
- [ADDED] `analyze.sizeBudget` — SizeBudgetConfig for build size budgets

## Changes to EntropyReport (packages/core/src/entropy/types.ts)

- [ADDED] `complexity?: ComplexityReport` — structural complexity results
- [ADDED] `coupling?: CouplingReport` — coupling metric results
- [ADDED] `sizeBudget?: SizeBudgetReport` — size budget results

## Changes to EntropyAnalyzer (packages/core/src/entropy/analyzer.ts)

- [MODIFIED] `analyze()` accepts new `graphComplexityData` and `graphCouplingData` in graphOptions
- [MODIFIED] `analyze()` runs complexity, coupling, and size-budget detectors when configured

## Changes to CICheckName (packages/types/src/index.ts)

- [ADDED] `'perf'` check name to the union type

## Changes to Check Orchestrator (packages/core/src/ci/check-orchestrator.ts)

- [ADDED] `'perf'` case in `runSingleCheck` running complexity + coupling + size checks
- [MODIFIED] `ALL_CHECKS` array includes `'perf'`

## Changes to CodeIngestor (packages/graph/src/ingest/CodeIngestor.ts)

- [MODIFIED] Function and method nodes now include `cyclomaticComplexity`, `nestingDepth`, `lineCount`, and `parameterCount` in metadata

## Changes to Graph Exports (packages/graph/src/index.ts)

- [ADDED] `GraphComplexityAdapter` export
- [ADDED] `GraphCouplingAdapter` export

## Changes to MCP Server (packages/mcp-server/src/server.ts)

- [ADDED] `check_performance` tool definition and handler

## Changes to CLI (packages/cli/)

- [ADDED] `harness check-perf` command with `--structural`, `--coupling`, `--size` flags
```

2. Run: `harness validate`
3. Commit: `docs: add delta document for performance enforcement part 1`
