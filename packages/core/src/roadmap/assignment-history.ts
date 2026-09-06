import type { AssignmentRecord, Result } from '@harness-engineering/types';
import { Ok } from '@harness-engineering/types';
// The newline escape codec lives in `./summary-field`, the single source of truth
// already shared by the `- **Summary:**` bullet's emitter and reader (#1756). The
// bullet grammar this module adopts has exactly the same hostile character, so it
// reuses that codec rather than growing a second one.
import { encodeSummaryField, decodeSummaryField } from './summary-field';

/**
 * Single source of truth for the `## Assignment History` section grammar — both
 * the emitter and BOTH readers.
 *
 * ## Why this is not a pipe table any more (#1811)
 *
 * History used to be emitted as a markdown pipe table, one record per row:
 *
 * ```markdown
 * | Feature | Assignee | Action | Date |
 * |---------|----------|--------|------|
 * | Auth | alice | assigned | 2026-03-21 |
 * ```
 *
 * and read back by splitting each row on `|` and recovering the four values
 * POSITIONALLY. Nothing escaped the separator, and a feature name is free text
 * (an H3 heading, or the MCP `manage_roadmap` write path). So a name such as
 * `Auth | Login flow` serialized to a row with five cells; `action` landed on
 * cell 2 (`alice`), failed the action-membership check, and the WHOLE record was
 * dropped — silently, with no error and no warning. Round-trip data loss.
 *
 * This is the same class of bug already fixed for the comma-in-list field (#1757)
 * and the newline-in-summary field (#1756), and those two were fixed with a
 * reversible escape codec over the existing separator. Escaping `|` was available
 * here too, and was the cheaper change — it was considered and deliberately NOT
 * taken. Escaping keeps a column separator that is legal inside every value, so
 * the format stays one un-escaped write path away from the same bug; the human
 * decision on this issue was to remove the separator instead of guarding it.
 *
 * ## The format
 *
 * Each record is a block of four `- **Key:** value` bullets, the SAME line
 * grammar every feature row already uses, blank-line separated:
 *
 * ```markdown
 * ## Assignment History
 *
 * - **Feature:** Auth | Login flow
 * - **Assignee:** alice
 * - **Action:** assigned
 * - **Date:** 2026-03-21
 *
 * - **Feature:** API Gateway
 * - **Assignee:** bob
 * - **Action:** completed
 * - **Date:** 2026-04-01
 * ```
 *
 * There is no column separator, so `|` needs no escaping and cannot shift a
 * value onto the wrong field. Each value owns a whole line, bounded by the line
 * ending — which leaves the newline as the only hostile character, exactly the
 * situation {@link encodeSummaryField} already solves. Backticks, pipes,
 * em-dashes and table-separator lookalikes are all inert.
 *
 * A record STARTS at its `- **Feature:**` bullet: that is the record boundary, so
 * the blank lines between blocks are cosmetic and a reformatter may add or drop
 * them freely. Bullets are anchored at column 0 to match the anchoring
 * `parseRoadmap` and `findUnpreservedLines` use everywhere else.
 *
 * ## Reading legacy documents
 *
 * {@link parseAssignmentHistory} ALSO still reads the old pipe table, unchanged
 * and with its original tolerances, so a shard `_meta` file or a monolith
 * aggregate written before this change — in another branch, or in an adopter repo
 * that has not re-serialized yet — keeps its history instead of losing it on first
 * read. Only the writer moved. A legacy row whose value contains a `|` is still
 * lost, since that information never survived being written; nothing can recover
 * it.
 *
 * This module is a pure grammar helper over a string: it opens no file and knows
 * nothing about where the document it parses lives.
 */

/** The section's H2 heading. Its own line, and the sentinel every reader bounds on. */
export const ASSIGNMENT_HISTORY_HEADING = '## Assignment History';

/** The four bullet labels, in emission order. */
const FIELD_LABELS = ['Feature', 'Assignee', 'Action', 'Date'] as const;

type FieldLabel = (typeof FIELD_LABELS)[number];

/** Bullet label -> the `AssignmentRecord` key it carries. */
const FIELD_KEYS: Record<FieldLabel, keyof AssignmentRecord> = {
  Feature: 'feature',
  Assignee: 'assignee',
  Action: 'action',
  Date: 'date',
};

const VALID_ACTIONS: ReadonlySet<string> = new Set(['assigned', 'completed', 'unassigned']);

/**
 * One record bullet. The value is optional so an empty field emits (and reads
 * back as) `- **Key:**` with no trailing space — a trailing space would be
 * stripped by any reformatter and turn an empty value into a parse miss.
 * Exactly ONE space separates the marker from the value, so a value with leading
 * whitespace round-trips instead of being trimmed away.
 */
const FIELD_BULLET = /^- \*\*(Feature|Assignee|Action|Date):\*\*(?: (.*))?$/;

