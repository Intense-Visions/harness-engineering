# Plan: Dashboard v1.1 Phase 1 -- Shared Types + New Gatherers

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard-v1.1/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Add all new shared types to `shared/types.ts` and implement five new gatherer modules (security, perf, arch, anomalies, blast-radius) with unit tests for each, following the existing v1 gatherer pattern.

## Observable Truths (Acceptance Criteria)

1. When `shared/types.ts` is imported, all 13 new interfaces are available: `CIData`, `CheckResult`, `SecurityData`, `SecurityFindingSummary`, `PerfData`, `PerfViolationSummary`, `ArchData`, `AnomalyData`, `AnomalyOutlier`, `AnomalyArticulationPoint`, `BlastRadiusData`, `BlastRadiusLayer`, `BlastRadiusNode`.
2. When `gatherSecurity` succeeds, the system shall return a `SecurityResult` with `valid`, `findings`, and `stats` fields matching the `SecurityData` shape.
3. When `gatherPerf` succeeds, the system shall return a `PerfResult` with `valid`, `violations`, and `stats` fields matching the `PerfData` shape.
4. When `gatherArch` succeeds, the system shall return an `ArchResult` with `passed`, `totalViolations`, `regressions`, and `newViolations` fields matching the `ArchData` shape.
5. When `gatherAnomalies` succeeds with a loaded graph, the system shall return an `AnomalyResult` with `outliers`, `articulationPoints`, and `overlapCount` fields matching the `AnomalyData` shape.
6. When `gatherBlastRadius` is called with a valid `nodeId`, the system shall return a `BlastRadiusResult` with `sourceNodeId`, `sourceName`, `layers`, and `summary` fields matching the `BlastRadiusData` shape.
7. If any gatherer's underlying data source throws, the system shall not throw -- it shall return `{ error: string }`.
8. `npx vitest run packages/dashboard/tests/server/gather/security.test.ts` passes with 3+ tests.
9. `npx vitest run packages/dashboard/tests/server/gather/perf.test.ts` passes with 3+ tests.
10. `npx vitest run packages/dashboard/tests/server/gather/arch.test.ts` passes with 3+ tests.
11. `npx vitest run packages/dashboard/tests/server/gather/anomalies.test.ts` passes with 3+ tests.
12. `npx vitest run packages/dashboard/tests/server/gather/blast-radius.test.ts` passes with 3+ tests.
13. `gather/index.ts` re-exports all 5 new gatherer functions alongside the existing 3.
14. `harness validate` passes.

## File Map

```
MODIFY packages/dashboard/src/shared/types.ts (add 13 new interfaces + result types)
CREATE packages/dashboard/src/server/gather/security.ts
CREATE packages/dashboard/src/server/gather/perf.ts
CREATE packages/dashboard/src/server/gather/arch.ts
CREATE packages/dashboard/src/server/gather/anomalies.ts
CREATE packages/dashboard/src/server/gather/blast-radius.ts
MODIFY packages/dashboard/src/server/gather/index.ts (add 5 new exports)
CREATE packages/dashboard/tests/server/gather/security.test.ts
CREATE packages/dashboard/tests/server/gather/perf.test.ts
CREATE packages/dashboard/tests/server/gather/arch.test.ts
CREATE packages/dashboard/tests/server/gather/anomalies.test.ts
CREATE packages/dashboard/tests/server/gather/blast-radius.test.ts
MODIFY packages/dashboard/package.json (add glob dependency)
```

## Tasks

### Task 1: Add shared types to types.ts

**Depends on:** none
**Files:** `packages/dashboard/src/shared/types.ts`

1. Open `packages/dashboard/src/shared/types.ts`.
2. Append the following types after the existing `SSEEvent` type (line 152), before the closing of the file:

