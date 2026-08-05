import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OPERATIONAL_DRIFT_POLICY,
  changedThresholdPaths,
  deepEqual,
  detectOperationalDrift,
  getByPath,
  normalizeRel,
  type OperationalDriftPolicy,
} from './operational-drift';

/**
 * Contract for the pure operational-drift detection (roadmap #565). Exercises the
 * three required fixtures — operational change + ADR in the same diff → pass;
 * operational change without ADR → flag; unrelated change → pass — plus the
 * field-level config-threshold diffing and the whole-file fallback.
 */

const policy: OperationalDriftPolicy = { ...DEFAULT_OPERATIONAL_DRIFT_POLICY };

describe('normalizeRel', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeRel('a\\b\\c')).toBe('a/b/c');
  });
});

describe('getByPath / deepEqual', () => {
  it('resolves nested dotted paths and returns undefined for missing', () => {
    const obj = { a: { b: { c: 15 } } };
    expect(getByPath(obj, 'a.b.c')).toBe(15);
    expect(getByPath(obj, 'a.b.x')).toBeUndefined();
    expect(getByPath(obj, 'a.z.c')).toBeUndefined();
  });

  it('is order-insensitive for object keys but order-sensitive for arrays', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ x: { y: [1, 2] } }, { x: { y: [1, 2] } })).toBe(true);
  });
});

describe('changedThresholdPaths', () => {
  it('reports only the threshold sub-trees that actually differ', () => {
    const base = {
      architecture: { thresholds: { complexity: { max: 15 } } },
      security: { strict: false },
    };
    const head = {
      architecture: { thresholds: { complexity: { max: 20 } } }, // softened
      security: { strict: false }, // unchanged
    };
    const paths = ['architecture.thresholds', 'security.strict'];
    const changed = changedThresholdPaths(base, head, paths);
    expect(changed).toEqual(['architecture.thresholds']);
    // Dynamic count assertion (no hardcoded literal count).
    const expectedChangedCount = paths.filter(
      (p) => JSON.stringify(getByPath(base, p)) !== JSON.stringify(getByPath(head, p))
    ).length;
    expect(changed).toHaveLength(expectedChangedCount);
  });

  it('detects adding or removing a threshold block', () => {
    const base = { security: {} };
    const head = { security: { strict: true } };
    expect(changedThresholdPaths(base, head, ['security.strict'])).toEqual(['security.strict']);
  });
});

describe('detectOperationalDrift', () => {
  it('flags an operational change (hook profile) with no ADR', () => {
    const changedFiles = ['packages/cli/src/hooks/profiles.ts', 'packages/cli/src/index.ts'];
    const result = detectOperationalDrift({ changedFiles, policy, changedConfigPaths: [] });
    expect(result.flagged).toBe(true);
    expect(result.adrFiles).toHaveLength(0);
    expect(result.operationalChanges).toHaveLength(1);
    expect(result.operationalChanges[0]?.surface).toBe('packages/cli/src/hooks/profiles.ts');
  });

  it('passes when an operational change is accompanied by an ADR in the same diff', () => {
    const opFiles = ['.husky/pre-commit'];
    const adrFiles = ['docs/knowledge/decisions/0099-soften-precommit.md'];
    const changedFiles = [...opFiles, ...adrFiles];
    const result = detectOperationalDrift({ changedFiles, policy, changedConfigPaths: [] });
    expect(result.flagged).toBe(false);
    expect(result.adrFiles).toEqual(adrFiles);
    // One finding per watched operational file.
    expect(result.operationalChanges).toHaveLength(opFiles.length);
  });

  it('passes for an unrelated change (no operational surface touched)', () => {
    const changedFiles = ['packages/cli/src/commands/check-docs.ts', 'README.md'];
    const result = detectOperationalDrift({ changedFiles, policy, changedConfigPaths: [] });
    expect(result.flagged).toBe(false);
    expect(result.operationalChanges).toHaveLength(0);
  });

  it('flags a config threshold field change with no ADR (field-level)', () => {
    const changedFiles = ['harness.config.json'];
    const changedConfigPaths = ['architecture.thresholds'];
    const result = detectOperationalDrift({ changedFiles, policy, changedConfigPaths });
    expect(result.flagged).toBe(true);
    expect(result.operationalChanges).toHaveLength(changedConfigPaths.length);
    expect(result.operationalChanges[0]?.surface).toBe(
      'harness.config.json:architecture.thresholds'
    );
  });

  it('does NOT flag a config change whose watched threshold fields are untouched', () => {
    // config file is in the diff, but changedConfigPaths is empty (e.g. only `name` changed)
    const changedFiles = ['harness.config.json'];
    const result = detectOperationalDrift({ changedFiles, policy, changedConfigPaths: [] });
    expect(result.flagged).toBe(false);
    expect(result.operationalChanges).toHaveLength(0);
  });

  it('falls back to flagging the whole config file when the base is undiffable', () => {
    const changedFiles = ['harness.config.json'];
    const result = detectOperationalDrift({
      changedFiles,
      policy,
      changedConfigPaths: [],
      configUndiffable: true,
    });
    expect(result.flagged).toBe(true);
    expect(result.operationalChanges).toHaveLength(1);
    expect(result.operationalChanges[0]?.surface).toBe('harness.config.json');
  });

  it('matches the pre-commit --skip list via the .husky glob', () => {
    // The --skip list lives as SKIP="…" inside .husky/pre-commit, covered by `.husky/**`.
    const changedFiles = ['.husky/pre-commit'];
    const result = detectOperationalDrift({ changedFiles, policy, changedConfigPaths: [] });
    expect(result.flagged).toBe(true);
    expect(result.operationalChanges.map((f) => f.surface)).toContain('.husky/pre-commit');
  });
});
