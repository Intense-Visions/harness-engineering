import {
  FINAL_REVIEW_LABEL,
  NO_PIPELINE_REVIEW,
  PROVENANCE_MARKER,
  STAMP_HEADING,
  STAMP_LIMITS,
  STAMP_TABLE_HEADER,
  STAMP_TABLE_RULE,
  isStampNoteLine,
  parseStampRow,
  type StampCells,
} from './stamp-grammar';

/**
 * The provenance stamp read back out of a PR body: text nobody vouches for. A best-effort reader:
 * it follows the CommonMark blocks that hide text (comments, fenced code, raw HTML blocks), fails
 * closed (`ambiguous`) on the constructs it knows it cannot place, and keeps only lines the
 * renderer could have written (stamp-grammar.ts). It does not render the page, so a body crafted
 * to show one stamp and hide another is not defended against: anyone who can write the body can
 * write any stamp, and the stamp is shown as stated, not verified (ADR 0139).
 */
export interface ParsedProvenanceStamp {
  /**
   * `read`: exactly one stamp was found and read. `conflicting`: more than one was found, so none
   * was read. `too-large`: the text is longer than STAMP_LIMITS.input characters and was not
   * read. `ambiguous`: the text before the last marker holds a construct the parser knows may
   * hide part of the page from its reader (`reason`), so nothing was read. Only `read` has rows;
   * the others say why there are none, and none of them is "no stamp".
   */
  status: 'read' | 'conflicting' | 'too-large' | 'ambiguous';
  /**
   * Set exactly when `status` is `ambiguous`. `details-element`: `<details` or `</details`
   * appears before the last marker. `comment-opener`: an HTML comment opener there shares its line
   * with a backtick, leaves a comment open without starting its line, or reopens a comment after a
   * `-->` on its line. `html-block`: a line there starts with `<noscript`, `<template`, `<select`
   * or `<rp`, or an HTML block of CommonMark type 6 or 7 holds a line that opens a fence, a raw
   * HTML block or a comment. `container`: a fence opens inside a list item or a quote on its own
   * line, or a line inside a fence, a comment or a raw HTML block is less indented than its opener.
   */
  reason?: 'details-element' | 'comment-opener' | 'html-block' | 'container';
  /** Visible stamps found: 1 when read, 2 or more when conflicting, 0 when the text was not read. */
  stamps: number;
  /** Table rows that have the stamp's shape, verbatim. */
  rows: string[];
  /** List lines under the table that are one of the renderer's notes, verbatim. */
  notes: string[];
  /**
   * Lines inside the markers that are neither, are outside the table and its notes, or are
   * indented four or more columns (a code block on the page, not a table row), left out.
   */
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
 * terminator. A marker inside one is not a marker. `<details>` is not tracked: any `<details` before
 * the last marker makes the text `ambiguous` (stampAmbiguity). Every pattern here is anchored or
 * a fixed string, so each line is matched in time linear in its length.
 */
const RAW_BLOCKS: ReadonlyArray<{ open: RegExp; close: RegExp }> = [
  {
    open: /^ {0,3}<(?:script|pre|style|textarea)(?=[ \t>]|$)/i,
    close: /<\/(?:script|pre|style|textarea)>/i,
  },
  { open: /^ {0,3}<\?/, close: /\?>/ },
  { open: /^ {0,3}<![A-Za-z]/, close: />/ },
  { open: /^ {0,3}<!\[CDATA\[/, close: /\]\]>/ },
];
/** `<details` or `</details`, in any case, anywhere: GitHub may show its body collapsed. */
const DETAILS = /<\/?details/i;
/** A comment opener that starts its line: an HTML block (CommonMark type 2) on the page too. */
const BLOCK_COMMENT = /^ {0,3}<!--/;
/** A line the page shows as an indented code block when it does not continue a paragraph. */
const INDENTED = /^(?: {0,3}\t| {4})/;
/** The tag names of a CommonMark HTML block of type 6. */
const BLOCK_TAGS =
  'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|' +
  'dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|' +
  'header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|' +
  'param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
/** A line that starts an HTML block of CommonMark type 6. */
const HTML_TYPE6 = new RegExp(`^ {0,3}</?(?:${BLOCK_TAGS})(?=[ \\t>]|/>|$)`, 'i');
/** A line that starts with an open or closing tag: with a `>` last, a type 7 block's start. */
const TAG_START = /^ {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?=[ \t/>]|$)/;
/** A tag whose content a browser hides, or may hide, at the start of a line. */
const HIDING_TAG = /^ {0,3}<(?:noscript|template|select|rp)(?=[ \t/>]|$)/i;
/** One list item or quote marker at a position (sticky): what a fence inside one follows. */
const CONTAINER = / {0,3}(?:>[ \t]?|(?:[-+*]|\d{1,9}[.)])[ \t]+)/y;

