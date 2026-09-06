import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TrackerSyncConfig } from '@harness-engineering/types';
import { deriveRepoFromGitRemote } from './derive-repo';

/** The kinds `roadmap sync` can drive. Sync is GitHub-only (issue #1863). */
export const SYNC_SUPPORTED_TRACKER_KINDS = ['github'] as const;

/**
 * Why `loadTrackerSyncConfig` returned null — the distinction its `null` throws
 * away.
 *
 * `null` collapses four different situations into one, and the CLI rendered all
 * of them as "harness.config.json has no `roadmap.tracker` block". For a config
 * that HAS a well-formed block naming an unsupported kind, that message sends
 * the reader looking for a missing block that is sitting right in front of them
 * (issue #1863). Sync stays GitHub-only either way; this only makes the refusal
 * say what is actually true.
 */
export type TrackerConfigDiagnosis =
  | { readonly problem: 'none' }
  | { readonly problem: 'no-config-file' }
  | { readonly problem: 'unreadable-config-file' }
  | { readonly problem: 'no-tracker-block' }
  | { readonly problem: 'unsupported-kind'; readonly kind: string }
  | { readonly problem: 'malformed-status-map' };

/**
 * Explain what (if anything) stops `loadTrackerSyncConfig` from returning a
 * config. Additive and side-effect-free: the loader's own contract is
 * unchanged, so no existing caller shifts behaviour.
 */
export function diagnoseTrackerSyncConfig(projectRoot: string): TrackerConfigDiagnosis {
  const configPath = path.join(projectRoot, 'harness.config.json');
  if (!fs.existsSync(configPath)) return { problem: 'no-config-file' };

  let parsed: { roadmap?: { tracker?: unknown } };
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as typeof parsed;
  } catch {
    return { problem: 'unreadable-config-file' };
  }

  const tracker = parsed.roadmap?.tracker;
  if (!tracker || typeof tracker !== 'object') return { problem: 'no-tracker-block' };

  const t = tracker as Record<string, unknown>;
  const kind = typeof t.kind === 'string' ? t.kind : '';
  if (!(SYNC_SUPPORTED_TRACKER_KINDS as readonly string[]).includes(kind)) {
    return { problem: 'unsupported-kind', kind };
  }
  if (typeof t.statusMap !== 'object' || t.statusMap === null) {
    return { problem: 'malformed-status-map' };
  }
  const allStrings = Object.values(t.statusMap as Record<string, unknown>).every(
    (val) => typeof val === 'string'
  );
  return allStrings ? { problem: 'none' } : { problem: 'malformed-status-map' };
}

/**
 * A reader-facing sentence for each diagnosis, naming the supported kinds when
 * the kind is the problem so the next step is obvious from the message alone.
 */
export function explainTrackerSyncConfig(diagnosis: TrackerConfigDiagnosis): string {
  const supported = SYNC_SUPPORTED_TRACKER_KINDS.join(', ');
  switch (diagnosis.problem) {
    case 'none':
      return 'Tracker config is usable.';
    case 'no-config-file':
      return (
        'No harness.config.json at the project root — `roadmap sync` needs one ' +
        'carrying a `roadmap.tracker` block (kind, repo, labels, statusMap).'
      );
    case 'unreadable-config-file':
      return (
        'harness.config.json could not be parsed as JSON, so its ' +
        '`roadmap.tracker` block could not be read.'
      );
    case 'no-tracker-block':
      return (
        'harness.config.json has no `roadmap.tracker` block. Add one (kind, repo, ' +
        'labels, statusMap) before running `harness roadmap sync` — without it ' +
        'there is nothing to sync to.'
      );
    case 'unsupported-kind':
      return (
        `roadmap.tracker.kind ${JSON.stringify(diagnosis.kind)} is not supported by ` +
        `\`harness roadmap sync\` (supported: ${supported}). The block IS present — ` +
        'sync is GitHub-only, so a tracker registered for the client seam is not ' +
        'usable here yet (issue #1863).'
      );
    case 'malformed-status-map':
      return (
        'roadmap.tracker.statusMap is missing or is not a map of strings — every ' +
        'roadmap status must map to an external status string.'
      );
  }
}

function isValidTrackerShape(tracker: unknown): tracker is TrackerSyncConfig {
  if (!tracker || typeof tracker !== 'object') return false;

  const t = tracker as Record<string, unknown>;
  // Stated once, in SYNC_SUPPORTED_TRACKER_KINDS, so the guard and the
  // diagnosis can never disagree about which kinds sync accepts.
  const kind = typeof t.kind === 'string' ? t.kind : '';
  if (!(SYNC_SUPPORTED_TRACKER_KINDS as readonly string[]).includes(kind)) return false;
  if (typeof t.statusMap !== 'object' || t.statusMap === null) return false;

  const allStrings = Object.values(t.statusMap as Record<string, unknown>).every(
    (val) => typeof val === 'string'
  );
  return allStrings;
}

/**
 * Load tracker sync config from harness.config.json at the given project root.
 * Returns null if the file is missing, the tracker section is absent, or the
 * config is malformed. Performs runtime validation without requiring Zod.
 */
export function loadTrackerSyncConfig(projectRoot: string): TrackerSyncConfig | null {
  try {
    const configPath = path.join(projectRoot, 'harness.config.json');
    if (!fs.existsSync(configPath)) return null;

    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as { roadmap?: { tracker?: unknown } };

    const tracker = config.roadmap?.tracker;
    if (!isValidTrackerShape(tracker)) return null;

    // Default `repo` from the git origin remote when unset, so downstream
    // repos that copy a config template (or omit the key) sync against their
    // own repo instead of no-oping. Explicit config always wins (#902).
    if (!tracker.repo) {
      const derived = deriveRepoFromGitRemote(projectRoot);
      if (derived) return { ...tracker, repo: derived };
    }

    return tracker;
  } catch {
    return null;
  }
}
