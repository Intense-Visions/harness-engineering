import {
  ERRNO_REASON,
  ESCAPED_FROM_STAGES,
  RECEIPT_UNREAD_REASONS,
  FINDING_CLASSES,
  REVIEW_BACKENDS,
  REVIEW_DECIDERS,
  REVIEW_DECISION_KINDS,
  REVIEW_GATE_FAILURE_CODES,
  REVIEW_MOMENTS,
  REVIEW_TIERS,
} from '@harness-engineering/types';
import { FINAL_REVIEW_LABEL, SESSION_REVIEW_LABEL, compareReviewLabels } from './layout';

export { FINAL_REVIEW_LABEL, SESSION_REVIEW_LABEL, compareReviewLabels };

/**
 * The provenance stamp's vocabulary, written once. The renderer takes its fixed words, limits and
 * note templates from here, and the PR-body parser accepts a line only when it matches the cell
 * grammar below. The cell forms the renderer formats by hand (Diff, Gate, Blocking, Override) are
 * restated here as patterns, so the round trip ("whatever the renderer writes, the parser
 * accepts") is held by tests, not by construction. A PR body is text nobody vouches for.
 */
export const PROVENANCE_MARKER = '<!-- harness:review-provenance -->';
export const NO_PIPELINE_REVIEW = 'no pipeline review recorded';
export const STAMP_HEADING = '### Review provenance';
/** The Gate cell of an expected review that has no directory. */
export const MISSING_REVIEW = 'MISSING';

export const STAMP_COLUMNS = [
  'Review',
  'Moment',
  'Tier',
  'Backend',
  'Reviewers',
  'Diff',
  'Coverage',
  'Gate',
  'Blocking',
  'By class',
  'Escaped from',
  'Override',
] as const;
export type StampColumn = (typeof STAMP_COLUMNS)[number];
export type StampCells = Record<StampColumn, string>;
export const STAMP_TABLE_HEADER = `| ${STAMP_COLUMNS.join(' | ')} |`;
export const STAMP_TABLE_RULE = `| ${STAMP_COLUMNS.map(() => '---').join(' | ')} |`;

/** Bounds. A list longer than its bound is cut at an item and says how many it left out. */
export const STAMP_LIMITS = {
  /** Failure codes listed in a Gate cell, and in one gate decision. */
  codes: 6,
  /** Decisions written out in an Override cell (all of them are counted). */
  decisions: 6,
  /** Finding ids, reviewer ids and prior rounds listed in one place. */
  items: 4,
  /** Characters of one rationale, and of one id. */
  rationale: 120,
  id: 32,
  /** What the parser accepts: a line, rows, notes, and the stamp as a whole. */
  line: 4000,
  rows: 50,
  notes: 20,
  total: 30000,
} as const;

/**
 * Characters that never reach a stamp, written once for the renderer and the parser: controls,
 * format characters and every Unicode default-ignorable code point (bidi controls, zero-width
 * characters, the tag block U+E0000-E007F, variation selectors, U+00AD, U+034F, U+180E, Hangul
 * fillers), each also listed by range so the class does not depend on the Unicode version.
 */
const INVISIBLE_CLASS =
  '[\\p{Cc}\\p{Cf}\\p{Default_Ignorable_Code_Point}\\u00ad\\u034f\\u061c\\u180b-\\u180f' +
  '\\u200b-\\u200f\\u202a-\\u202e\\u2060-\\u206f\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0' +
  '\\u{E0000}-\\u{E0FFF}]';
// The class lists combining marks (U+034F, variation selectors) on purpose, one code point each.
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE = new RegExp(INVISIBLE_CLASS, 'u');
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE_ALL = new RegExp(INVISIBLE_CLASS, 'gu');
/**
 * Characters written as a numeric reference, which Markdown never reads as structure. `;` is
 * encoded too: it separates the decisions of an Override cell, so free text never holds one.
 */