type Hidden =
  | { in: 'none' }
  | { in: 'comment'; indent: number }
  | { in: 'fence'; fence: string; indent: number }
  | { in: 'raw'; close: RegExp; indent: number };

/** Why the text before the last marker leaves what the page shows unknown. */
type Ambiguity = NonNullable<ParsedProvenanceStamp['reason']>;

/** A line without the spaces and tabs at its end (CommonMark's whitespace, not `\s`). */
function trimEndBlank(line: string): string {
  let end = line.length;
  while (end > 0 && (line[end - 1] === ' ' || line[end - 1] === '\t')) end--;
  return line.slice(0, end);
}

/** A line without the spaces and tabs at either end. */
function trimBlank(line: string): string {
  let start = 0;
  while (start < line.length && (line[start] === ' ' || line[start] === '\t')) start++;
  return trimEndBlank(line.slice(start));
}

/** The column a line's first non-blank character stands in (a tab to the next multiple of 4). */
function indentOf(line: string): number {
  let col = 0;
  for (const ch of line) {
    if (ch === ' ') col++;
    else if (ch === '\t') col += 4 - (col % 4);
    else return col;
  }
  return col;
}

/**
 * The fence a line opens at `from` (after up to three spaces), or undefined: three or more
 * backticks or tildes, and for backticks no backtick after them on the line (CommonMark: a
 * backtick fence's info string holds none). One pass over the line.
 */
function fenceAt(line: string, from: number): string | undefined {
  let i = from;
  while (i < from + 3 && line[i] === ' ') i++;
  const char = line[i];
  if (char !== '`' && char !== '~') return undefined;
  let end = i;
  while (line[end] === char) end++;
  if (end - i < 3) return undefined;
  if (char === '`' && line.indexOf('`', end) >= 0) return undefined;
  return line.slice(i, end);
}

/** The line that closes a fence: the same character, at least as many, then only blanks. */
function closesFence(fence: string, line: string): boolean {
  let i = 0;
  while (i < 3 && line[i] === ' ') i++;
  let end = i;
  while (line[end] === fence[0]) end++;
  // The lines are trimmed of spaces and tabs at their end, and of nothing else.
  return end - i >= fence.length && end === line.length;
}

/** Whether a line opens a fence inside a list item or a quote that starts on it. */
function containedFence(line: string): boolean {
  let i = 0;
  let depth = 0;
  for (;;) {
    CONTAINER.lastIndex = i;
    if (CONTAINER.exec(line) === null) break;
    i = CONTAINER.lastIndex;
    depth++;
  }
  return depth > 0 && fenceAt(line, i) !== undefined;
}

/**
 * A line's text outside its HTML comments, and whether it leaves one open. `<!-->` and `<!--->`
 * are whole (empty) comments, as in CommonMark. One pass over the line.
 */
function scanComments(line: string): { outside: string; leavesOpen: boolean } {
  let outside = '';
  let i = 0;
  for (;;) {
    const open = line.indexOf('<!--', i);
    if (open < 0) return { outside: outside + line.slice(i), leavesOpen: false };
    outside += line.slice(i, open);
    const after = open + 4;
    if (line.startsWith('>', after)) i = after + 1;
    else if (line.startsWith('->', after)) i = after + 2;
    else {
      const close = line.indexOf('-->', after);
      if (close < 0) return { outside, leavesOpen: true };
      i = close + 3;
    }
  }
}

/** Where a line that starts outside any hidden block leaves the scan. */
function stepFree(line: string): Hidden {
  const indent = indentOf(line);
  const fence = fenceAt(line, 0);
  if (fence !== undefined) return { in: 'fence', fence, indent };
  const raw = RAW_BLOCKS.find((b) => b.open.test(line));
  if (raw !== undefined)
    return raw.close.test(line) ? { in: 'none' } : { in: 'raw', close: raw.close, indent };
  return scanComments(line).leavesOpen ? { in: 'comment', indent } : { in: 'none' };
}

/** Where a line leaves the hidden state it starts in. */
function step(state: Hidden, line: string): Hidden {
  switch (state.in) {
    case 'none':
      return stepFree(line);
    case 'fence':
      return closesFence(state.fence, line) ? { in: 'none' } : state;
    case 'raw':
      return state.close.test(line) ? { in: 'none' } : state;
    case 'comment':
      return leaveComment(state, line);
  }
}