```typescript
// --- CI types ---

export interface CIData {
  checks: CheckResult[];
  lastRun: string | null;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  errorCount: number;
  warningCount: number;
  details?: string;
}

// --- Security types ---

export interface SecurityData {
  valid: boolean;
  findings: SecurityFindingSummary[];
  stats: { filesScanned: number; errorCount: number; warningCount: number; infoCount: number };
}

export interface SecurityFindingSummary {
  ruleId: string;
  category: string;
  severity: string;
  file: string;
  line: number;
  message: string;
}

export interface SecurityError {
  error: string;
}

export type SecurityResult = SecurityData | SecurityError;

// --- Perf types ---

export interface PerfData {
  valid: boolean;
  violations: PerfViolationSummary[];
  stats: { filesAnalyzed: number; violationCount: number };
}

export interface PerfViolationSummary {
  metric: string;
  file: string;
  value: number;
  threshold: number;
  severity: string;
}

export interface PerfError {
  error: string;
}

export type PerfResult = PerfData | PerfError;

// --- Architecture types ---

export interface ArchData {
  passed: boolean;
  totalViolations: number;
  regressions: { category: string; delta: number }[];
  newViolations: { file: string; detail: string; severity: string }[];
}

export interface ArchError {
  error: string;
}

export type ArchResult = ArchData | ArchError;

// --- Anomaly types ---

export interface AnomalyData {
  outliers: AnomalyOutlier[];
  articulationPoints: AnomalyArticulationPoint[];
  overlapCount: number;
}

export interface AnomalyOutlier {
  nodeId: string;
  name: string;
  type: string;
  metric: string;
  value: number;
  zScore: number;
}

export interface AnomalyArticulationPoint {
  nodeId: string;
  name: string;
  componentsIfRemoved: number;
  dependentCount: number;
}

export interface AnomalyUnavailable {
  available: false;
  reason: string;
}

export type AnomalyResult = AnomalyData | AnomalyUnavailable;

// --- Blast radius types ---

export interface BlastRadiusData {
  sourceNodeId: string;
  sourceName: string;
  layers: BlastRadiusLayer[];
  summary: {
    totalAffected: number;
    maxDepth: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
  };
}

export interface BlastRadiusLayer {
  depth: number;
  nodes: BlastRadiusNode[];
}

export interface BlastRadiusNode {
  nodeId: string;
  name: string;
  type: string;
  probability: number;
  parentId: string;
}

export interface BlastRadiusError {
  error: string;
}

export type BlastRadiusResult = BlastRadiusData | BlastRadiusError;
```

3. Run: `cd packages/dashboard && npx tsc --noEmit`
4. Run: `harness validate`
5. Commit: `feat(dashboard): add v1.1 shared types for CI, security, perf, arch, anomaly, and blast radius`

---

### Task 2: Add glob dependency and implement security gatherer (TDD)

**Depends on:** Task 1
**Files:** `packages/dashboard/package.json`, `packages/dashboard/tests/server/gather/security.test.ts`, `packages/dashboard/src/server/gather/security.ts`

1. Add `glob` dependency:

   ```bash
   cd packages/dashboard && pnpm add glob
   ```

