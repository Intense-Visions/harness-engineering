/**
 * `harness waypoint` — the fleet-artifact emission surface and spool
 * observability for the opt-in Waypoint sdlc.* layer (pnyon/pnyon#124).
 *
 * Fleet provenance.json and handoff records are written by fleet workers
 * (skill-driven agents), not by TypeScript code — so this command is the
 * sanctioned code seam those pipelines invoke at artifact-write time:
 *
 *   harness waypoint record-provenance docs/changes/<slug>/provenance.json
 *   harness waypoint record-handoff <handoff.json>
 *   harness waypoint status [--json]
 *
 * Every subcommand is a no-op (exit 0, explanatory note) when no
 * `waypoint.sink` is configured in `harness.config.json`, so fleets can call
 * it unconditionally without changing non-adopter behavior (PRD Story 1).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { logger } from '../output/logger';

const NO_SINK_NOTE =
  'Waypoint sink not configured (harness.config.json `waypoint.sink`); nothing recorded.';

/** Loose shape of a fleet provenance.json (deliberately permissive, like burn). */
interface ProvenanceFile {
  slug?: string;
  item?: string;
  issues?: unknown[];
  issue?: unknown;
  stages?: unknown[];
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** Derives the item id from a provenance file, preferring slug over path. */
function provenanceItem(parsed: ProvenanceFile, filePath: string): string {
  if (typeof parsed.slug === 'string' && parsed.slug.length > 0) return parsed.slug;
  if (typeof parsed.item === 'string' && parsed.item.length > 0) return parsed.item;
  return path.basename(path.dirname(path.resolve(filePath)));
}

function registerRecordProvenance(waypoint: Command): void {
  waypoint
    .command('record-provenance <file>')
    .description('Spool one sdlc.* event for a written fleet provenance.json')
    .action(async (file: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const { ensureWaypointEmitter, emitFleetProvenanceWritten } =
        await import('@harness-engineering/core');
      if (ensureWaypointEmitter(cwd) === null) {
        emitResult(globalOpts.json === true, { recorded: false, note: NO_SINK_NOTE });
        return;
      }
      let parsed: ProvenanceFile;
      try {
        parsed = readJsonFile(file) as ProvenanceFile;
      } catch (error) {
        logger.error(
          `Could not read provenance file: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exitCode = 1;
        return;
      }
      const eventId = emitFleetProvenanceWritten({
        item: provenanceItem(parsed, file),
        stages: Array.isArray(parsed.stages) ? parsed.stages.map(String) : [],
        artifactPath: path.relative(cwd, path.resolve(file)).replaceAll('\\', '/'),
      });
      emitResult(globalOpts.json === true, { recorded: eventId !== null, eventId });
    });
}

function registerRecordHandoff(waypoint: Command): void {
  waypoint
    .command('record-handoff <file>')
    .description('Spool one sdlc.* event for a written fleet handoff record')
    .action(async (file: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const { ensureWaypointEmitter, emitFleetHandoffWritten } =
        await import('@harness-engineering/core');
      const { validateFleetHandoffRecord } = await import('@harness-engineering/types');
      if (ensureWaypointEmitter(cwd) === null) {
        emitResult(globalOpts.json === true, { recorded: false, note: NO_SINK_NOTE });
        return;
      }
      let raw: unknown;
      try {
        raw = readJsonFile(file);
      } catch (error) {
        logger.error(
          `Could not read handoff file: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exitCode = 1;
        return;
      }
      const validated = validateFleetHandoffRecord(raw);
      if (!validated.ok) {
        logger.error(`Invalid fleet handoff record: ${validated.error.message}`);
        process.exitCode = 1;
        return;
      }
      const eventId = emitFleetHandoffWritten(validated.record);
      emitResult(globalOpts.json === true, { recorded: eventId !== null, eventId });
    });
}

function registerStatus(waypoint: Command): void {
  waypoint
    .command('status')
    .description('Show spool health: segments, event counts, drops, oldest event age')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();
      const { readSpoolSegments, countUnshipped, countRejected } =
        await import('@harness-engineering/core');
      const spoolDir = path.join(cwd, '.harness', 'spool');
      const segments = readSpoolSegments(spoolDir);
      const status: SpoolStatus = {
        spoolDir: path.relative(cwd, spoolDir).replaceAll('\\', '/'),
        segments: segments.length,
        events: segments.reduce((sum, s) => sum + s.lines.length, 0),
        droppedEvents: segments.reduce((sum, s) => sum + s.droppedEvents, 0),
        oldestEventTime: oldestEventTime(segments),
        unshipped: countUnshipped(spoolDir),
        rejected: countRejected(spoolDir),
      };
      if (globalOpts.json === true) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      renderStatus(status);
    });
}