/** Inside an HTML comment: where a line leaves the scan. */
function leaveComment(state: Hidden, line: string): Hidden {
  const end = line.indexOf('-->');
  if (end < 0) return state;
  // A comment reopened after `-->` on the same line is refused by lineAmbiguity first.
  return scanComments(line.slice(end + 3)).leavesOpen
    ? { in: 'comment', indent: 0 }
    : { in: 'none' };
}

/** Whether a line outside any hidden block starts an HTML block of type 6 or 7 (loosely). */
function startsHtmlBlock(line: string): boolean {
  if (RAW_BLOCKS.some((b) => b.open.test(line))) return false;
  return HTML_TYPE6.test(line) || (TAG_START.test(line) && line.endsWith('>'));
}

/**
 * One line's part in the stateful fail-closed rules (scanLines). `html-block`: a line outside
 * any hidden block that starts with `<noscript`, `<template`, `<select` or `<rp` (a browser hides
 * what follows), or a line inside an HTML block of type 6 or 7 (from its start to the next empty
 * line, where the page reads raw HTML, not Markdown) that the scan reads as opening a fence, a
 * raw HTML block or a comment. `container`: a fence opened inside a list item or a quote on its
 * own line, or a line less indented than the opener of the hidden block it is in (a list item the
 * page closes there, which closes the block with it).
 */
function lineReason(state: Hidden, html: boolean, line: string): Ambiguity | undefined {
  if (state.in !== 'none') {
    return state.indent > 0 && line !== '' && indentOf(line) < state.indent
      ? 'container'
      : undefined;
  }
  if (HIDING_TAG.test(line)) return 'html-block';
  if (html && stepFree(line).in !== 'none') return 'html-block';
  return containedFence(line) ? 'container' : undefined;
}

/**
 * One pass over the lines. The markers a reader of the rendered page sees as a block of their
 * own: a line that is exactly the marker, at column 0, after an empty line (or first), and not
 * inside an HTML comment, a fenced code block or a raw HTML block (RAW_BLOCKS). A marker anywhere
 * else (in a paragraph, a list item, a quote, a link reference definition's title, a code block)
 * is text, not a marker. And, up to line `last`, the first stateful reason (lineReason) the page
 * may differ from the scan.
 */
function scanLines(
  lines: readonly string[],
  last: number
): { markers: number[]; reason?: Ambiguity } {
  const markers: number[] = [];
  let state: Hidden = { in: 'none' };
  let html = false;
  let reason: Ambiguity | undefined;
  for (const [i, line] of lines.entries()) {
    const free = state.in === 'none';
    if (free && line === PROVENANCE_MARKER && (i === 0 || lines[i - 1] === '')) {
      markers.push(i);
      continue;
    }
    if (reason === undefined && i <= last) reason = lineReason(state, html, line);
    const next = step(state, line);
    if (line === '') html = false;
    else if (free && !html && next.in === 'none') html = startsHtmlBlock(line);
    state = next;
  }
  return reason === undefined ? { markers } : { markers, reason };
}

/** The visible stamps: neighbouring visible markers of which the first is followed by the heading. */
function stampRanges(
  lines: readonly string[],
  markers: readonly number[]
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k + 1 < markers.length; ) {
    const open = markers[k] as number;
    if (lines[open + 1] === STAMP_HEADING) {
      out.push([open, markers[k + 1] as number]);
      k += 2;
    } else k++;
  }
  return out;
}

/** HTML comments, which a rendered page hides; each stands for a line break. */
const HTML_COMMENT = /<!--(?:>|->|[\s\S]*?(?:-->|$))/g;

/** The index of the last line that holds a marker, or -1. */
function lastMarkerLine(lines: readonly string[]): number {
  let last = lines.length - 1;
  while (last >= 0 && !(lines[last] ?? '').includes(PROVENANCE_MARKER)) last--;
  return last;
}

/**
 * Why the text up to line `last` leaves what the page shows unknown, or undefined: the stateless
 * rules. The scan of hidden blocks (scanLines) follows CommonMark, but a page can hide text it
 * does not track, and a code span can make an opener it does track into plain text. These rules
 * close part of that gap by refusing, not by modelling it: any `<details` or `</details` (in a
 * code span, a comment, a code block or anywhere else); and any HTML comment opener that shares
 * its line with a backtick, that leaves a comment open without starting its line, or that
 * reopens a comment after a `-->` on the same line (the page ends the comment block there). The
 * markers themselves are left out of the comment rules. Linear in the text.
 */
function stampAmbiguity(lines: readonly string[], last: number): Ambiguity | undefined {
  for (let i = 0; i <= last; i++) {
    const reason = lineAmbiguity(lines[i] ?? '');
    if (reason !== undefined) return reason;
  }
  return undefined;
}

