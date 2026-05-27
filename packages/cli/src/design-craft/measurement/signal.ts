// packages/cli/src/design-craft/measurement/signal.ts
//
// CRITIQUE-recurrence → candidate-pattern-proposal feedback loop.
//
// The catalog grows from two sources: human contributions (PR-time, per
// contribution.md) and operational signal — recurring findings that
// suggest a missing pattern. This module is the second source.
//
// A "finding shape" is the fingerprint `(code, tier, rubricOrPatternId)`.
// When the same shape recurs across N (default 5) projects, we materialise
// a proposal file under `.harness/design-craft/proposals/<shape-hash>.yaml`
// for human review. The threshold is configurable per harness.config.json
// `design.craft.signal.proposalThreshold` (already in schema).
//
// The store is JSONL appended at `.harness/design-craft/signal-events.jsonl`
// so we never block a CRITIQUE run on slow proposal aggregation — that
// runs from the dedicated `proposeFromRecurringFindings` entry point
// (used in tests today, scheduled from a maintenance task later).
//
// Multi-project recurrence is the load-bearing rule: the same finding
// firing 5 times on the same project is just one project's bug, not a
// signal about the catalog. Requiring ≥2 distinct projects guards
// against single-project pathologies.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { CraftFinding } from '../findings/schema.js';

export interface SignalEvent {
  /** Stable fingerprint of the finding's shape (code + tier + cite id). */
  fingerprint: string;
  /** Project root the event came from. */
  projectRoot: string;
  /** Wall-clock ISO string. */
  recordedAt: string;
  /** Snapshot of the bare-bones finding context for proposal text. */
  finding: {
    code: string;
    tier: CraftFinding['tier'];
    impact: CraftFinding['impact'];
    rubricOrPatternId: string;
    messageSample: string;
  };
}

export interface ProposalCandidate {
  fingerprint: string;
  /** Number of times the shape recurred across all distinct projects. */
  occurrenceCount: number;
  /** Distinct project roots — the multi-project guard rail. */
  distinctProjects: string[];
  /** The most recent finding sample, for narrative context. */
  representative: SignalEvent['finding'];
  /** Where the proposal was written. */
  proposalPath: string;
}

const EVENTS_RELATIVE_PATH = path.join('.harness', 'design-craft', 'signal-events.jsonl');
const PROPOSALS_RELATIVE_DIR = path.join('.harness', 'design-craft', 'proposals');

function resolveEventsPath(storeRoot?: string): string {
  return path.resolve(storeRoot ?? process.cwd(), EVENTS_RELATIVE_PATH);
}

function resolveProposalsDir(storeRoot?: string): string {
  return path.resolve(storeRoot ?? process.cwd(), PROPOSALS_RELATIVE_DIR);
}

function fingerprintFinding(finding: CraftFinding): string {
  // Tier is part of the shape because the same `code` can be flagged at
  // different tiers across components — splitting them keeps "this rubric
  // sometimes flags polish, sometimes foundational" from masking a real
  // pattern that's always foundational/large.
  const raw = `${finding.code}|${finding.tier}|${finding.cite.rubricOrPatternId}`;
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
}

/**
 * Append a single finding to the signal-event log. Called per finding
 * from the CRITIQUE / POLISH phases when measurement is wired in. The
 * call is best-effort: I/O failures must not break the phase.
 *
 * `projectRoot` identifies the source — usually the path the CRITIQUE
 * was invoked against. The same value should be passed to
 * `proposeFromRecurringFindings` when running locally.
 */
export function recordSignalEvent(
  finding: CraftFinding,
  projectRoot: string,
  /** Where the events JSONL lives. Defaults to `process.cwd()`. */
  storeRoot?: string
): void {
  const event: SignalEvent = {
    fingerprint: fingerprintFinding(finding),
    projectRoot,
    recordedAt: new Date().toISOString(),
    finding: {
      code: finding.code,
      tier: finding.tier,
      impact: finding.impact,
      rubricOrPatternId: finding.cite.rubricOrPatternId,
      messageSample: finding.message.slice(0, 240),
    },
  };
  try {
    const file = resolveEventsPath(storeRoot);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
  } catch {
    /* swallow — signal logging is best-effort */
  }
}

