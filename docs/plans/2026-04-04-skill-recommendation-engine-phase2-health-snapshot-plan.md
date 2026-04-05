# Plan: Health Snapshot Capture (Skill Recommendation Engine Phase 2)

**Date:** 2026-04-04
**Spec:** docs/changes/skill-recommendation-engine/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement `captureHealthSnapshot`, signal derivation, `isSnapshotFresh`, and cache read/write in `health-snapshot.ts` so the recommendation engine has a runtime health snapshot to consume.

## Observable Truths (Acceptance Criteria)

1. When `captureHealthSnapshot` is called with a valid project path, the system shall return a `HealthSnapshot` with all `checks`, `metrics`, and `signals` fields populated.
2. When the graph is unavailable, the system shall return a `HealthSnapshot` with metrics defaulting to zero and no graph-derived signals (`anomaly-outlier`, `articulation-point`, `high-coupling`, `high-complexity` absent).
3. When `circularDeps > 0` in checks, `signals` shall contain `'circular-deps'`. Likewise for each signal: `layerViolations > 0` triggers `'layer-violations'`; `deadExports > 0 || deadFiles > 0` triggers `'dead-code'`; `driftCount > 0` triggers `'drift'`; `findingCount > 0` triggers `'security-findings'`; `undocumentedCount > 0` triggers `'doc-gaps'`; `violationCount > 0` (perf) triggers `'perf-regression'`; `anomalyOutlierCount > 0` triggers `'anomaly-outlier'`; `articulationPointCount > 0` triggers `'articulation-point'`; coupling/complexity thresholds trigger `'high-coupling'`/`'high-complexity'`.
4. When `isSnapshotFresh` is called with a snapshot whose `gitHead` matches the current HEAD, the system shall return `true`.
5. When `isSnapshotFresh` is called in a non-git directory and snapshot age is < 1 hour, the system shall return `true`.
6. When `isSnapshotFresh` is called with a snapshot older than 1 hour and different git HEAD, the system shall return `false`.
7. When `saveCachedSnapshot` is called, the system shall write valid JSON to `.harness/health-snapshot.json`.
8. When `loadCachedSnapshot` is called and the file exists with valid JSON, the system shall return the parsed `HealthSnapshot`.
9. When `loadCachedSnapshot` is called and the file does not exist, the system shall return `null`.
10. `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts` passes with all tests green.
11. `npx harness validate` passes.

## File Map

- MODIFY `packages/cli/src/skill/health-snapshot.ts` (add all runtime functions)
- CREATE `packages/cli/tests/skill/health-snapshot.test.ts` (unit tests)

## Skeleton

_Skeleton not produced -- task count (5) below threshold (8)._

## Tasks

### Task 1: Add `isSnapshotFresh`, `loadCachedSnapshot`, `saveCachedSnapshot` with TDD

**Depends on:** none
**Files:** `packages/cli/tests/skill/health-snapshot.test.ts`, `packages/cli/src/skill/health-snapshot.ts`