interface SpoolStatus {
  spoolDir: string;
  segments: number;
  events: number;
  droppedEvents: number;
  oldestEventTime: string | null;
  /** Events not yet confirmed in the ledger (SC-8). */
  unshipped: number;
  /** Events the ledger refused permanently; see `rejected.jsonl`. */
  rejected: number;
}

/** Env var holding the ingest credential; never read from config. */
export const INGEST_TOKEN_ENV = 'PNYON_WAYPOINT_INGEST_TOKEN';

/** A resolved, credentialed shipping target. */
interface ShipTarget {
  readonly ship: { url: string; outpost: string; project: string; batchSize?: number };
  readonly token: string;
}

/**
 * Resolve where to ship and with what credential, reporting and returning null
 * when either is unavailable.
 *
 * The three outcomes are deliberately distinct. A malformed `waypoint` block is
 * an error, NOT "no sink configured" — treating it as the latter would make a
 * broken adopter repo look exactly like a healthy non-adopter one while quietly
 * shipping nothing. An absent `ship` block is the documented default and exits
 * 0. A missing token is an error that names the env var, because the token is
 * deliberately unconfigurable in the committed file.
 */
function resolveShipTarget(
  configResult: { ok: boolean; value?: unknown; error?: Error },
  json: boolean
): ShipTarget | null {
  if (!configResult.ok) {
    logger.error(`Cannot read Waypoint config: ${configResult.error?.message ?? 'unknown error'}`);
    process.exitCode = 1;
    return null;
  }
  const ship = (configResult.value as { sink?: { ship?: ShipTarget['ship'] } } | undefined)?.sink
    ?.ship;
  if (!ship) {
    emitNote(json, NO_SHIP_NOTE);
    return null;
  }
  const token = process.env[INGEST_TOKEN_ENV];
  if (token === undefined || token === '') {
    logger.error(
      `${INGEST_TOKEN_ENV} is not set; it is required to ship to ${ship.url}. ` +
        'The token is deliberately not read from harness.config.json so it cannot be committed.'
    );
    process.exitCode = 1;
    return null;
  }
  return { ship, token };
}

/**
 * `harness waypoint ship` — send spooled events to the configured ledger.
 *
 * An explicit command rather than an automatic flush on emit (D5): auto-flush
 * would put a network call on the hot path of every sanctioned mutator, which
 * is exactly the set of operations that must not gain a new failure mode. This
 * is observable, scriptable, and cron-able, and can be run from CI.
 */
function registerShip(waypoint: Command): void {
  waypoint
    .command('ship')
    .description('Send spooled sdlc.* events to the configured Waypoint ledger')
    .option('--dry-run', 'Report what would ship without sending anything')
    .option('--limit <n>', 'Cap the number of events sent this run', (v) => Number.parseInt(v, 10))
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const json = globalOpts.json === true;
      const cwd = process.cwd();
      const { loadWaypointConfig, shipSpool, recordRejected, ShipError } =
        await import('@harness-engineering/core');

      const target = resolveShipTarget(loadWaypointConfig(cwd), json);
      if (target === null) return;
      const { ship, token } = target;

      const spoolDir = path.join(cwd, '.harness', 'spool');
      try {
        const report = await shipSpool({
          spoolDir,
          config: ship,
          token,
          fetchFn: (url, init) => fetch(url, init),
          ...(opts.dryRun === true ? { dryRun: true } : {}),
          ...(typeof opts.limit === 'number' && !Number.isNaN(opts.limit)
            ? { limit: opts.limit }
            : {}),
          onRejected: (rejected) => {
            recordRejected(spoolDir, rejected, new Date().toISOString());
          },
        });
        if (json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }
        renderShipReport(report, ship.url, opts.dryRun === true);
      } catch (err) {
        if (err instanceof ShipError) {
          logger.error(err.message);
          process.exitCode = 1;
          return;
        }
        throw err;
      }
    });
}

