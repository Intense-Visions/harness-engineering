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
import { acquireMigrateLock, isRefusal } from './migrate-lock';

/**
 * REV-P5-S3: distinct exit codes per abortReason so CI consumers can
 * branch on the failure mode without parsing stderr text.
 *
 *   0 = success (applied | dry-run | already-migrated)
 *   1 = generic failure (network, write, parse)
 *   2 = AMBIGUOUS title collision (D-P5-E)
 *   3 = archive file collision (D-P5-D)
 *   4 = config error (missing tracker, missing repo, missing roadmap.md)
 *   5 = partial-create failure (createdSoFar non-empty; operator hand-recovery)
 *
 * Documented in `docs/changes/roadmap-tracker-only/migration.md` and
 * `docs/reference/cli-commands.md`.
 */
export const MigrateExitCode = {
  SUCCESS: 0,
  GENERIC_FAILURE: 1,
  AMBIGUOUS: 2,
  ARCHIVE_COLLISION: 3,
  CONFIG_ERROR: 4,
  PARTIAL_CREATE: 5,
} as const;
export type MigrateExitCodeType = (typeof MigrateExitCode)[keyof typeof MigrateExitCode];

/**
 * Map a MigrationReport into a specific MigrateExitCode. Inspects abortReason
 * and createdSoFar to disambiguate partial-create from generic failure.
 */
export function reportToExitCode(report: migrate.MigrationReport): MigrateExitCodeType {
  if (report.mode !== 'aborted') return MigrateExitCode.SUCCESS;
  const reason = report.abortReason ?? '';
  // Order matters: partial-create takes priority over the generic
  // "create failed" string when there are features already created.
  if (reason.startsWith('create failed') && report.createdSoFar && report.createdSoFar.length > 0) {
    return MigrateExitCode.PARTIAL_CREATE;
  }
  if (reason.startsWith('ambiguous features')) return MigrateExitCode.AMBIGUOUS;
  if (reason.startsWith('archive-collision')) return MigrateExitCode.ARCHIVE_COLLISION;
  if (reason.startsWith('config rewrite failed')) return MigrateExitCode.CONFIG_ERROR;
  return MigrateExitCode.GENERIC_FAILURE;
}

export interface RoadmapMigrateOptions {
  to: string;
  dryRun: boolean;
  cwd?: string;
  /**
   * Output format. `human` (default) prints the colored plan summary and
   * `logger.*` lines to stderr/stdout. `json` suppresses the human-readable
   * output and emits a single JSON object containing the plan + report on
   * stdout — for CI consumers.
   */
  format?: 'human' | 'json';
  /**
   * Optional injected client (for tests). When absent the command builds one
   * from `loadTrackerClientConfigFromProject(cwd)`.
   */
  client?: RoadmapTrackerClient;
}

/**
 * The JSON shape emitted when --format=json. Stable for CI consumers: any
 * additive field is backward-compatible; field removals are breaking.
 */
