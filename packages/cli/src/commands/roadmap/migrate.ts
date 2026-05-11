import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  Ok,
  Err,
  parseRoadmap,
  loadProjectRoadmapMode,
  loadTrackerClientConfigFromProject,
  createTrackerClient,
  migrate,
} from '@harness-engineering/core';
import type { Result, RoadmapTrackerClient, TrackedFeature } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

export interface RoadmapMigrateOptions {
  to: string;
  dryRun: boolean;
  cwd?: string;
  /**
   * Optional injected client (for tests). When absent the command builds one
   * from `loadTrackerClientConfigFromProject(cwd)`.
   */
  client?: RoadmapTrackerClient;
}

/**
 * Print a human-readable summary of the migration plan.
 *
 * Always called, even for dry-run (dry-run is what makes the summary the
 * primary signal). The CLI's `--dry-run` flag appends "DRY RUN" to the banner.
 */
function printPlanSummary(plan: migrate.MigrationPlan, dryRun: boolean): void {
  const banner = dryRun ? chalk.cyan('DRY RUN ') : '';
  console.log(`${banner}Migration plan:`);
  console.log(`  Would create: ${plan.toCreate.length}`);
  for (const e of plan.toCreate) console.log(`    - ${e.name}`);
  console.log(`  Would update: ${plan.toUpdate.length}`);
  for (const e of plan.toUpdate) console.log(`    - ${e.name} (${e.externalId}): ${e.diff}`);
  console.log(`  Unchanged:    ${plan.unchanged.length}`);
  console.log(`  Would append history: ${plan.historyToAppend.length}`);
  console.log(`  Ambiguous:    ${plan.ambiguous.length}`);
  for (const a of plan.ambiguous) {
    console.log(`    - ${a.name} (existing: ${a.existingIssueRef})`);
  }
}

function printReport(report: migrate.MigrationReport): void {
  if (report.mode === 'aborted') {
    logger.error(`Migration aborted: ${report.abortReason ?? 'unknown reason'}`);
    if (report.createdSoFar && report.createdSoFar.length > 0) {
      logger.warn(
        `Features created before abort (record manually): ${report.createdSoFar
          .map((c) => `${c.name} → ${c.externalId}`)
          .join(', ')}`
      );
    }
    return;
  }
  if (report.mode === 'dry-run') {
    logger.info(`DRY RUN complete: ${report.created + report.updated} writes would be performed.`);
    return;
  }
  if (report.mode === 'already-migrated') {
    logger.success('Already migrated; nothing to do.');
    return;
  }
  logger.success(
    `Migration applied: ${report.created} created, ${report.updated} updated, ` +
      `${report.unchanged} unchanged, ${report.historyAppended} history events appended.`
  );
  if (report.archivedTo) logger.info(`Archived: ${report.archivedFrom} -> ${report.archivedTo}`);
  if (report.configBackup) logger.info(`Config backup: ${report.configBackup}`);
}

/**
 * Build the set of history-comment hashes for a feature by paging through
 * existing comments. Implemented via the client's `fetchHistory` method: each
 * `HistoryEvent` is hashed via `migrate.hashHistoryEvent` so a re-run produces
 * the same set the tracker would emit.
 */
async function collectHistoryHashes(
  client: RoadmapTrackerClient,
  externalId: string
): Promise<Set<string>> {
  const result = await client.fetchHistory(externalId);
  const set = new Set<string>();
  if (!result.ok) return set;
  for (const e of result.value) set.add(migrate.hashHistoryEvent(e));
  return set;
}

/**
 * Build the raw body resolver.
 *
 * REV-P5-S6: The Phase 2 RoadmapTrackerClient does not expose raw issue
 * bodies — `fetchById` returns a normalized `TrackedFeature`, not the
 * original markdown. The plan-builder routes a null body to `toUpdate` as
 * the safe default (a byte-identical canonical re-write is a no-op on the
 * wire). Until the client gains a `fetchRawBody` (or equivalent), keep this
 * resolver minimal: always return null.
 *
 * Context: C-P5-rawBody-resolver-overupdates in the autopilot session.
 * The previous implementation fetched and discarded the result, which only
 * served to inflate API call counts during migration without changing the
 * plan output. The signature is preserved so the call-site does not need
 * to change when raw-body support lands.
 */
