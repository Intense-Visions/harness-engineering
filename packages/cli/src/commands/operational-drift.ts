// packages/cli/src/commands/operational-drift.ts
//
// Pure detection logic for `harness check-operational-drift` (roadmap #565).
//
// Operational policy — hook profiles, the pre-commit `--skip` list, config
// threshold values, and baseline-update policy — is load-bearing but tends to
// accumulate silently in commits without an ADR-grade record. This module
// answers one question against a diff: did a watched operational-policy surface
// change WITHOUT a corresponding ADR being added or modified in the same diff?
//
// Everything here is pure (no git, no fs). The command layer
// (`check-operational-drift.ts`) supplies the changed-file list and the
// base/head config objects; these functions decide what is flagged. That split
// keeps the detection fully unit-testable without spawning git.

import { minimatch } from 'minimatch';

export type OperationalDriftSeverity = 'advisory' | 'blocking';

/**
 * Resolved operational-policy watch configuration. Every field is
 * config-overridable via `operationalPolicy` in `harness.config.json`; the
 * defaults below encode the surfaces named in roadmap #565.
 */
export interface OperationalDriftPolicy {
  /** When false, the check is a no-op (always passes). */
  enabled: boolean;
  /**
   * `advisory` (default): findings are reported but the command exits 0.
   * `blocking`: an operational change with no ADR exits non-zero.
   */
  severity: OperationalDriftSeverity;
  /** Directory (repo-relative) where ADRs live; a change here satisfies the requirement. */
  adrDir: string;
  /**
   * Glob patterns (repo-relative, forward-slash) whose changed files are treated
   * as operational-policy changes. `.husky/**` covers hook scripts AND the
   * pre-commit `--skip` list (which is a `SKIP="…"` assignment inside
   * `.husky/pre-commit`).
   */
  watchedPaths: string[];
  /** The config file whose threshold fields are watched (repo-relative). */
  configFile: string;
  /**
   * Dotted JSON paths inside {@link configFile} whose sub-tree is threshold /
   * skip-list policy. A change to any of these sub-trees is an operational
   * change. Field-level (not whole-file) so unrelated config edits do not flag.
   */
  configThresholdPaths: string[];
}

/**
 * Defaults for the surfaces named in roadmap #565:
 * - `.husky/**` — hook scripts + the pre-commit `--skip` list.
 * - `packages/cli/src/hooks/profiles.ts` — hook profile tiers.
 * - `harness.config.json` threshold sub-trees — architecture / performance
 *   budgets and the security gate strictness.
 */
export const DEFAULT_OPERATIONAL_DRIFT_POLICY: OperationalDriftPolicy = {
  enabled: true,
  severity: 'advisory',
  adrDir: 'docs/knowledge/decisions',
  watchedPaths: ['.husky/**', 'packages/cli/src/hooks/profiles.ts'],
  configFile: 'harness.config.json',
  configThresholdPaths: [
    'architecture.thresholds',
    'performance.complexity.thresholds',
    'performance.coupling.thresholds',
    'security.strict',
    'security.rules',
  ],
};

/** A single operational-policy surface that changed in the diff. */
export interface OperationalDriftFinding {
  /** The surface identifier, e.g. `.husky/pre-commit` or `harness.config.json:architecture.thresholds`. */
  surface: string;
  /** Human-readable explanation of what changed. */
  detail: string;
}

/** Normalize a path to forward slashes so glob/prefix matching is platform-stable. */
export function normalizeRel(p: string): string {
  return p.replaceAll('\\', '/');
}

/** Resolve a dotted path (`a.b.c`) inside a parsed-JSON object; `undefined` if absent. */
export function getByPath(obj: unknown, dottedPath: string): unknown {
  const segments = dottedPath.split('.');
  let cursor: unknown = obj;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Deep array equality (order-sensitive), used by {@link deepEqual}. */
function arraysEqual(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
}

/** Deep plain-object equality (key-order-insensitive), used by {@link deepEqual}. */
function objectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key])
  );
}

/**
 * Order-insensitive deep equality for parsed-JSON values (objects, arrays,
 * primitives). Object key order does not matter; array order does.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  return aArr
    ? arraysEqual(a as unknown[], b as unknown[])
    : objectsEqual(a as Record<string, unknown>, b as Record<string, unknown>);
}

/**
 * Compare the watched threshold sub-trees between two parsed configs and return
 * the dotted paths that differ. `undefined` on either side is compared like any
 * value, so adding or removing a threshold block is detected too.
 */
export function changedThresholdPaths(
  baseConfig: unknown,
  headConfig: unknown,
  paths: string[]
): string[] {
  return paths.filter((p) => !deepEqual(getByPath(baseConfig, p), getByPath(headConfig, p)));
}

/** Result of a pure detection pass over a diff. */
export interface OperationalDriftDetection {
  /** Watched operational-policy surfaces that changed. */
  operationalChanges: OperationalDriftFinding[];
  /** ADR files added/modified in the same diff (repo-relative, normalized). */
  adrFiles: string[];
  /** True when an operational change occurred with NO corresponding ADR. */
  flagged: boolean;
}

/**
 * Decide, from a diff's changed-file list and a pre-computed set of changed
 * config-threshold paths, which operational-policy surfaces changed and whether
 * a corresponding ADR is present.
 *
 * "Corresponding ADR" = any added/modified file under `policy.adrDir` in the
 * same diff. If one is present, operational changes pass.
 */
export function detectOperationalDrift(input: {
  changedFiles: string[];
  policy: OperationalDriftPolicy;
  /** Dotted config-threshold paths that changed (from {@link changedThresholdPaths}). */
  changedConfigPaths: string[];
  /**
   * True when the config file changed but its base version could not be read to
   * diff fields (e.g. new file, or unreadable base). Falls back to flagging the
   * whole file, as documented in the proposal.
   */
  configUndiffable?: boolean;
}): OperationalDriftDetection {
  const { policy } = input;
  const changed = input.changedFiles.map(normalizeRel);
  const operationalChanges: OperationalDriftFinding[] = [];

  // 1) Glob-watched paths (hook scripts, profiles, the --skip list in .husky).
  for (const file of changed) {
    for (const pattern of policy.watchedPaths) {
      if (minimatch(file, pattern, { dot: true })) {
        operationalChanges.push({
          surface: file,
          detail: `operational-policy file changed (matches "${pattern}")`,
        });
        break;
      }
    }
  }

  // 2) Config threshold / skip-list fields.
  const configFile = normalizeRel(policy.configFile);
  if (input.configUndiffable && changed.includes(configFile)) {
    operationalChanges.push({
      surface: configFile,
      detail: `${configFile} changed but its base version could not be read to diff threshold fields; flagging the whole file`,
    });
  } else {
    for (const p of input.changedConfigPaths) {
      operationalChanges.push({
        surface: `${configFile}:${p}`,
        detail: `threshold/policy field "${p}" changed in ${configFile}`,
      });
    }
  }

  // 3) Corresponding ADR = any changed file under the ADR directory.
  const adrPrefix = normalizeRel(policy.adrDir).replace(/\/$/, '') + '/';
  const adrFiles = changed.filter((f) => f.startsWith(adrPrefix));

  const flagged = operationalChanges.length > 0 && adrFiles.length === 0;

  return { operationalChanges, adrFiles, flagged };
}
