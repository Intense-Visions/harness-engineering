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
 */
export type RowLinkOutcome =
  | { kind: 'not-configured' }
  | { kind: 'no-token' }
  | { kind: 'linked'; externalId: string }
  | { kind: 'failed'; reason: string };

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

    // This is `feature.externalId` after the push, expressed through the
    // returned SyncResult: on the create path the id lands in `created`
    // (resolveExternalId returns false, so no update is issued); on the dedup
    // and already-linked paths it lands in `updated`. No other case exists.
    const externalId = result.created[0]?.externalId ?? result.updated[0] ?? null;

    if (result.errors.length > 0) {
      const reasons = result.errors.map((e) => e.error.message).join('; ');
      // Create-succeeded-but-writeback-failed is an explicit case, not an
      // accident: name the orphaned id so an operator can repair by hand. A
      // retry of the same add is self-healing (the dedup index now matches).
      const orphan = externalId
        ? ` (ticket ${externalId} exists but the row was not linked to it)`
        : '';
      return { kind: 'failed', reason: `${reasons}${orphan}` };
    }
    if (!externalId) {
      return { kind: 'failed', reason: 'tracker returned no external id for the row' };
    }
    return { kind: 'linked', externalId };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}
