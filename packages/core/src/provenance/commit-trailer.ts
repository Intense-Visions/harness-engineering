/**
 * Machine-readable provenance commit trailer (#1531).
 *
 * Autonomous, agent-authored commits are statistically invisible: the only
 * provenance a commit carries today is a freeform `Claude-Session:` URL appended
 * by the interactive client, which the autonomous fleet/orchestrator ship path
 * does not emit and which is not a governed, parseable schema. This module
 * defines a distinct, structured, deterministically-parseable git trailer that
 * the ship path emits so AI-authored work — specifically the *autonomous* tier —
 * is mechanically countable, joinable to cost, and auditable on gated paths.
 *
 * DESIGN
 * - Distinct `Harness-*` namespace, NEVER `Co-authored-by:`. Co-opting the
 *   co-author trailer would conflate the autonomous tier with interactive AI
 *   assistance (which already emits co-author trailers) and defeat mechanical
 *   tier detection. The presence of a `Harness-Run` key IS the tier signal.
 * - Standard git-trailer syntax (`Key: value`, one per line, trailing block) so
 *   the trailer is `git log --grep`-friendly and survives ordinary git tooling.
 * - Pure + IO-free: formatter, appender and parser are pure functions reused by
 *   the orchestrator (emit) and any telemetry/CLI consumer (parse). This is a
 *   different concept from the ADR-0100 rule-to-failure provenance reporter that
 *   also lives in this module — hence the distinct file name.
 */

/**
 * Schema version stamped as `Harness-Provenance-Version`. Bump on any
 * backwards-incompatible change to the key set or value grammar so a parser can
 * branch on it.
 */
export const PROVENANCE_TRAILER_VERSION = 1;

/** The `Harness-*` trailer keys, in canonical emission order. */
export const PROVENANCE_TRAILER_KEYS = {
  /** `<skill>@<version>` — the primary key; its presence is the tier signal. */
  run: 'Harness-Run',
  version: 'Harness-Provenance-Version',
  runId: 'Harness-Run-Id',
  lane: 'Harness-Lane',
  agent: 'Harness-Agent',
  model: 'Harness-Model',
  session: 'Harness-Session',
} as const;

/** A parsed provenance trailer. `schemaVersion`, `skill`, `skillVersion` are always present. */
export interface ProvenanceTrailer {
  /** From `Harness-Provenance-Version`. Falls back to {@link PROVENANCE_TRAILER_VERSION} if unparseable. */
  schemaVersion: number;
  /** Left of `@` in `Harness-Run`. */
  skill: string;
  /** Right of `@` in `Harness-Run`. */
  skillVersion: string;
  /** `Harness-Run-Id` — the orchestrator/fleet run this commit belongs to. */
  runId?: string;
  /** `Harness-Model` — the model that authored the change. */
  model?: string;
  /** `Harness-Session` — the agent session id, when known. */
  sessionId?: string;
  /** `Harness-Lane` — the fleet lane / workflow, when known. */
  lane?: string;
  /** `Harness-Agent` — the agent identity, when known. */
  agent?: string;
}

/** Input to {@link formatProvenanceTrailer}. `skillVersion` defaults to `0.0.0` when omitted. */
export interface ProvenanceTrailerInput {
  skill: string;
  skillVersion?: string;
  runId?: string;
  model?: string;
  sessionId?: string;
  lane?: string;
  agent?: string;
}

/**
 * Collapse a value to a single safe trailer line: strip CR/LF (so an attacker-
 * or accident-supplied newline can never break the block or forge an extra key)
 * and trim surrounding whitespace. Returns `''` for nullish input.
 */
function sanitizeValue(value: string | undefined): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Render a deterministic, ordered `Key: value` trailer block for the given
 * provenance. Optional fields whose value is empty after sanitization are
 * omitted. Always emits `Harness-Run` and `Harness-Provenance-Version`.
 *
 * The `skill` is emitted even when empty (as `@<version>`) so the block always
 * carries the tier-signal key; callers should pass a non-empty skill.
 */
