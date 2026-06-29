import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import {
  Ok,
  Err,
  parseRoadmap,
  serializeRoadmap,
  loadProjectRoadmapMode,
  loadTrackerClientConfigFromProject,
  createTrackerClient,
  migrate,
} from '@harness-engineering/core';
import type {
  Result,
  RoadmapTrackerClient,
  TrackedFeature,
  Roadmap,
  RoadmapFeature,
} from '@harness-engineering/core';
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
  // Reverse migration: file-less -> file-backed (reconstruct docs/roadmap.md
  // from the tracker and flip the config mode back).
  if (opts.to === 'file-backed') {
    return runReverseMigrate(opts);
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

/**
 * Reconstruct a file-backed Roadmap from tracker features. `TrackedFeature` is
 * nearly a superset of `RoadmapFeature`; the only structural work is grouping by
 * milestone (a null milestone becomes the special Backlog section) in first-seen
 * order, with Backlog sorted last for a conventional layout.
 */
export function featuresToRoadmap(
  features: TrackedFeature[],
  project: string,
  nowIso: string
): Roadmap {
  const order: string[] = [];
  const byMilestone = new Map<string, RoadmapFeature[]>();
  for (const f of features) {
    const key = f.milestone ?? 'Backlog';
    let bucket = byMilestone.get(key);
    if (!bucket) {
      bucket = [];
      byMilestone.set(key, bucket);
      order.push(key);
    }
    bucket.push({
      name: f.name,
      status: f.status,
      spec: f.spec,
      plans: f.plans,
      blockedBy: f.blockedBy,
      summary: f.summary,
      assignee: f.assignee,
      priority: f.priority,
      externalId: f.externalId,
      updatedAt: f.updatedAt,
    });
  }
  // Array.sort is stable in V8, so non-Backlog milestones keep first-seen order
  // while Backlog is pushed to the end.
  order.sort((a, b) => (a === 'Backlog' ? 1 : b === 'Backlog' ? -1 : 0));
  const milestones = order.map((name) => ({
    name,
    isBacklog: name === 'Backlog',
    features: byMilestone.get(name) ?? [],
  }));
  return {
    frontmatter: { project, version: 1, lastSynced: nowIso, lastManualEdit: nowIso },
    milestones,
    assignmentHistory: [],
  };
}

/** Read the project name from harness.config.json (`name`), defaulting to "Roadmap". */
function readProjectName(configPath: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { name?: unknown };
    return typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : 'Roadmap';
  } catch {
    return 'Roadmap';
  }
}

function emitReverseReport(
  report: migrate.MigrationReport,
  count: number,
  isJson: boolean,
  dryRun: boolean
): void {
  if (isJson) {
    console.log(
      JSON.stringify(buildJsonOutput(undefined, report, undefined, MigrateExitCode.SUCCESS))
    );
    return;
  }
  if (dryRun) {
    console.log(`${chalk.cyan('DRY RUN ')}Reverse migration plan:`);
    console.log(`  Would write docs/roadmap.md with ${count} feature(s)`);
    console.log('  Would set roadmap.mode = "file-backed"');
    return;
  }
  printReport(report);
}

/**
 * Reverse migration: file-less -> file-backed.
 *
 * Inverse of the forward migration — instead of pushing roadmap.md into the
 * tracker, it pulls the tracker's features back into a freshly serialized
 * `docs/roadmap.md` and flips `roadmap.mode` to `file-backed` (byte-identical
 * config backup first, mirroring the forward path). Refuses to clobber an
 * existing roadmap.md (the file-less invariant is that it must not exist).
 */
export async function runReverseMigrate(
  opts: RoadmapMigrateOptions
): Promise<Result<migrate.MigrationReport, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const isJson = (opts.format ?? 'human') === 'json';

  // Already file-backed -> nothing to reverse.
  if (loadProjectRoadmapMode(cwd) === 'file-backed') {
    const report: migrate.MigrationReport = {
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
        JSON.stringify(buildJsonOutput(undefined, report, undefined, MigrateExitCode.SUCCESS))
      );
    } else {
      logger.success('Already file-backed; nothing to do.');
    }
    return Ok(report);
  }

  const lockResult = acquireMigrateLock(cwd);
  if (isRefusal(lockResult)) return Err(new CLIError(lockResult.message));
  try {
    // The file-less invariant is that docs/roadmap.md does not exist; refuse to
    // overwrite a stray one rather than silently clobbering manual edits.
    const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
    if (fs.existsSync(roadmapPath)) {
      return Err(
        new CLIError(`docs/roadmap.md already exists; refusing to overwrite (${roadmapPath})`)
      );
    }

    // Tracker client (injected for tests, else built from project config).
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

    const fetchR = await client.fetchAll();
    if (!fetchR.ok) {
      return Err(new CLIError(`failed to fetch tracker features: ${fetchR.error.message}`));
    }
    const features = fetchR.value.features;

    const configPath = path.join(cwd, 'harness.config.json');
    const project = readProjectName(configPath);
    const nowIso = new Date().toISOString();
    const markdown = serializeRoadmap(featuresToRoadmap(features, project, nowIso));

    const report: migrate.MigrationReport = {
      created: features.length,
      updated: 0,
      unchanged: 0,
      historyAppended: 0,
      archivedFrom: null,
      archivedTo: null,
      configBackup: null,
      mode: opts.dryRun ? 'dry-run' : 'applied',
    };

    if (opts.dryRun) {
      emitReverseReport(report, features.length, isJson, true);
      return Ok(report);
    }

    // Write the reconstructed roadmap.
    fs.mkdirSync(path.dirname(roadmapPath), { recursive: true });
    fs.writeFileSync(roadmapPath, markdown);
    report.archivedTo = roadmapPath;

    // Config: backup, then flip roadmap.mode -> file-backed (mirrors forward).
    if (fs.existsSync(configPath)) {
      const original = fs.readFileSync(configPath, 'utf-8');
      const configBackupPath = path.join(cwd, 'harness.config.json.pre-migration');
      fs.writeFileSync(configBackupPath, original);
      report.configBackup = configBackupPath;
      const parsed = JSON.parse(original) as Record<string, unknown>;
      const roadmapSection: Record<string, unknown> =
        (parsed.roadmap as Record<string, unknown> | undefined) ?? {};
      roadmapSection.mode = 'file-backed';
      parsed.roadmap = roadmapSection;
      fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2) + '\n');
    }

    emitReverseReport(report, features.length, isJson, false);
    return Ok(report);
  } finally {
    lockResult.release();
  }
}

export function createRoadmapMigrateCommand(): Command {
  return new Command('migrate')
    .description('Migrate the project roadmap to a different storage mode')
    .requiredOption('--to <target>', 'Migration target: "file-less" or "file-backed"')
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
