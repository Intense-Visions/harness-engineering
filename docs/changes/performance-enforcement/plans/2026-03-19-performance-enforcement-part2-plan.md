# Plan: Performance Enforcement — Part 2 (Runtime Benchmarks, Skills, Persona, Lint Rules)

**Date:** 2026-03-19
**Spec:** docs/changes/performance-enforcement/proposal.md
**Estimated tasks:** 16
**Estimated time:** 55 minutes

## Goal

Runtime benchmark infrastructure with baseline management and regression detection is implemented. The performance-guardian persona, harness-perf skill, harness-perf-tdd skill, and ESLint perf lint rules are created — completing all 6 phases of the performance enforcement spec.

## Observable Truths (Acceptance Criteria)

1. When `BaselineManager.load()` is called on a valid baselines file, the system shall return parsed benchmark baselines with opsPerSec, meanMs, p99Ms, and marginOfError per benchmark.
2. When `BaselineManager.save()` is called, the system shall write `.harness/perf/baselines.json` with version, updatedAt, updatedFrom, and benchmarks fields.
3. When `RegressionDetector.detect()` compares results against baselines, the system shall classify >10% regression as Tier 2 warning and >5% on critical paths as Tier 1 error. Regressions within `marginOfError × 2` shall not be flagged.
4. When `CriticalPathResolver.resolve()` is called, the system shall return functions from `@perf-critical` annotations merged with graph-inferred high-fan-in functions.
5. `npx vitest run packages/core/tests/performance/` passes with all tests.
6. `agents/personas/performance-guardian.yaml` exists and follows persona v1 schema.
7. `agents/skills/claude-code/harness-perf/skill.yaml` and `SKILL.md` exist with analyze/benchmark/report/enforce phases.
8. `agents/skills/claude-code/harness-perf-tdd/skill.yaml` and `SKILL.md` exist with red/green/refactor/validate phases.
9. 3 new MCP tools (`get_perf_baselines`, `update_perf_baselines`, `get_critical_paths`) are registered in the MCP server.
10. `harness perf --help` shows bench, baselines, report, critical-paths subcommands.
11. `harness validate` passes after all changes.

## File Map

```
CREATE packages/core/src/performance/types.ts
CREATE packages/core/src/performance/baseline-manager.ts
CREATE packages/core/src/performance/regression-detector.ts
CREATE packages/core/src/performance/critical-path.ts
CREATE packages/core/src/performance/index.ts
CREATE packages/core/tests/performance/baseline-manager.test.ts
CREATE packages/core/tests/performance/regression-detector.test.ts
CREATE packages/core/tests/performance/critical-path.test.ts
CREATE packages/cli/src/commands/perf.ts
CREATE agents/personas/performance-guardian.yaml
CREATE agents/skills/claude-code/harness-perf/skill.yaml
CREATE agents/skills/claude-code/harness-perf/SKILL.md
CREATE agents/skills/claude-code/harness-perf-tdd/skill.yaml
CREATE agents/skills/claude-code/harness-perf-tdd/SKILL.md
MODIFY packages/core/src/index.ts (add performance re-export)
MODIFY packages/mcp-server/src/tools/performance.ts (add 3 MCP tools)
MODIFY packages/mcp-server/src/server.ts (register new tools)
MODIFY packages/cli/src/index.ts (register perf command)
MODIFY agents/personas/code-reviewer.yaml (add complexity observation)
MODIFY agents/personas/codebase-health-analyst.yaml (add hotspot tracking)
```

## Tasks

### Task 1: Define performance types

**Depends on:** none
**Files:** packages/core/src/performance/types.ts

1. Create `packages/core/src/performance/types.ts`:

