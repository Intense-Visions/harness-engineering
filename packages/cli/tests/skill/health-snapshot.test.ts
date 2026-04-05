import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync as realExecSync } from 'child_process';

/** Create a temp git repo with an initial commit. Works cross-platform. */
function createTempGitRepo(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-git-test-'));
  const opts = { cwd: tmpDir, stdio: 'pipe' as const };
  realExecSync('git init', opts);
  realExecSync('git config user.email "test@test.com"', opts);
  realExecSync('git config user.name "Test"', opts);
  realExecSync('git commit --allow-empty -m "init"', opts);
  return tmpDir;
}
import {
  isSnapshotFresh,
  loadCachedSnapshot,
  saveCachedSnapshot,
  deriveSignals,
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

  it('returns true when git HEAD differs but age < 1 hour (time fallback)', () => {
    const tmpDir = createTempGitRepo();
    try {
      const recentTime = new Date(Date.now() - 1_800_000).toISOString(); // 30 min ago
      const snapshot = makeSnapshot({ gitHead: 'non-matching-sha', capturedAt: recentTime });
      expect(isSnapshotFresh(snapshot, tmpDir)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns false when git HEAD differs and age is exactly 1 hour', () => {
    const tmpDir = createTempGitRepo();
    try {
      const exactlyOneHour = new Date(Date.now() - 3_600_000).toISOString();
      const snapshot = makeSnapshot({ gitHead: 'non-matching-sha', capturedAt: exactlyOneHour });
      expect(isSnapshotFresh(snapshot, tmpDir)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns true when git HEAD matches regardless of age', () => {
    const tmpDir = createTempGitRepo();
    try {
      const realHead = realExecSync('git rev-parse HEAD', {
        cwd: tmpDir,
        encoding: 'utf-8',
      }).trim();
      const veryOld = new Date(Date.now() - 86_400_000).toISOString(); // 24 hours ago
      const snapshot = makeSnapshot({ gitHead: realHead, capturedAt: veryOld });
      expect(isSnapshotFresh(snapshot, tmpDir)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('saveCachedSnapshot / loadCachedSnapshot', () => {
  const tmpDir = path.join(os.tmpdir(), `health-snapshot-test-${Date.now()}`);
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
    const emptyDir = path.join(os.tmpdir(), `health-snapshot-empty-${Date.now()}`);
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

describe('runHealthChecks', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('maps assess_project and check_dependencies output to HealthChecks', async () => {
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

    const { runHealthChecks } = await import('../../src/skill/health-snapshot');
    const checks = await runHealthChecks('/tmp/test-project');

    expect(checks.deps.circularDeps).toBe(2);
    expect(checks.deps.layerViolations).toBe(1);
    expect(checks.deps.issueCount).toBe(3);
    expect(checks.entropy.deadExports).toBe(2);
    expect(checks.entropy.deadFiles).toBe(1);
    expect(checks.entropy.driftCount).toBe(1);
    expect(checks.security.findingCount).toBe(0); // from assess_project summary (0)
    expect(checks.security.criticalCount).toBe(1);
    expect(checks.docs.undocumentedCount).toBe(5);
    expect(checks.lint.passed).toBe(true);
  });
});

describe('runGraphMetrics', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns zero defaults when graph is unavailable', async () => {
    vi.doMock('../../src/mcp/utils/graph-loader', () => ({
      loadGraphStore: vi.fn().mockResolvedValue(null),
    }));
    const { runGraphMetrics } = await import('../../src/skill/health-snapshot');
    const metrics = await runGraphMetrics('/tmp/no-graph');
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
    const fakeStore = {};
    vi.doMock('../../src/mcp/utils/graph-loader', () => ({
      loadGraphStore: vi.fn().mockResolvedValue(fakeStore),
    }));
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

    const { runGraphMetrics } = await import('../../src/skill/health-snapshot');
    const metrics = await runGraphMetrics('/tmp/with-graph');
    expect(metrics.avgFanOut).toBe(7); // (10+4)/2
    expect(metrics.maxFanOut).toBe(10);
    expect(metrics.avgCyclomaticComplexity).toBe(11.5); // (15+8)/2
    expect(metrics.maxCyclomaticComplexity).toBe(15);
    expect(metrics.avgCouplingRatio).toBeCloseTo(0.635); // (0.83+0.44)/2
    expect(metrics.anomalyOutlierCount).toBe(2);
    expect(metrics.articulationPointCount).toBe(1);
  });
});

describe('captureHealthSnapshot', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function mockCleanToolHandlers(): void {
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
  }

  it('returns a complete HealthSnapshot with checks, metrics, and signals', async () => {
    const realCP = await import('child_process');
    vi.doMock('child_process', () => ({
      ...realCP,
      execSync: vi.fn().mockReturnValue('abc123\n'),
    }));
    mockCleanToolHandlers();

    const { captureHealthSnapshot } = await import('../../src/skill/health-snapshot');
    const tmpDir = path.join(os.tmpdir(), `snapshot-test-${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });

    try {
      const snapshot = await captureHealthSnapshot(tmpDir);
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
    const realCP = await import('child_process');
    vi.doMock('child_process', () => ({
      ...realCP,
      execSync: vi.fn().mockReturnValue('def456\n'),
    }));

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

    const { captureHealthSnapshot } = await import('../../src/skill/health-snapshot');
    const tmpDir = path.join(os.tmpdir(), `snapshot-signals-${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });

    try {
      const snapshot = await captureHealthSnapshot(tmpDir);
      expect(snapshot.signals).toContain('circular-deps');
      expect(snapshot.signals).toContain('dead-code');
      expect(snapshot.signals).toContain('drift');
      expect(snapshot.signals).toContain('doc-gaps');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles non-git directory gracefully (empty gitHead)', async () => {
    const realCP = await import('child_process');
    vi.doMock('child_process', () => ({
      ...realCP,
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo');
      }),
    }));
    mockCleanToolHandlers();

    const { captureHealthSnapshot } = await import('../../src/skill/health-snapshot');
    const tmpDir = path.join(os.tmpdir(), `snapshot-nogit-${Date.now()}`);
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });

    try {
      const snapshot = await captureHealthSnapshot(tmpDir);
      expect(snapshot.gitHead).toBe('');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
