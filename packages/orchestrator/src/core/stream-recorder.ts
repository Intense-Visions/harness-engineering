import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentEvent } from '@harness-engineering/types';

export interface StreamManifest {
  issueId: string;
  externalId: number | string | null;
  identifier: string;
  attempts: AttemptRecord[];
  pr: PRLink | null;
  retention: RetentionInfo;
  highlights: HighlightsInfo | null;
}

export interface AttemptRecord {
  attempt: number;
  file: string;
  startedAt: string;
  endedAt: string | null;
  outcome: string | null;
  stats: AttemptStats;
}

export interface AttemptStats {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  turnCount: number;
  toolsCalled: string[];
  filesTouched: string[];
}

export interface PRLink {
  number: number;
  linkedAt: string;
  status: string;
}

export interface RetentionInfo {
  strategy: 'orphan' | 'pr-linked';
  orphanExpiresAt: string | null;
}

export interface Highlight {
  timestamp: string;
  summary: string;
  category: 'file_op' | 'test' | 'git' | 'error' | 'completion';
}

export interface HighlightsInfo {
  extractedAt: string;
  postedToPr: boolean;
  moments: Highlight[];
}

interface RecorderLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** In-memory accumulator for per-attempt stats during recording. Key: `issueId:attempt`. */
interface IssueAccumulator {
  tools: Set<string>;
  files: Set<string>;
  turnCount: number;
  startedAt: string;
}

const ORPHAN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOOL_NAME_RE = /^Calling (\w+)\(/;
const FILE_ARG_RE = /^Calling (?:Read|Write|Edit)\(([^)]+)\)/;

function isExpired(manifest: StreamManifest, openPrNumbers: Set<number>): boolean {
  if (manifest.retention.strategy === 'pr-linked' && manifest.pr) {
    return !openPrNumbers.has(manifest.pr.number);
  }
  if (manifest.retention.strategy === 'orphan' && manifest.retention.orphanExpiresAt) {
    return new Date(manifest.retention.orphanExpiresAt).getTime() < Date.now();
  }
  return false;
}

export class StreamRecorder {
  private readonly streamsDir: string;
  private readonly logger: RecorderLogger;
  private readonly accumulators = new Map<string, IssueAccumulator>();

  constructor(streamsDir: string, logger: RecorderLogger) {
    this.streamsDir = streamsDir;
    this.logger = logger;
  }

  // ---------------------------------------------------------------------------
  // Core recording
  // ---------------------------------------------------------------------------

  startRecording(
    issueId: string,
    externalId: number | string | null,
    identifier: string,
    backend: string,
    attempt: number
  ): void {
    const issueDir = path.join(this.streamsDir, issueId);
    fs.mkdirSync(issueDir, { recursive: true });

    const now = new Date().toISOString();

    // Write session_start line
    const startLine = JSON.stringify({
      type: 'session_start',
      issueId,
      externalId,
      identifier,
      startedAt: now,
      backend,
      attempt,
    });
    fs.appendFileSync(this.streamPath(issueId, attempt), startLine + '\n');

    // Initialize or update manifest
    const manifest =
      this.readManifest(issueId) ?? this.createManifest(issueId, externalId, identifier);

    // Avoid duplicate attempt records on crash/restart
    if (!manifest.attempts.some((a) => a.attempt === attempt)) {
      manifest.attempts.push({
        attempt,
        file: `${attempt}.jsonl`,
        startedAt: now,
        endedAt: null,
        outcome: null,
        stats: {
          durationMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          turnCount: 0,
          toolsCalled: [],
          filesTouched: [],
        },
      });
    }

    this.writeManifest(issueId, manifest);

    // Initialize accumulator (keyed by issueId:attempt to avoid clobbering on retries)
    this.accumulators.set(`${issueId}:${attempt}`, {
      tools: new Set(),
      files: new Set(),
      turnCount: 0,
      startedAt: now,
    });

    this.logger.info(`Started recording for ${issueId} attempt ${attempt}`);
  }

  recordEvent(issueId: string, attempt: number, event: AgentEvent): void {
    const line = JSON.stringify(event);
    try {
      fs.appendFileSync(this.streamPath(issueId, attempt), line + '\n');
    } catch (err) {
      this.logger.warn(`Failed to record event for ${issueId}`, { error: String(err) });
      return;
    }

    // Accumulate stats
    const acc = this.accumulators.get(`${issueId}:${attempt}`);
    if (!acc) return;

    if (event.type === 'call' && typeof event.content === 'string') {
      const toolMatch = event.content.match(TOOL_NAME_RE);
      if (toolMatch?.[1]) acc.tools.add(toolMatch[1]);

      const fileMatch = event.content.match(FILE_ARG_RE);
      if (fileMatch?.[1]) acc.files.add(fileMatch[1]);
    }

    if (event.type === 'turn_start') {
      acc.turnCount++;
    }
  }