1. Create test file `packages/cli/tests/skill/health-snapshot.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  isSnapshotFresh,
  loadCachedSnapshot,
  saveCachedSnapshot,
} from '../../src/skill/health-snapshot';
import type { HealthSnapshot } from '../../src/skill/health-snapshot';

function makeSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    gitHead: 'abc123',
    projectPath: '/tmp/test-project',
    checks: {
      deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
      entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
      security: { passed: true, findingCount: 0, criticalCount: 0 },
      perf: { passed: true, violationCount: 0 },
      docs: { passed: true, undocumentedCount: 0 },
      lint: { passed: true, issueCount: 0 },
    },
    metrics: {
      avgFanOut: 0,
      maxFanOut: 0,
      avgCyclomaticComplexity: 0,
      maxCyclomaticComplexity: 0,
      avgCouplingRatio: 0,
      testCoverage: null,
      anomalyOutlierCount: 0,
      articulationPointCount: 0,
    },
    signals: [],
    ...overrides,
  };
}

describe('isSnapshotFresh', () => {
  it('returns true when git HEAD matches snapshot gitHead', () => {
    vi.spyOn(require('child_process'), 'execSync').mockReturnValue(Buffer.from('abc123\n'));
    const snapshot = makeSnapshot({ gitHead: 'abc123' });
    expect(isSnapshotFresh(snapshot, '/tmp/test-project')).toBe(true);
  });

  it('returns false when git HEAD differs and age > 1 hour', () => {
    vi.spyOn(require('child_process'), 'execSync').mockReturnValue(Buffer.from('def456\n'));
    const oldTime = new Date(Date.now() - 7_200_000).toISOString();
    const snapshot = makeSnapshot({ gitHead: 'abc123', capturedAt: oldTime });
    expect(isSnapshotFresh(snapshot, '/tmp/test-project')).toBe(false);
  });

  it('returns true in non-git directory when age < 1 hour', () => {
    vi.spyOn(require('child_process'), 'execSync').mockImplementation(() => {
      throw new Error('not a git repository');
    });
    const snapshot = makeSnapshot({ capturedAt: new Date().toISOString() });
    expect(isSnapshotFresh(snapshot, '/tmp/test-project')).toBe(true);
  });

  it('returns false in non-git directory when age > 1 hour', () => {
    vi.spyOn(require('child_process'), 'execSync').mockImplementation(() => {
      throw new Error('not a git repository');
    });
    const oldTime = new Date(Date.now() - 7_200_000).toISOString();
    const snapshot = makeSnapshot({ capturedAt: oldTime });
    expect(isSnapshotFresh(snapshot, '/tmp/test-project')).toBe(false);
  });
});

describe('saveCachedSnapshot / loadCachedSnapshot', () => {
  const tmpDir = path.join('/tmp', `health-snapshot-test-${Date.now()}`);
  const harnessDir = path.join(tmpDir, '.harness');

  beforeEach(() => {
    fs.mkdirSync(harnessDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads a snapshot', () => {
    const snapshot = makeSnapshot({ projectPath: tmpDir });
    saveCachedSnapshot(snapshot, tmpDir);
    const filePath = path.join(harnessDir, 'health-snapshot.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const loaded = loadCachedSnapshot(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.gitHead).toBe('abc123');
  });

  it('returns null when cache file does not exist', () => {
    const emptyDir = path.join('/tmp', `health-snapshot-empty-${Date.now()}`);
    fs.mkdirSync(path.join(emptyDir, '.harness'), { recursive: true });
    const loaded = loadCachedSnapshot(emptyDir);
    expect(loaded).toBeNull();
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('returns null when cache file has invalid JSON', () => {
    fs.writeFileSync(path.join(harnessDir, 'health-snapshot.json'), 'not json');
    const loaded = loadCachedSnapshot(tmpDir);
    expect(loaded).toBeNull();
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
3. Observe failure: `isSnapshotFresh`, `loadCachedSnapshot`, `saveCachedSnapshot` not exported from health-snapshot.ts.

4. Add implementation to `packages/cli/src/skill/health-snapshot.ts` -- append after the existing type definitions:

```typescript
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const CACHE_FILE = 'health-snapshot.json';
const STALENESS_MS = 3_600_000; // 1 hour

/**
 * Check if a snapshot is still fresh based on git HEAD match or time fallback.
 */
export function isSnapshotFresh(snapshot: HealthSnapshot, projectPath: string): boolean {
  try {
    const currentHead = execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (snapshot.gitHead === currentHead) return true;
  } catch {
    // Non-git directory -- fall through to time-based staleness
  }
  const age = Date.now() - new Date(snapshot.capturedAt).getTime();
  return age < STALENESS_MS;
}

/**
 * Load a cached health snapshot from .harness/health-snapshot.json.
 * Returns null if the file does not exist or contains invalid JSON.
 */
export function loadCachedSnapshot(projectPath: string): HealthSnapshot | null {
  const filePath = path.join(projectPath, '.harness', CACHE_FILE);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as HealthSnapshot;
  } catch {
    return null;
  }
}

/**
 * Save a health snapshot to .harness/health-snapshot.json.
 */
