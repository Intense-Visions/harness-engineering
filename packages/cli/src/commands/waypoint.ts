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
      const { readSpoolSegments } = await import('@harness-engineering/core');
      const spoolDir = path.join(cwd, '.harness', 'spool');
      const segments = readSpoolSegments(spoolDir);
      const status: SpoolStatus = {
        spoolDir: path.relative(cwd, spoolDir).replaceAll('\\', '/'),
        segments: segments.length,
        events: segments.reduce((sum, s) => sum + s.lines.length, 0),
        droppedEvents: segments.reduce((sum, s) => sum + s.droppedEvents, 0),
        oldestEventTime: oldestEventTime(segments),
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
    .description('Opt-in Waypoint sdlc.* emission: record fleet artifacts, inspect the spool')
    .option('--json', 'Output in JSON format');

  registerRecordProvenance(waypoint);
  registerRecordHandoff(waypoint);
  registerStatus(waypoint);

  return waypoint;
}
