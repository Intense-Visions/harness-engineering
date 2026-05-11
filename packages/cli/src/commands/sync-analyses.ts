import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { logger } from '../output/logger';
import {
  loadTrackerSyncConfig,
  loadProjectRoadmapMode,
  loadTrackerClientConfigFromProject,
  createTrackerClient,
} from '@harness-engineering/core';
import type { TrackerComment } from '@harness-engineering/types';
import type { AnalysisRecord } from '@harness-engineering/orchestrator';

function isValidRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.issueId === 'string' &&
    !!record.issueId &&
    typeof record.identifier === 'string' &&
    !!record.identifier &&
    typeof record.analyzedAt === 'string' &&
    !/[/\\]/.test(record.issueId as string)
  );
}

/**
 * Scan an array of tracker comments for the most recent one containing
 * a ```json fence with `"_harness_analysis": true`. Parse and return
 * the AnalysisRecord, or null if none found / all malformed.
 */
export function extractAnalysisFromComments(comments: TrackerComment[]): AnalysisRecord | null {
  const sorted = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const comment of sorted) {
    const fenceRegex = /```json\s*\r?\n([\s\S]*?)\r?\n```/g;
    let match: RegExpExecArray | null;

    while ((match = fenceRegex.exec(comment.body)) !== null) {
      try {
        const parsed = JSON.parse(match[1]!);
        if (parsed._harness_analysis !== true) continue;

        const { _harness_analysis, _version, ...record } = parsed;
        if (isValidRecord(record)) return record as AnalysisRecord;
      } catch {
        continue;
      }
    }
  }

  return null;
}

interface BootstrapResult {
  token: string;
  projectPath: string;
  trackerConfig: ReturnType<typeof loadTrackerSyncConfig> & object;
}

function bootstrapTrackerCommand(opts: { dir: string }, verb: string): BootstrapResult | null {
  const projectPath = path.resolve(opts.dir);
  const trackerConfig = loadTrackerSyncConfig(projectPath);

  if (!trackerConfig) {
    logger.error(`No tracker config found in harness.config.json. Cannot ${verb}.`);
    return null;
  }
  if (trackerConfig.kind !== 'github') {
    logger.error(
      `${verb} currently only supports 'github' tracker kind. Found: ${String(trackerConfig.kind)}`
    );
    return null;
  }

  const projectEnvPath = path.join(projectPath, '.env');
  if (fs.existsSync(projectEnvPath) && !process.env.GITHUB_TOKEN) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('dotenv').config({ path: projectEnvPath });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logger.error('No GITHUB_TOKEN environment variable found.');
    return null;
  }

  return { token, projectPath, trackerConfig };
}

async function loadRoadmapFeatures(
  projectPath: string
): Promise<Array<{ name: string; externalId: string }> | null> {
  // FR-S2: route on roadmap.mode instead of using `fs.existsSync(roadmap.md)`
  // as a proxy. In file-less mode, the file does not exist and the tracker
  // is canonical — fetch features through `RoadmapTrackerClient.fetchAll`.
  const mode = loadProjectRoadmapMode(projectPath);
  if (mode === 'file-less') {
    const trackerCfg = loadTrackerClientConfigFromProject(projectPath);
    if (!trackerCfg.ok) {
      logger.error(`File-less mode: ${trackerCfg.error.message}`);
      return null;
    }
    const clientR = createTrackerClient(trackerCfg.value);
    if (!clientR.ok) {
      logger.error(`File-less mode: ${clientR.error.message}`);
      return null;
    }
    const r = await clientR.value.fetchAll();
    if (!r.ok) {
      logger.error(`File-less mode: failed to fetch features from tracker: ${r.error.message}`);
      return null;
    }
    return r.value.features
      .filter((f) => !!f.externalId)
      .map((f) => ({ name: f.name, externalId: f.externalId }));
  }

  const roadmapFile = path.join(projectPath, 'docs', 'roadmap.md');
  if (!fs.existsSync(roadmapFile)) {
    logger.error('No docs/roadmap.md found. Cannot discover features with externalIds.');
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseRoadmap } = require('@harness-engineering/core');
  const roadmapParsed = parseRoadmap(fs.readFileSync(roadmapFile, 'utf-8'));
  if (!roadmapParsed.ok) {
    logger.error('Failed to parse docs/roadmap.md');
    return null;
  }

  const features: Array<{ name: string; externalId: string }> = [];
  for (const milestone of roadmapParsed.value.milestones) {
    for (const feature of milestone.features) {
      if (feature.externalId) {
        features.push({ name: feature.name, externalId: feature.externalId });
      }
    }
  }
  return features;
}

