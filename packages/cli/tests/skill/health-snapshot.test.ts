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
