import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { logger } from '../output/logger';
import { loadTrackerConfig } from '../mcp/tools/roadmap-auto-sync';
import type { AnalysisRecord } from '@harness-engineering/orchestrator';

const PUBLISHED_INDEX_PATH = '.harness/metrics/published-analyses.json';

interface PublishedIndex {
  [issueId: string]: string; // iso string of when published
}

function loadPublishedIndex(projectRoot: string): PublishedIndex {
  const p = path.join(projectRoot, PUBLISHED_INDEX_PATH);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function savePublishedIndex(projectRoot: string, index: PublishedIndex): void {
  const p = path.join(projectRoot, PUBLISHED_INDEX_PATH);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Renders an AnalysisRecord as a structured markdown comment.
 * Format: summary header + reasoning bullets + collapsible JSON with discriminator.
 */
export function renderAnalysisComment(record: AnalysisRecord): string {
  const lines: string[] = [];

  lines.push(`## Harness Analysis: ${record.identifier}`);
  lines.push('');

  if (record.score) {
    lines.push(
      `**Risk:** ${record.score.riskLevel} (${(record.score.confidence * 100).toFixed(0)}% confidence)`
    );
    lines.push(`**Route:** ${record.score.recommendedRoute}`);
  }
  lines.push(`**Analyzed:** ${record.analyzedAt}`);
  lines.push('');

  if (record.score && record.score.reasoning.length > 0) {
    for (const r of record.score.reasoning) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  // Collapsible details block with full AnalysisRecord + discriminator fields
  const jsonPayload = {
    _harness_analysis: true,
    _version: 1,
    ...record,
  };

  lines.push('<details>');
  lines.push('<summary>Full Analysis Data</summary>');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(jsonPayload, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('</details>');

  return lines.join('\n');
}

export function createPublishAnalysesCommand(): Command {
  const command = new Command('publish-analyses')
    .description('Publishes locally generated intelligence analyses to the external issue tracker (e.g., GitHub)')
    .option('-d, --dir <path>', 'Workspace directory', process.cwd())
    .action(async (opts) => {
      const projectPath = path.resolve(opts.dir);

      try {
        const trackerConfig = loadTrackerConfig(projectPath);
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

          // In RoadmapTrackerAdapter, issue identifiers hash the name.
          // Because we don't have the hash function here directly easily, 
          // we match by `identifier` prefix since identifier is derived from `feature.name`.
          // `record.identifier` is exactly the derived name (e.g. `adoption-usage-telem-51b4a863`)
          let externalId: string | null = null;
          
          for (const [featName, extId] of nameToExternalId) {
            const prefix = featName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20);
            if (record.identifier.startsWith(prefix)) {
              externalId = extId;
              break;
            }
          }

          if (!externalId) {
            continue; // Could not map to external issue
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
