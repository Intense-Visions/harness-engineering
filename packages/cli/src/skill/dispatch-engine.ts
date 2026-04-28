/**
 * Dispatch engine core -- enriches health snapshots with change-type and domain
 * signals, feeds into the recommendation engine, and annotates output.
 */

import { execSync } from 'node:child_process';
import type { ChangeType, DiffInfo } from '@harness-engineering/core';
import { detectChangeType } from '@harness-engineering/core';
import type { HealthSnapshot } from './health-snapshot.js';
import { loadCachedSnapshot, isSnapshotFresh, captureHealthSnapshot } from './health-snapshot.js';
import { detectDomainsFromFiles } from './stack-profile.js';
import { recommend, buildSkillAddressIndex } from './recommendation-engine.js';
import type { Recommendation } from './recommendation-types.js';
import type { DispatchContext, DispatchResult, DispatchedSkill } from './dispatch-types.js';

// ---------------------------------------------------------------------------
// Signal categories for parallel-safe detection
// ---------------------------------------------------------------------------

export const SIGNAL_CATEGORIES: Record<string, string> = {
  'circular-deps': 'structure',
  'layer-violations': 'structure',
  'high-coupling': 'structure',
  'dead-code': 'quality',
  drift: 'quality',
  'doc-gaps': 'quality',
  'security-findings': 'security',
  'perf-regression': 'performance',
  'low-coverage': 'coverage',
};

/**
 * Get the parallel-safety category for a signal.
 * Returns null for change-type, domain, and unmapped signals.
 */
export function getSignalCategory(signal: string): string | null {
  return SIGNAL_CATEGORIES[signal] ?? null;
}

// ---------------------------------------------------------------------------
// Git output parsers
// ---------------------------------------------------------------------------

/**
 * Parse `git diff --numstat` output into total lines changed and file list.
 */
export function parseNumstatOutput(output: string): {
  totalDiffLines: number;
  changedFiles: string[];
} {
  const lines = output.trim().split('\n').filter(Boolean);
  let totalDiffLines = 0;
  const changedFiles: string[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parts[0]!;
    const deleted = parts[1]!;
    const file = parts[2]!;
    changedFiles.push(file);
    // Binary files show '-' for added/deleted
    if (added !== '-') totalDiffLines += parseInt(added, 10) || 0;
    if (deleted !== '-') totalDiffLines += parseInt(deleted, 10) || 0;
  }

  return { totalDiffLines, changedFiles };
}

/**
 * Parse `git diff --diff-filter=A --name-only` output into new file list.
 */
