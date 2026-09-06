import { parse as parseYaml } from 'yaml';
import type { RoadmapFrontmatter, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { parseAssignmentHistory } from '../parse';
import { findAssignmentHistoryHeadingIndex } from '../assignment-history';
import { serializeAssignmentHistory } from '../serialize';
import { quoteYamlScalar } from './yaml-scalar';
import type { RoadmapMeta } from './roadmap-store';

// Frontmatter fence followed by an OPTIONAL trailing body (the `## Assignment
// History` section in Phase 2). Group 1 = YAML, group 2 = body (may be empty).
const FRONTMATTER = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/;

/**
 * Parse a frontmatter-only `_meta.md` into `RoadmapMeta`.
 *
 * Uses the `yaml` package (NOT gray-matter): gray-matter's js-yaml engine
 * coerces ISO timestamp scalars to `Date` objects, which breaks string fidelity
 * and byte-stability. The `yaml` package's default schema keeps ISO strings as
 * strings and parses the `milestones:` block sequence. This is the documented
 * fallback in the Phase 1 plan's gray-matter assumption.
 */
export function parseMeta(md: string): Result<RoadmapMeta> {
  const block = parseFrontmatterBlock(md);
  if (!block.ok) return Err(block.error);
  const { data, body } = block.value;

  const frontmatter = buildFrontmatter(data);
  if (!frontmatter.ok) return Err(frontmatter.error);

  const milestones = parseMilestones(data);
  if (!milestones.ok) return Err(milestones.error);

  const meta: RoadmapMeta = { frontmatter: frontmatter.value, milestones: milestones.value };
  const preamble = parsePreamble(body);
  if (preamble !== '') meta.preamble = preamble;
  return attachAssignmentHistory(meta, body);
}

/** Match the frontmatter fence and parse its YAML; returns the YAML data and trailing body. */
function parseFrontmatterBlock(
  md: string
): Result<{ data: Record<string, unknown>; body: string }> {
  const match = md.match(FRONTMATTER);
  if (!match) {
    return Err(new Error('_meta.md is missing or has malformed YAML frontmatter'));
  }

  let data: Record<string, unknown>;
  try {
    const parsed = parseYaml(match[1]!);
    data = (parsed ?? {}) as Record<string, unknown>;
  } catch (err) {
    return Err(new Error(`_meta.md frontmatter is not valid YAML: ${(err as Error).message}`));
  }

  return Ok({ data, body: match[2] ?? '' });
}

/** Validate and assemble the required + optional frontmatter fields. */
function buildFrontmatter(data: Record<string, unknown>): Result<RoadmapFrontmatter> {
  const project = data.project;
  const rawVersion = data.version;
  const lastSynced = data.last_synced;
  const lastManualEdit = data.last_manual_edit;

  if (
    typeof project !== 'string' ||
    (typeof rawVersion !== 'number' && typeof rawVersion !== 'string') ||
    typeof lastSynced !== 'string' ||
    typeof lastManualEdit !== 'string'
  ) {
    return Err(
      new Error(
        '_meta.md frontmatter missing required fields: project, version, last_synced, last_manual_edit'
      )
    );
  }

  const version = typeof rawVersion === 'number' ? rawVersion : parseInt(rawVersion, 10);
  if (Number.isNaN(version)) {
    return Err(new Error('_meta.md frontmatter version must be a number'));
  }

  const frontmatter: RoadmapFrontmatter = { project, version, lastSynced, lastManualEdit };
  if (typeof data.created === 'string') frontmatter.created = data.created;
  if (typeof data.updated === 'string') frontmatter.updated = data.updated;
  return Ok(frontmatter);
}

/** Validate the `milestones:` block sequence as a list of strings. */
function parseMilestones(data: Record<string, unknown>): Result<string[]> {
  const rawMilestones = data.milestones;
  if (!Array.isArray(rawMilestones) || !rawMilestones.every((m) => typeof m === 'string')) {
    return Err(new Error('_meta.md frontmatter `milestones` must be a list of strings'));
  }
  return Ok(rawMilestones as string[]);
}

/**
 * The aggregate's preamble, carried verbatim in the `_meta.md` body ahead of any
 * `## Assignment History` section (the only other thing the body ever holds).
 * A body with no preamble yields '' and no field is attached, so history-free and
 * preamble-free `_meta.md` files stay byte-identical to Phase 1.
 *
 * The boundary comes from {@link findAssignmentHistoryHeadingIndex}, the same
 * authority the parser uses. This used to be a raw `body.indexOf(...)`, which is
 * neither column-anchored nor fence-aware: a preamble containing a fenced example
 * of the grammar (the shape the guide publishes) was cut at the FENCED heading
 * while the parser ignored it, silently deleting the rest of the preamble and
 * re-emitting a `_meta.md` whose fence was left open (#1862 review).
 */
function parsePreamble(body: string): string {
  const history = findAssignmentHistoryHeadingIndex(body);
  return (history === null ? body : body.slice(0, history)).trim();
}

/**
 * Optional trailing `## Assignment History` body. Reuse the exported roadmap
 * parser; absence yields []. Only attach when records exist so history-free
 * `_meta.md` stays structurally identical (and byte-stable) to Phase 1.
 */
function attachAssignmentHistory(meta: RoadmapMeta, body: string): Result<RoadmapMeta> {
  // Ask the parser, not `body.includes(...)`: a fenced EXAMPLE of the grammar is
  // not a section, and the two answers must not diverge (#1862 review).
  if (findAssignmentHistoryHeadingIndex(body) !== null) {
    const history = parseAssignmentHistory(body);
    if (!history.ok) return Err(history.error);
    if (history.value.length > 0) meta.assignmentHistory = history.value;
  }
  return Ok(meta);
}

/**
 * Serialize `RoadmapMeta` to a byte-stable `_meta.md`. Frontmatter is hand-emitted
 * in fixed key order (project, version, created?, updated?, last_synced,
 * last_manual_edit) followed by the `milestones:` block sequence — deterministic,
 * no YAML stringifier (whose quoting/ordering is not guaranteed stable). Free-form
 * string scalars (project, the ISO timestamps, and every milestone name) are
 * double-quoted via `quoteYamlScalar` so values with colons (`Maintenance: Lint &
 * Deps`) or boolean/number shapes round-trip; `version` is a number, emitted raw.
 */
export function serializeMeta(meta: RoadmapMeta): string {
  const { frontmatter: fm, milestones } = meta;
  const lines = ['---', `project: ${quoteYamlScalar(fm.project)}`, `version: ${fm.version}`];
  if (fm.created) lines.push(`created: ${quoteYamlScalar(fm.created)}`);
  if (fm.updated) lines.push(`updated: ${quoteYamlScalar(fm.updated)}`);
  lines.push(`last_synced: ${quoteYamlScalar(fm.lastSynced)}`);
  lines.push(`last_manual_edit: ${quoteYamlScalar(fm.lastManualEdit)}`);
  // Empty roadmaps (e.g. a freshly scaffolded `harness init`) must emit an explicit
  // flow-style empty list `milestones: []` — a bare `milestones:` parses as YAML
  // null and `parseMeta` rejects it, so the scaffolded `_meta.md` would not round-trip
  // / load. Non-empty roadmaps keep the block sequence (byte-stable with Phase 1).
  if (milestones.length === 0) {
    lines.push('milestones: []');
  } else {
    lines.push('milestones:');
    for (const name of milestones) {
      lines.push(`  - ${quoteYamlScalar(name)}`);
    }
  }
  lines.push('---');
  // Optional preamble: a blank line then the verbatim block, emitted BEFORE any
  // assignment history so `parsePreamble`'s split at the history heading recovers
  // exactly these bytes.
  if (meta.preamble) {
    lines.push('', meta.preamble);
  }
  // Optional `## Assignment History` body: a blank line then the verbatim
  // serializer output. Empty/absent history emits nothing (byte-stable with
  // history-free `_meta.md`); preserves the single-trailing-newline contract.
  if (meta.assignmentHistory && meta.assignmentHistory.length > 0) {
    lines.push('', ...serializeAssignmentHistory(meta.assignmentHistory));
  }
  return lines.join('\n') + '\n';
}
