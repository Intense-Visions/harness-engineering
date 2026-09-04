/**
 * Repo-local `sdlc.*` spool — the file-backed binding of the normative spool
 * contract (pnyon `docs/architecture/waypoint/sdlc-event-schema.md` §7):
 *
 * - JSON Lines: one complete event envelope per `\n`-terminated line, UTF-8.
 * - One segment file per writing process: `.harness/spool/sdlc-<id>.jsonl`
 *   where `<id>` is a ULID minted at process start. No lock files;
 *   concurrent writers never share a segment.
 * - Bounded: at the cap (default 10 000 events) the segment drops its OLDEST
 *   line and increments a persistent `droppedEvents` counter kept in a
 *   sidecar `sdlc-<id>.meta.json`.
 * - Appending never throws and never fails the originating harness
 *   operation: invalid events return diagnostics, I/O failures are recorded
 *   and reported in the result — the caller's own work always completes.
 *
 * The spool directory is only ever created by an append, and appends only
 * happen when a Waypoint sink is configured — so a repo without `waypoint`
 * config never grows a `.harness/spool/` directory (PRD Story 1).
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type {
  SdlcAppendResult,
  SdlcEvent,
  SdlcSpoolSegmentSnapshot,
} from '@harness-engineering/types';
import { bestEffortScrub } from './scrub';
import { validateSdlcEvent } from './validate';

/** Default segment bound (events per segment; schema doc §7.1). */
export const DEFAULT_MAX_EVENTS = 10_000;

/** Construction options for one per-process file-backed spool segment. */
export interface FileSpoolOptions {
  /** Directory holding the segment files, e.g. `<repo>/.harness/spool`. */
  readonly spoolDir: string;
  /** Unique per-writer id (file: `sdlc-<segmentId>.jsonl`). */
  readonly segmentId: string;
  /** Segment bound; drop-oldest beyond it. Default: DEFAULT_MAX_EVENTS. */
  readonly maxEvents?: number;
}

/**
 * One per-process spool segment bound to disk. Append is validate →
 * best-effort scrub → one JSONL line; it never throws: invalid input returns
 * diagnostics, a full segment drops its oldest line and counts it in the
 * sidecar meta file, and an I/O failure is reported in the result without
 * interrupting the caller.
 */
export class FileSpool {
  readonly segmentId: string;
  private readonly spoolDir: string;
  private readonly maxEvents: number;
  private readonly storedLines: string[] = [];
  private dropped = 0;
  private dirReady = false;

  constructor(options: FileSpoolOptions) {
    this.segmentId = options.segmentId;
    this.spoolDir = options.spoolDir;
    this.maxEvents = Math.max(1, options.maxEvents ?? DEFAULT_MAX_EVENTS);
  }

  private get segmentPath(): string {
    return join(this.spoolDir, `sdlc-${this.segmentId}.jsonl`);
  }

  private get metaPath(): string {
    return join(this.spoolDir, `sdlc-${this.segmentId}.meta.json`);
  }

  /** Validates, scrubs, and appends one event as a JSONL line. */
  append(candidate: unknown): SdlcAppendResult {
    const result = validateSdlcEvent(candidate);
    if (!result.ok) {
      return { ok: false, issues: result.issues };
    }
    const { event, redactions } = bestEffortScrub(result.event);
    const line = JSON.stringify(event);

    try {
      if (!this.dirReady) {
        mkdirSync(this.spoolDir, { recursive: true });
        this.dirReady = true;
      }
      this.storedLines.push(line);
      let droppedNow = 0;
      while (this.storedLines.length > this.maxEvents) {
        this.storedLines.shift();
        this.dropped += 1;
        droppedNow += 1;
      }
      if (droppedNow > 0) {
        // Drop-oldest: rewrite the bounded window and persist the counter.
        writeFileSync(this.segmentPath, this.storedLines.join('\n') + '\n', 'utf8');
        writeFileSync(
          this.metaPath,
          JSON.stringify({ droppedEvents: this.dropped }) + '\n',
          'utf8'
        );
      } else {
        appendFileSync(this.segmentPath, line + '\n', 'utf8');
      }
      return { ok: true, dropped: droppedNow, redactions };
    } catch (error) {
      // Spooling must never fail the originating harness operation
      // (PRD Story 1): report the I/O failure in the result instead.
      return {
        ok: false,
        issues: [
          {
            field: 'spool',
            message: `append failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  /** Events evicted by drop-oldest since this segment was created. */
  get droppedEvents(): number {
    return this.dropped;
  }

  /** JSONL lines currently in the bounded window, oldest first. */
  get lines(): readonly string[] {
    return this.storedLines;
  }

  snapshot(): SdlcSpoolSegmentSnapshot {
    return {
      segmentId: this.segmentId,
      lines: [...this.storedLines],
      droppedEvents: this.dropped,
    };
  }
}

/**
 * Reads every `sdlc-*.jsonl` segment in a spool directory into snapshots
 * (sidecar `droppedEvents` counters included). Returns an empty list when the
 * directory does not exist — a repo with no configured sink has no spool.
 */
export function readSpoolSegments(spoolDir: string): SdlcSpoolSegmentSnapshot[] {
  if (!existsSync(spoolDir)) {
    return [];
  }
  const snapshots: SdlcSpoolSegmentSnapshot[] = [];
  for (const entry of readdirSync(spoolDir)) {
    const match = /^sdlc-(.+)\.jsonl$/.exec(entry);
    if (!match) continue;
    const segmentId = match[1] as string;
    const raw = readFileSync(join(spoolDir, entry), 'utf8');
    const lines = raw.split('\n').filter((line) => line.length > 0);
    let droppedEvents = 0;
    const metaPath = join(spoolDir, `sdlc-${segmentId}.meta.json`);
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { droppedEvents?: number };
        droppedEvents = typeof meta.droppedEvents === 'number' ? meta.droppedEvents : 0;
      } catch {
        droppedEvents = 0; // Unreadable sidecar: report the segment, not a crash.
      }
    }
    snapshots.push({ segmentId, lines, droppedEvents });
  }
  return snapshots;
}

/**
 * Merges per-process segments into one stream ordered by event ULID
 * (time-prefixed, so lexicographic order is creation order). No locks, no
 * coordination — the ULID is also the idempotency key downstream, so overlap
 * between readers is harmless. Ships with the (out-of-scope) shipper; kept
 * here because it is part of the normative spool contract third parties
 * consume.
 */
export function mergeSegments(segments: readonly SdlcSpoolSegmentSnapshot[]): SdlcEvent[] {
  const events = segments.flatMap((segment) =>
    segment.lines.map((line) => JSON.parse(line) as SdlcEvent)
  );
  return events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