async function syncFeatureAnalyses(
  features: Array<{ name: string; externalId: string }>,
  adapter: {
    fetchComments: (
      id: string
    ) => Promise<
      import('@harness-engineering/types').Result<
        import('@harness-engineering/types').TrackerComment[]
      >
    >;
  },
  archive: { save: (record: AnalysisRecord) => Promise<void> },
  publishedIndex: Record<string, string>
): Promise<{ syncedCount: number; skippedCount: number; warnCount: number }> {
  let syncedCount = 0;
  let skippedCount = 0;
  let warnCount = 0;

  for (const { name, externalId } of features) {
    const commentsResult = await adapter.fetchComments(externalId);
    if (!commentsResult.ok) {
      logger.warn(
        `Failed to fetch comments for "${name}" (${externalId}): ${commentsResult.error.message}`
      );
      warnCount++;
      continue;
    }

    const record = extractAnalysisFromComments(commentsResult.value);
    if (!record) {
      skippedCount++;
      continue;
    }

    await archive.save(record);
    publishedIndex[record.issueId] = record.analyzedAt;
    syncedCount++;
    logger.info(`Synced analysis for "${name}" (${record.identifier})`);
  }

  return { syncedCount, skippedCount, warnCount };
}

async function runSyncAnalyses(opts: { dir: string }): Promise<void> {
  const bootstrap = bootstrapTrackerCommand(opts, 'sync');
  if (!bootstrap) return process.exit(1);
  const { token, projectPath, trackerConfig } = bootstrap;

  const features = await loadRoadmapFeatures(projectPath);
  if (!features) return process.exit(1);
  if (features.length === 0) {
    logger.info('No roadmap features have externalIds. Nothing to sync.');
    return;
  }

  const { AnalysisArchive, loadPublishedIndex, savePublishedIndex } =
    await import('@harness-engineering/orchestrator');
  const { GitHubIssuesSyncAdapter } = await import('@harness-engineering/core');

  const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
  const archive = new AnalysisArchive(path.join(projectPath, '.harness', 'analyses'));
  const publishedIndex = loadPublishedIndex(projectPath);

  const { syncedCount, skippedCount, warnCount } = await syncFeatureAnalyses(
    features,
    adapter,
    archive,
    publishedIndex
  );

  if (syncedCount > 0) {
    savePublishedIndex(projectPath, publishedIndex);
    logger.success(
      `Synced ${syncedCount} analysis record(s). Skipped ${skippedCount} (no analysis). Warnings: ${warnCount}.`
    );
  } else {
    logger.info(
      `No new analyses found on tracker. Skipped ${skippedCount} feature(s) with no analysis comments.`
    );
  }
}

export function createSyncAnalysesCommand(): Command {
  const command = new Command('sync-analyses')
    .description(
      'Pull published intelligence analyses from the external issue tracker into the local .harness/analyses/ directory'
    )
    .option('-d, --dir <path>', 'Workspace directory', process.cwd())
    .action(async (opts) => {
      try {
        await runSyncAnalyses(opts);
      } catch (err) {
        logger.error(`Error syncing analyses: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return command;
}
