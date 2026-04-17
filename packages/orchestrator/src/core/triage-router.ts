import type { Issue } from '@harness-engineering/types';

/**
 * Candidate skills the orchestrator may dispatch to. Keep this set
 * small on purpose — the triage router is a coarse routing layer, not
 * a skill registry.
 */
export type TriageSkill =
  | 'code-review'
  | 'security-review'
  | 'planning'
  | 'debugging'
  | 'refactoring'
  | 'docs';

/**
 * Shape-of-work signals the triage router consumes. These are derived
 * from the Issue plus diff metadata by the caller.
 */
export interface TriageSignals {
  /** Raw title/body prefix, e.g. "feat:", "fix:", "docs:", "security:" */
  titlePrefix?: string;
  /** True if the diff touches auth, crypto, session, or similar paths */
  touchesSecuritySensitivePaths?: boolean;
  /** True if the diff touches a migrations or schema directory */
  touchesMigrationPaths?: boolean;
  /** Count of changed files in the diff */
  changedFileCount?: number;
  /** Whether tests are failing on the issue branch */
  hasFailingTests?: boolean;
  /** Whether the issue is marked or labeled as a rollback */
  isRollback?: boolean;
  /** True if every changed file is `.md` */
  isDocsOnly?: boolean;
}

/**
 * Structured decision the orchestrator persists and consumes.
 */
export interface TriageDecision {
  /** Target skill for dispatch. */
  skill: TriageSkill;
  /** Specific agent within the skill, optional. */
  agent?: string;
  /** Router confidence in the decision. */
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable justifications (one entry per rule that matched). */
  reasons: string[];
}

/**
 * Optional user/project overrides for path heuristics and rule thresholds.
 */
export interface TriageConfig {
  /** Max changed files for a fix to still route to code-review (default 3). */
  smallFixChangedFileMax?: number;
}

const DEFAULT_CONFIG: Required<TriageConfig> = {
  smallFixChangedFileMax: 3,
};

const SECURITY_LABELS = new Set(['security', 'sec', 'security-review']);
const ROLLBACK_LABELS = new Set(['rollback', 'revert']);

const PREFIX_RE = /^([a-z][a-z0-9-]*)(\([^)]*\))?:/i;

/**
 * Extract the conventional-commit prefix (lowercased) from a title.
 * Returns undefined if no prefix is present.
 */
export function extractTitlePrefix(title: string | null | undefined): string | undefined {
  if (!title) return undefined;
  const match = PREFIX_RE.exec(title.trim());
  return match?.[1]?.toLowerCase();
}

/**
 * Decide which skill/agent the orchestrator should dispatch this issue to.
 *
 * Rule order (first match wins):
 *  1. isRollback                          → debugging (high)
 *  2. security prefix or security paths   → security-review (high)
 *  3. docs prefix or docs-only diff       → docs (high)
 *  4. hasFailingTests                     → debugging (medium)
 *  5. touchesMigrationPaths               → planning (high)
 *  6. fix: with small change              → code-review (high)
 *  7. feat:                               → planning (medium)
 *  8. refactor:                           → refactoring (medium)
 *  9. default                             → code-review (low)
 *
 * Triage is meant to run BEFORE `routeIssue()`; the selected skill is
 * persisted on the live session so downstream dispatch does not
 * re-derive it.
 */
export function triageIssue(
  issue: Issue,
  signals: TriageSignals,
  config?: TriageConfig
): TriageDecision {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const reasons: string[] = [];
  const prefix = signals.titlePrefix ?? extractTitlePrefix(issue.title);

  const hasLabel = (set: ReadonlySet<string>): boolean =>
    issue.labels.some((l) => set.has(l.toLowerCase()));

  // 1. Rollback
  if (signals.isRollback || hasLabel(ROLLBACK_LABELS)) {
    reasons.push('Rollback flagged — route to debugging for root-cause review.');
    return { skill: 'debugging', confidence: 'high', reasons };
  }

  // 2. Security
  if (prefix === 'security' || signals.touchesSecuritySensitivePaths || hasLabel(SECURITY_LABELS)) {
    if (prefix === 'security') reasons.push('Security prefix in title.');
    if (signals.touchesSecuritySensitivePaths)
      reasons.push('Diff touches security-sensitive paths.');
    if (hasLabel(SECURITY_LABELS)) reasons.push('Issue has a security label.');
    return { skill: 'security-review', confidence: 'high', reasons };
  }

  // 3. Docs
  if (prefix === 'docs' || prefix === 'doc' || signals.isDocsOnly) {
    if (prefix === 'docs' || prefix === 'doc') reasons.push('Docs prefix in title.');
    if (signals.isDocsOnly) reasons.push('All changed files are markdown.');
    return { skill: 'docs', confidence: 'high', reasons };
  }

  // 4. Failing tests
  if (signals.hasFailingTests) {
    reasons.push('Tests are failing on the branch — route to debugging.');
    return { skill: 'debugging', confidence: 'medium', reasons };
  }

  // 5. Migration paths
  if (signals.touchesMigrationPaths) {
    reasons.push('Diff touches migration/schema paths — planning required before execution.');
    return { skill: 'planning', confidence: 'high', reasons };
  }

  // 6. Small fix — eligible for quick code-review shortcut
  if (
    (prefix === 'fix' || prefix === 'bugfix') &&
    (signals.changedFileCount ?? Infinity) <= cfg.smallFixChangedFileMax
  ) {
    reasons.push(`Small ${prefix} (≤${cfg.smallFixChangedFileMax} files) — code-review.`);
    return { skill: 'code-review', confidence: 'high', reasons };
  }

  // 6a. Large fix — investigation-level, route to planning
  if (
    (prefix === 'fix' || prefix === 'bugfix') &&
    (signals.changedFileCount ?? 0) > cfg.smallFixChangedFileMax
  ) {
    reasons.push(
      `Large ${prefix} (${signals.changedFileCount ?? 0} files > ${cfg.smallFixChangedFileMax}) — planning.`
    );
    return { skill: 'planning', confidence: 'medium', reasons };
  }

  // 7. Feature
  if (prefix === 'feat' || prefix === 'feature') {
    reasons.push('Feature prefix — planning skill produces a plan before execution.');
    return { skill: 'planning', confidence: 'medium', reasons };
  }

  // 8. Refactor
  if (prefix === 'refactor') {
    reasons.push('Refactor prefix — refactoring skill enforces behavioral invariants.');
    return { skill: 'refactoring', confidence: 'medium', reasons };
  }

  // 9. Default
  reasons.push('No specific routing signal matched — default to code-review.');
  return { skill: 'code-review', confidence: 'low', reasons };
}
