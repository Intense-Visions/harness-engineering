import { Command } from 'commander';
import { OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { resolveConfig } from '../config/loader';
import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../skill/health-snapshot';
import type { HealthSnapshot } from '../skill/health-snapshot';
import { recommend } from '../skill/recommendation-engine';
import type { RecommendationResult, Recommendation } from '../skill/recommendation-types';
import { loadOrRebuildIndex } from '../skill/index-builder';
import chalk from 'chalk';

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

export interface RecommendOptions {
  cwd?: string;
  noCache?: boolean;
  top?: number;
}

export async function runRecommend(options: RecommendOptions): Promise<RecommendationResult> {
  const cwd = options.cwd ?? process.cwd();
  const top = options.top ?? 5;

  // Resolve snapshot: use cache unless --no-cache or stale
  let snapshot: HealthSnapshot | null = null;

  if (!options.noCache) {
    const cached = loadCachedSnapshot(cwd);
    if (cached && isSnapshotFresh(cached, cwd)) {
      snapshot = cached;
    }
  }

  if (!snapshot) {
    snapshot = await captureHealthSnapshot(cwd);
  }

  // Load skill index for address data
  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;
  const index = loadOrRebuildIndex('claude-code', cwd, tierOverrides);

  // Build skills record from index (addresses + dependsOn)
  const skills: Record<
    string,
    { addresses: (typeof index.skills)[string]['addresses']; dependsOn: string[] }
  > = {};
  for (const [name, entry] of Object.entries(index.skills)) {
    skills[name] = { addresses: entry.addresses, dependsOn: entry.dependsOn };
  }

  const result = recommend(snapshot, skills, { top });

  // Set snapshotAge based on whether we used cache
  return {
    ...result,
    snapshotAge: options.noCache
      ? 'fresh'
      : snapshot === loadCachedSnapshot(cwd)
        ? 'cached'
        : result.snapshotAge,
  };
}

// ---------------------------------------------------------------------------
// Text formatting
// ---------------------------------------------------------------------------

function formatRecommendation(rec: Recommendation): string {
  const lines: string[] = [];

  if (rec.urgency === 'critical') {
    lines.push(`  ${chalk.red('[CRITICAL]')} ${rec.sequence}. ${rec.skillName}`);
  } else {
    lines.push(`  ${rec.sequence}. ${rec.skillName} (${rec.score.toFixed(2)})`);
  }

  for (const reason of rec.reasons) {
    lines.push(`     ${chalk.dim('\u2192')} ${reason}`);
  }

  return lines.join('\n');
}

function printRecommendations(result: RecommendationResult): void {
  if (result.recommendations.length === 0) {
    console.log('');
    console.log('No recommendations. Codebase health looks good!');
    console.log('');
    return;
  }

  console.log('');
  console.log(
    `Recommended workflow (${result.recommendations.length} skill${result.recommendations.length === 1 ? '' : 's'}):`
  );
  console.log('');

  for (const rec of result.recommendations) {
    console.log(formatRecommendation(rec));
    console.log('');
  }

  console.log(`Sequence reasoning: ${result.sequenceReasoning}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function createRecommendCommand(): Command {
  const command = new Command('recommend')
    .description('Recommend skills based on codebase health analysis')
    .option('--no-cache', 'Force fresh health snapshot')
    .option('--top <n>', 'Max recommendations (default 5)', '5')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;

      try {
        const top = parseInt(opts.top, 10);
        if (isNaN(top) || top < 1) {
          logger.error('--top must be a positive integer');
          process.exit(1);
        }

        if (mode === OutputMode.TEXT) {
          console.log('');
          console.log('Analyzing codebase health...');
        }

        const result = await runRecommend({
          noCache: opts.cache === false,
          top,
        });

        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printRecommendations(result);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(message);
        }
        process.exit(1);
      }
    });

  return command;
}