export function saveCachedSnapshot(snapshot: HealthSnapshot, projectPath: string): void {
  const dir = path.join(projectPath, '.harness');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, CACHE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
6. Observe: all tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(skill): add isSnapshotFresh, loadCachedSnapshot, saveCachedSnapshot`

---

### Task 2: Add `deriveSignals` function with TDD

**Depends on:** Task 1
**Files:** `packages/cli/tests/skill/health-snapshot.test.ts`, `packages/cli/src/skill/health-snapshot.ts`

1. Append tests to `packages/cli/tests/skill/health-snapshot.test.ts`:

```typescript
import { deriveSignals } from '../../src/skill/health-snapshot';

describe('deriveSignals', () => {
  it('returns empty array when everything passes with zero counts', () => {
    const snapshot = makeSnapshot();
    expect(deriveSignals(snapshot.checks, snapshot.metrics)).toEqual([]);
  });

  it('includes circular-deps when circularDeps > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.deps.circularDeps = 2;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('circular-deps');
  });

  it('includes layer-violations when layerViolations > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.deps.layerViolations = 1;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('layer-violations');
  });

  it('includes dead-code when deadExports > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.entropy.deadExports = 3;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('dead-code');
  });

  it('includes dead-code when deadFiles > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.entropy.deadFiles = 1;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('dead-code');
  });

  it('includes drift when driftCount > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.entropy.driftCount = 2;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('drift');
  });

  it('includes security-findings when findingCount > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.security.findingCount = 5;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('security-findings');
  });

  it('includes doc-gaps when undocumentedCount > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.docs.undocumentedCount = 10;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('doc-gaps');
  });

  it('includes perf-regression when violationCount > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.perf.violationCount = 1;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('perf-regression');
  });

  it('includes anomaly-outlier when anomalyOutlierCount > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.anomalyOutlierCount = 3;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('anomaly-outlier');
  });

  it('includes articulation-point when articulationPointCount > 0', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.articulationPointCount = 1;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('articulation-point');
  });

  it('includes high-coupling when avgCouplingRatio > 0.5', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.avgCouplingRatio = 0.65;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('high-coupling');
  });

  it('includes high-coupling when maxFanOut > 20', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.maxFanOut = 25;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('high-coupling');
  });

  it('includes high-complexity when maxCyclomaticComplexity > 20', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.maxCyclomaticComplexity = 30;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('high-complexity');
  });

  it('includes high-complexity when avgCyclomaticComplexity > 10', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.avgCyclomaticComplexity = 12;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('high-complexity');
  });

  it('includes low-coverage when testCoverage < 60', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.testCoverage = 45;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('low-coverage');
  });

  it('does not include low-coverage when testCoverage is null', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.testCoverage = null;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).not.toContain('low-coverage');
  });

  it('returns multiple signals when multiple conditions are met', () => {
    const snapshot = makeSnapshot();
    snapshot.checks.deps.circularDeps = 1;
    snapshot.checks.security.findingCount = 2;
    snapshot.metrics.maxCyclomaticComplexity = 25;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    expect(signals).toContain('circular-deps');
    expect(signals).toContain('security-findings');
    expect(signals).toContain('high-complexity');
  });

  it('does not duplicate signals', () => {
    const snapshot = makeSnapshot();
    snapshot.metrics.maxFanOut = 25;
    snapshot.metrics.avgCouplingRatio = 0.7;
    const signals = deriveSignals(snapshot.checks, snapshot.metrics);
    const couplingCount = signals.filter((s: string) => s === 'high-coupling').length;
    expect(couplingCount).toBe(1);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
3. Observe failure: `deriveSignals` is not exported.

4. Add `deriveSignals` function to `packages/cli/src/skill/health-snapshot.ts`:

```typescript
/**
 * Derive active signal identifiers from health checks and metrics.
 * Uses threshold-based rules to map numeric values to named signals.
 */
export function deriveSignals(checks: HealthChecks, metrics: HealthMetrics): string[] {
  const signals = new Set<string>();

  // Check-based signals
  if (checks.deps.circularDeps > 0) signals.add('circular-deps');
  if (checks.deps.layerViolations > 0) signals.add('layer-violations');
  if (checks.entropy.deadExports > 0 || checks.entropy.deadFiles > 0) signals.add('dead-code');
  if (checks.entropy.driftCount > 0) signals.add('drift');
  if (checks.security.findingCount > 0) signals.add('security-findings');
  if (checks.docs.undocumentedCount > 0) signals.add('doc-gaps');
  if (checks.perf.violationCount > 0) signals.add('perf-regression');

  // Metric-based signals
  if (metrics.anomalyOutlierCount > 0) signals.add('anomaly-outlier');
  if (metrics.articulationPointCount > 0) signals.add('articulation-point');
  if (metrics.avgCouplingRatio > 0.5 || metrics.maxFanOut > 20) signals.add('high-coupling');
  if (metrics.maxCyclomaticComplexity > 20 || metrics.avgCyclomaticComplexity > 10)
    signals.add('high-complexity');
  if (metrics.testCoverage !== null && metrics.testCoverage < 60) signals.add('low-coverage');

  return [...signals];
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
6. Observe: all tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(skill): add deriveSignals threshold-based signal derivation`

---

### Task 3: Add `runHealthChecks` helper with TDD (mocked tool handlers)

**Depends on:** Task 1
**Files:** `packages/cli/tests/skill/health-snapshot.test.ts`, `packages/cli/src/skill/health-snapshot.ts`

This task implements the internal helper that calls `assess_project` and `check_dependencies` tool handlers and maps their output to `HealthChecks`.

1. Append tests to `packages/cli/tests/skill/health-snapshot.test.ts`:

```typescript
import { runHealthChecks } from '../../src/skill/health-snapshot';

// We test runHealthChecks by mocking the MCP tool handlers it imports.
// The function calls handleAssessProject and handleCheckDependencies.

describe('runHealthChecks', () => {
  it('maps assess_project and check_dependencies output to HealthChecks', async () => {
    // Mock handleAssessProject
    vi.doMock('../../src/mcp/tools/assess-project', () => ({
      handleAssessProject: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              healthy: false,
              checks: [
                { name: 'deps', passed: false, issueCount: 3 },
                { name: 'entropy', passed: false, issueCount: 4 },
                { name: 'security', passed: true, issueCount: 0 },
                { name: 'perf', passed: true, issueCount: 0 },
                { name: 'docs', passed: false, issueCount: 5 },
                { name: 'lint', passed: true, issueCount: 0 },
              ],
            }),
          },
        ],
      }),
    }));

    // Mock handleCheckDependencies
    vi.doMock('../../src/mcp/tools/architecture', () => ({
      handleCheckDependencies: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              valid: false,
              violations: [
                {
                  reason: 'CIRCULAR_DEP',
                  file: 'a.ts',
                  imports: 'b.ts',
                  fromLayer: 'x',
                  toLayer: 'y',
                  line: 1,
                  suggestion: '',
                },
                {
                  reason: 'CIRCULAR_DEP',
                  file: 'b.ts',
                  imports: 'a.ts',
                  fromLayer: 'y',
                  toLayer: 'x',
                  line: 1,
                  suggestion: '',
                },
                {
                  reason: 'WRONG_LAYER',
                  file: 'c.ts',
                  imports: 'd.ts',
                  fromLayer: 'x',
                  toLayer: 'z',
                  line: 5,
                  suggestion: '',
                },
              ],
            }),
          },
        ],
      }),
    }));

    // Mock detect_entropy detailed output for granular entropy counts
    vi.doMock('../../src/mcp/tools/entropy', () => ({
      handleDetectEntropy: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deadCode: { unusedExports: ['a', 'b'], unusedImports: [], deadFiles: ['x.ts'] },
              drift: { staleReferences: ['ref1'], missingTargets: [] },
            }),
          },
        ],
      }),
    }));

    // Mock security scan for critical count
    vi.doMock('../../src/mcp/tools/security', () => ({
      handleRunSecurityScan: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              findings: [
                { severity: 'error', rule: 'r1', message: 'm1' },
                { severity: 'warning', rule: 'r2', message: 'm2' },
              ],
            }),
          },
        ],
      }),
    }));

    // Need to re-import after mocks
    const { runHealthChecks: mockedRunHealthChecks } =
      await import('../../src/skill/health-snapshot');

    const checks = await mockedRunHealthChecks('/tmp/test-project');

    expect(checks.deps.circularDeps).toBe(2);
    expect(checks.deps.layerViolations).toBe(1);
    expect(checks.deps.issueCount).toBe(3);
    expect(checks.entropy.deadExports).toBe(2);
    expect(checks.entropy.deadFiles).toBe(1);
    expect(checks.entropy.driftCount).toBe(1);
    expect(checks.security.findingCount).toBe(2);
    expect(checks.security.criticalCount).toBe(1);
    expect(checks.docs.undocumentedCount).toBe(5);
    expect(checks.lint.passed).toBe(true);
  });
});
```

Note: The mocking pattern above is conceptual. The actual test will use `vi.mock` with factory functions at the top level for the modules that `runHealthChecks` dynamically imports. The key behaviors to verify are:

- Circular deps and layer violations are counted from the violations array `reason` field
- Entropy granular counts come from a separate `handleDetectEntropy` call
- Security critical count comes from filtering findings by `severity === 'error'`
- Docs undocumented count and lint pass/fail come from assess_project summary

2. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
3. Observe failure: `runHealthChecks` not exported.

4. Add `runHealthChecks` to `packages/cli/src/skill/health-snapshot.ts`:

```typescript
/**
 * Run health checks by calling assess_project, check_dependencies, and
 * entropy/security handlers for granular counts. Returns HealthChecks.
 */
export async function runHealthChecks(projectPath: string): Promise<HealthChecks> {
  const { handleAssessProject } = await import('../mcp/tools/assess-project.js');
  const { handleCheckDependencies } = await import('../mcp/tools/architecture.js');
  const { handleDetectEntropy } = await import('../mcp/tools/entropy.js');
  const { handleRunSecurityScan } = await import('../mcp/tools/security.js');

  // Run assess_project for summary pass/fail and issue counts
  const [assessResult, depsResult, entropyResult, securityResult] = await Promise.all([
    handleAssessProject({
      path: projectPath,
      checks: ['deps', 'entropy', 'security', 'perf', 'docs', 'lint'],
    }),
    handleCheckDependencies({ path: projectPath }),
    handleDetectEntropy({ path: projectPath, type: 'all' }),
    handleRunSecurityScan({ path: projectPath }),
  ]);

  // Parse assess_project summary
  const assessData = JSON.parse(assessResult.content[0]?.text ?? '{}');
  const checkMap = new Map<string, { passed: boolean; issueCount: number }>();
  for (const c of assessData.checks ?? []) {
    checkMap.set(c.name, { passed: c.passed, issueCount: c.issueCount });
  }

  // Parse check_dependencies for granular violation counts
  const depsData = JSON.parse(depsResult.content[0]?.text ?? '{}');
  const violations: Array<{ reason: string }> = depsData.violations ?? [];
  const circularDeps = violations.filter((v) => v.reason === 'CIRCULAR_DEP').length;
  const layerViolations = violations.filter(
    (v) => v.reason === 'WRONG_LAYER' || v.reason === 'FORBIDDEN_IMPORT'
  ).length;

  // Parse entropy for granular counts
  const entropyData = JSON.parse(entropyResult.content[0]?.text ?? '{}');
  const deadExports = entropyData.deadCode?.unusedExports?.length ?? 0;
  const deadFiles = entropyData.deadCode?.deadFiles?.length ?? 0;
  const driftCount =
    (entropyData.drift?.staleReferences?.length ?? 0) +
    (entropyData.drift?.missingTargets?.length ?? 0);

  // Parse security for critical count
  const securityData = JSON.parse(securityResult.content[0]?.text ?? '{}');
  const findings: Array<{ severity: string }> = securityData.findings ?? [];
  const criticalCount = findings.filter((f) => f.severity === 'error').length;

  const deps = checkMap.get('deps') ?? { passed: true, issueCount: 0 };
  const entropy = checkMap.get('entropy') ?? { passed: true, issueCount: 0 };
  const security = checkMap.get('security') ?? { passed: true, issueCount: 0 };
  const perf = checkMap.get('perf') ?? { passed: true, issueCount: 0 };
  const docs = checkMap.get('docs') ?? { passed: true, issueCount: 0 };
  const lint = checkMap.get('lint') ?? { passed: true, issueCount: 0 };

  return {
    deps: { passed: deps.passed, issueCount: deps.issueCount, circularDeps, layerViolations },
    entropy: { passed: entropy.passed, deadExports, deadFiles, driftCount },
    security: { passed: security.passed, findingCount: security.issueCount, criticalCount },
    perf: { passed: perf.passed, violationCount: perf.issueCount },
    docs: { passed: docs.passed, undocumentedCount: docs.issueCount },
    lint: { passed: lint.passed, issueCount: lint.issueCount },
  };
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
6. Observe: all tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(skill): add runHealthChecks with granular violation and entropy counts`

---

### Task 4: Add `runGraphMetrics` helper with TDD (graph-aware with graceful fallback)

**Depends on:** Task 1
**Files:** `packages/cli/tests/skill/health-snapshot.test.ts`, `packages/cli/src/skill/health-snapshot.ts`

This task implements the internal helper that loads the graph, runs anomaly detection, and aggregates coupling/complexity metrics into `HealthMetrics`.

1. Append tests to `packages/cli/tests/skill/health-snapshot.test.ts`:

```typescript
import { runGraphMetrics } from '../../src/skill/health-snapshot';

describe('runGraphMetrics', () => {
  it('returns zero defaults when graph is unavailable', async () => {
    // Mock graph-loader to return null
    vi.doMock('../../src/mcp/utils/graph-loader', () => ({
      loadGraphStore: vi.fn().mockResolvedValue(null),
    }));
    const { runGraphMetrics: m } = await import('../../src/skill/health-snapshot');
    const metrics = await m('/tmp/no-graph');
    expect(metrics.avgFanOut).toBe(0);
    expect(metrics.maxFanOut).toBe(0);
    expect(metrics.avgCyclomaticComplexity).toBe(0);
    expect(metrics.maxCyclomaticComplexity).toBe(0);
    expect(metrics.avgCouplingRatio).toBe(0);
    expect(metrics.testCoverage).toBeNull();
    expect(metrics.anomalyOutlierCount).toBe(0);
    expect(metrics.articulationPointCount).toBe(0);
  });

  it('aggregates coupling and complexity metrics from graph adapters', async () => {
    // Mock graph-loader to return a fake store
    const fakeStore = {};
    vi.doMock('../../src/mcp/utils/graph-loader', () => ({
      loadGraphStore: vi.fn().mockResolvedValue(fakeStore),
    }));
    // Mock graph adapters
    vi.doMock('@harness-engineering/graph', () => ({
      GraphCouplingAdapter: class {
        computeCouplingData() {
          return {
            files: [
              { file: 'a.ts', fanIn: 2, fanOut: 10, couplingRatio: 0.83, transitiveDepth: 3 },
              { file: 'b.ts', fanIn: 5, fanOut: 4, couplingRatio: 0.44, transitiveDepth: 1 },
            ],
          };
        }
      },
      GraphComplexityAdapter: class {
        computeComplexityHotspots() {
          return {
            hotspots: [
              {
                file: 'a.ts',
                function: 'foo',
                changeFrequency: 5,
                complexity: 15,
                hotspotScore: 75,
              },
              {
                file: 'b.ts',
                function: 'bar',
                changeFrequency: 2,
                complexity: 8,
                hotspotScore: 16,
              },
            ],
            percentile95Score: 75,
          };
        }
      },
      GraphAnomalyAdapter: class {
        detect() {
          return {
            statisticalOutliers: [{ nodeId: 'a' }, { nodeId: 'b' }],
            articulationPoints: [{ nodeId: 'c' }],
            summary: { outlierCount: 2, articulationPointCount: 1 },
          };
        }
      },
    }));

    const { runGraphMetrics: m } = await import('../../src/skill/health-snapshot');
    const metrics = await m('/tmp/with-graph');
    expect(metrics.avgFanOut).toBe(7); // (10+4)/2
    expect(metrics.maxFanOut).toBe(10);
    expect(metrics.avgCyclomaticComplexity).toBe(11.5); // (15+8)/2
    expect(metrics.maxCyclomaticComplexity).toBe(15);
    expect(metrics.avgCouplingRatio).toBeCloseTo(0.635); // (0.83+0.44)/2
    expect(metrics.anomalyOutlierCount).toBe(2);
    expect(metrics.articulationPointCount).toBe(1);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
3. Observe failure: `runGraphMetrics` not exported.

4. Add `runGraphMetrics` to `packages/cli/src/skill/health-snapshot.ts`:

```typescript
/**
 * Run graph-based metric aggregation. Returns HealthMetrics.
 * Gracefully returns zero defaults when graph is unavailable.
 */
export async function runGraphMetrics(projectPath: string): Promise<HealthMetrics> {
  const zeroMetrics: HealthMetrics = {
    avgFanOut: 0,
    maxFanOut: 0,
    avgCyclomaticComplexity: 0,
    maxCyclomaticComplexity: 0,
    avgCouplingRatio: 0,
    testCoverage: null,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
  };

  try {
    const { loadGraphStore } = await import('../mcp/utils/graph-loader.js');
    const store = await loadGraphStore(projectPath);
    if (!store) return zeroMetrics;

    const { GraphCouplingAdapter, GraphComplexityAdapter, GraphAnomalyAdapter } =
      await import('@harness-engineering/graph');

    // Coupling metrics
    const couplingAdapter = new GraphCouplingAdapter(store);
    const couplingData = couplingAdapter.computeCouplingData();
    const files = couplingData.files;

    let avgFanOut = 0;
    let maxFanOut = 0;
    let avgCouplingRatio = 0;
    if (files.length > 0) {
      const totalFanOut = files.reduce((sum, f) => sum + f.fanOut, 0);
      avgFanOut = Math.round((totalFanOut / files.length) * 100) / 100;
      maxFanOut = Math.max(...files.map((f) => f.fanOut));
      const totalCoupling = files.reduce((sum, f) => sum + f.couplingRatio, 0);
      avgCouplingRatio = Math.round((totalCoupling / files.length) * 1000) / 1000;
    }

    // Complexity metrics
    const complexityAdapter = new GraphComplexityAdapter(store);
    const complexityData = complexityAdapter.computeComplexityHotspots();
    const hotspots = complexityData.hotspots;

    let avgCyclomaticComplexity = 0;
    let maxCyclomaticComplexity = 0;
    if (hotspots.length > 0) {
      const totalComplexity = hotspots.reduce((sum, h) => sum + h.complexity, 0);
      avgCyclomaticComplexity = Math.round((totalComplexity / hotspots.length) * 100) / 100;
      maxCyclomaticComplexity = Math.max(...hotspots.map((h) => h.complexity));
    }

    // Anomaly metrics
    const anomalyAdapter = new GraphAnomalyAdapter(store);
    const anomalyReport = anomalyAdapter.detect();

    return {
      avgFanOut,
      maxFanOut,
      avgCyclomaticComplexity,
      maxCyclomaticComplexity,
      avgCouplingRatio,
      testCoverage: null, // Coverage integration deferred -- not available from graph
      anomalyOutlierCount: anomalyReport.summary.outlierCount,
      articulationPointCount: anomalyReport.summary.articulationPointCount,
    };
  } catch {
    return zeroMetrics;
  }
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
6. Observe: all tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(skill): add runGraphMetrics with coupling/complexity/anomaly aggregation`

---

### Task 5: Add `captureHealthSnapshot` orchestrator with TDD

**Depends on:** Task 2, Task 3, Task 4
**Files:** `packages/cli/tests/skill/health-snapshot.test.ts`, `packages/cli/src/skill/health-snapshot.ts`

[checkpoint:human-verify] -- Verify Tasks 1-4 pass before this integration task.

This task implements the top-level `captureHealthSnapshot` that orchestrates checks, metrics, signal derivation, git HEAD capture, and cache write.

1. Append tests to `packages/cli/tests/skill/health-snapshot.test.ts`:

```typescript
import { captureHealthSnapshot } from '../../src/skill/health-snapshot';

describe('captureHealthSnapshot', () => {
  it('returns a complete HealthSnapshot with checks, metrics, and signals', async () => {
    // Mock runHealthChecks and runGraphMetrics at module level
    // (or inline mock the underlying tool handlers as in Tasks 3/4)
    // Mock git rev-parse HEAD
    vi.spyOn(require('child_process'), 'execSync').mockReturnValue(Buffer.from('abc123\n'));

    // Mock the tool handlers to return clean results
    vi.doMock('../../src/mcp/tools/assess-project', () => ({
      handleAssessProject: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              healthy: true,
              checks: [
                { name: 'deps', passed: true, issueCount: 0 },
                { name: 'entropy', passed: true, issueCount: 0 },
                { name: 'security', passed: true, issueCount: 0 },
                { name: 'perf', passed: true, issueCount: 0 },
                { name: 'docs', passed: true, issueCount: 0 },
                { name: 'lint', passed: true, issueCount: 0 },
              ],
            }),
          },
        ],
      }),
    }));
    vi.doMock('../../src/mcp/tools/architecture', () => ({
      handleCheckDependencies: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ valid: true, violations: [] }) }],
      }),
    }));
    vi.doMock('../../src/mcp/tools/entropy', () => ({
      handleDetectEntropy: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ deadCode: {}, drift: {} }) }],
      }),
    }));
    vi.doMock('../../src/mcp/tools/security', () => ({
      handleRunSecurityScan: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ findings: [] }) }],
      }),
    }));
    vi.doMock('../../src/mcp/utils/graph-loader', () => ({
      loadGraphStore: vi.fn().mockResolvedValue(null),
    }));

    const { captureHealthSnapshot: capture } = await import('../../src/skill/health-snapshot');
    const tmpDir = path.join('/tmp', `snapshot-test-${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });

    try {
      const snapshot = await capture(tmpDir);
      expect(snapshot.gitHead).toBe('abc123');
      expect(snapshot.projectPath).toBe(tmpDir);
      expect(snapshot.capturedAt).toBeTruthy();
      expect(snapshot.checks.deps.passed).toBe(true);
      expect(snapshot.metrics.avgFanOut).toBe(0); // no graph
      expect(snapshot.signals).toEqual([]); // all clean

      // Verify cache was written
      const cached = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.harness', 'health-snapshot.json'), 'utf-8')
      );
      expect(cached.gitHead).toBe('abc123');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('populates signals when checks have issues', async () => {
    vi.spyOn(require('child_process'), 'execSync').mockReturnValue(Buffer.from('def456\n'));

    vi.doMock('../../src/mcp/tools/assess-project', () => ({
      handleAssessProject: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              healthy: false,
              checks: [
                { name: 'deps', passed: false, issueCount: 3 },
                { name: 'entropy', passed: false, issueCount: 4 },
                { name: 'security', passed: false, issueCount: 2 },
                { name: 'perf', passed: true, issueCount: 0 },
                { name: 'docs', passed: false, issueCount: 5 },
                { name: 'lint', passed: true, issueCount: 0 },
              ],
            }),
          },
        ],
      }),
    }));
    vi.doMock('../../src/mcp/tools/architecture', () => ({
      handleCheckDependencies: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              valid: false,
              violations: [
                {
                  reason: 'CIRCULAR_DEP',
                  file: 'a.ts',
                  imports: 'b.ts',
                  fromLayer: 'x',
                  toLayer: 'y',
                  line: 1,
                  suggestion: '',
                },
              ],
            }),
          },
        ],
      }),
    }));
    vi.doMock('../../src/mcp/tools/entropy', () => ({
      handleDetectEntropy: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              deadCode: { unusedExports: ['a'], deadFiles: [] },
              drift: { staleReferences: ['r1'], missingTargets: [] },
            }),
          },
        ],
      }),
    }));
    vi.doMock('../../src/mcp/tools/security', () => ({
      handleRunSecurityScan: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              findings: [{ severity: 'error', rule: 'r1', message: '' }],
            }),
          },
        ],
      }),
    }));
    vi.doMock('../../src/mcp/utils/graph-loader', () => ({
      loadGraphStore: vi.fn().mockResolvedValue(null),
    }));

    const { captureHealthSnapshot: capture } = await import('../../src/skill/health-snapshot');
    const tmpDir = path.join('/tmp', `snapshot-signals-${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });

    try {
      const snapshot = await capture(tmpDir);
      expect(snapshot.signals).toContain('circular-deps');
      expect(snapshot.signals).toContain('dead-code');
      expect(snapshot.signals).toContain('drift');
      expect(snapshot.signals).toContain('security-findings');
      expect(snapshot.signals).toContain('doc-gaps');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles non-git directory gracefully (empty gitHead)', async () => {
    vi.spyOn(require('child_process'), 'execSync').mockImplementation(() => {
      throw new Error('not a git repo');
    });

    vi.doMock('../../src/mcp/tools/assess-project', () => ({
      handleAssessProject: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ healthy: true, checks: [] }) }],
      }),
    }));
    vi.doMock('../../src/mcp/tools/architecture', () => ({
      handleCheckDependencies: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ valid: true, violations: [] }) }],
      }),
    }));
    vi.doMock('../../src/mcp/tools/entropy', () => ({
      handleDetectEntropy: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({}) }],
      }),
    }));
    vi.doMock('../../src/mcp/tools/security', () => ({
      handleRunSecurityScan: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ findings: [] }) }],
      }),
    }));
    vi.doMock('../../src/mcp/utils/graph-loader', () => ({
      loadGraphStore: vi.fn().mockResolvedValue(null),
    }));

    const { captureHealthSnapshot: capture } = await import('../../src/skill/health-snapshot');
    const tmpDir = path.join('/tmp', `snapshot-nogit-${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });

    try {
      const snapshot = await capture(tmpDir);
      expect(snapshot.gitHead).toBe('');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
3. Observe failure: `captureHealthSnapshot` not exported.

4. Add `captureHealthSnapshot` to `packages/cli/src/skill/health-snapshot.ts`:

```typescript
/**
 * Capture a complete health snapshot for a project.
 * Runs health checks and graph metrics in parallel, derives signals,
 * saves to cache, and returns the snapshot.
 */
export async function captureHealthSnapshot(projectPath: string): Promise<HealthSnapshot> {
  // Get git HEAD
  let gitHead = '';
  try {
    gitHead = execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Non-git directory
  }

  // Run checks and graph metrics in parallel
  const [checks, metrics] = await Promise.all([
    runHealthChecks(projectPath),
    runGraphMetrics(projectPath),
  ]);

  // Derive signals
  const signals = deriveSignals(checks, metrics);

  const snapshot: HealthSnapshot = {
    capturedAt: new Date().toISOString(),
    gitHead,
    projectPath,
    checks,
    metrics,
    signals,
  };

  // Write to cache
  saveCachedSnapshot(snapshot, projectPath);

  return snapshot;
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts`
6. Observe: all tests pass.
7. Run: `npx harness validate`
8. Commit: `feat(skill): add captureHealthSnapshot orchestrator with cache write`

## Traceability Matrix

| Observable Truth                                         | Delivered by Task(s) |
| -------------------------------------------------------- | -------------------- |
| 1. captureHealthSnapshot returns complete HealthSnapshot | Task 3, 4, 5         |
| 2. Graph unavailable yields zero defaults                | Task 4               |
| 3. Signal derivation from checks/metrics                 | Task 2               |
| 4. isSnapshotFresh with matching git HEAD                | Task 1               |
| 5. isSnapshotFresh in non-git with age < 1hr             | Task 1               |
| 6. isSnapshotFresh returns false when stale              | Task 1               |
| 7. saveCachedSnapshot writes JSON                        | Task 1               |
| 8. loadCachedSnapshot reads valid JSON                   | Task 1               |
| 9. loadCachedSnapshot returns null when missing          | Task 1               |
| 10. All tests pass                                       | Task 1-5             |
| 11. harness validate passes                              | Task 1-5             |