const ENCODED = /[<>&[\]`*_~\\$;]/;
const ENTITY = /&#(?:36|38|42|59|60|62|91|92|93|95|96|126);/g;
/**
 * What must not survive in free text: markup, a cell break, math, an autolink, a mention, an
 * issue reference (`#12`, `owner/repo#12`, `GH-12`).
 */
const RAW_UNSAFE = /[<>&[\]`*~\\|@$]|:\/\/|www\.|#\d|GH-\d|(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])/i;

/**
 * Free text as inert stamp text of at most `max` characters: no marker, markup, cell break,
 * autolink, mention, issue reference, control or bidi character. Text that does not fit ends
 * with `…`; it is cut between characters, never inside a character reference.
 */
export function inert(text: string, max: number): string {
  const plain = text
    .replaceAll(PROVENANCE_MARKER, '')
    .replace(/[\t\n\v\f\r\u2028\u2029]+/g, ' ')
    .replace(INVISIBLE_ALL, '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '/')
    .replace(/:\/\//g, ': //')
    .replace(/www\./gi, (m) => `${m.slice(0, 3)} .`)
    .replace(/@/g, '(at)')
    .replace(/#(?=\d)/g, '# ')
    .replace(/GH-(?=\d)/gi, (m) => `${m} `)
    .trim();
  let out = '';
  for (const ch of plain) {
    const next = ENCODED.test(ch) ? `&#${ch.charCodeAt(0)};` : ch;
    if (out.length + next.length > max) return `${out.trimEnd()}…`;
    out += next;
  }
  return out;
}

/** Whether text the parser was given holds only what `inert` and the fixed vocabulary can write. */
export function isInert(cell: string): boolean {
  // A reference stands for one harmless character: it never joins what is on either side of it.
  const bare = cell.replace(ENTITY, ' ');
  return !RAW_UNSAFE.test(bare) && !INVISIBLE.test(bare);
}

