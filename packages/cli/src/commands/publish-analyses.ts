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

export function createPublishAnalysesCommand(): Command {
  const command = new Command('publish-analyses')
    .description('Publishes locally generated intelligence analyses to the external issue tracker (e.g., GitHub)')
    .option('-d, --dir <path>', 'Workspace directory', process.cwd())
    .action(async (opts) => {
      const projectPath = path.resolve(opts.dir);

      try {
        const trackerConfig = loadTrackerSyncConfig(projectPath);
        if (!trackerConfig) {
          logger.error('No tracker config found in harness.config.json. Cannot publish.');
          process.exit(1);
        }

        if (trackerConfig.kind !== 'github') {
          logger.error(`Publishing analyses currently only supports 'github' tracker kind. Found: ${trackerConfig.kind}`);
          process.exit(1);
        }

        const projectEnvPath = path.join(projectPath, '.env');
        if (fs.existsSync(projectEnvPath) && !process.env.GITHUB_TOKEN) {
          const { config: loadDotenv } = await import('dotenv');
          loadDotenv({ path: projectEnvPath });
        }

        const token = process.env.GITHUB_TOKEN;
        if (!token) {
          logger.error('No GITHUB_TOKEN environment variable found.');
          process.exit(1);
        }

        const { AnalysisArchive } = await import('@harness-engineering/orchestrator');
        const { GitHubIssuesSyncAdapter } = await import('@harness-engineering/core');
        const { parseRoadmap } = await import('@harness-engineering/core');

        const roadmapFile = path.join(projectPath, 'docs', 'roadmap.md');
        if (!fs.existsSync(roadmapFile)) {
          logger.error('No docs/roadmap.md found. Cannot map issue hashes to external IDs.');
          process.exit(1);
        }
        
        const roadmapRaw = fs.readFileSync(roadmapFile, 'utf-8');
        const roadmapParsed = parseRoadmap(roadmapRaw);
        if (!roadmapParsed.ok) {
          logger.error('Failed to parse docs/roadmap.md');
          process.exit(1);
        }

        // Build mapping of feature name identifier -> externalId
        const nameToExternalId = new Map<string, string>();
        for (const milestone of roadmapParsed.value.milestones) {
          for (const feature of milestone.features) {
            if (feature.externalId) {
              nameToExternalId.set(feature.name.toLowerCase(), feature.externalId);
            }
          }
        }

        const archive = new AnalysisArchive(path.join(projectPath, '.harness', 'analyses'));
        const analyses = await archive.list();
        if (analyses.length === 0) {
          logger.info('No analyses found to publish.');
          return;
        }

        const publishedIndex = loadPublishedIndex(projectPath);
        const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
        
        let publishedCount = 0;

        for (const record of analyses) {
          if (publishedIndex[record.issueId]) {
            // Already published this issue
            continue;
          }

          // Prefer the externalId wired at analysis time (Phase 2+).
          // Fall back to prefix matching for legacy records that predate the externalId field.
          let externalId: string | null = record.externalId ?? null;

          if (!externalId) {
            for (const [featName, extId] of nameToExternalId) {
              const prefix = featName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
              if (record.identifier.startsWith(prefix)) {
                externalId = extId;
                break;
              }
            }
          }

          if (!externalId) {
            logger.dim(`Skipping ${record.identifier}: could not resolve externalId from roadmap`);
            continue;
          }

          logger.info(`Publishing analysis for ${record.identifier} to ${externalId}...`);
          
          const commentBody = renderAnalysisComment(record);
          const result = await adapter.addComment(externalId, commentBody);

          if (result.ok) {
            publishedIndex[record.issueId] = new Date().toISOString();
            publishedCount++;
          } else {
            logger.error(`Failed to publish ${record.identifier}: ${result.error.message}`);
          }
        }

        if (publishedCount > 0) {
          savePublishedIndex(projectPath, publishedIndex);
          logger.success(`Successfully published ${publishedCount} analyses.`);
        } else {
          logger.info('All analyses are already up to date on external tracker.');
        }

      } catch (err) {
        logger.error(`Error publishing analyses: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return command;
}