```typescript
export interface BenchmarkResult {
  name: string;
  file: string;
  opsPerSec: number;
  meanMs: number;
  p99Ms: number;
  marginOfError: number;
}

export interface Baseline {
  opsPerSec: number;
  meanMs: number;
  p99Ms: number;
  marginOfError: number;
}

export interface BaselinesFile {
  version: 1;
  updatedAt: string;
  updatedFrom: string;
  benchmarks: Record<string, Baseline>;
}

export interface RegressionResult {
  benchmark: string;
  current: BenchmarkResult;
  baseline: Baseline;
  regressionPct: number;
  isCriticalPath: boolean;
  tier: 1 | 2 | 3;
  severity: 'error' | 'warning' | 'info';
  withinNoise: boolean;
}

export interface RegressionReport {
  regressions: RegressionResult[];
  improvements: Array<{
    benchmark: string;
    improvementPct: number;
  }>;
  stats: {
    benchmarksCompared: number;
    regressionCount: number;
    improvementCount: number;
    newBenchmarks: number;
  };
}

export interface CriticalPathEntry {
  file: string;
  function: string;
  source: 'annotation' | 'graph-inferred';
  fanIn?: number;
}

export interface CriticalPathSet {
  entries: CriticalPathEntry[];
  stats: {
    annotated: number;
    graphInferred: number;
    total: number;
  };
}
```

2. Run: `harness validate`
3. Commit: `feat(core): define performance module types`

---

### Task 2: Create BaselineManager with tests (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/performance/baseline-manager.ts, packages/core/tests/performance/baseline-manager.test.ts

1. Create test file `packages/core/tests/performance/baseline-manager.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaselineManager } from '../../src/performance/baseline-manager';
import type { BaselinesFile, BenchmarkResult } from '../../src/performance/types';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('BaselineManager', () => {
  let testDir: string;
  let manager: BaselineManager;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'baseline-test-'));
    manager = new BaselineManager(testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty baselines when file does not exist', () => {
    const baselines = manager.load();
    expect(baselines).toBeNull();
  });

  it('loads valid baselines file', () => {
    const data: BaselinesFile = {
      version: 1,
      updatedAt: '2026-03-19T00:00:00Z',
      updatedFrom: 'abc123',
      benchmarks: {
        'test::bench1': { opsPerSec: 1000, meanMs: 1.0, p99Ms: 2.0, marginOfError: 0.05 },
      },
    };
    mkdirSync(join(testDir, '.harness', 'perf'), { recursive: true });
    writeFileSync(join(testDir, '.harness', 'perf', 'baselines.json'), JSON.stringify(data));

    const loaded = manager.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.benchmarks['test::bench1']!.opsPerSec).toBe(1000);
  });

  it('saves baselines to disk', () => {
    const results: BenchmarkResult[] = [
      {
        name: 'bench1',
        file: 'test.bench.ts',
        opsPerSec: 500,
        meanMs: 2.0,
        p99Ms: 3.0,
        marginOfError: 0.03,
      },
    ];

    manager.save(results, 'def456');

    const raw = readFileSync(join(testDir, '.harness', 'perf', 'baselines.json'), 'utf-8');
    const parsed = JSON.parse(raw) as BaselinesFile;
    expect(parsed.version).toBe(1);
    expect(parsed.updatedFrom).toBe('def456');
    expect(parsed.benchmarks['test.bench.ts::bench1']!.opsPerSec).toBe(500);
  });

  it('updates existing baselines preserving other entries', () => {
    const existing: BaselinesFile = {
      version: 1,
      updatedAt: '2026-03-18T00:00:00Z',
      updatedFrom: 'old',
      benchmarks: {
        'old.bench.ts::oldBench': { opsPerSec: 100, meanMs: 10, p99Ms: 20, marginOfError: 0.1 },
      },
    };
    mkdirSync(join(testDir, '.harness', 'perf'), { recursive: true });
    writeFileSync(join(testDir, '.harness', 'perf', 'baselines.json'), JSON.stringify(existing));

    const results: BenchmarkResult[] = [
      {
        name: 'newBench',
        file: 'new.bench.ts',
        opsPerSec: 200,
        meanMs: 5,
        p99Ms: 8,
        marginOfError: 0.04,
      },
    ];
    manager.save(results, 'new123');

    const loaded = manager.load()!;
    expect(loaded.benchmarks['old.bench.ts::oldBench']).toBeDefined();
    expect(loaded.benchmarks['new.bench.ts::newBench']).toBeDefined();
    expect(loaded.updatedFrom).toBe('new123');
  });

  it('prunes stale baselines', () => {
    const existing: BaselinesFile = {
      version: 1,
      updatedAt: '',
      updatedFrom: '',
      benchmarks: {
        'a.bench.ts::keep': { opsPerSec: 1, meanMs: 1, p99Ms: 1, marginOfError: 0 },
        'b.bench.ts::remove': { opsPerSec: 1, meanMs: 1, p99Ms: 1, marginOfError: 0 },
      },
    };
    mkdirSync(join(testDir, '.harness', 'perf'), { recursive: true });
    writeFileSync(join(testDir, '.harness', 'perf', 'baselines.json'), JSON.stringify(existing));

    manager.prune(['a.bench.ts']);

    const loaded = manager.load()!;
    expect(loaded.benchmarks['a.bench.ts::keep']).toBeDefined();
    expect(loaded.benchmarks['b.bench.ts::remove']).toBeUndefined();
  });
});
```

