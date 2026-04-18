import * as fs from 'fs';
import * as path from 'path';
import { loadTrackerSyncConfig } from '@harness-engineering/core';

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
    const roadmapFile = path.join(projectPath, 'docs', 'roadmap.md');
    if (!fs.existsSync(roadmapFile)) return; // no roadmap — nothing to sync

    const { parseRoadmap, serializeRoadmap, syncRoadmap, applySyncChanges } =
      await import('@harness-engineering/core');

    const raw = fs.readFileSync(roadmapFile, 'utf-8');
    const parseResult = parseRoadmap(raw);
    if (!parseResult.ok) return;

    const roadmap = parseResult.value;
    const syncResult = syncRoadmap({ projectPath, roadmap });
    if (!syncResult.ok || syncResult.value.length === 0) {
      // Even if no local changes, still attempt external sync
      await triggerExternalSync(projectPath, roadmapFile);
      return;
    }

    applySyncChanges(roadmap, syncResult.value);
    fs.writeFileSync(roadmapFile, serializeRoadmap(roadmap), 'utf-8');

    // Fire external sync after local sync completes
    await triggerExternalSync(projectPath, roadmapFile);
  } catch {
    // Best-effort: never let roadmap sync failures break state operations
  }
}

/**
 * Detect tracker config in harness.config.json and fire fullSync if present.
 * Fire-and-forget: errors are logged to stderr but never propagated.
 */
export async function triggerExternalSync(projectPath: string, roadmapFile: string): Promise<void> {
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

    const result = await fullSync(roadmapFile, adapter, trackerConfig);

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
