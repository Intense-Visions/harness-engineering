import type { AssignmentRecord, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
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
 * {@link parseAssignmentHistory} ALSO still reads the old pipe table, so a shard
 * `_meta` file or a monolith aggregate written before this change — in another
 * branch, or in an adopter repo that has not re-serialized yet — keeps its history
 * instead of losing it on first read. Only the writer moved. A legacy row whose
 * value contains a `|` is still lost, since that information never survived being
 * written; nothing can recover it.
 *
 * ONE legacy tolerance was withdrawn (#1862): a table whose `|---|---|` separator
 * row is missing used to read as an empty history, which is the silent-deletion
 * defect in miniature — real rows reported as "no history" and then omitted by
 * {@link serializeRoadmap}. Such a table is now an error instead. The rows are
 * unrecoverable either way (the separator is what marks where the data begins);
 * the only thing that changed is that the operator hears about it.
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

/** An ATX heading of ANY level at column 0 — the bound of the history section. */
const NEXT_HEADING = /^#{1,6}[ \t]/m;

/** A fence line (```/~~~), optionally indented, opening or closing a code block. */
const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})/;

/**
 * Blank out every fenced code block, preserving each line's LENGTH so an offset
 * into the mask is the same offset into `body`.
 *
 * Documentation legitimately shows this section's grammar inside a ```markdown
 * fence — `docs/guides/roadmap-sync.md` does, and a roadmap preamble carries
 * instructions to humans and may do the same. Such an example is an illustration,
 * never data, so both the heading search and the record readers must be blind to
 * it; otherwise a doc example either gets parsed as history or hard-fails the
 * whole document. An unterminated fence runs to the end of the input, matching
 * CommonMark.
 */
function maskFencedBlocks(body: string): string {
  let openFence: string | null = null;
  return body
    .split('\n')
    .map((line) => {
      const fence = line.match(FENCE_LINE);
      if (openFence === null) {
        if (!fence) return line;
        openFence = fence[1]![0]!;
      } else if (fence && fence[1]![0] === openFence) {
        openFence = null;
      }
      return ' '.repeat(line.length);
    })
    .join('\n');
}

/**
 * Locate the `## Assignment History` section in `body`, ignoring any occurrence
 * inside a fenced code block.
 *
 * The section is bounded by the next ATX heading of ANY level, not just the next
 * `## ` — bounding on H2 alone let an `### `/`# ` section that FOLLOWS history be
 * swallowed into it, which both fed foreign lines to the record readers and let
 * an unrelated section hard-fail the parse while the error named a line that is
 * not in the history section at all (#1862).
 *
 * Returns offsets into the ORIGINAL `body` plus the MASKED section text: callers
 * that read records want the masked text (fenced examples inert), callers that
 * preserve the section verbatim slice `body` with the offsets.
 */
