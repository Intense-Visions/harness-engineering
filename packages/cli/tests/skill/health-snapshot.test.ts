import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
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
