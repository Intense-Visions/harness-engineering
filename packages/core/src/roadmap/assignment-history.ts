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

/**
 * The bound of the history section: the next ATX heading at a level AT OR ABOVE
 * the section's own H2 — i.e. `# ` or `## `.
 *
 * Not "any level". An `### ` under `## Assignment History` is that section's
 * SUBSECTION in markdown, and hand-grouped histories really do use them
 * (`### 2026 Q1`). Bounding on `###` cuts the section off at its first subheading,
 * leaving an empty body — zero records AND zero record-shaped lines, so the
 * unreadable-history guard cannot fire and the whole grouped history is deleted
 * at exit 0. Bounding on `## ` alone is the opposite error: a following `# `
 * section gets swallowed INTO the history, feeding foreign lines to the readers
 * and naming a line outside the section in the error. Level ≤ 2 is the bound that
 * is wrong in neither direction (#1862 review).
 */
const NEXT_HEADING = /^#{1,2}[ \t]/m;

/**
 * A fence line (```/~~~) opening or closing a code block.
 *
 * At most 3 leading spaces, per CommonMark — 4+ spaces is an indented code block,
 * not a fence, and treating one as a fence would blank a region the document does
 * not consider fenced.
 */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Blank out every CLOSED fenced code block, preserving each line's LENGTH so an
 * offset into the mask is the same offset into `body`.
 *
 * Documentation legitimately shows this section's grammar inside a ```markdown
 * fence — `docs/guides/roadmap-sync.md` does, and a roadmap preamble carries
 * instructions to humans and may do the same. Such an example is an illustration,
 * never data, so both the heading search and the record readers must be blind to
 * it; otherwise a doc example either gets parsed as history or hard-fails the
 * whole document.
 *
 * ## Why an UNTERMINATED fence is left as literal text
 *
 * CommonMark runs an unclosed fence to the end of the document, and masking that
 * far is exactly the silent deletion this module exists to stop: one stray
 * ```` ``` ```` in a preamble would blank the real `## Assignment History`
 * section, the heading search would find nothing, {@link parseAssignmentHistory}
 * would answer `Ok([])` before its guard ever ran, and `serializeRoadmap` would
 * drop the section at exit 0. The guard cannot fire on records it can no longer
 * see.
 *
 * So the invariant this function must preserve is: **a heading present in `body`
 * is never absent from the mask.** Only balanced open/close pairs are blanked; a
 * dangling opener masks nothing. The cost is that an unterminated fenced example
 * may be read as real records — a wrong answer the guard and the reader can both
 * still see, which is strictly recoverable, unlike silence.
 */