export function formatProvenanceTrailer(input: ProvenanceTrailerInput): string {
  const K = PROVENANCE_TRAILER_KEYS;
  const skill = sanitizeValue(input.skill);
  const skillVersion = sanitizeValue(input.skillVersion) || '0.0.0';

  const lines: string[] = [
    `${K.run}: ${skill}@${skillVersion}`,
    `${K.version}: ${PROVENANCE_TRAILER_VERSION}`,
  ];

  const optional: Array<[string, string | undefined]> = [
    [K.runId, input.runId],
    [K.lane, input.lane],
    [K.agent, input.agent],
    [K.model, input.model],
    [K.session, input.sessionId],
  ];
  for (const [key, raw] of optional) {
    const value = sanitizeValue(raw);
    if (value !== '') lines.push(`${key}: ${value}`);
  }

  return lines.join('\n');
}

/**
 * True when the message already carries a `Harness-Run` trailer — used to keep
 * {@link appendProvenanceTrailer} idempotent (a resumed ship re-committing the
 * same work must not double-stamp).
 */
export function hasProvenanceTrailer(message: string): boolean {
  return new RegExp(`^${PROVENANCE_TRAILER_KEYS.run}:\\s`, 'm').test(message);
}

/**
 * Append the provenance trailer block to a commit or PR-body message, separated
 * from the existing body by a blank line. Idempotent: if the message already
 * carries a `Harness-Run` trailer the message is returned unchanged.
 */
export function appendProvenanceTrailer(message: string, input: ProvenanceTrailerInput): string {
  if (hasProvenanceTrailer(message)) return message;
  const block = formatProvenanceTrailer(input);
  const base = message.replace(/\s+$/, '');
  if (base === '') return block;
  return `${base}\n\n${block}`;
}

/** Parse a single `Key: value` line into a `[key, value]` tuple, or `null`. */
function parseTrailerLine(line: string): [string, string] | null {
  const match = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s?(.*)$/);
  if (match === null) return null;
  return [match[1]!, match[2]!.trim()];
}

/**
 * Extract the provenance trailer from a commit or PR-body message.
 *
 * Returns `null` when no `Harness-Run` key is present — i.e. an interactive /
 * non-fleet commit, which this function leaves entirely unclaimed. Scans every
 * `Key: value` line in the message (co-existing trailers such as
 * `Claude-Session:` or `Co-authored-by:` are ignored), so a `Harness-Run` line
 * is found regardless of what other trailers surround it.
 */
export function parseProvenanceTrailer(message: string): ProvenanceTrailer | null {
  const K = PROVENANCE_TRAILER_KEYS;
  const found = new Map<string, string>();
  for (const rawLine of message.split(/\r?\n/)) {
    const parsed = parseTrailerLine(rawLine.trim());
    if (parsed === null) continue;
    const [key, value] = parsed;
    if (key.startsWith('Harness-')) found.set(key, value);
  }

  const run = found.get(K.run);
  if (run === undefined) return null;

  const atIndex = run.lastIndexOf('@');
  const [skill, skillVersion] =
    atIndex >= 0 ? [run.slice(0, atIndex), run.slice(atIndex + 1)] : [run, ''];

  const parsedVersion = Number.parseInt(found.get(K.version) ?? '', 10);
  const schemaVersion = Number.isFinite(parsedVersion) ? parsedVersion : PROVENANCE_TRAILER_VERSION;

  const trailer: ProvenanceTrailer = { schemaVersion, skill, skillVersion };
  // Copy each optional field from its trailer key onto its typed property, skipping
  // absent/empty values. Data-driven so the branch count stays flat as keys grow.
  const optionalFields: Array<[string, 'runId' | 'lane' | 'agent' | 'model' | 'sessionId']> = [
    [K.runId, 'runId'],
    [K.lane, 'lane'],
    [K.agent, 'agent'],
    [K.model, 'model'],
    [K.session, 'sessionId'],
  ];
  for (const [key, field] of optionalFields) {
    const value = found.get(key);
    if (value !== undefined && value !== '') trailer[field] = value;
  }
  return trailer;
}