/** `k n, k n` for a count table, or `none`. */
export function countsText(counts: Readonly<Record<string, number | undefined>>): string {
  const parts = Object.entries(counts).map(([k, n]) => `${k} ${n ?? 0}`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The first `max` items, then how many were left out. Never cuts inside an item. */
export function listed(items: readonly string[], max: number): string {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown}, +${items.length - max} more` : shown;
}

const alt = (values: readonly string[]) => values.join('|');
const LABEL = SESSION_REVIEW_LABEL.source.replace(/^\^|\$$/g, '');
const CODE = `(?:${alt(REVIEW_GATE_FAILURE_CODES)})`;
const MORE = '(?:, \\+\\d+ more)?';
const UNREVIEWED =
  '(?:, \\+(?:\\d+ commits? not reviewed|\\? commits not reviewed \\(count unavailable\\)))?';
/** Why a receipt is unreadable: an errno code or one of the reader's reasons. One definition. */
export const UNREAD_REASON = `(?:${ERRNO_REASON}|${alt(RECEIPT_UNREAD_REASONS)})`;
const REVIEWER = '[a-z][a-z0-9-]*…?';
const counts = (names: readonly string[]) =>
  `(?:none|(?:${alt(names)}) \\d+(?:, (?:${alt(names)}) \\d+)*)`;
const orDash = (pattern: string) => new RegExp(`^(?:-|${pattern})$`);

/**
 * Inert free text (`inert`): any character but `;` and `|`, a `&` that starts no reference, or a
 * numeric reference (whose `;` is its own). A bare `;` is never free text, so `; ` separates.
 */
const INERT_TOKEN = '(?:[^;&|]|&(?!#\\d{1,5};)|&#\\d{1,5};)';
const inertText = (tokens: number) => `${INERT_TOKEN}{1,${tokens}}`;
const DECIDER = `\\((?:${alt(REVIEW_DECIDERS)}|decider unknown)\\)`;
/** One decision as the Override cell writes it (provenance.ts `decisionText`). */
const DECISION =
  `(?:gate \\(${CODE}(?:, ${CODE})*${MORE}\\)|findings|dismissed ${inertText(400)}) ` +
  `${DECIDER}: ${inertText(STAMP_LIMITS.rationale + 1)}`;
/** The longest text one written-out decision can be: its kind, ids or codes, decider, rationale. */
const LONGEST_DECISION =
  Math.max(
    'gate () (decider unknown): '.length +
      Math.max(...REVIEW_GATE_FAILURE_CODES.map((c) => c.length + 2)) * STAMP_LIMITS.codes +
      ', +999 more'.length,
    'dismissed  (decider unknown): '.length +
      (STAMP_LIMITS.id + 3) * STAMP_LIMITS.items +
      ', +999 more'.length
  ) +
  STAMP_LIMITS.rationale +
  1;
/** The longest Override cell the renderer can write: the counts, every decision, `+N more`. */
export const OVERRIDE_CELL_MAX =
  '999999 overrides, 999999 dismissals, 999999 from other rounds: '.length +
  (LONGEST_DECISION + 2) * STAMP_LIMITS.decisions +
  '+999999 more'.length;
/**
 * The Override cell: its counts, then at most STAMP_LIMITS.decisions decisions separated by `; `
 * and `+N more`, each in the renderer's own form, and no longer in all than the renderer can
 * write (OVERRIDE_CELL_MAX). `inert` encodes `;` in free text, so the separators are unambiguous.
 */
const OVERRIDE_CELL = new RegExp(
  `^(?=.{1,${OVERRIDE_CELL_MAX}}$)(?:-|none|unknown|\\d+ overrides?, \\d+ dismissals?(?:, \\d+ from other rounds)?` +
    `(?:: ${DECISION}(?:; ${DECISION}){0,${STAMP_LIMITS.decisions - 1}}(?:; \\+\\d+ more)?)?)$`
);

/** What each cell of a stamp row may hold. The Gate cell is built from the failure-code list. */
export const STAMP_CELL_GRAMMAR: Record<StampColumn, RegExp> = {
  Review: SESSION_REVIEW_LABEL,
  Moment: orDash(alt(REVIEW_MOMENTS)),
  Tier: orDash(alt(REVIEW_TIERS)),
  Backend: orDash(alt(REVIEW_BACKENDS)),
  Reviewers: orDash('\\d+/\\d+'),
  Diff: orDash(
    '[0-9a-f]{7}\\.\\.[0-9a-f]{7}(?: \\(base: starting-commit\\))?' +
      `(?: \\(gap: base is not (?:the head ${LABEL} reviewed|the session starting commit)\\))?`
  ),
  Coverage: orDash('\\d+/\\d+ files|unknown'),
  Gate: new RegExp(
    `^(?:(?:${MISSING_REVIEW}|receipt missing|receipt invalid|receipt unreadable \\(${UNREAD_REASON}\\))(?: \\(overridden\\))?|` +
      `(?:pass at [0-9a-f]{7}|FAIL: ${CODE}(?:, ${CODE})*${MORE}(?: \\(overridden\\))?)${UNREVIEWED})$`
  ),
  Blocking: orDash(
    '(?:at least )?\\d+(?: \\(\\d+ dismissed(?:, \\d+ unaudited)?(?:, \\d+ decider unknown)?\\))?' +
      `(?:; not loaded: ${REVIEWER}(?:, ${REVIEWER})*${MORE})?` +
      '(?:; round \\d+)?(?:; round \\d+: \\d+ blocking)*(?:; \\+\\d+ more rounds?)?'
  ),
  'By class': orDash(counts(FINDING_CLASSES)),
  'Escaped from': orDash(counts(ESCAPED_FROM_STAGES)),
  Override: OVERRIDE_CELL,
};

/**
 * Every note the renderer can write, with its slots. The parser accepts a note line only when
 * it is one of these with every slot filled from the slot's own vocabulary: no free text.
 */
export const STAMP_NOTES = {
  'skipped-entries': 'entries under reviews/ that are not review directories, skipped: {n}',
  'expected-unknown-no-state':
    'expected reviews unknown (autopilot-state.json is absent or is not a JSON object), so a review that never ran is not shown',
  'expected-unknown-no-phase-list':
    'expected reviews unknown (autopilot-state.json has no phase list), so a review that never ran is not shown',
  'expected-unknown-phase-entry':
    'expected reviews unknown (phase entry {n} is malformed), so a review that never ran is not shown',
  'expected-unknown-phase-index':
    'expected reviews unknown (phase entry {n} states an index other than its 0-based position), so a review that never ran is not shown',
  'decisions-unreadable': 'overrides could not be read from autopilot-state.json',
  'decisions-legacy':
    'decision provenance unknown: {n} review decisions were recorded without decidedBy',
  'orphan-label':
    'orphan decision: {n} recorded for {label}, which is not a review of this session',
  'orphan-state':
    'orphan decision: kind {kind} recorded under state {state}, which is not a review state',
} as const;
export type StampNoteId = keyof typeof STAMP_NOTES;
const SLOTS = {
  n: '\\d{1,9}',
  label: LABEL,
  kind: `(?:${alt(REVIEW_DECISION_KINDS)})`,
  state: '(?:[A-Z_]{1,40}|unknown)',
} as const;
const slotPattern = (name: string): string | undefined =>
  Object.entries(SLOTS).find(([slot]) => slot === name)?.[1];

/** One note under the table: a template and the values of its slots. */
export interface StampNote {
  id: StampNoteId;
  args?: Partial<Record<keyof typeof SLOTS, string | number>>;
}

/** The text of a note. A slot value outside the slot's vocabulary is written as `?`. */
export function noteText(note: StampNote): string {
  const args: Record<string, string | number | undefined> = note.args ?? {};
  return STAMP_NOTES[note.id].replace(/\{(\w+)\}/g, (_, slot: string) => {
    const value = String(args[slot] ?? '');
    return new RegExp(`^${slotPattern(slot) ?? ''}$`).test(value) ? value : '?';
  });
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOTE_LINES = Object.values(STAMP_NOTES).map((template) => {
  const pattern = template
    .split(/(\{\w+\})/)
    .map(
      (part) =>
        (/^\{\w+\}$/.test(part) ? slotPattern(part.slice(1, -1)) : undefined) ?? escapeRegExp(part)
    )
    .join('');
  return new RegExp(`^- ${pattern}$`);
});

/** Whether a list line is a note the renderer could have written. */
export function isStampNoteLine(line: string): boolean {
  return NOTE_LINES.some((re) => re.test(line));
}

/** A table line as its twelve named cells, or undefined when it is not a stamp row. */
export function parseStampRow(line: string): StampCells | undefined {
  const parts = line.split('|').map((c) => c.trim());
  if (parts.length !== STAMP_COLUMNS.length + 2 || parts[0] !== '' || parts.at(-1) !== '') {
    return undefined;
  }
  const cells = Object.fromEntries(
    STAMP_COLUMNS.map((column, i) => [column, parts[i + 1] ?? ''])
  ) as StampCells;
  const fits = STAMP_COLUMNS.every((column) => STAMP_CELL_GRAMMAR[column].test(cells[column]));
  // Every other cell is fixed vocabulary; the Override cell is the one that carries free text.
  return fits && isInert(cells.Override) ? cells : undefined;
}

export interface ParsedProvenanceStamp {
  /** Table rows that have the stamp's shape, verbatim. */
  rows: string[];
  /** List lines under the table that are one of the renderer's notes, verbatim. */
  notes: string[];
  /** Lines inside the markers that are neither, or are outside the table and its notes, left out. */
  dropped: number;
  /** Stamp lines left out because the stamp holds more rows, notes or text than it may. */
  omitted: number;
  /** Rows for a review whose receipt was gated (a `pass at` or a `FAIL:` Gate cell). */
  reviewed: number;
  /** The review and abbreviated commit of every `pass at` row, in row order. */
  passedAt: Array<{ review: string; sha: string }>;
  /** Every final-all row: its Gate cell and the abbreviated head its Diff cell names. */
  finalRows: Array<{ gate: string; head?: string }>;
}

/**
 * Markdown and HTML that a rendered page does not show as blocks of its own and that may hold a
 * blank line: an HTML comment, a fenced code block, and an HTML block of CommonMark types 1, 3, 4
 * and 5 (`<script>`, `<pre>`, `<style>`, `<textarea>`, `<?`, `<!X`, `<![CDATA[`), each until its
 * terminator. A marker inside one is not a marker.
 */
const RAW_BLOCKS: ReadonlyArray<{ open: RegExp; close: RegExp }> = [
  {
    open: /^ {0,3}<(?:script|pre|style|textarea)(?=[\s>]|$)/i,
    close: /<\/(?:script|pre|style|textarea)>/i,
  },
  { open: /^ {0,3}<\?/, close: /\?>/ },
  { open: /^ {0,3}<![A-Za-z]/, close: />/ },
  { open: /^ {0,3}<!\[CDATA\[/, close: /\]\]>/ },
];
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

type Hidden =
  | { in: 'none' }
  | { in: 'comment' }
  | { in: 'fence'; fence: string }
  | { in: 'raw'; close: RegExp };

/**
 * Whether a line leaves an HTML comment open. `<!-->` and `<!--->` are whole (empty) comments,
 * as in CommonMark.
 */
function opensComment(line: string): boolean {
  const left = line.replace(/<!--(?:>|->|[\s\S]*?-->)/g, '');
  return left.includes('<!--');
}

/** Where a line that starts outside any hidden block leaves the scan. */
function stepFree(line: string): Hidden {
  const fence = FENCE.exec(line)?.[1];
  if (fence !== undefined) return { in: 'fence', fence };
  const raw = RAW_BLOCKS.find((b) => b.open.test(line));
  if (raw !== undefined)
    return raw.close.test(line) ? { in: 'none' } : { in: 'raw', close: raw.close };
  return opensComment(line) ? { in: 'comment' } : { in: 'none' };
}

/** The line that closes a fence: the same character, at least as many, nothing else. */
function closesFence(fence: string, line: string): boolean {
  const char = fence.startsWith('`') ? '`' : '~';
  return new RegExp(`^ {0,3}${char}{${fence.length},}\\s*$`).test(line);
}

/** Where a line leaves the hidden state it starts in. */
function step(state: Hidden, line: string): Hidden {
  if (state.in === 'none') return stepFree(line);
  if (state.in === 'fence') return closesFence(state.fence, line) ? { in: 'none' } : state;
  if (state.in === 'raw') return state.close.test(line) ? { in: 'none' } : state;
  const end = line.indexOf('-->');
  return end >= 0 && !opensComment(line.slice(end + 3)) ? { in: 'none' } : state;
}

/**
 * The line numbers of the markers a reader of the rendered page sees as a block of their own: a
 * line that is exactly the marker, at column 0, after an empty line (or first), and not inside
 * an HTML comment, a fenced code block or a raw HTML block (RAW_BLOCKS). A marker anywhere else
 * (in a paragraph, a list item, a quote, a link reference definition's title, a code block) is
 * text, not a marker.
 */
function visibleMarkers(lines: readonly string[]): number[] {
  const out: number[] = [];
  let state: Hidden = { in: 'none' };
  for (const [i, line] of lines.entries()) {
    const free = state.in === 'none';
    if (free && line === PROVENANCE_MARKER && (i === 0 || (lines[i - 1] ?? '').trim() === '')) {
      out.push(i);
      continue;
    }
    state = step(state, line);
  }
  return out;
}

/** HTML comments, which a rendered page hides; each stands for a line break. */
const HTML_COMMENT = /<!--(?:>|->|[\s\S]*?(?:-->|$))/g;

/**
 * The lines of the last stamp a reader of the rendered page sees, or undefined. A stamp is two
 * neighbouring visible markers (visibleMarkers) of which the first is followed directly by the
 * heading line. HTML comments inside it are removed, each leaving a line break.
 */
function stampLines(body: string): string[] | undefined {
  const lines = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());
  const markers = visibleMarkers(lines);
  for (let k = markers.length - 2; k >= 0; k--) {
    const open = markers[k] as number;
    const close = markers[k + 1] as number;
    if (lines[open + 1] !== STAMP_HEADING) continue;
    const inside = lines
      .slice(open + 2, close)
      .join('\n')
      .replace(HTML_COMMENT, '\n');
    return inside.split('\n').map((l) => l.trim());
  }
  return undefined;
}

/** Keep a stamp line unless its list or the stamp as a whole is full; an omitted line is counted. */
function keep(out: ParsedProvenanceStamp, list: string[], max: number, line: string): boolean {
  const size = [...out.rows, ...out.notes].reduce((n, l) => n + l.length, 0);
  if (list.length >= max || size + line.length > STAMP_LIMITS.total) {
    out.omitted++;
    return false;
  }
  list.push(line);
  return true;
}

function readRow(out: ParsedProvenanceStamp, line: string, cells: StampCells): void {
  if (!keep(out, out.rows, STAMP_LIMITS.rows, line)) return;
  if (cells.Review === FINAL_REVIEW_LABEL) {
    const head = /\.\.([0-9a-f]{7})/.exec(cells.Diff)?.[1];
    out.finalRows.push({ gate: cells.Gate, ...(head !== undefined && { head }) });
  }
  const pass = /^pass at ([0-9a-f]{7})/.exec(cells.Gate)?.[1];
  if (pass !== undefined) out.passedAt.push({ review: cells.Review, sha: pass });
  if (pass !== undefined || cells.Gate.startsWith('FAIL:')) out.reviewed++;
}

/** The stamp's lines as blocks: runs of non-empty lines between empty ones. */
function blocksOf(lines: readonly string[]): string[][] {
  const blocks: string[][] = [[]];
  for (const line of lines) {
    if (line === '') blocks.push([]);
    else blocks.at(-1)?.push(line);
  }
  return blocks.filter((b) => b.length > 0);
}

/**
 * Read a block in order: each line `accept` takes, up to the first it does not (that line and the
 * rest of the block are dropped: what follows a broken table or list is not shown as its rows).
 */
function readBlock(
  out: ParsedProvenanceStamp,
  block: readonly string[],
  accept: (line: string) => boolean
) {
  for (const [i, line] of block.entries()) {
    if (line.length > STAMP_LIMITS.line) {
      out.omitted++;
      continue;
    }
    if (!accept(line)) {
      out.dropped += block.length - i;
      return;
    }
  }
}

/**
 * Read a stamp out of text nobody vouches for (a PR body). Only what a reader of the rendered
 * page sees as the stamp is read (stampLines): its first block is the table (the header line, the
 * rule line, then rows) or the no-review line, and its second block, if any, the notes. A line
 * is kept only when the renderer could have written it (the cell grammar, the note templates),
 * within fixed bounds; everything else, any other block included, is counted and left out.
 * undefined: the text holds no stamp.
 */
export function parseProvenanceStamp(text: string): ParsedProvenanceStamp | undefined {
  const lines = stampLines(text);
  if (lines === undefined) return undefined;
  const out: ParsedProvenanceStamp = {
    rows: [],
    notes: [],
    dropped: 0,
    omitted: 0,
    reviewed: 0,
    passedAt: [],
    finalRows: [],
  };
  const [first = [], second = [], ...rest] = blocksOf(lines);
  const noReview = first.length === 1 && first[0] === `_${NO_PIPELINE_REVIEW}._`;
  if (!noReview && first[0] === STAMP_TABLE_HEADER && first[1] === STAMP_TABLE_RULE) {
    readBlock(out, first.slice(2), (line) => {
      const cells = parseStampRow(line);
      if (cells !== undefined) readRow(out, line, cells);
      return cells !== undefined;
    });
  } else if (!noReview) out.dropped += first.length;
  readBlock(out, second, (line) => {
    if (isStampNoteLine(line)) keep(out, out.notes, STAMP_LIMITS.notes, line);
    return isStampNoteLine(line);
  });
  out.dropped += rest.reduce((n, b) => n + b.length, 0);
  return out;
}