export function parseNewFilesOutput(output: string): string[] {
  return output.trim().split('\n').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Git auto-detection helpers
// ---------------------------------------------------------------------------

/**
 * Get the latest commit message. Returns empty string if no commits exist.
 */
export function getLatestCommitMessage(projectPath: string): string {
  try {
    return execSync('git log -1 --format=%s', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Get changed files from `git diff --name-only HEAD`.
 * Returns empty array if no commits exist or diff fails.
 */
export function getChangedFiles(projectPath: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Run a git command and return trimmed stdout, or null on failure. */
function gitExec(cmd: string, cwd: string): string | null {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

/** Construct an empty DiffInfo with no changes. */
function emptyDiffInfo(): DiffInfo {
  return {
    changedFiles: [],
    newFiles: [],
    deletedFiles: [],
    totalDiffLines: 0,
    fileDiffs: new Map(),
  };
}

/**
 * Build a DiffInfo object from current git state.
 * Returns null if not in a git repository.
 */
export function buildDiffInfoFromGit(projectPath: string): DiffInfo | null {
  if (gitExec('git rev-parse --git-dir', projectPath) === null) return null;

  const numstatOutput = gitExec('git diff --numstat HEAD', projectPath);
  if (numstatOutput === null) return emptyDiffInfo();

  const { totalDiffLines, changedFiles } = parseNumstatOutput(numstatOutput);
  const newFiles = parseNewFilesOutput(
    gitExec('git diff --diff-filter=A --name-only HEAD', projectPath) ?? ''
  );
  const deletedFiles = parseNewFilesOutput(
    gitExec('git diff --diff-filter=D --name-only HEAD', projectPath) ?? ''
  );

  return { changedFiles, newFiles, deletedFiles, totalDiffLines, fileDiffs: new Map() };
}

// ---------------------------------------------------------------------------
// Enriched snapshot for dispatch
// ---------------------------------------------------------------------------

/**
 * Build an enriched DispatchContext by combining a health snapshot with
 * change-type and domain signals derived from git diff information.
 */
export async function enrichSnapshotForDispatch(
  projectPath: string,
  options: { files?: string[]; commitMessage?: string; fresh?: boolean }
): Promise<DispatchContext> {
  // 1. Get snapshot (cached or fresh)
  let snapshot: HealthSnapshot | null = null;
  let snapshotFreshness: 'fresh' | 'cached' = 'fresh';

  if (!options.fresh) {
    snapshot = loadCachedSnapshot(projectPath);
    if (snapshot && isSnapshotFresh(snapshot, projectPath)) {
      snapshotFreshness = 'cached';
    } else {
      snapshot = null; // stale, will recapture
    }
  }

  if (!snapshot) {
    snapshot = await captureHealthSnapshot(projectPath);
    snapshotFreshness = 'fresh';
  }

  // 2. Detect change type
  const commitMessage = options.commitMessage ?? '';
  const files = options.files ?? [];
  const diff: DiffInfo = {
    changedFiles: files,
    newFiles: [],
    deletedFiles: [],
    totalDiffLines: 0,
    fileDiffs: new Map(),
  };
  const changeType: ChangeType = detectChangeType(commitMessage, diff);

  // 3. Detect domains from changed files
  const domains = detectDomainsFromFiles(files);

  // 4. Merge all signals
  const changeSignal = `change-${changeType}`;
  const domainSignals = domains.map((d) => `domain-${d}`);
  const allSignals = [...snapshot.signals, changeSignal, ...domainSignals];

  return {
    snapshot,
    changeType,
    changedFiles: files,
    domains,
    allSignals,
    snapshotFreshness,
  };
}

// ---------------------------------------------------------------------------
// Annotation helpers
// ---------------------------------------------------------------------------

/**
 * Compute estimatedImpact from a recommendation.
 * hard address match (critical urgency) -> high, score >= 0.7 -> medium, else low.
 */
export function computeEstimatedImpact(rec: Recommendation): 'high' | 'medium' | 'low' {
  if (rec.urgency === 'critical') return 'high';
  if (rec.score >= 0.7) return 'medium';
  return 'low';
}

/**
 * Compute whether two adjacent skills are parallel-safe based on their triggered signals.
 * Skills are parallel-safe when they target non-overlapping signal categories.
 * Default to false if category cannot be determined.
 */
export function computeParallelSafe(prevTriggeredBy: string[], currTriggeredBy: string[]): boolean {
  if (prevTriggeredBy.length === 0) return true;

  const prevCategories = new Set<string>();
  const currCategories = new Set<string>();

  let prevHasCategory = false;
  let currHasCategory = false;

  for (const sig of prevTriggeredBy) {
    const cat = getSignalCategory(sig);
    if (cat) {
      prevCategories.add(cat);
      prevHasCategory = true;
    }
  }

  for (const sig of currTriggeredBy) {
    const cat = getSignalCategory(sig);
    if (cat) {
      currCategories.add(cat);
      currHasCategory = true;
    }
  }

  // If either skill has no categorizable signals, default to not parallel-safe
  if (!prevHasCategory || !currHasCategory) return false;

  // Check for overlap
  for (const cat of currCategories) {
    if (prevCategories.has(cat)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

/**
 * Run the dispatch engine: feed enriched signals into the recommendation engine,
 * then annotate output with parallel-safe flags, estimatedImpact, and dependsOn.
 */
export function dispatchSkills(
  context: DispatchContext,
  options: { limit?: number; trigger?: string; skillTriggers?: Map<string, string[]> } = {}
): DispatchResult {
  const { snapshot, changeType, domains, allSignals } = context;
  const limit = options.limit ?? 5;

  // Build an enriched snapshot with all signals for the recommendation engine
  const enrichedSnapshot: HealthSnapshot = { ...snapshot, signals: allSignals };

  // Run recommendation engine (uses fallback rules -- no skill index files needed)
  const recOpts: { top: number; trigger?: string; skillTriggers?: Map<string, string[]> } = {
    top: limit,
  };
  if (options.trigger) recOpts.trigger = options.trigger;
  if (options.skillTriggers) recOpts.skillTriggers = options.skillTriggers;
  const recResult = recommend(enrichedSnapshot, {}, recOpts);

  // Build the skill address index to get dependsOn info
  const addressIndex = buildSkillAddressIndex({});

  // Annotate recommendations into DispatchedSkill[]
  const skills: DispatchedSkill[] = recResult.recommendations.map((rec, i) => {
    const prevRec = i > 0 ? recResult.recommendations[i - 1] : null;
    const prevTriggeredBy = prevRec?.triggeredBy ?? [];
    const entry = addressIndex.get(rec.skillName);
    const dependsOn = entry?.dependsOn?.length ? entry.dependsOn : undefined;

    const dispatched: DispatchedSkill = {
      name: rec.skillName,
      score: rec.score,
      urgency: rec.urgency,
      reason: rec.reasons.join('; '),
      parallelSafe: computeParallelSafe(prevTriggeredBy, rec.triggeredBy),
      estimatedImpact: computeEstimatedImpact(rec),
    };
    if (dependsOn) dispatched.dependsOn = dependsOn;
    return dispatched;
  });

  return {
    context: {
      changeType,
      domains,
      signalCount: allSignals.length,
      snapshotFreshness: context.snapshotFreshness,
    },
    skills,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// High-level dispatch from git state
// ---------------------------------------------------------------------------

/**
 * Full dispatch pipeline: auto-detect from git, enrich, and dispatch.
 * Throws if not in a git repository.
 * Returns empty skills if diff is empty.
 */
export async function dispatchSkillsFromGit(
  projectPath: string,
  options: {
    fresh?: boolean;
    limit?: number;
    trigger?: string;
    skillTriggers?: Map<string, string[]>;
  } = {}
): Promise<DispatchResult> {
  // Check for git repository
  const diffInfo = buildDiffInfoFromGit(projectPath);
  if (diffInfo === null) {
    throw new Error('dispatch_skills requires a git repository');
  }

  // Empty diff -> empty result
  if (diffInfo.changedFiles.length === 0) {
    const commitMessage = getLatestCommitMessage(projectPath);
    const changeType: ChangeType = commitMessage
      ? detectChangeType(commitMessage, diffInfo)
      : 'feature';

    return {
      context: { changeType, domains: [], signalCount: 0, snapshotFreshness: 'cached' },
      skills: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // Auto-detect commit message and files
  const commitMessage = getLatestCommitMessage(projectPath);
  const files = diffInfo.changedFiles;

  // Enrich and dispatch
  const enrichOpts: { files?: string[]; commitMessage?: string; fresh?: boolean } = { files };
  if (commitMessage) enrichOpts.commitMessage = commitMessage;
  if (options.fresh) enrichOpts.fresh = options.fresh;
  const ctx = await enrichSnapshotForDispatch(projectPath, enrichOpts);

  const dispatchOpts: { limit?: number; trigger?: string; skillTriggers?: Map<string, string[]> } =
    {};
  if (options.limit !== undefined) dispatchOpts.limit = options.limit;
  if (options.trigger) dispatchOpts.trigger = options.trigger;
  if (options.skillTriggers) dispatchOpts.skillTriggers = options.skillTriggers;
  return dispatchSkills(ctx, dispatchOpts);
}