/** A legacy pipe-table separator row (`|---|---|`), which opens the data rows. */
const LEGACY_SEPARATOR = /^\|[-\s|]+\|$/;

/** Emit one `- **Key:** value` bullet, omitting the separator space when empty. */
function emitFieldBullet(label: FieldLabel, value: string): string {
  const encoded = encodeSummaryField(value);
  return encoded === '' ? `- **${label}:**` : `- **${label}:** ${encoded}`;
}

/**
 * Emit the whole `## Assignment History` section: the heading, a blank line, then
 * one blank-line-separated four-bullet block per record, in order. Returns the
 * lines (no trailing blank), so callers own their own surrounding spacing.
 *
 * Emitting nothing for an empty list is the CALLER's job — both call sites guard
 * on `length > 0` because a `_meta.md` with no history must stay byte-identical
 * to one written before the section existed.
 */
export function serializeAssignmentHistory(records: AssignmentRecord[]): string[] {
  const lines: string[] = [ASSIGNMENT_HISTORY_HEADING, ''];
  records.forEach((record, index) => {
    if (index > 0) lines.push('');
    for (const label of FIELD_LABELS) lines.push(emitFieldBullet(label, record[FIELD_KEYS[label]]));
  });
  return lines;
}

/**
 * Slice the `## Assignment History` section body out of a document, bounded by the
 * next H2 so a future section after history is not swallowed. Returns `null` when
 * the document has no history section at all.
 */
function extractSection(body: string): string | null {
  const heading = body.match(/^## Assignment History[ \t]*\n/m);
  if (!heading || heading.index === undefined) return null;
  const afterHeading = body.slice(heading.index + heading[0].length);
  const nextH2 = afterHeading.search(/^## /m);
  return nextH2 === -1 ? afterHeading : afterHeading.slice(0, nextH2);
}

/** A record under construction: fields arrive one bullet at a time. */
type RecordDraft = Partial<Record<keyof AssignmentRecord, string>>;

/** A draft becomes a record only once all four fields are present and `action` is real. */
function finalizeDraft(draft: RecordDraft | null): AssignmentRecord | null {
  if (!draft) return null;
  const { feature, assignee, action, date } = draft;
  if (feature === undefined || assignee === undefined || date === undefined) return null;
  if (action === undefined || !VALID_ACTIONS.has(action)) return null;
  return { feature, assignee, action: action as AssignmentRecord['action'], date };
}

/**
 * Read the current bullet-block format. A `- **Feature:**` bullet closes the
 * previous record and opens a new one; the other three fill in the open record.
 * Anything else on the line is ignored, so blank lines and the legacy table are
 * simply not this reader's business.
 */
function readBulletRecords(lines: string[]): AssignmentRecord[] {
  const records: AssignmentRecord[] = [];
  let draft: RecordDraft | null = null;

  for (const line of lines) {
    const match = line.match(FIELD_BULLET);
    if (!match) continue;
    const label = match[1] as FieldLabel;
    if (label === 'Feature') {
      const finished = finalizeDraft(draft);
      if (finished) records.push(finished);
      draft = {};
    }
    draft ??= {};
    draft[FIELD_KEYS[label]] = decodeSummaryField(match[2] ?? '');
  }

  const last = finalizeDraft(draft);
  if (last) records.push(last);
  return records;
}

/**
 * Read the legacy pipe table, preserving its original tolerances verbatim: rows
 * before the `|---|` separator are header and are skipped, a table with NO
 * separator is treated as empty, empty cells are dropped by the positional
 * split, and a row whose third value is not an action is skipped.
 *
 * Kept for reading only — nothing writes this shape any more (#1811).
 */
function readLegacyTableRecords(lines: string[]): AssignmentRecord[] {
  const records: AssignmentRecord[] = [];
  let pastHeader = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (!pastHeader) {
      if (LEGACY_SEPARATOR.test(trimmed)) pastHeader = true;
      continue;
    }
    const cells = trimmed
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    if (cells.length < 4) continue;
    if (!VALID_ACTIONS.has(cells[2]!)) continue;
    records.push({
      feature: cells[0]!,
      assignee: cells[1]!,
      action: cells[2] as AssignmentRecord['action'],
      date: cells[3]!,
    });
  }

  return records;
}

/**
 * Parse the `## Assignment History` section of `body` into records. An absent
 * section yields `[]`.
 *
 * Both shapes are read: current bullet blocks first, then any legacy table rows.
 * A real document only ever holds one of the two, so the concatenation order is
 * observable only for a hand-mixed section, where "new format, then old" is as
 * good an answer as any.
 */
export function parseAssignmentHistory(body: string): Result<AssignmentRecord[]> {
  const section = extractSection(body);
  if (section === null) return Ok([]);
  const lines = section.split('\n');
  return Ok([...readBulletRecords(lines), ...readLegacyTableRecords(lines)]);
}