const NO_SHIP_NOTE =
  'No `waypoint.sink.ship` configured in harness.config.json; events stay in the local spool.';

/** Human-readable outcome of one `ship` run. */
function renderShipReport(
  report: {
    shipped: number;
    accepted: number;
    duplicate: number;
    rejected: readonly unknown[];
    remaining: number;
  },
  url: string,
  dryRun: boolean
): void {
  if (dryRun) {
    logger.info(`Dry run: ${report.remaining} event(s) would ship to ${url}.`);
    return;
  }
  logger.info(
    `Shipped ${report.shipped} event(s) to ${url} ` +
      `(${report.accepted} accepted, ${report.duplicate} already present).`
  );
  if (report.rejected.length > 0) {
    // Loud, not a footnote: a scrub rejection means the scrubber caught
    // something in harness's own exhaust, which the adopter needs to see.
    logger.warn(
      `${report.rejected.length} event(s) permanently refused and recorded in ` +
        `${path.join('.harness', 'spool', 'rejected.jsonl')} — review them.`
    );
  }
  if (report.remaining > 0) {
    logger.info(`${report.remaining} event(s) still queued; re-run to continue.`);
  }
}

function emitNote(json: boolean, note: string): void {
  if (json) {
    console.log(JSON.stringify({ shipped: 0, note }, null, 2));
    return;
  }
  logger.info(note);
}

/** Oldest `time` across segment heads (segments are append-ordered). */
function oldestEventTime(segments: readonly { lines: readonly string[] }[]): string | null {
  let oldestIso: string | null = null;
  for (const segment of segments) {
    const first = segment.lines[0];
    if (first === undefined) continue;
    try {
      const time = (JSON.parse(first) as { time?: string }).time;
      if (typeof time === 'string' && (oldestIso === null || time < oldestIso)) {
        oldestIso = time;
      }
    } catch {
      /* unparseable line: skip */
    }
  }
  return oldestIso;
}

function renderStatus(status: SpoolStatus): void {
  if (status.segments === 0) {
    logger.info('No spool segments found (no Waypoint sink configured, or nothing emitted).');
    return;
  }
  logger.info(`Spool: ${status.spoolDir}`);
  logger.info(`Segments: ${status.segments} · Events: ${status.events}`);
  if (status.droppedEvents > 0) {
    logger.warn(`Dropped events (drop-oldest at cap): ${status.droppedEvents}`);
  }
  if (status.oldestEventTime !== null) {
    logger.info(`Oldest spooled event: ${status.oldestEventTime}`);
  }
  logger.info(`Unshipped: ${status.unshipped}`);
  if (status.rejected > 0) {
    // Surfaced as a warning: these are events the ledger refused outright, and
    // a scrub rejection in particular is a signal, not a statistic.
    logger.warn(`Permanently refused: ${status.rejected} (see rejected.jsonl)`);
  }
}

function emitResult(json: boolean, body: Record<string, unknown>): void {
  if (json) {
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  if (body.recorded === true) {
    logger.info(`Spooled sdlc.* event ${String(body.eventId)}`);
  } else {
    logger.info(typeof body.note === 'string' ? body.note : 'Nothing recorded.');
  }
}

export function createWaypointCommand(): Command {
  const waypoint = new Command('waypoint')
    .description(
      'Opt-in Waypoint sdlc.* emission: record fleet artifacts, ship the spool, inspect it'
    )
    .option('--json', 'Output in JSON format');

  registerRecordProvenance(waypoint);
  registerRecordHandoff(waypoint);
  registerShip(waypoint);
  registerStatus(waypoint);

  return waypoint;
}