/** One line's part in stampAmbiguity. */
function lineAmbiguity(line: string): Ambiguity | undefined {
  if (DETAILS.test(line)) return 'details-element';
  const rest = line.replaceAll(PROVENANCE_MARKER, '');
  if (!rest.includes('<!--')) return undefined;
  const textual = rest.includes('`');
  const spans = scanComments(rest).leavesOpen && !BLOCK_COMMENT.test(rest);
  const closed = rest.lastIndexOf('-->');
  const reopens = closed >= 0 && rest.indexOf('<!--', closed + 3) >= 0;
  return textual || spans || reopens ? 'comment-opener' : undefined;
}

/** Why nothing was read from text that holds a marker, or the lines of its one visible stamp. */
type StampText =
  | { status: 'ambiguous'; reason: Ambiguity }
  | { status: 'conflicting'; stamps: number }
  | { status: 'read'; lines: string[] };

/**
 * The lines of the one stamp the scan finds, or why none is read: ambiguous text (stampAmbiguity,
 * then the stateful rules of scanLines), or more than one stamp. undefined: no stamp. HTML
 * comments inside the stamp are removed, each leaving a line break. A line indented four or more
 * columns keeps its indent, so it is never read as a table row or a note (the page shows a code
 * block there); any other line is trimmed of spaces and tabs.
 */
function stampText(body: string): StampText | undefined {
  const lines = body.replace(/\r\n?/g, '\n').split('\n').map(trimEndBlank);
  const last = lastMarkerLine(lines);
  if (last < 0) return undefined;
  const flat = stampAmbiguity(lines, last);
  if (flat !== undefined) return { status: 'ambiguous', reason: flat };
  const { markers, reason } = scanLines(lines, last);
  if (reason !== undefined) return { status: 'ambiguous', reason };
  const ranges = stampRanges(lines, markers);
  if (ranges.length > 1) return { status: 'conflicting', stamps: ranges.length };
  const [range] = ranges;
  if (range === undefined) return undefined;
  const inside = lines
    .slice(range[0] + 2, range[1])
    .join('\n')
    .replace(HTML_COMMENT, '\n');
  return {
    status: 'read',
    lines: inside.split('\n').map((l) => (INDENTED.test(l) ? l : trimBlank(l))),
  };
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
 * Read a block in order: each line `accept` takes, up to the first it does not or the first
 * indented four or more columns (that line and the rest of the block are dropped: what follows a
 * broken table or list is not shown as its rows).
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
    if (INDENTED.test(line) || !accept(line)) {
      out.dropped += block.length - i;
      return;
    }
  }
}

const empty = (status: ParsedProvenanceStamp['status'], stamps: number): ParsedProvenanceStamp => ({
  status,
  stamps,
  rows: [],
  notes: [],
  dropped: 0,
  omitted: 0,
  reviewed: 0,
  passedAt: [],
  finalRows: [],
});

/**
 * Read a stamp out of text nobody vouches for (a PR body). Text longer than STAMP_LIMITS.input
 * characters is refused unread (`too-large`). Text whose part up to the last marker holds a
 * construct the parser knows it cannot place (stampAmbiguity, scanLines) is refused unread
 * (`ambiguous`). Otherwise the stamp the scan finds outside comments, fenced code and raw HTML
 * blocks is read (stampText), and only when exactly one is found: two or more are `conflicting`
 * and none of them is read. Best effort: a body crafted to show one stamp and hide another is
 * not defended against (ParsedProvenanceStamp). Linear in the text. The stamp's first block
 * is the table (the header line, the rule line, then rows) or the no-review line, and its second
 * block, if any, the notes. A line is kept only when the renderer could have written it (the cell
 * grammar, the note templates), within fixed bounds; everything else, any other block included,
 * is counted and left out. A consumer reports `ambiguous`, `conflicting` and `too-large` as
 * states of their own, never as "no stamp" and never as a pass.
 * undefined: the text holds no marker, or no stamp.
 */
export function parseProvenanceStamp(text: string): ParsedProvenanceStamp | undefined {
  if (text.length > STAMP_LIMITS.input) return empty('too-large', 0);
  const found = stampText(text);
  if (found === undefined) return undefined;
  if (found.status === 'ambiguous') return { ...empty('ambiguous', 0), reason: found.reason };
  if (found.status === 'conflicting') return empty('conflicting', found.stamps);
  return readStamp(found.lines);
}

/** The table and notes of the one visible stamp, kept as far as the grammar and bounds allow. */
function readStamp(lines: readonly string[]): ParsedProvenanceStamp {
  const out = empty('read', 1);
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