2. Run test, observe failure
3. Create `packages/core/src/performance/baseline-manager.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BaselinesFile, BenchmarkResult, Baseline } from './types';

export class BaselineManager {
  private readonly baselinesPath: string;

  constructor(private readonly projectRoot: string) {
    this.baselinesPath = join(projectRoot, '.harness', 'perf', 'baselines.json');
  }

  load(): BaselinesFile | null {
    if (!existsSync(this.baselinesPath)) return null;
    try {
      const raw = readFileSync(this.baselinesPath, 'utf-8');
      return JSON.parse(raw) as BaselinesFile;
    } catch {
      return null;
    }
  }

  save(results: BenchmarkResult[], commitHash: string): void {
    const existing = this.load();
    const benchmarks: Record<string, Baseline> = existing?.benchmarks ?? {};

    for (const r of results) {
      const key = `${r.file}::${r.name}`;
      benchmarks[key] = {
        opsPerSec: r.opsPerSec,
        meanMs: r.meanMs,
        p99Ms: r.p99Ms,
        marginOfError: r.marginOfError,
      };
    }

    const data: BaselinesFile = {
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedFrom: commitHash,
      benchmarks,
    };

    const dir = join(this.projectRoot, '.harness', 'perf');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.baselinesPath, JSON.stringify(data, null, 2));
  }

  prune(existingBenchFiles: string[]): void {
    const data = this.load();
    if (!data) return;

    const pruned: Record<string, Baseline> = {};
    for (const [key, value] of Object.entries(data.benchmarks)) {
      const file = key.split('::')[0]!;
      if (existingBenchFiles.some((f) => file.endsWith(f) || f.endsWith(file))) {
        pruned[key] = value;
      }
    }

    data.benchmarks = pruned;
    const dir = join(this.projectRoot, '.harness', 'perf');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.baselinesPath, JSON.stringify(data, null, 2));
  }
}
```

4. Run test, observe pass
5. Run: `harness validate`
6. Commit: `feat(core): add BaselineManager for benchmark baseline persistence`

---

### Task 3: Create RegressionDetector with tests (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/performance/regression-detector.ts, packages/core/tests/performance/regression-detector.test.ts