export interface MigrateJsonOutput {
  ok: boolean;
  mode: migrate.MigrationReport['mode'] | 'error';
  exitCode: MigrateExitCodeType;
  plan?: {
    toCreate: Array<{ name: string }>;
    toUpdate: Array<{ name: string; externalId: string; diff: string }>;
    unchanged: Array<{ name: string; externalId: string }>;
    historyToAppend: Array<{ externalId: string; type: string }>;
    ambiguous: Array<{ name: string; existingIssueRef: string }>;
  };
  report?: migrate.MigrationReport;
  error?: string;
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

/**
 * Build the canonical JSON payload emitted under --format=json. Stable shape
 * so CI consumers can rely on the field set.
 */
function buildJsonOutput(
  plan: migrate.MigrationPlan | undefined,
  report: migrate.MigrationReport | undefined,
  error: string | undefined,
  exitCode: MigrateExitCodeType
): MigrateJsonOutput {
  const out: MigrateJsonOutput = {
    ok: exitCode === MigrateExitCode.SUCCESS,
    mode: report ? report.mode : 'error',
    exitCode,
  };
  if (plan) {
    out.plan = {
      toCreate: plan.toCreate.map((e) => ({ name: e.name })),
      toUpdate: plan.toUpdate.map((e) => ({
        name: e.name,
        externalId: e.externalId,
        diff: e.diff,
      })),
      unchanged: plan.unchanged,
      historyToAppend: plan.historyToAppend.map((e) => ({
        externalId: e.externalId,
        type: e.event.type,
      })),
      ambiguous: plan.ambiguous,
    };
  }
  if (report) out.report = report;
  if (error) out.error = error;
  return out;
}

export async function runRoadmapMigrate(
  opts: RoadmapMigrateOptions
): Promise<Result<migrate.MigrationReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const format: 'human' | 'json' = opts.format ?? 'human';
  const isJson = format === 'json';

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
    const alreadyMigratedReport: migrate.MigrationReport = {
      created: 0,
      updated: 0,
      unchanged: 0,
      historyAppended: 0,
      archivedFrom: null,
      archivedTo: null,
      configBackup: null,
      mode: 'already-migrated',
    };
    if (isJson) {
      console.log(
        JSON.stringify(
          buildJsonOutput(undefined, alreadyMigratedReport, undefined, MigrateExitCode.SUCCESS)
        )
      );
    } else {
      logger.success('Already migrated; nothing to do.');
    }
    return Ok(alreadyMigratedReport);
  }

  // REV-P5-S7: advisory lockfile. Acquire BEFORE any tracker fetches or
  // writes so two concurrent operators cannot interleave. The lock is
  // released in finally so a crash leaves a stale lock that the next run
  // auto-recovers (dead-pid OR > 30 min old).
  const lockResult = acquireMigrateLock(cwd);
  if (isRefusal(lockResult)) {
    return Err(new CLIError(lockResult.message));
  }
  try {
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
    const plan = await migrate.buildMigrationPlan(
      roadmap,
      existingFeatures,
      fetchHashes,
      getRawBody
    );

    if (!isJson) printPlanSummary(plan, opts.dryRun);

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
    if (isJson) {
      const exitCode = reportToExitCode(reportR.value);
      console.log(JSON.stringify(buildJsonOutput(plan, reportR.value, undefined, exitCode)));
    } else {
      printReport(reportR.value);
    }
    return Ok(reportR.value);
  } finally {
    lockResult.release();
  }
}

export function createRoadmapMigrateCommand(): Command {
  return new Command('migrate')
    .description('Migrate the project roadmap to a different storage mode')
    .requiredOption('--to <target>', 'Migration target (only "file-less" supported today)')
    .option('--dry-run', 'Print the migration plan without making any changes', false)
    .option(
      '--format <fmt>',
      'Output format: "human" (default) or "json" (single JSON object for CI consumers)',
      'human'
    )
    .action(async (options: { to: string; dryRun?: boolean; format?: string }) => {
      const format: 'human' | 'json' = options.format === 'json' ? 'json' : 'human';
      const result = await runRoadmapMigrate({
        to: options.to,
        dryRun: Boolean(options.dryRun),
        format,
      });
      if (!result.ok) {
        if (format === 'json') {
          // Pre-flight failure (bad --to, missing config, etc). Emit JSON
          // shape so CI consumers can branch on exitCode uniformly.
          console.log(
            JSON.stringify(
              buildJsonOutput(
                undefined,
                undefined,
                result.error.message,
                MigrateExitCode.CONFIG_ERROR
              )
            )
          );
        } else {
          logger.error(result.error.message);
        }
        // Pre-flight errors today map to CONFIG_ERROR (4). Existing
        // process.exit(result.error.exitCode) preserved the CLI's generic
        // ExitCode (2). We deliberately keep that behavior for non-json mode
        // (no breaking changes), but json consumers see the precise code.
        process.exit(format === 'json' ? MigrateExitCode.CONFIG_ERROR : result.error.exitCode);
      }
      // REV-P5-S3: distinct exit codes per abortReason for CI consumers.
      const exitCode = reportToExitCode(result.value);
      process.exit(exitCode);
    });
}
