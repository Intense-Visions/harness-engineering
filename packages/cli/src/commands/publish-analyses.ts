import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { logger } from '../output/logger';
import { loadTrackerSyncConfig } from '@harness-engineering/core';
import {
  renderAnalysisComment,
  loadPublishedIndex,
  savePublishedIndex,
} from '@harness-engineering/orchestrator';

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

function buildNameToExternalIdMap(projectPath: string): Map<string, string> | null {
  const roadmapFile = path.join(projectPath, 'docs', 'roadmap.md');
  if (!fs.existsSync(roadmapFile)) {
    logger.error('No docs/roadmap.md found. Cannot map issue hashes to external IDs.');
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseRoadmap } = require('@harness-engineering/core');
  const roadmapParsed = parseRoadmap(fs.readFileSync(roadmapFile, 'utf-8'));
  if (!roadmapParsed.ok) {
    logger.error('Failed to parse docs/roadmap.md');
    return null;
  }

  const map = new Map<string, string>();
  for (const milestone of roadmapParsed.value.milestones) {
    for (const feature of milestone.features) {
      if (feature.externalId) {
        map.set(feature.name.toLowerCase(), feature.externalId);
      }
    }
  }
  return map;
}

function resolveExternalId(
  record: { identifier: string; externalId?: string },
  nameToExternalId: Map<string, string>
): string | null {
  if (record.externalId) return record.externalId;

  for (const [featName, extId] of nameToExternalId) {
    const prefix = featName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 20);
    if (record.identifier.startsWith(prefix)) return extId;
  }
  return null;
}

async function publishUnpublishedAnalyses(
  analyses: Array<{ issueId: string; identifier: string; [k: string]: unknown }>,
  adapter: {
    addComment: (
      id: string,
      body: string
    ) => Promise<import('@harness-engineering/types').Result<void>>;
  },
  nameToExternalId: Map<string, string>,
  publishedIndex: Record<string, string>
): Promise<number> {
  let publishedCount = 0;

  for (const record of analyses) {
    if (publishedIndex[record.issueId]) continue;

    const externalId = resolveExternalId(record, nameToExternalId);
    if (!externalId) {
      logger.dim(`Skipping ${record.identifier}: could not resolve externalId from roadmap`);
      continue;
    }

    logger.info(`Publishing analysis for ${record.identifier} to ${externalId}...`);
    const result = await adapter.addComment(externalId, renderAnalysisComment(record));

    if (result.ok) {
      publishedIndex[record.issueId] = new Date().toISOString();
      publishedCount++;
    } else {
      logger.error(`Failed to publish ${record.identifier}: ${result.error.message}`);
    }
  }

  return publishedCount;
}

async function runPublishAnalyses(opts: { dir: string }): Promise<void> {
  const bootstrap = bootstrapTrackerCommand(opts, 'publish');
  if (!bootstrap) return process.exit(1);
  const { token, projectPath, trackerConfig } = bootstrap;

  const nameToExternalId = buildNameToExternalIdMap(projectPath);
  if (!nameToExternalId) return process.exit(1);

  const { AnalysisArchive } = await import('@harness-engineering/orchestrator');
  const { GitHubIssuesSyncAdapter } = await import('@harness-engineering/core');

  const archive = new AnalysisArchive(path.join(projectPath, '.harness', 'analyses'));
  const analyses = await archive.list();
  if (analyses.length === 0) {
    logger.info('No analyses found to publish.');
    return;
  }

  const publishedIndex = loadPublishedIndex(projectPath);
  const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });

  const publishedCount = await publishUnpublishedAnalyses(
    analyses,
    adapter,
    nameToExternalId,
    publishedIndex
  );

  if (publishedCount > 0) {
    savePublishedIndex(projectPath, publishedIndex);
    logger.success(`Successfully published ${publishedCount} analyses.`);
  } else {
    logger.info('All analyses are already up to date on external tracker.');
  }
}

export function createPublishAnalysesCommand(): Command {
  const command = new Command('publish-analyses')
    .description(
      'Publishes locally generated intelligence analyses to the external issue tracker (e.g., GitHub)'
    )
    .option('-d, --dir <path>', 'Workspace directory', process.cwd())
    .action(async (opts) => {
      try {
        await runPublishAnalyses(opts);
      } catch (err) {
        logger.error(
          `Error publishing analyses: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    });

  return command;
}