1. Create test file `packages/core/tests/performance/regression-detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RegressionDetector } from '../../src/performance/regression-detector';
import type { BenchmarkResult, Baseline, CriticalPathSet } from '../../src/performance/types';

describe('RegressionDetector', () => {
  const detector = new RegressionDetector();

  const baseline: Baseline = { opsPerSec: 1000, meanMs: 1.0, p99Ms: 2.0, marginOfError: 0.03 };
  const criticalPaths: CriticalPathSet = {
    entries: [{ file: 'hot.bench.ts', function: 'hotFn', source: 'annotation' }],
    stats: { annotated: 1, graphInferred: 0, total: 1 },
  };

  it('detects >10% regression as Tier 2 warning', () => {
    const current: BenchmarkResult = {
      name: 'bench1',
      file: 'test.bench.ts',
      opsPerSec: 850,
      meanMs: 1.18,
      p99Ms: 2.5,
      marginOfError: 0.03,
    };
    const baselines = { 'test.bench.ts::bench1': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0]!.tier).toBe(2);
    expect(report.regressions[0]!.severity).toBe('warning');
    expect(report.regressions[0]!.regressionPct).toBeGreaterThan(10);
  });

  it('detects >5% regression on critical path as Tier 1 error', () => {
    const current: BenchmarkResult = {
      name: 'hotFn',
      file: 'hot.bench.ts',
      opsPerSec: 920,
      meanMs: 1.09,
      p99Ms: 2.2,
      marginOfError: 0.03,
    };
    const baselines = { 'hot.bench.ts::hotFn': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    expect(report.regressions).toHaveLength(1);
    expect(report.regressions[0]!.tier).toBe(1);
    expect(report.regressions[0]!.severity).toBe('error');
    expect(report.regressions[0]!.isCriticalPath).toBe(true);
  });

  it('does not flag regressions within noise margin', () => {
    const current: BenchmarkResult = {
      name: 'bench1',
      file: 'test.bench.ts',
      opsPerSec: 950,
      meanMs: 1.05,
      p99Ms: 2.1,
      marginOfError: 0.03,
    };
    const baselines = { 'test.bench.ts::bench1': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    const flagged = report.regressions.filter((r) => !r.withinNoise);
    expect(flagged).toHaveLength(0);
  });

  it('reports improvements', () => {
    const current: BenchmarkResult = {
      name: 'bench1',
      file: 'test.bench.ts',
      opsPerSec: 1200,
      meanMs: 0.83,
      p99Ms: 1.5,
      marginOfError: 0.02,
    };
    const baselines = { 'test.bench.ts::bench1': baseline };

    const report = detector.detect([current], baselines, criticalPaths);
    expect(report.improvements).toHaveLength(1);
    expect(report.improvements[0]!.improvementPct).toBeGreaterThan(0);
  });

  it('counts new benchmarks without baselines', () => {
    const current: BenchmarkResult = {
      name: 'newBench',
      file: 'new.bench.ts',
      opsPerSec: 500,
      meanMs: 2.0,
      p99Ms: 3.0,
      marginOfError: 0.05,
    };

    const report = detector.detect([current], {}, criticalPaths);
    expect(report.stats.newBenchmarks).toBe(1);
    expect(report.regressions).toHaveLength(0);
  });
});
```

2. Run test, observe failure
3. Create `packages/core/src/performance/regression-detector.ts`:

```typescript
import type {
  BenchmarkResult,
  Baseline,
  CriticalPathSet,
  RegressionReport,
  RegressionResult,
} from './types';

export class RegressionDetector {
  detect(
    results: BenchmarkResult[],
    baselines: Record<string, Baseline>,
    criticalPaths: CriticalPathSet
  ): RegressionReport {
    const regressions: RegressionResult[] = [];
    const improvements: Array<{ benchmark: string; improvementPct: number }> = [];
    let newBenchmarks = 0;

    for (const current of results) {
      const key = `${current.file}::${current.name}`;
      const baseline = baselines[key];

      if (!baseline) {
        newBenchmarks++;
        continue;
      }

      const regressionPct = ((baseline.opsPerSec - current.opsPerSec) / baseline.opsPerSec) * 100;
      const noiseThreshold = (baseline.marginOfError + current.marginOfError) * 100;
      const withinNoise = Math.abs(regressionPct) <= noiseThreshold;

      if (regressionPct < 0) {
        // Improvement
        improvements.push({ benchmark: key, improvementPct: Math.abs(regressionPct) });
        continue;
      }

      const isCriticalPath = criticalPaths.entries.some(
        (e) => current.file.includes(e.file) || current.name === e.function
      );

      let tier: 1 | 2 | 3;
      let severity: 'error' | 'warning' | 'info';

      if (isCriticalPath && regressionPct > 5 && !withinNoise) {
        tier = 1;
        severity = 'error';
      } else if (regressionPct > 10 && !withinNoise) {
        tier = 2;
        severity = 'warning';
      } else {
        tier = 3;
        severity = 'info';
      }

      regressions.push({
        benchmark: key,
        current,
        baseline,
        regressionPct,
        isCriticalPath,
        tier,
        severity,
        withinNoise,
      });
    }

    return {
      regressions,
      improvements,
      stats: {
        benchmarksCompared: results.length - newBenchmarks,
        regressionCount: regressions.filter((r) => !r.withinNoise).length,
        improvementCount: improvements.length,
        newBenchmarks,
      },
    };
  }
}
```