2. Create test file `packages/dashboard/tests/server/gather/security.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfigureForProject = vi.fn();
const mockScanFiles = vi.fn();

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );
  return {
    ...actual,
    SecurityScanner: class MockSecurityScanner {
      configureForProject = mockConfigureForProject;
      scanFiles = mockScanFiles;
    },
  };
});

vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue(['/project/src/a.ts', '/project/src/b.ts']),
}));

import { gatherSecurity } from '../../../src/server/gather/security';

describe('gatherSecurity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns security data when scan succeeds with no findings', async () => {
    mockScanFiles.mockResolvedValue({
      findings: [],
      scannedFiles: 2,
      rulesApplied: 10,
      externalToolsUsed: [],
      coverage: 'baseline',
    });

    const result = await gatherSecurity('/project');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.valid).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.stats.filesScanned).toBe(2);
    expect(result.stats.errorCount).toBe(0);
  });

  it('returns findings mapped to SecurityFindingSummary shape', async () => {
    mockScanFiles.mockResolvedValue({
      findings: [
        {
          ruleId: 'SEC-SEC-001',
          ruleName: 'hardcoded-secret',
          category: 'secrets',
          severity: 'error',
          confidence: 'high',
          file: '/project/src/config.ts',
          line: 10,
          match: 'const API_KEY = "abc123"',
          context: 'const API_KEY = "abc123"',
          message: 'Hardcoded secret detected',
          remediation: 'Use environment variables',
        },
      ],
      scannedFiles: 2,
      rulesApplied: 10,
      externalToolsUsed: [],
      coverage: 'baseline',
    });

    const result = await gatherSecurity('/project');

    if ('error' in result) return;
    expect(result.valid).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual({
      ruleId: 'SEC-SEC-001',
      category: 'secrets',
      severity: 'error',
      file: '/project/src/config.ts',
      line: 10,
      message: 'Hardcoded secret detected',
    });
    expect(result.stats.errorCount).toBe(1);
  });

  it('returns error when scanner throws', async () => {
    mockScanFiles.mockRejectedValue(new Error('Scanner crashed'));

    const result = await gatherSecurity('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Scanner crashed');
  });
});
```

3. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/security.test.ts`
4. Observe failure: `gatherSecurity` is not defined.

5. Create implementation `packages/dashboard/src/server/gather/security.ts`:

```typescript
import { SecurityScanner } from '@harness-engineering/core';
import { glob } from 'glob';
import type { SecurityResult } from '../../shared/types';

const SCAN_PATTERN = '**/*.{ts,tsx,js,jsx,go,py,java,rb}';
const SCAN_IGNORE = ['**/node_modules/**', '**/dist/**', '**/*.test.ts', '**/fixtures/**'];

