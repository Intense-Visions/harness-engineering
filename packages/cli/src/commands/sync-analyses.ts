import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { logger } from '../output/logger';
import { loadTrackerSyncConfig } from '@harness-engineering/core';
import type { TrackerComment } from '@harness-engineering/types';
import type { AnalysisRecord } from '@harness-engineering/orchestrator';

/**
 * Scan an array of tracker comments for the most recent one containing
 * a ```json fence with `"_harness_analysis": true`. Parse and return
 * the AnalysisRecord, or null if none found / all malformed.
 */
export function extractAnalysisFromComments(
  comments: TrackerComment[]
): AnalysisRecord | null {
  // Sort by createdAt descending so we check the most recent first
  const sorted = [...comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const comment of sorted) {
    // Match ```json ... ``` fences (handle both LF and CRLF line endings)
    const fenceRegex = /```json\s*\r?\n([\s\S]*?)\r?\n```/g;
    let match: RegExpExecArray | null;

    while ((match = fenceRegex.exec(comment.body)) !== null) {
      try {
        const parsed = JSON.parse(match[1]!);
        if (parsed._harness_analysis === true) {
          // Strip discriminator fields before returning
          const { _harness_analysis, _version, ...record } = parsed;

          // Validate required fields to prevent incomplete records or path traversal
          if (
            typeof record.issueId !== 'string' || !record.issueId ||
            typeof record.identifier !== 'string' || !record.identifier ||
            typeof record.analyzedAt !== 'string' ||
            /[/\\]/.test(record.issueId)
          ) {
            continue;
          }

          return record as AnalysisRecord;
        }
      } catch {
        // Malformed JSON -- continue to next fence or next comment
        continue;
      }
    }
  }

  return null;
}

export function createSyncAnalysesCommand(): Command {
  const command = new Command('sync-analyses')
    .description(
      'Pull published intelligence analyses from the external issue tracker into the local .harness/analyses/ directory'
    )
    .option('-d, --dir <path>', 'Workspace directory', process.cwd())
    .action(async (opts) => {
      const projectPath = path.resolve(opts.dir);

      try {
        const trackerConfig = loadTrackerSyncConfig(projectPath);
        if (!trackerConfig) {
          logger.error('No tracker config found in harness.config.json. Cannot sync.');
          process.exit(1);
        }

        if (trackerConfig.kind !== 'github') {
          logger.error(
            `Syncing analyses currently only supports 'github' tracker kind. Found: ${trackerConfig.kind}`
          );
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
          logger.error('No docs/roadmap.md found. Cannot discover features with externalIds.');
          process.exit(1);
        }

        const roadmapRaw = fs.readFileSync(roadmapFile, 'utf-8');
        const roadmapParsed = parseRoadmap(roadmapRaw);
        if (!roadmapParsed.ok) {
          logger.error('Failed to parse docs/roadmap.md');
          process.exit(1);
        }

        // Collect all features with externalIds
        const features: Array<{ name: string; externalId: string }> = [];
        for (const milestone of roadmapParsed.value.milestones) {
          for (const feature of milestone.features) {
            if (feature.externalId) {
              features.push({ name: feature.name, externalId: feature.externalId });
            }
          }
        }

        if (features.length === 0) {
          logger.info('No roadmap features have externalIds. Nothing to sync.');
          return;
        }

        const adapter = new GitHubIssuesSyncAdapter({ token, config: trackerConfig });
        const archive = new AnalysisArchive(path.join(projectPath, '.harness', 'analyses'));

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
          syncedCount++;
          logger.info(`Synced analysis for "${name}" (${record.identifier})`);
        }

        if (syncedCount > 0) {
          logger.success(
            `Synced ${syncedCount} analysis record(s). Skipped ${skippedCount} (no analysis). Warnings: ${warnCount}.`
          );
        } else {
          logger.info(
            `No new analyses found on tracker. Skipped ${skippedCount} feature(s) with no analysis comments.`
          );
        }
      } catch (err) {
        logger.error(
          `Error syncing analyses: ${err instanceof Error ? err.message : String(err)}`
        );
        process.exit(1);
      }
    });

  return command;
}