4. Run test, observe pass
5. Run: `harness validate`
6. Commit: `feat(core): add RegressionDetector for benchmark regression analysis`

---

### Task 4: Create CriticalPathResolver with tests (TDD)

**Depends on:** Task 1
**Files:** packages/core/src/performance/critical-path.ts, packages/core/tests/performance/critical-path.test.ts

1. Create test file `packages/core/tests/performance/critical-path.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CriticalPathResolver } from '../../src/performance/critical-path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CriticalPathResolver', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'critical-path-test-'));
    mkdirSync(join(testDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('finds @perf-critical annotations in source files', async () => {
    writeFileSync(
      join(testDir, 'src', 'hot.ts'),
      `
/** @perf-critical */
export function processData() { return 1; }

export function coldFunction() { return 2; }
`
    );

    const resolver = new CriticalPathResolver(testDir);
    const result = await resolver.resolve();

    const annotated = result.entries.filter((e) => e.source === 'annotation');
    expect(annotated.length).toBe(1);
    expect(annotated[0]!.function).toBe('processData');
    expect(result.stats.annotated).toBe(1);
  });

  it('finds // @perf-critical comment annotations', async () => {
    writeFileSync(
      join(testDir, 'src', 'handler.ts'),
      `
// @perf-critical
export function handleRequest() { return 1; }
`
    );

    const resolver = new CriticalPathResolver(testDir);
    const result = await resolver.resolve();
    expect(result.entries.some((e) => e.function === 'handleRequest')).toBe(true);
  });

  it('merges graph data with annotations', async () => {
    writeFileSync(
      join(testDir, 'src', 'a.ts'),
      `
/** @perf-critical */
export function annotatedFn() {}
`
    );

    const graphData = {
      highFanInFunctions: [{ file: 'src/b.ts', function: 'graphFn', fanIn: 25 }],
    };

    const resolver = new CriticalPathResolver(testDir);
    const result = await resolver.resolve(graphData);
    expect(result.entries).toHaveLength(2);
    expect(result.stats.annotated).toBe(1);
    expect(result.stats.graphInferred).toBe(1);
  });

  it('deduplicates entries from both sources', async () => {
    writeFileSync(
      join(testDir, 'src', 'shared.ts'),
      `
/** @perf-critical */
export function sharedFn() {}
`
    );

    const graphData = {
      highFanInFunctions: [{ file: 'src/shared.ts', function: 'sharedFn', fanIn: 30 }],
    };

    const resolver = new CriticalPathResolver(testDir);
    const result = await resolver.resolve(graphData);
    expect(result.entries).toHaveLength(1);
    expect(result.stats.total).toBe(1);
  });

  it('returns empty set when no annotations and no graph data', async () => {
    writeFileSync(join(testDir, 'src', 'plain.ts'), 'export function fn() {}');

    const resolver = new CriticalPathResolver(testDir);
    const result = await resolver.resolve();
    expect(result.entries).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });
});
```

2. Run test, observe failure
3. Create `packages/core/src/performance/critical-path.ts`:

```typescript
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CriticalPathEntry, CriticalPathSet } from './types';

export interface GraphCriticalPathData {
  highFanInFunctions: Array<{ file: string; function: string; fanIn: number }>;
}

export class CriticalPathResolver {
  constructor(private readonly projectRoot: string) {}

  async resolve(graphData?: GraphCriticalPathData): Promise<CriticalPathSet> {
    const annotated = this.scanAnnotations();
    const graphInferred =
      graphData?.highFanInFunctions.map((f) => ({
        file: f.file,
        function: f.function,
        source: 'graph-inferred' as const,
        fanIn: f.fanIn,
      })) ?? [];

    // Merge and deduplicate
    const seen = new Set<string>();
    const entries: CriticalPathEntry[] = [];

    for (const entry of annotated) {
      const key = `${entry.file}::${entry.function}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push(entry);
      }
    }

    for (const entry of graphInferred) {
      const key = `${entry.file}::${entry.function}`;
      if (!seen.has(key)) {
        seen.add(key);
        entries.push(entry);
      }
    }

    return {
      entries,
      stats: {
        annotated: annotated.length,
        graphInferred: graphInferred.filter((g) => {
          const key = `${g.file}::${g.function}`;
          return !annotated.some((a) => `${a.file}::${a.function}` === key);
        }).length,
        total: entries.length,
      },
    };
  }

  private scanAnnotations(): CriticalPathEntry[] {
    const entries: CriticalPathEntry[] = [];
    this.walkDir(this.projectRoot, entries);
    return entries;
  }

  private walkDir(dir: string, entries: CriticalPathEntry[]): void {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }

    for (const item of items) {
      if (item === 'node_modules' || item === 'dist' || item === '.git') continue;
      const fullPath = join(dir, item);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          this.walkDir(fullPath, entries);
        } else if (/\.(ts|tsx|js|jsx)$/.test(item) && !item.endsWith('.d.ts')) {
          this.scanFile(fullPath, entries);
        }
      } catch {
        continue;
      }
    }
  }

  private scanFile(filePath: string, entries: CriticalPathEntry[]): void {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      return;
    }

    const lines = content.split('\n');
    const relPath = relative(this.projectRoot, filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes('@perf-critical')) {
        // Look at the next non-empty line for a function declaration
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j]!;
          const fnMatch = nextLine.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
          const methodMatch = nextLine.match(/(?:export\s+)?(?:const|let)\s+(\w+)\s*=/);
          const match = fnMatch || methodMatch;
          if (match) {
            entries.push({
              file: relPath,
              function: match[1]!,
              source: 'annotation',
            });
            break;
          }
        }
      }
    }
  }
}
```

4. Run test, observe pass
5. Run: `harness validate`
6. Commit: `feat(core): add CriticalPathResolver for @perf-critical annotations and graph inference`

---

### Task 5: Create performance module barrel export

**Depends on:** Task 2, Task 3, Task 4
**Files:** packages/core/src/performance/index.ts, packages/core/src/index.ts

1. Create `packages/core/src/performance/index.ts`:

```typescript
export { BaselineManager } from './baseline-manager';
export { RegressionDetector } from './regression-detector';
export { CriticalPathResolver } from './critical-path';
export type { GraphCriticalPathData } from './critical-path';

export type {
  BenchmarkResult,
  Baseline,
  BaselinesFile,
  RegressionResult,
  RegressionReport,
  CriticalPathEntry,
  CriticalPathSet,
} from './types';
```

2. Add to `packages/core/src/index.ts` after the entropy export:

```typescript
// Performance module
export * from './performance';
```

3. Run: `pnpm --filter @harness-engineering/core test`
4. Run: `harness validate`
5. Commit: `feat(core): export performance module from core barrel`

---

### Task 6: Add 3 new MCP tools for performance

**Depends on:** Task 5
**Files:** packages/mcp-server/src/tools/performance.ts, packages/mcp-server/src/server.ts

1. Add to `packages/mcp-server/src/tools/performance.ts` — 3 new tool definitions and handlers:

- `get_perf_baselines` — calls `BaselineManager.load()` and returns JSON
- `update_perf_baselines` — placeholder that returns instructions (actual bench requires CLI context)
- `get_critical_paths` — calls `CriticalPathResolver.resolve()` with optional graph data

2. Register all 3 in `packages/mcp-server/src/server.ts` TOOL_DEFINITIONS and TOOL_HANDLERS.

3. Update MCP server tests: tool count from 33 to 36.

4. Run: `pnpm --filter @harness-engineering/mcp-server test`
5. Run: `harness validate`
6. Commit: `feat(mcp): add get_perf_baselines, update_perf_baselines, get_critical_paths tools`

---

### Task 7: Create harness perf CLI subcommand group

**Depends on:** Task 5
**Files:** packages/cli/src/commands/perf.ts, packages/cli/src/index.ts

1. Create `packages/cli/src/commands/perf.ts` with subcommands:
   - `harness perf bench [glob]` — placeholder that logs instructions for running vitest bench
   - `harness perf baselines show` — loads and displays baselines
   - `harness perf baselines update` — placeholder with instructions
   - `harness perf report` — runs check-perf and displays formatted output
   - `harness perf critical-paths` — resolves and displays critical path set

2. Register in `packages/cli/src/index.ts`:

   ```typescript
   import { createPerfCommand } from './commands/perf';
   program.addCommand(createPerfCommand());
   ```

3. Run: `pnpm build`
4. Run: `node packages/cli/dist/bin/harness.js perf --help`
5. Run: `harness validate`
6. Commit: `feat(cli): add harness perf subcommand group`

---

### Task 8: Create performance-guardian persona

**Depends on:** none
**Files:** agents/personas/performance-guardian.yaml

1. Create `agents/personas/performance-guardian.yaml`:

```yaml
version: 1
name: Performance Guardian
description: Enforces performance budgets and detects regressions
role: Run structural complexity checks, coupling analysis, benchmark regression detection, and size budget enforcement on PRs and scheduled runs
skills:
  - harness-perf
  - harness-tdd