/**
 * Run a security scan on the project and return a summary.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherSecurity(projectPath: string): Promise<SecurityResult> {
  try {
    const scanner = new SecurityScanner();
    scanner.configureForProject(projectPath);

    const filesToScan = await glob(SCAN_PATTERN, {
      cwd: projectPath,
      absolute: true,
      ignore: SCAN_IGNORE,
    });

    const result = await scanner.scanFiles(filesToScan);

    const errorCount = result.findings.filter((f) => f.severity === 'error').length;
    const warningCount = result.findings.filter((f) => f.severity === 'warning').length;
    const infoCount = result.findings.filter((f) => f.severity === 'info').length;
    const hasErrors = errorCount > 0;

    return {
      valid: !hasErrors,
      findings: result.findings.map((f) => ({
        ruleId: f.ruleId,
        category: f.category,
        severity: f.severity,
        file: f.file,
        line: f.line,
        message: f.message,
      })),
      stats: {
        filesScanned: result.scannedFiles,
        errorCount,
        warningCount,
        infoCount,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
```

6. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/security.test.ts`
7. Observe: all tests pass.
8. Run: `harness validate`
9. Commit: `feat(dashboard): add security gatherer with glob-based file scanning`

---

### Task 3: Implement perf gatherer (TDD)

**Depends on:** Task 1
**Files:** `packages/dashboard/tests/server/gather/perf.test.ts`, `packages/dashboard/src/server/gather/perf.ts`

1. Create test file `packages/dashboard/tests/server/gather/perf.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAnalyze = vi.fn();

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );
  return {
    ...actual,
    EntropyAnalyzer: class MockEntropyAnalyzer {
      analyze = mockAnalyze;
    },
  };
});

import { gatherPerf } from '../../../src/server/gather/perf';

describe('gatherPerf', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns perf data with no violations when analysis is clean', async () => {
    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        complexity: { violations: [], stats: { filesAnalyzed: 5 } },
        coupling: { violations: [] },
        sizeBudget: { violations: [] },
      },
    });

    const result = await gatherPerf('/project');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.stats.filesAnalyzed).toBe(5);
    expect(result.stats.violationCount).toBe(0);
  });

  it('returns violations mapped to PerfViolationSummary shape', async () => {
    mockAnalyze.mockResolvedValue({
      ok: true,
      value: {
        complexity: {
          violations: [
            {
              tier: 1,
              severity: 'error',
              metric: 'cyclomaticComplexity',
              file: 'src/a.ts',
              value: 25,
              threshold: 15,
              function: 'doStuff',
              message: '',
            },
          ],
          stats: { filesAnalyzed: 3 },
        },
        coupling: {
          violations: [
            {
              tier: 2,
              severity: 'warning',
              metric: 'fanOut',
              file: 'src/b.ts',
              value: 12,
              threshold: 10,
              message: '',
            },
          ],
        },
        sizeBudget: { violations: [] },
      },
    });

    const result = await gatherPerf('/project');

    if ('error' in result) return;
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(2);
    expect(result.violations[0]).toEqual({
      metric: 'cyclomaticComplexity',
      file: 'src/a.ts',
      value: 25,
      threshold: 15,
      severity: 'error',
    });
    expect(result.violations[1]).toEqual({
      metric: 'fanOut',
      file: 'src/b.ts',
      value: 12,
      threshold: 10,
      severity: 'warning',
    });
    expect(result.stats.violationCount).toBe(2);
  });

  it('returns error when analysis fails', async () => {
    mockAnalyze.mockResolvedValue({
      ok: false,
      error: { message: 'Analysis config invalid' },
    });

    const result = await gatherPerf('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Analysis config invalid');
  });

  it('returns error when analyzer throws', async () => {
    mockAnalyze.mockRejectedValue(new Error('Unexpected crash'));

    const result = await gatherPerf('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Unexpected crash');
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/perf.test.ts`
3. Observe failure: `gatherPerf` is not defined.

4. Create implementation `packages/dashboard/src/server/gather/perf.ts`:

```typescript
import { EntropyAnalyzer } from '@harness-engineering/core';
import type { PerfResult, PerfViolationSummary } from '../../shared/types';

/**
 * Run structural performance analysis (complexity, coupling, size budgets).
 * Returns an error object instead of throwing on failure.
 */
