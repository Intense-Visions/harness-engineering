import * as fs from 'fs';
import * as path from 'path';
import {
  loadTrackerSyncConfig,
  resolveRoadmapStore,
  applyRoadmapDiff,
  roadmapSourceExists,
} from '@harness-engineering/core';
import type { TrackerSyncConfig } from '@harness-engineering/types';
import type { TrackerSyncAdapter } from '@harness-engineering/core';

/**
 * Automatically sync the roadmap after state transitions.
 *
 * This is the mechanical enforcement layer — it runs syncRoadmap with apply=true
 * as a side effect of state transitions, removing the dependency on agents
 * remembering to call manage_roadmap manually.
 *
 * If tracker config is present in harness.config.json, also fires fullSync
 * to keep the external tracker in sync. External sync is fire-and-forget from
 * the caller's perspective: errors are logged but never block the state transition.
 *
 * Failures are swallowed: roadmap sync is best-effort and must never break
 * the primary state operation.
 */
export async function autoSyncRoadmap(projectPath: string): Promise<void> {
  try {
    // Resolve the roadmap SOURCE (shards when docs/roadmap.d/ exists, else the
    // monolith aggregate). No source → nothing to sync.
    if (!roadmapSourceExists(projectPath)) return;

    const { syncRoadmap, applySyncChanges } = await import('@harness-engineering/core');

    const store = resolveRoadmapStore({ projectRoot: projectPath });
    const loaded = await store.load();
    if (!loaded.ok) return;

    const roadmap = loaded.value;
    const before = structuredClone(roadmap);

    // syncRoadmap reads execution progress from the event-sourced snapshot (issue 667).
    const syncResult = await syncRoadmap({ projectPath, roadmap });
    if (!syncResult.ok || syncResult.value.length === 0) {
      // Even if no local changes, still attempt external sync.
      await triggerExternalSync(projectPath);
      return;
    }

    applySyncChanges(roadmap, syncResult.value);
    // Per-shard writeback (+ aggregate regen in sharded mode); whole-file in monolith.
    await applyRoadmapDiff(store, before, roadmap);

    // Fire external sync after local sync completes.
    await triggerExternalSync(projectPath);
  } catch {
    // Best-effort: never let roadmap sync failures break state operations
  }
}

/**
 * Detect tracker config in harness.config.json and fire fullSync if present.
 * Fire-and-forget: errors are logged to stderr but never propagated.
 */
export async function triggerExternalSync(projectPath: string): Promise<void> {
  try {
    const trackerConfig = loadTrackerSyncConfig(projectPath);
    if (!trackerConfig) return;

    // Load .env from the project root — the MCP server's startup dotenv/config
    // loads from process.cwd() which may differ from the project being synced.
    const projectEnvPath = path.join(projectPath, '.env');
    if (fs.existsSync(projectEnvPath) && !process.env.GITHUB_TOKEN) {
      const { config: loadDotenv } = await import('dotenv');
      loadDotenv({ path: projectEnvPath });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn('[roadmap-sync] GITHUB_TOKEN not found — external sync skipped');
      return;
    }

    const { fullSync, GitHubIssuesSyncAdapter } = await import('@harness-engineering/core');

    const adapter = new GitHubIssuesSyncAdapter({
      token,
      config: trackerConfig,
    });

    const result = await fullSync(projectPath, adapter, trackerConfig);

    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(
          `[roadmap-sync] External sync error for ${err.featureOrId}: ${err.error.message}`
        );
      }
    }
  } catch (error) {
    console.error(
      `[roadmap-sync] External sync failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Outcome of linking a single roadmap row to its tracker ticket.
 * `not-configured` is the silent, expected case for projects with no tracker.
 *
 * `linked` means the row carries its `External-ID` ON DISK. It may still carry
 * a `warning` — a tracker patch can fail after the link was written, which is
 * worth reporting but is not a link failure. `failed` means the row is NOT
 * linked on disk; its `externalId`, when present, names a ticket that exists
 * but was never joined to the row (an orphan an operator must repair).
 */
export type RowLinkOutcome =
  | { kind: 'not-configured' }
  | { kind: 'no-token' }
  | { kind: 'linked'; externalId: string; warning?: string }
  | { kind: 'failed'; reason: string; externalId?: string };

/**
 * Push ONE roadmap row to the tracker and report the outcome.
 *
 * Unlike `triggerExternalSync` (fire-and-forget, swallows everything), this
 * reports: a caller that just added a row must be able to tell whether the row
 * is actually linked. Never throws.
 *
 * `deps.makeAdapter` is an injection seam, not decoration: `triggerExternalSync`
 * builds its adapter internally, which is why no test can drive that path
 * against a fake tracker. Production callers omit `deps`.
 */
export async function triggerScopedExternalSync(
  projectPath: string,
  featureName: string,
  deps?: { makeAdapter?: (token: string, config: TrackerSyncConfig) => TrackerSyncAdapter }
): Promise<RowLinkOutcome> {
  try {
    const trackerConfig = loadTrackerSyncConfig(projectPath);
    if (!trackerConfig) return { kind: 'not-configured' };

    const projectEnvPath = path.join(projectPath, '.env');
    if (fs.existsSync(projectEnvPath) && !process.env.GITHUB_TOKEN) {
      const { config: loadDotenv } = await import('dotenv');
      loadDotenv({ path: projectEnvPath });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn('[roadmap-sync] GITHUB_TOKEN not found — row link skipped');
      return { kind: 'no-token' };
    }

    const { syncRowToExternal, GitHubIssuesSyncAdapter } =
      await import('@harness-engineering/core');
    const adapter = deps?.makeAdapter
      ? deps.makeAdapter(token, trackerConfig)
      : new GitHubIssuesSyncAdapter({ token, config: trackerConfig });

    const result = await syncRowToExternal(projectPath, adapter, trackerConfig, featureName);

    // Classify on the post-push `feature.externalId`, NOT on created/updated:
    // when a row dedup-links to an existing ticket and the follow-up patch
    // fails, both arrays are empty even though the id was stamped and written
    // to disk. Classifying on the arrays would report `failed` — and name no
    // orphan — for a row that is linked, which is the exact response/disk
    // divergence this outcome type exists to prevent.
    const { externalId } = result;
    const reasons = result.errors.map((e) => e.error.message).join('; ');
    // `'*'` is the writeback envelope (see syncRowToExternal): it is the only
    // error that means the row on disk did NOT record the link.
    const writebackFailed = result.errors.some((e) => e.featureOrId === '*');

    if (!externalId) {
      return { kind: 'failed', reason: reasons || 'tracker returned no external id for the row' };
    }
    if (writebackFailed) {
      // Linked at the tracker, unlinked on disk. Name the orphaned id so an
      // operator can repair by hand.
      return {
        kind: 'failed',
        externalId,
        reason: `${reasons} (ticket ${externalId} exists but the row was not linked to it)`,
      };
    }
    // The row IS linked on disk. A tracker-side error here (e.g. the follow-up
    // patch failed) is a non-fatal warning, not a link failure.
    if (reasons) return { kind: 'linked', externalId, warning: reasons };
    return { kind: 'linked', externalId };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