commands:
  - check-perf
  - perf
triggers:
  - event: on_pr
    conditions:
      paths:
        - 'src/**'
        - 'packages/**'
  - event: scheduled
    cron: '0 6 * * 1'
config:
  severity: error
  autoFix: false
  timeout: 300000
outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

2. Run: `harness validate`
3. Commit: `feat(personas): add performance-guardian persona`

---

### Task 9: Extend code-reviewer and codebase-health-analyst personas

**Depends on:** Task 8
**Files:** agents/personas/code-reviewer.yaml, agents/personas/codebase-health-analyst.yaml

1. Edit `agents/personas/code-reviewer.yaml` — add `check-perf` step:

```yaml
- command: check-perf
  when: on_pr
```

2. Edit `agents/personas/codebase-health-analyst.yaml` — add `harness-perf` skill and `check-perf` command:

```yaml
skills:
  - harness-hotspot-detector
  - harness-dependency-health
  - harness-impact-analysis
  - cleanup-dead-code
  - harness-perf
commands:
  - graph status
  - check-deps
  - check-perf
```

3. Run: `harness validate`
4. Commit: `feat(personas): extend code-reviewer and codebase-health-analyst with perf checks`

---

### Task 10: Create harness-perf skill

**Depends on:** none
**Files:** agents/skills/claude-code/harness-perf/skill.yaml, agents/skills/claude-code/harness-perf/SKILL.md

1. Create `agents/skills/claude-code/harness-perf/skill.yaml`:

```yaml
name: harness-perf
version: '1.0.0'
description: Performance enforcement and benchmark management
cognitive_mode: meticulous-verifier
triggers:
  - manual
  - on_pr
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-perf
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-perf
    path: string
type: rigid
phases:
  - name: analyze
    description: Run structural complexity and coupling checks
    required: true
  - name: benchmark
    description: Run benchmarks and detect regressions
    required: false
  - name: report
    description: Generate perf report with violations and recommendations
    required: true
  - name: enforce
    description: Apply tier-based gate decisions
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-verify
```

2. Create `agents/skills/claude-code/harness-perf/SKILL.md` — a complete rigid skill document covering:
   - When to use (after code changes, on PRs, for perf audits)
   - Iron Law: No merge with Tier 1 violations. No commit with complexity > error threshold.
   - Phase 1 ANALYZE: Run `harness check-perf --structural` and `harness check-perf --coupling`
   - Phase 2 BENCHMARK: If `.bench.ts` files exist, run `harness perf bench`, compare against baselines
   - Phase 3 REPORT: Format violations by tier, show hotspots, recommend actions
   - Phase 4 ENFORCE: Apply gate decisions — Tier 1 blocks, Tier 2 warns, Tier 3 informs
   - Harness integration: commands, MCP tools, graph refresh
   - Success criteria, gates, escalation

3. Run: `harness validate`
4. Commit: `feat(skills): add harness-perf skill for performance enforcement`

---

### Task 11: Create harness-perf-tdd skill

**Depends on:** none
**Files:** agents/skills/claude-code/harness-perf-tdd/skill.yaml, agents/skills/claude-code/harness-perf-tdd/SKILL.md

1. Create `agents/skills/claude-code/harness-perf-tdd/skill.yaml`:

```yaml
name: harness-perf-tdd
version: '1.0.0'
description: Performance-aware TDD with benchmark assertions in the red-green-refactor cycle
cognitive_mode: meticulous-implementer
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
cli:
  command: harness skill run harness-perf-tdd
  args:
    - name: path
      description: Project root path
      required: false
mcp:
  tool: run_skill
  input:
    skill: harness-perf-tdd
    path: string
type: rigid
phases:
  - name: red
    description: Write failing test and benchmark assertion
    required: true
  - name: green
    description: Implement to pass test and benchmark
    required: true
  - name: refactor
    description: Optimize while keeping both green
    required: false
  - name: validate
    description: Run harness check-perf and harness validate
    required: true
state:
  persistent: false
  files: []
depends_on:
  - harness-tdd
  - harness-perf
```

2. Create `agents/skills/claude-code/harness-perf-tdd/SKILL.md` — extending harness-tdd with:
   - RED: Write failing test + `.bench.ts` benchmark assertion (e.g., "must complete in < 5ms")
   - GREEN: Implement to pass both test and benchmark
   - REFACTOR: Optimize performance while keeping tests green
   - VALIDATE: `harness check-perf` + `harness validate`

3. Run: `harness validate`
4. Commit: `feat(skills): add harness-perf-tdd skill for performance-aware TDD`

---

### Task 12: Create Gemini CLI skill parity for harness-perf and harness-perf-tdd

**Depends on:** Task 10, Task 11
**Files:** agents/skills/gemini-cli/harness-perf/skill.yaml, agents/skills/gemini-cli/harness-perf/SKILL.md, agents/skills/gemini-cli/harness-perf-tdd/skill.yaml, agents/skills/gemini-cli/harness-perf-tdd/SKILL.md

1. Copy Claude Code skill files to Gemini CLI, updating `platforms` and any platform-specific tool references.
2. Run: `harness validate`
3. Commit: `feat(skills): add Gemini CLI parity for harness-perf and harness-perf-tdd skills`

---

### Task 13: Build, test, and smoke test

[checkpoint:human-verify]

**Depends on:** Tasks 1-12
**Files:** none (verification only)

1. Run: `pnpm build`
2. Run: `pnpm --filter @harness-engineering/core test`
3. Run: `pnpm --filter @harness-engineering/graph test`
4. Run: `pnpm --filter @harness-engineering/mcp-server test`
5. Run: `node packages/cli/dist/bin/harness.js perf --help`
6. Run: `node packages/cli/dist/bin/harness.js check-perf --json`
7. Run: `harness validate`

---

### Task 14: Regenerate slash commands and agent definitions

**Depends on:** Task 13
**Files:** (generated files)

1. Run: `node packages/cli/dist/bin/harness.js generate slash-commands`
2. Run: `node packages/cli/dist/bin/harness.js generate agent-definitions`
3. Run: `harness validate`
4. Commit: `chore: regenerate slash commands and agent definitions after perf additions`

---

### Task 15: Update delta document for Part 2

**Depends on:** Task 14
**Files:** docs/changes/performance-enforcement/delta.md

1. Append Part 2 changes to the existing delta document:
   - [ADDED] `packages/core/src/performance/` module with BaselineManager, RegressionDetector, CriticalPathResolver
   - [ADDED] `performance-guardian` persona
   - [ADDED] `harness-perf` and `harness-perf-tdd` skills (both platforms)
   - [ADDED] 3 new MCP tools
   - [ADDED] `harness perf` CLI subcommand group
   - [MODIFIED] `code-reviewer` persona — added check-perf step
   - [MODIFIED] `codebase-health-analyst` persona — added harness-perf skill

2. Run: `harness validate`
3. Commit: `docs: update delta document for performance enforcement part 2`

---

### Task 16: Final state update and handoff

**Depends on:** Task 15
**Files:** .harness/state.json, .harness/handoff.json, .harness/learnings.md

1. Update `.harness/state.json` with all tasks complete
2. Update `.harness/handoff.json` with completion summary
3. Append session learnings to `.harness/learnings.md`
4. Commit: `chore: update harness state after performance enforcement completion`