function maskFencedBlocks(body: string): string {
  const lines = body.split('\n');
  const masked = [...lines];
  let openIndex: number | null = null;
  let openChar = '';

  for (let i = 0; i < lines.length; i++) {
    const fence = lines[i]!.match(FENCE_LINE);
    if (!fence) continue;
    const char = fence[1]![0]!;
    if (openIndex === null) {
      openIndex = i;
      openChar = char;
      continue;
    }
    // Only a fence of the SAME character closes the block, per CommonMark.
    if (char !== openChar) continue;
    for (let j = openIndex; j <= i; j++) masked[j] = ' '.repeat(lines[j]!.length);
    openIndex = null;
  }

  return masked.join('\n');
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
 * Returns offsets into the ORIGINAL `body` plus BOTH views of the section body:
 * `masked` (fenced examples blanked) is what the record readers consume, `raw` is
 * what the unreadable-history guard inspects. They must not be swapped — see
 * {@link parseAssignmentHistory} for why the guard reads the unmasked text.
 */
function locateSection(
  body: string
): { start: number; end: number; masked: string; raw: string } | null {
  const mask = maskFencedBlocks(body);
  // `\r?\n`: a CRLF document must not slip past the heading match, or the whole
  // guard silently never fires on Windows checkouts (#1862).
  const heading = mask.match(/^## Assignment History[ \t]*\r?\n/m);
  if (!heading || heading.index === undefined) return null;
  const start = heading.index + heading[0].length;
  const rest = mask.slice(start);
  const next = rest.search(NEXT_HEADING);
  const end = next === -1 ? body.length : start + next;
  return { start, end, masked: mask.slice(start, end), raw: body.slice(start, end) };
}

/**
 * Offset of the `## Assignment History` heading in `body`, or `null` when there
 * is none — fence-aware, so a documentation example does not count as a section.
 *
 * Exported so every reader that needs to know "where does the history section
 * begin" agrees with the parser. `store/meta.ts` used to answer that question
 * with a naive `indexOf`, which disagreed with this module the moment a preamble
 * contained a fenced example: the preamble was truncated mid-fence, and the
 * re-serialized `_meta.md` then carried an unterminated fence (#1862 review).
 */
export function findAssignmentHistoryHeadingIndex(body: string): number | null {
  const found = locateSection(body);
  if (!found) return null;
  return body.lastIndexOf(ASSIGNMENT_HISTORY_HEADING, found.start);
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

/** Split a masked section body into lines, tolerating CRLF. */
function sectionLines(section: string): string[] {
  return section.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
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

/** What a reader got out of the section, and which line indices it accounted for. */
interface ReadPass {
  records: AssignmentRecord[];
  /**
   * Indices of the lines that ended up INSIDE a record. A record-shaped line not
   * in this set is data the reader saw and dropped — which is the whole signal
   * the unreadable-history guard runs on.
   */
  consumed: Set<number>;
}

/**
 * Read the current bullet-block format. A `- **Feature:**` bullet closes the
 * previous record and opens a new one; the other three fill in the open record.
 * Anything else on the line is ignored, so blank lines and the legacy table are
 * simply not this reader's business.
 *
 * A bullet counts as consumed only once its block FINALIZES into a record. An
 * incomplete block — three of the four labels, say — is left unaccounted for on
 * purpose, so the guard reports it instead of silently dropping it.
 */
function readBulletRecords(lines: string[]): ReadPass {
  const records: AssignmentRecord[] = [];
  const consumed = new Set<number>();
  let draft: RecordDraft | null = null;
  let draftLines: number[] = [];

  const closeDraft = (): void => {
    const finished = finalizeDraft(draft);
    if (finished) {
      records.push(finished);
      for (const index of draftLines) consumed.add(index);
    }
    draft = null;
    draftLines = [];
  };

  for (const [index, line] of lines.entries()) {
    const match = line.match(FIELD_BULLET);
    if (!match) continue;
    const label = match[1] as FieldLabel;
    if (label === 'Feature') closeDraft();
    draft ??= {};
    draft[FIELD_KEYS[label]] = decodeSummaryField(match[2] ?? '');
    draftLines.push(index);
  }
  closeDraft();

  return { records, consumed };
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
function readLegacyTableRecords(lines: string[]): ReadPass & { sawSeparator: boolean } {
  const records: AssignmentRecord[] = [];
  const consumed = new Set<number>();
  const headerLines: number[] = [];
  let sawSeparator = false;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (!sawSeparator) {
      headerLines.push(index);
      if (LEGACY_SEPARATOR.test(trimmed)) {
        // The separator proves the rows above it are a header, not lost data —
        // so a well-formed table with zero data rows is genuinely empty, and the
        // guard must stay quiet about it.
        sawSeparator = true;
        for (const header of headerLines) consumed.add(header);
      }
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
    consumed.add(index);
  }

  return { records, consumed, sawSeparator };
}

/**
 * A record bullet as the GUARD recognises it: any CommonMark bullet marker, any
 * indentation.
 *
 * Deliberately looser than {@link FIELD_BULLET}, which the reader keeps anchored
 * at `- ` in column 0. The reader defines what round-trips; the guard defines what
 * is worth refusing to delete, and those are not the same bar. `markdownlint --fix`
 * with `MD004 ul-style: asterisk` rewrites every `- ` to `* `, and indenting a
 * block is one keystroke — under the reader's anchoring both turn real records
 * into unreadable lines, which is exactly the case the guard exists to catch.
 * Anchoring the guard as tightly as the reader would leave the LIVE format less
 * protected than the retired one, since the legacy arm has always trimmed.
 */
const RECORD_BULLET_PREFIX = /^[-*+]\s+\*\*/;

/**
 * True when `line` is shaped like a record this section has been written in — a
 * `- **` bullet or a `|` table row, both matched after trimming. See
 * {@link parseAssignmentHistory} for why the unreadable-section guard keys on
 * this rather than on "non-blank".
 */
function looksLikeRecordData(line: string): boolean {
  const trimmed = line.trim();
  return RECORD_BULLET_PREFIX.test(trimmed) || trimmed.startsWith('|');
}

/**
 * Raised when the `## Assignment History` section holds record-shaped lines that
 * this build cannot read. A named class so callers can tell this recoverable,
 * escape-hatchable failure apart from a structurally broken document — see
 * `store/regenerator`'s `allowUnreadableHistory`.
 */
export class UnreadableAssignmentHistoryError extends Error {
  /** The record-shaped lines no reader accounted for, in document order. */
  readonly unreadableLines: readonly string[];

  /**
   * The message is DIAGNOSIS plus document repair, and deliberately names no CLI
   * flag. This module is a pure grammar helper; a remedy phrased as
   * `harness roadmap regen --…` is unreachable advice for the MCP tool and the
   * dashboard, which hit the same `Err`, and nothing would couple the string to
   * the constant that defines the flag. Each front-end appends its own recovery
   * sentence — see `runRoadmapRegen`.
   *
   * @param unreadableLines  record-shaped lines that ended up in no record.
   * @param sawLegacySeparator whether a `|---|` row was present. Governs which
   *   repair is offered: telling an operator to restore a separator row they can
   *   see is already there is worse than saying nothing, and upgrading the CLI
   *   cannot repair a separator that was never written — so neither may be
   *   offered unconditionally.
   */
  constructor(unreadableLines: string[], sawLegacySeparator = false) {
    const missingSeparator =
      !sawLegacySeparator && unreadableLines.some((line) => line.trim().startsWith('|'));
    super(
      `\`${ASSIGNMENT_HISTORY_HEADING}\` holds ${unreadableLines.length} line(s) shaped like ` +
        `assignment records that could not be read into a record. Refusing to drop them: a ` +
        `document written from this parse would delete them from the section. ` +
        `First unreadable line: ${JSON.stringify(unreadableLines[0])}. ` +
        (missingSeparator
          ? `This looks like a legacy pipe table that has lost its \`|---|---|---|---|\` ` +
            `separator row — restore that row by hand, since the separator is what marks ` +
            `where the data rows begin and nothing can infer it.`
          : `The section is most likely in a grammar this build does not understand; ` +
            `upgrading the harness CLI is the usual repair.`)
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
  const found = locateSection(body);
  if (found === null) return unlocatedHeadingCheck(body);

  // Masking preserves every line's length, so the two views share line indices.
  const maskedLines = sectionLines(found.masked);
  const rawLines = sectionLines(found.raw);

  const bullets = readBulletRecords(maskedLines);
  const legacy = readLegacyTableRecords(maskedLines);
  const records = [...bullets.records, ...legacy.records];

  // The GUARD reads the RAW section, not the masked one. Masking exists to keep a
  // fenced EXAMPLE out of the record READERS; a guard that cannot see a line
  // cannot protect it, and a fence inside a real history section hides data at
  // risk rather than an illustration. Running the guard on the mask let one stray
  // fence delete records in silence — the #1862 defect, rebuilt (review).
  const unreadable = rawLines.filter(
    (line, index) =>
      looksLikeRecordData(line) && !bullets.consumed.has(index) && !legacy.consumed.has(index)
  );

  // NOT gated on `records.length === 0`. One readable record used to switch the
  // guard off entirely, so a half-migrated section dropped the rest in silence —
  // the same defect, scoped to a subset. Any record-shaped line that no reader
  // accounted for is data about to be deleted.
  //
  // The `> 0` arm is load-bearing, not defensive: without it a heading whose body
  // holds no record-shaped line at all — the blank placeholder heading — would
  // fail too, and there is nothing there to lose.
  if (unreadable.length > 0) {
    return Err(new UnreadableAssignmentHistoryError(unreadable, legacy.sawSeparator));
  }
  return Ok(records);
}

/** A heading line whose text STARTS with the section name (`## Assignment History (legacy)`). */
const NEAR_MISS_HEADING = /^#{1,6}[ \t]+Assignment History[^\n]*$/m;

/**
 * The answer for a document {@link locateSection} found no section in.
 *
 * Almost always `Ok([])` — a roadmap with no history is legitimate and must keep
 * round-tripping byte-for-byte. The exception is a heading that NAMES the section
 * without matching it exactly, `## Assignment History (legacy)` being the shape an
 * operator produces while hand-repairing a table. Reading that as "no history"
 * deletes a section whose records may be perfectly readable — the defect this
 * module exists to stop — so it is an error instead, and one repaired in a single
 * edit.
 */
function unlocatedHeadingCheck(body: string): Result<AssignmentRecord[]> {
  const nearMiss = maskFencedBlocks(body).match(NEAR_MISS_HEADING);
  if (!nearMiss) return Ok([]);
  return Err(
    new Error(
      `Found the heading ${JSON.stringify(nearMiss[0].trim())}, which names the assignment ` +
        `history section but is not exactly \`${ASSIGNMENT_HISTORY_HEADING}\` on its own line. ` +
        `Refusing to read this document as having no history: anything under that heading ` +
        `would be deleted by the next write. Restore the heading to ` +
        `\`${ASSIGNMENT_HISTORY_HEADING}\` and re-run.`
    )
  );
}