function makeRawBodyResolver(
  _client: RoadmapTrackerClient,
  _features: TrackedFeature[]
): (id: string) => Promise<string | null> {
  return async () => null;
}

export async function runRoadmapMigrate(
  opts: RoadmapMigrateOptions
): Promise<Result<migrate.MigrationReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();

  if (!opts.to) {
    return Err(new CLIError('missing required argument: --to <target>', ExitCode.ERROR));
  }
  // REV-P5-S5: accept --to=file-backed as a recognized-but-not-yet-implemented
  // target so the flag validator does not bury the failure as "unsupported
  // target". Reverse migration (file-less -> file-backed) is a future spec.
  if (opts.to === 'file-backed') {
    return Err(
      new CLIError(
        '--to=file-backed reverse migration is not yet implemented; track in a future spec'
      )
    );
  }
  if (opts.to !== 'file-less') {
    return Err(
      new CLIError(`unsupported migration target: ${opts.to} (only "file-less" supported today)`)
    );
  }

  // Step 0: short-circuit if already migrated.
  if (loadProjectRoadmapMode(cwd) === 'file-less') {
    logger.success('Already migrated; nothing to do.');
    return Ok({
      created: 0,
      updated: 0,
      unchanged: 0,
      historyAppended: 0,
      archivedFrom: null,
      archivedTo: null,
      configBackup: null,
      mode: 'already-migrated',
    });
  }

  // Step 1: tracker config + client.
  let client: RoadmapTrackerClient;
  if (opts.client) {
    client = opts.client;
  } else {
    const cfgR = loadTrackerClientConfigFromProject(cwd);
    if (!cfgR.ok) return Err(new CLIError(cfgR.error.message));
    const clientR = createTrackerClient(cfgR.value);
    if (!clientR.ok) return Err(new CLIError(clientR.error.message));
    client = clientR.value;
  }

  // Step 2: parse roadmap.md.
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  if (!fs.existsSync(roadmapPath)) {
    return Err(new CLIError(`docs/roadmap.md not found in ${cwd}`));
  }
  const roadmapR = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
  if (!roadmapR.ok) {
    return Err(new CLIError(`failed to parse docs/roadmap.md: ${roadmapR.error.message}`));
  }
  const roadmap = roadmapR.value;

  // Step 3: fetch existing tracker features.
  const fetchR = await client.fetchAll();
  if (!fetchR.ok) {
    return Err(new CLIError(`failed to fetch tracker features: ${fetchR.error.message}`));
  }
  const existingFeatures = fetchR.value.features;

  // Step 4: build plan.
  const getRawBody = makeRawBodyResolver(client, existingFeatures);
  const fetchHashes = (id: string) => collectHistoryHashes(client, id);
  const plan = await migrate.buildMigrationPlan(roadmap, existingFeatures, fetchHashes, getRawBody);

  printPlanSummary(plan, opts.dryRun);

  // Step 5: run.
  const deps: migrate.RunDeps = {
    client,
    readFile: (p) => fs.readFileSync(p, 'utf-8'),
    writeFile: (p, b) => fs.writeFileSync(p, b),
    renameFile: (from, to) => fs.renameSync(from, to),
    existsFile: (p) => fs.existsSync(p),
  };
  const reportR = await migrate.runMigrationPlan(plan, deps, {
    projectRoot: cwd,
    dryRun: opts.dryRun,
  });
  if (!reportR.ok) {
    return Err(new CLIError(`migration failed: ${reportR.error.message}`));
  }
  printReport(reportR.value);
  return Ok(reportR.value);
}

export function createRoadmapMigrateCommand(): Command {
  return new Command('migrate')
    .description('Migrate the project roadmap to a different storage mode')
    .requiredOption('--to <target>', 'Migration target (only "file-less" supported today)')
    .option('--dry-run', 'Print the migration plan without making any changes', false)
    .action(async (options: { to: string; dryRun?: boolean }) => {
      const result = await runRoadmapMigrate({
        to: options.to,
        dryRun: Boolean(options.dryRun),
      });
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
      process.exit(result.value.mode === 'aborted' ? ExitCode.ERROR : ExitCode.SUCCESS);
    });
}