  finishRecording(
    issueId: string,
    attempt: number,
    outcome: 'normal' | 'error',
    tokenStats: { inputTokens: number; outputTokens: number; turnCount: number }
  ): void {
    const accKey = `${issueId}:${attempt}`;
    const acc = this.accumulators.get(accKey);
    const now = new Date().toISOString();
    const durationMs = acc ? Date.now() - new Date(acc.startedAt).getTime() : 0;

    const stats: AttemptStats = {
      durationMs,
      inputTokens: tokenStats.inputTokens,
      outputTokens: tokenStats.outputTokens,
      turnCount: tokenStats.turnCount,
      toolsCalled: acc ? [...acc.tools] : [],
      filesTouched: acc ? [...acc.files] : [],
    };

    // Write session_end line
    const endLine = JSON.stringify({
      type: 'session_end',
      timestamp: now,
      outcome,
      stats,
    });

    try {
      fs.appendFileSync(this.streamPath(issueId, attempt), endLine + '\n');
    } catch (err) {
      this.logger.error(`Failed to write session_end for ${issueId}`, { error: String(err) });
    }

    // Update manifest
    const manifest = this.readManifest(issueId);
    if (manifest) {
      const attemptRecord = manifest.attempts.find((a) => a.attempt === attempt);
      if (attemptRecord) {
        attemptRecord.endedAt = now;
        attemptRecord.outcome = outcome;
        attemptRecord.stats = stats;
      }

      // Set orphan retention if no PR linked
      if (!manifest.pr) {
        manifest.retention = {
          strategy: 'orphan',
          orphanExpiresAt: new Date(Date.now() + ORPHAN_TTL_MS).toISOString(),
        };
      }

      this.writeManifest(issueId, manifest);
    }

    this.accumulators.delete(accKey);
    this.logger.info(`Finished recording for ${issueId} attempt ${attempt}: ${outcome}`);
  }

  // ---------------------------------------------------------------------------
  // Retrieval
  // ---------------------------------------------------------------------------

  getManifest(issueId: string): StreamManifest | null {
    return this.readManifest(issueId);
  }

  getStream(issueId: string, attempt?: number): string | null {
    if (attempt != null) {
      return this.readStreamFile(issueId, attempt);
    }

    // Default to latest attempt
    const manifest = this.readManifest(issueId);
    if (!manifest || manifest.attempts.length === 0) return null;

    const lastEntry = manifest.attempts[manifest.attempts.length - 1];
    if (!lastEntry) return null;
    const latestAttempt = lastEntry.attempt;
    return this.readStreamFile(issueId, latestAttempt);
  }

  // ---------------------------------------------------------------------------
  // PR linkage
  // ---------------------------------------------------------------------------

  linkPR(issueId: string, prNumber: number): void {
    const manifest = this.readManifest(issueId);
    if (!manifest) return;

    manifest.pr = {
      number: prNumber,
      linkedAt: new Date().toISOString(),
      status: 'open',
    };
    manifest.retention = {
      strategy: 'pr-linked',
      orphanExpiresAt: null,
    };

    this.writeManifest(issueId, manifest);
    this.logger.info(`Linked PR #${prNumber} to stream ${issueId}`);
  }

  // ---------------------------------------------------------------------------
  // Highlights
  // ---------------------------------------------------------------------------

  updateHighlights(issueId: string, moments: Highlight[]): void {
    const manifest = this.readManifest(issueId);
    if (!manifest) return;

    manifest.highlights = {
      extractedAt: new Date().toISOString(),
      postedToPr: false,
      moments,
    };

    this.writeManifest(issueId, manifest);
  }

  markHighlightsPosted(issueId: string): void {
    const manifest = this.readManifest(issueId);
    if (!manifest?.highlights) return;

    manifest.highlights.postedToPr = true;
    this.writeManifest(issueId, manifest);
  }

  // ---------------------------------------------------------------------------
  // Retention sweep
  // ---------------------------------------------------------------------------

  sweepExpired(openPrNumbers: number[]): void {
    const openSet = new Set(openPrNumbers);
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(this.streamsDir, { withFileTypes: true });
    } catch {
      return; // streams dir doesn't exist yet
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      this.sweepIfExpired(entry.name, openSet);
    }
  }

  private sweepIfExpired(issueId: string, openPrNumbers: Set<number>): void {
    const manifest = this.readManifest(issueId);
    if (!manifest) return;
    if (!isExpired(manifest, openPrNumbers)) return;

    try {
      fs.rmSync(path.join(this.streamsDir, issueId), { recursive: true, force: true });
      this.logger.info(`Swept expired stream: ${issueId}`);
    } catch (err) {
      this.logger.warn(`Failed to sweep stream ${issueId}`, { error: String(err) });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private manifestPath(issueId: string): string {
    return path.join(this.streamsDir, issueId, 'manifest.json');
  }

  private streamPath(issueId: string, attempt: number): string {
    return path.join(this.streamsDir, issueId, `${attempt}.jsonl`);
  }

  private readManifest(issueId: string): StreamManifest | null {
    try {
      const content = fs.readFileSync(this.manifestPath(issueId), 'utf-8');
      // harness-ignore SEC-DES-001: reading self-written manifest.json from disk — trusted internal source
      return JSON.parse(content) as StreamManifest;
    } catch {
      return null;
    }
  }

  private writeManifest(issueId: string, manifest: StreamManifest): void {
    fs.writeFileSync(this.manifestPath(issueId), JSON.stringify(manifest, null, 2));
  }

  private createManifest(
    issueId: string,
    externalId: number | string | null,
    identifier: string
  ): StreamManifest {
    return {
      issueId,
      externalId,
      identifier,
      attempts: [],
      pr: null,
      retention: { strategy: 'orphan', orphanExpiresAt: null },
      highlights: null,
    };
  }

  private readStreamFile(issueId: string, attempt: number): string | null {
    try {
      return fs.readFileSync(this.streamPath(issueId, attempt), 'utf-8');
    } catch {
      return null;
    }
  }
}