export async function gatherPerf(projectPath: string): Promise<PerfResult> {
  try {
    const analyzer = new EntropyAnalyzer({
      rootDir: projectPath,
      analyze: {
        complexity: true,
        coupling: true,
        sizeBudget: true,
      },
    });

    const analysisResult = await analyzer.analyze();

    if (!analysisResult.ok) {
      return { error: analysisResult.error.message };
    }

    const report = analysisResult.value;
    const violations: PerfViolationSummary[] = [];

    if (report.complexity) {
      for (const v of report.complexity.violations) {
        violations.push({
          metric: v.metric,
          file: v.file,
          value: v.value,
          threshold: v.threshold,
          severity: v.severity,
        });
      }
    }

    if (report.coupling) {
      for (const v of report.coupling.violations) {
        violations.push({
          metric: v.metric,
          file: v.file,
          value: v.value,
          threshold: v.threshold,
          severity: v.severity,
        });
      }
    }

    if (report.sizeBudget) {
      for (const v of report.sizeBudget.violations) {
        violations.push({
          metric: 'sizeBudget',
          file: v.package,
          value: v.currentSize,
          threshold: v.budgetSize,
          severity: v.severity,
        });
      }
    }

    const hasErrors = violations.some((v) => v.severity === 'error');

    return {
      valid: !hasErrors,
      violations,
      stats: {
        filesAnalyzed: report.complexity?.stats.filesAnalyzed ?? 0,
        violationCount: violations.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
```

5. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/perf.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add perf gatherer using EntropyAnalyzer structural mode`

---

### Task 4: Implement arch gatherer (TDD)

**Depends on:** Task 1
**Files:** `packages/dashboard/tests/server/gather/arch.test.ts`, `packages/dashboard/src/server/gather/arch.ts`

1. Create test file `packages/dashboard/tests/server/gather/arch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunAll = vi.fn();
const mockDiff = vi.fn();
const mockLoad = vi.fn();

vi.mock('@harness-engineering/core', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/core')>(
    '@harness-engineering/core'
  );
  return {
    ...actual,
    runAll: mockRunAll,
    diff: mockDiff,
    ArchBaselineManager: class MockArchBaselineManager {
      load = mockLoad;
    },
    ArchConfigSchema: {
      parse: (v: unknown) =>
        v ?? {
          enabled: true,
          baselinePath: '.harness/arch/baselines.json',
          thresholds: {},
          modules: {},
        },
    },
  };
});

import { gatherArch } from '../../../src/server/gather/arch';

describe('gatherArch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns arch data when baseline exists and diff passes', async () => {
    mockRunAll.mockResolvedValue([]);
    mockLoad.mockReturnValue({
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      updatedFrom: 'abc123',
      metrics: {},
    });
    mockDiff.mockReturnValue({
      passed: true,
      newViolations: [],
      resolvedViolations: [],
      preExisting: [],
      regressions: [],
    });

    const result = await gatherArch('/project');

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.passed).toBe(true);
    expect(result.totalViolations).toBe(0);
    expect(result.regressions).toEqual([]);
    expect(result.newViolations).toEqual([]);
  });

  it('returns failures when diff has regressions and new violations', async () => {
    mockRunAll.mockResolvedValue([]);
    mockLoad.mockReturnValue({
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      updatedFrom: 'abc123',
      metrics: {},
    });
    mockDiff.mockReturnValue({
      passed: false,
      newViolations: [{ id: 'v1', file: 'src/a.ts', detail: 'Circular dep', severity: 'error' }],
      resolvedViolations: [],
      preExisting: [],
      regressions: [{ category: 'complexity', baselineValue: 5, currentValue: 8, delta: 3 }],
    });

    const result = await gatherArch('/project');

    if ('error' in result) return;
    expect(result.passed).toBe(false);
    expect(result.totalViolations).toBe(1);
    expect(result.regressions).toEqual([{ category: 'complexity', delta: 3 }]);
    expect(result.newViolations).toEqual([
      { file: 'src/a.ts', detail: 'Circular dep', severity: 'error' },
    ]);
  });

  it('returns passed with zero violations when no baseline exists', async () => {
    mockRunAll.mockResolvedValue([]);
    mockLoad.mockReturnValue(null);

    const result = await gatherArch('/project');

    if ('error' in result) return;
    expect(result.passed).toBe(true);
    expect(result.totalViolations).toBe(0);
  });

  it('returns error when runAll throws', async () => {
    mockRunAll.mockRejectedValue(new Error('Collector failed'));

    const result = await gatherArch('/project');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Collector failed');
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/arch.test.ts`
3. Observe failure: `gatherArch` is not defined.

4. Create implementation `packages/dashboard/src/server/gather/arch.ts`:

```typescript
import { ArchBaselineManager, ArchConfigSchema, runAll, diff } from '@harness-engineering/core';
import type { ArchResult } from '../../shared/types';

/**
 * Run architecture baseline checks and return a summary.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherArch(projectPath: string): Promise<ArchResult> {
  try {
    const archConfig = ArchConfigSchema.parse({});
    const results = await runAll(archConfig, projectPath);
    const manager = new ArchBaselineManager(projectPath);
    const baseline = manager.load();

    if (!baseline) {
      // No baseline: report clean (threshold-only mode, no regressions detectable)
      return {
        passed: true,
        totalViolations: 0,
        regressions: [],
        newViolations: [],
      };
    }

    const diffResult = diff(results, baseline);

    return {
      passed: diffResult.passed,
      totalViolations: diffResult.newViolations.length,
      regressions: diffResult.regressions.map((r) => ({
        category: r.category,
        delta: r.delta,
      })),
      newViolations: diffResult.newViolations.map((v) => ({
        file: v.file,
        detail: v.detail,
        severity: v.severity,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
```

5. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/arch.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add arch gatherer using ArchBaselineManager and diff`

---

### Task 5: Implement anomalies gatherer (TDD)

**Depends on:** Task 1
**Files:** `packages/dashboard/tests/server/gather/anomalies.test.ts`, `packages/dashboard/src/server/gather/anomalies.ts`

1. Create test file `packages/dashboard/tests/server/gather/anomalies.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoad = vi.fn();
const mockDetect = vi.fn();

vi.mock('@harness-engineering/graph', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/graph')>(
    '@harness-engineering/graph'
  );
  return {
    ...actual,
    GraphStore: class MockGraphStore {
      load = mockLoad;
    },
    GraphAnomalyAdapter: class MockGraphAnomalyAdapter {
      detect = mockDetect;
    },
  };
});

import { gatherAnomalies } from '../../../src/server/gather/anomalies';

describe('gatherAnomalies', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns anomaly data when graph is available', async () => {
    mockLoad.mockResolvedValue(true);
    mockDetect.mockReturnValue({
      statisticalOutliers: [
        {
          nodeId: 'n1',
          nodeName: 'big-file.ts',
          nodeType: 'file',
          metric: 'fanOut',
          value: 30,
          zScore: 3.5,
          mean: 5,
          stdDev: 7,
        },
      ],
      articulationPoints: [
        {
          nodeId: 'n2',
          nodeName: 'core-utils.ts',
          componentsIfRemoved: 3,
          dependentCount: 15,
        },
      ],
      overlapping: [],
      summary: {
        totalNodesAnalyzed: 100,
        outlierCount: 1,
        articulationPointCount: 1,
        overlapCount: 0,
        metricsAnalyzed: ['fanOut'],
        warnings: [],
        threshold: 2.0,
      },
    });

    const result = await gatherAnomalies('/project');

    expect('available' in result && !result.available).toBe(false);
    if ('available' in result) return;
    expect(result.outliers).toHaveLength(1);
    expect(result.outliers[0]).toEqual({
      nodeId: 'n1',
      name: 'big-file.ts',
      type: 'file',
      metric: 'fanOut',
      value: 30,
      zScore: 3.5,
    });
    expect(result.articulationPoints).toHaveLength(1);
    expect(result.articulationPoints[0]).toEqual({
      nodeId: 'n2',
      name: 'core-utils.ts',
      componentsIfRemoved: 3,
      dependentCount: 15,
    });
    expect(result.overlapCount).toBe(0);
  });

  it('returns unavailable when graph fails to load', async () => {
    mockLoad.mockResolvedValue(false);

    const result = await gatherAnomalies('/project');

    expect('available' in result).toBe(true);
    if (!('available' in result)) return;
    expect(result.available).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('returns unavailable when adapter throws', async () => {
    mockLoad.mockResolvedValue(true);
    mockDetect.mockImplementation(() => {
      throw new Error('Graph analysis failed');
    });

    const result = await gatherAnomalies('/project');

    expect('available' in result).toBe(true);
    if (!('available' in result)) return;
    expect(result.available).toBe(false);
    expect(result.reason).toContain('Graph analysis failed');
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/anomalies.test.ts`
3. Observe failure: `gatherAnomalies` is not defined.

4. Create implementation `packages/dashboard/src/server/gather/anomalies.ts`:

```typescript
import { join } from 'node:path';
import { GraphStore, GraphAnomalyAdapter } from '@harness-engineering/graph';
import type { AnomalyResult } from '../../shared/types';

const GRAPH_DIR = '.harness/graph';

/**
 * Detect graph anomalies (statistical outliers and articulation points).
 * Returns { available: false } when the graph cannot be loaded.
 */
export async function gatherAnomalies(projectPath: string): Promise<AnomalyResult> {
  try {
    const store = new GraphStore();
    const loaded = await store.load(join(projectPath, GRAPH_DIR));

    if (!loaded) {
      return {
        available: false,
        reason: 'Graph data not found. Run "harness graph scan" to build the knowledge graph.',
      };
    }

    const adapter = new GraphAnomalyAdapter(store);
    const report = adapter.detect();

    return {
      outliers: report.statisticalOutliers.map((o) => ({
        nodeId: o.nodeId,
        name: o.nodeName,
        type: o.nodeType,
        metric: o.metric,
        value: o.value,
        zScore: o.zScore,
      })),
      articulationPoints: report.articulationPoints.map((ap) => ({
        nodeId: ap.nodeId,
        name: ap.nodeName,
        componentsIfRemoved: ap.componentsIfRemoved,
        dependentCount: ap.dependentCount,
      })),
      overlapCount: report.summary.overlapCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: `Failed to detect anomalies: ${message}`,
    };
  }
}
```

5. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/anomalies.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add anomalies gatherer using GraphAnomalyAdapter`

---

### Task 6: Implement blast-radius gatherer (TDD)

**Depends on:** Task 1
**Files:** `packages/dashboard/tests/server/gather/blast-radius.test.ts`, `packages/dashboard/src/server/gather/blast-radius.ts`

1. Create test file `packages/dashboard/tests/server/gather/blast-radius.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoad = vi.fn();
const mockSimulate = vi.fn();

vi.mock('@harness-engineering/graph', async () => {
  const actual = await vi.importActual<typeof import('@harness-engineering/graph')>(
    '@harness-engineering/graph'
  );
  return {
    ...actual,
    GraphStore: class MockGraphStore {
      load = mockLoad;
    },
    CascadeSimulator: class MockCascadeSimulator {
      simulate = mockSimulate;
    },
  };
});

import { gatherBlastRadius } from '../../../src/server/gather/blast-radius';

describe('gatherBlastRadius', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns blast radius data for a valid node', async () => {
    mockLoad.mockResolvedValue(true);
    mockSimulate.mockReturnValue({
      sourceNodeId: 'n1',
      sourceName: 'core-utils.ts',
      layers: [
        {
          depth: 1,
          nodes: [
            {
              nodeId: 'n2',
              name: 'service.ts',
              type: 'file',
              cumulativeProbability: 0.8,
              depth: 1,
              incomingEdge: 'imports',
              parentId: 'n1',
            },
          ],
          categoryBreakdown: { code: 1, tests: 0, docs: 0, other: 0 },
        },
      ],
      flatSummary: [],
      summary: {
        totalAffected: 1,
        maxDepthReached: 1,
        highRisk: 1,
        mediumRisk: 0,
        lowRisk: 0,
        categoryBreakdown: { code: 1, tests: 0, docs: 0, other: 0 },
        amplificationPoints: [],
        truncated: false,
      },
    });

    const result = await gatherBlastRadius('/project', 'n1', 3);

    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.sourceNodeId).toBe('n1');
    expect(result.sourceName).toBe('core-utils.ts');
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].depth).toBe(1);
    expect(result.layers[0].nodes[0]).toEqual({
      nodeId: 'n2',
      name: 'service.ts',
      type: 'file',
      probability: 0.8,
      parentId: 'n1',
    });
    expect(result.summary.totalAffected).toBe(1);
    expect(result.summary.highRisk).toBe(1);
    expect(result.summary.maxDepth).toBe(1);
  });

  it('returns error when graph fails to load', async () => {
    mockLoad.mockResolvedValue(false);

    const result = await gatherBlastRadius('/project', 'n1');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Graph data not found');
  });

  it('returns error when simulate throws (node not found)', async () => {
    mockLoad.mockResolvedValue(true);
    mockSimulate.mockImplementation(() => {
      throw new Error('Node not found: n99');
    });

    const result = await gatherBlastRadius('/project', 'n99');

    expect('error' in result).toBe(true);
    if (!('error' in result)) return;
    expect(result.error).toContain('Node not found');
  });

  it('uses default maxDepth of 3 when not specified', async () => {
    mockLoad.mockResolvedValue(true);
    mockSimulate.mockReturnValue({
      sourceNodeId: 'n1',
      sourceName: 'a.ts',
      layers: [],
      flatSummary: [],
      summary: {
        totalAffected: 0,
        maxDepthReached: 0,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: 0,
        categoryBreakdown: { code: 0, tests: 0, docs: 0, other: 0 },
        amplificationPoints: [],
        truncated: false,
      },
    });

    await gatherBlastRadius('/project', 'n1');

    expect(mockSimulate).toHaveBeenCalledWith('n1', { maxDepth: 3 });
  });
});
```

2. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/blast-radius.test.ts`
3. Observe failure: `gatherBlastRadius` is not defined.

4. Create implementation `packages/dashboard/src/server/gather/blast-radius.ts`:

```typescript
import { join } from 'node:path';
import { GraphStore, CascadeSimulator } from '@harness-engineering/graph';
import type { BlastRadiusResult } from '../../shared/types';

const GRAPH_DIR = '.harness/graph';
const DEFAULT_MAX_DEPTH = 3;

/**
 * Run a blast radius simulation for a specific node.
 * This is query-scoped: only runs when called with a specific nodeId.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherBlastRadius(
  projectPath: string,
  nodeId: string,
  maxDepth: number = DEFAULT_MAX_DEPTH
): Promise<BlastRadiusResult> {
  try {
    const store = new GraphStore();
    const loaded = await store.load(join(projectPath, GRAPH_DIR));

    if (!loaded) {
      return {
        error: 'Graph data not found. Run "harness graph scan" to build the knowledge graph.',
      };
    }

    const simulator = new CascadeSimulator(store);
    const result = simulator.simulate(nodeId, { maxDepth });

    return {
      sourceNodeId: result.sourceNodeId,
      sourceName: result.sourceName,
      layers: result.layers.map((layer) => ({
        depth: layer.depth,
        nodes: layer.nodes.map((n) => ({
          nodeId: n.nodeId,
          name: n.name,
          type: n.type,
          probability: n.cumulativeProbability,
          parentId: n.parentId,
        })),
      })),
      summary: {
        totalAffected: result.summary.totalAffected,
        maxDepth: result.summary.maxDepthReached,
        highRisk: result.summary.highRisk,
        mediumRisk: result.summary.mediumRisk,
        lowRisk: result.summary.lowRisk,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
```

5. Run test: `cd packages/dashboard && npx vitest run tests/server/gather/blast-radius.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(dashboard): add blast-radius gatherer using CascadeSimulator`

---

### Task 7: Update barrel export and run full test suite

**Depends on:** Tasks 2, 3, 4, 5, 6
**Files:** `packages/dashboard/src/server/gather/index.ts`

[checkpoint:human-verify] -- Verify all 5 gatherer tasks passed before wiring the barrel export.

1. Update `packages/dashboard/src/server/gather/index.ts` to include the new exports:

```typescript
export { gatherRoadmap } from './roadmap';
export { gatherHealth } from './health';
export { gatherGraph } from './graph';
export { gatherSecurity } from './security';
export { gatherPerf } from './perf';
export { gatherArch } from './arch';
export { gatherAnomalies } from './anomalies';
export { gatherBlastRadius } from './blast-radius';
```

2. Run full gatherer test suite: `cd packages/dashboard && npx vitest run tests/server/gather/`
3. Observe: all tests pass (existing + new).
4. Run: `cd packages/dashboard && npx tsc --noEmit`
5. Observe: no type errors.
6. Run: `harness validate`
7. Commit: `feat(dashboard): export all v1.1 gatherers from barrel index`
