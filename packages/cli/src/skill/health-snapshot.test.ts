import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  deriveSignals,
  captureHealthSnapshot,
  ZERO_METRICS,
  type HealthChecks,
  type HealthMetrics,
} from './health-snapshot';

const PASSING_CHECKS: HealthChecks = {
  deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
  entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
  security: { passed: true, findingCount: 0, criticalCount: 0 },
  perf: { passed: true, violationCount: 0 },
  docs: { passed: true, undocumentedCount: 0 },
  lint: { passed: true, issueCount: 0 },
};

function metricsWithRework(maxUnplannedReworkRate: number): HealthMetrics {
  return {
    ...ZERO_METRICS,
    reworkRate: { maxUnplannedReworkRate, reworkSurfaceCount: maxUnplannedReworkRate > 0 ? 1 : 0 },
  };
}

function git(cwd: string, args: string[]) {
  execFileSync('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}
function gitInit(cwd: string) {
  git(cwd, ['init', '-q']);
  git(cwd, ['config', 'user.email', 't@t']);
  git(cwd, ['config', 'user.name', 'T']);
}
function commit(cwd: string, file: string, subject: string) {
  const abs = join(cwd, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `${file}:${subject}`);
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-q', '-m', subject]);
}

describe('deriveSignals — rework-hotspot (AC3)', () => {
  it('raises rework-hotspot when max unplanned rework rate is at/over the threshold', () => {
    const signals = deriveSignals(PASSING_CHECKS, metricsWithRework(0.5));
    expect(signals).toContain('rework-hotspot');
  });

  it('does not raise rework-hotspot below the threshold', () => {
    const signals = deriveSignals(PASSING_CHECKS, metricsWithRework(0.1));
    expect(signals).not.toContain('rework-hotspot');
  });

  it('is metric-only: rework does not flip any check.passed', () => {
    // rework-hotspot has check: null in the registry, so reconcilePassed can
    // never demote a check from it. deriveSignals itself touches no checks.
    const signals = deriveSignals(PASSING_CHECKS, metricsWithRework(0.9));
    expect(signals).toContain('rework-hotspot');
    // deriveSignals returns only signal names; it never mutates the checks.
    expect(PASSING_CHECKS.deps.passed).toBe(true);
    expect(PASSING_CHECKS.security.passed).toBe(true);
  });
});

describe('ZERO_METRICS', () => {
  it('includes a zeroed reworkRate block', () => {
    expect(ZERO_METRICS.reworkRate).toEqual({ maxUnplannedReworkRate: 0, reworkSurfaceCount: 0 });
  });
});

describe('captureHealthSnapshot — rework wiring (AC3)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'health-rework-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));

  it('populates reworkRate and raises rework-hotspot for a high-rework surface', async () => {
    gitInit(tmp);
    // A surface with an unplanned fix re-touch → unplanned rework rate 0.5.
    commit(tmp, 'src/foo.ts', 'feat: add foo');
    commit(tmp, 'src/foo.ts', 'fix: correct foo');

    const snapshot = await captureHealthSnapshot(tmp);
    expect(snapshot.metrics.reworkRate.maxUnplannedReworkRate).toBeGreaterThan(0);
    expect(snapshot.signals).toContain('rework-hotspot');
  });

  it('degrade-safe: a non-git directory yields a zeroed reworkRate, no signal, no throw', async () => {
    const snapshot = await captureHealthSnapshot(tmp);
    expect(snapshot.metrics.reworkRate).toEqual({
      maxUnplannedReworkRate: 0,
      reworkSurfaceCount: 0,
    });
    expect(snapshot.signals).not.toContain('rework-hotspot');
  });
});