function readEvents(storeRoot?: string): SignalEvent[] {
  const file = resolveEventsPath(storeRoot);
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const events: SignalEvent[] = [];
  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isSignalEvent(parsed)) events.push(parsed);
    } catch {
      /* skip malformed lines — never block on user-corrupted JSONL */
    }
  }
  return events;
}

function isSignalEvent(v: unknown): v is SignalEvent {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.fingerprint === 'string' &&
    typeof o.projectRoot === 'string' &&
    typeof o.recordedAt === 'string' &&
    typeof o.finding === 'object' &&
    o.finding !== null
  );
}

/**
 * Materialise candidate proposals from the recorded signal events.
 *
 * For each fingerprint that:
 *   - has been recorded ≥ `threshold` times AND
 *   - was recorded from ≥ 2 distinct projects
 * emit a proposal YAML to `.harness/design-craft/proposals/<fp>.yaml`.
 *
 * Returns the list of candidates emitted (existing or newly written).
 * Idempotent: re-running with the same events overwrites the proposal
 * file in place with refreshed counts.
 */
export function proposeFromRecurringFindings(
  threshold: number,
  storeRoot?: string
): ProposalCandidate[] {
  if (!Number.isFinite(threshold) || threshold < 1) {
    throw new Error(
      `proposeFromRecurringFindings: threshold must be a positive integer (got ${String(threshold)})`
    );
  }
  const events = readEvents(storeRoot);
  const grouped = new Map<string, SignalEvent[]>();
  for (const ev of events) {
    const arr = grouped.get(ev.fingerprint);
    if (arr) arr.push(ev);
    else grouped.set(ev.fingerprint, [ev]);
  }

  const proposalsDir = resolveProposalsDir(storeRoot);
  const candidates: ProposalCandidate[] = [];

  for (const [fingerprint, fpEvents] of grouped) {
    const distinctProjects = Array.from(new Set(fpEvents.map((e) => e.projectRoot))).sort();
    if (fpEvents.length < threshold) continue;
    if (distinctProjects.length < 2) continue;

    const representative = fpEvents[fpEvents.length - 1]!.finding;
    const proposalPath = path.join(proposalsDir, `${fingerprint}.yaml`);
    const yaml = renderProposalYaml({
      fingerprint,
      occurrenceCount: fpEvents.length,
      distinctProjects,
      representative,
    });
    fs.mkdirSync(proposalsDir, { recursive: true });
    fs.writeFileSync(proposalPath, yaml, 'utf8');

    candidates.push({
      fingerprint,
      occurrenceCount: fpEvents.length,
      distinctProjects,
      representative,
      proposalPath,
    });
  }
  return candidates;
}

function renderProposalYaml(args: {
  fingerprint: string;
  occurrenceCount: number;
  distinctProjects: string[];
  representative: SignalEvent['finding'];
}): string {
  const { fingerprint, occurrenceCount, distinctProjects, representative } = args;
  const escape = (s: string): string => s.replace(/"/g, '\\"');
  const projectList = distinctProjects.map((p) => `  - "${escape(p)}"`).join('\n');
  return [
    `# Candidate pattern/rubric proposal — emitted by the design-craft signal loop.`,
    `# Review per docs/changes/design-pipeline/design-craft-elevator/contribution.md`,
    `# before promoting to a real catalog entry.`,
    ``,
    `kind: proposal`,
    `fingerprint: ${fingerprint}`,
    `occurrenceCount: ${occurrenceCount}`,
    `distinctProjectCount: ${distinctProjects.length}`,
    `distinctProjects:`,
    projectList,
    `representative:`,
    `  code: ${representative.code}`,
    `  tier: ${representative.tier}`,
    `  impact: ${representative.impact}`,
    `  rubricOrPatternId: ${representative.rubricOrPatternId}`,
    `  messageSample: "${escape(representative.messageSample)}"`,
    `status: proposed`,
    `proposedAt: ${new Date().toISOString()}`,
    ``,
  ].join('\n');
}

/** Test helper — wipe events + proposals. Idempotent. */
export function resetSignalStore(storeRoot?: string): void {
  const events = resolveEventsPath(storeRoot);
  const proposals = resolveProposalsDir(storeRoot);
  try {
    fs.unlinkSync(events);
  } catch {
    /* missing file */
  }
  try {
    fs.rmSync(proposals, { recursive: true, force: true });
  } catch {
    /* missing dir */
  }
}