function locateSection(body: string): { start: number; end: number; masked: string } | null {
  const mask = maskFencedBlocks(body);
  const heading = mask.match(/^## Assignment History[ \t]*\n/m);
  if (!heading || heading.index === undefined) return null;
  const start = heading.index + heading[0].length;
  const rest = mask.slice(start);
  const next = rest.search(NEXT_HEADING);
  const end = next === -1 ? body.length : start + next;
  return { start, end, masked: mask.slice(start, end) };
}

/** The masked section body, or `null` when the document has no history section. */
function extractSection(body: string): string | null {
  return locateSection(body)?.masked ?? null;
}

/**
 * The `## Assignment History` section of `body` VERBATIM, heading line included,
 * or `null` when there is none. The escape hatch for an unreadable section
 * ({@link parseAssignmentHistory} `Err`) carries this string through untouched
 * rather than dropping the section — see `store/regenerator`.
 */
export function extractAssignmentHistorySection(body: string): string | null {
  const found = locateSection(body);
  if (!found) return null;
  const headingStart = body.lastIndexOf(ASSIGNMENT_HISTORY_HEADING, found.start);
  return body.slice(headingStart, found.end).replace(/\s+$/, '');
}

/**
 * `body` with its `## Assignment History` section removed (and nothing else
 * touched). Returned unchanged when there is no such section. Paired with
 * {@link extractAssignmentHistorySection} so the escape hatch can re-parse a
 * document without its unreadable section and re-attach that section verbatim.
 */
export function stripAssignmentHistorySection(body: string): string {
  const found = locateSection(body);
  if (!found) return body;
  const headingStart = body.lastIndexOf(ASSIGNMENT_HISTORY_HEADING, found.start);
  return body.slice(0, headingStart) + body.slice(found.end);
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
 * Read the legacy pipe table: rows before the `|---|` separator are header and
 * are skipped, empty cells are dropped by the positional split, and a row whose
 * third value is not an action is skipped. A table with NO separator row yields
 * nothing here — and since its rows ARE record-shaped, {@link
 * parseAssignmentHistory} turns that into an error rather than an empty history
 * (#1862); this reader itself stays a pure "what can I read" helper.
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

/** The current bullet grammar, column-anchored exactly like {@link FIELD_BULLET}. */
const RECORD_BULLET_PREFIX = /^- \*\*/;

/**
 * True when `line` is shaped like a record this section has been written in —
 * a `- **` bullet, or a `|` table row (matched after trimming, the same tolerance
 * {@link readLegacyTableRecords} applies). See {@link parseAssignmentHistory} for
 * why the unreadable-section guard keys on this rather than on "non-blank".
 */
function looksLikeRecordData(line: string): boolean {
  return RECORD_BULLET_PREFIX.test(line) || line.trim().startsWith('|');
}

/**
 * Raised when the `## Assignment History` section holds record-shaped lines that
 * this build cannot read. A named class so callers can tell this recoverable,
 * escape-hatchable failure apart from a structurally broken document — see
 * `store/regenerator`'s `allowUnreadableHistory`.
 */
export class UnreadableAssignmentHistoryError extends Error {
  /** The record-shaped lines that could not be read, in document order. */
  readonly unreadableLines: readonly string[];

  constructor(unreadableLines: string[]) {
    super(
      `\`${ASSIGNMENT_HISTORY_HEADING}\` holds ${unreadableLines.length} line(s) shaped like ` +
        `assignment records, but no record could be read from any of them. Refusing to report ` +
        `an empty history: a document written from this parse would delete the whole section. ` +
        `First unreadable line: ${JSON.stringify(unreadableLines[0])}. ` +
        `Repair the section, then re-run — either it is in a grammar this build does not ` +
        `understand (upgrade the harness CLI), or it is a legacy pipe table that has lost its ` +
        `\`|---|---|---|---|\` separator row (restore that row by hand; the separator is what ` +
        `marks where the data rows begin, so nothing can infer it). To regenerate meanwhile ` +
        `without losing the section, re-run \`harness roadmap regen\` with ` +
        `\`--allow-unreadable-history\` (or set HARNESS_ROADMAP_ALLOW_UNREADABLE_HISTORY=1, ` +
        `which the pre-commit hook's bare invocation also honours): the section is carried ` +
        `into the aggregate verbatim instead of being dropped.`
    );
    this.name = 'UnreadableAssignmentHistoryError';
    this.unreadableLines = unreadableLines;
  }
}

/**
 * Parse the `## Assignment History` section of `body` into records.
 *
 * Both shapes are read: current bullet blocks first, then any legacy table rows.
 * A real document only ever holds one of the two, so the concatenation order is
 * observable only for a hand-mixed section, where "new format, then old" is as
 * good an answer as any.
 *
 * ## Why "no section" and "unreadable section" are different answers (#1862)
 *
 * This used to return `Ok([])` for BOTH of those, and the conflation cost 92
 * committed lines. `serializeRoadmap` omits the section when the record list is
 * empty — correct for a roadmap that never had a history — so an empty parse and
 * an empty history produce byte-identical output, and the deletion reads as
 * correct all the way down. `harness roadmap regen` reported success, exit 0,
 * and dropped the whole section.
 *
 * The empty parse is exactly what a format migration produces. #1811/#1859 moved
 * history off the pipe table onto bullet blocks; a parser built before that
 * migration reads the new shape as zero records. Any future migration recreates
 * the same situation, so the failure mode worth closing is the silence, not the
 * one instance.
 *
 * Hence: an ABSENT heading still yields `Ok([])` — a document with no history is
 * legitimate and must keep round-tripping byte-for-byte — but a heading carrying
 * lines that LOOK LIKE RECORDS, none of which could be read, is an `Err`.
 *
 * ## What counts as "looks like a record" — and why the trigger is that narrow
 *
 * A line qualifies only when it opens with `- **` (the current bullet grammar) or
 * with `|` (a legacy table row). Those are the only two shapes this section has
 * ever been WRITTEN in, so they are the only two shapes that can carry data at
 * risk — and the threat model is a format migration, which always leaves one of
 * them behind (a renamed bullet label is still `- **`; a mangled table row is
 * still `|`).
 *
 * Erroring on "any non-blank line" instead was tried and is too broad: it turns a
 * hand-authored placeholder (`_No assignments recorded yet._`), a machine marker
 * (`<!-- populated by sync -->`) and a thematic break (`---`) into a hard parse
 * failure of the WHOLE document. Those hold nothing to lose, so failing on them
 * protects nothing while wedging every reader of the file. Fenced examples and a
 * following section are excluded structurally instead, by {@link locateSection}.
 *
 * A heading with a blank body, or a body of prose only, is therefore `Ok([])`.
 *
 * ## Escape hatch
 *
 * The `Err` fails READS, not just writes, so a document in this state would wedge
 * every consumer — including the regen the repair commit has to pass. `regenerate`
 * / `writeRegeneratedRoadmap` therefore take `allowUnreadableHistory`, surfaced as
 * `harness roadmap regen --allow-unreadable-history` (and the
 * `HARNESS_ROADMAP_ALLOW_UNREADABLE_HISTORY=1` env var, for the pre-commit hook
 * that runs the bare command). It carries the unreadable section into the
 * aggregate VERBATIM — lossless, so it unwedges the repo without reintroducing the
 * deletion this guard exists to stop.
 */
export function parseAssignmentHistory(body: string): Result<AssignmentRecord[]> {
  const section = extractSection(body);
  if (section === null) return Ok([]);
  const lines = section.split('\n');
  const records = [...readBulletRecords(lines), ...readLegacyTableRecords(lines)];
  if (records.length === 0) {
    const unreadable = lines.filter(looksLikeRecordData);
    // The `> 0` arm is load-bearing, not defensive: without it a heading whose
    // body holds no record-shaped line at all — the blank placeholder heading —
    // would fail too, and there is nothing there to lose.
    if (unreadable.length > 0) return Err(new UnreadableAssignmentHistoryError(unreadable));
  }
  return Ok(records);
}
