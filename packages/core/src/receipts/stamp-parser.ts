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
 * The provenance stamp read back out of a PR body: text nobody vouches for. Only what a reader of
 * the rendered page sees is read, and only lines the renderer could have written (stamp-grammar.ts)
 * are kept. Where the parser cannot tell what the page shows it reads nothing (`ambiguous`).
 */
export interface ParsedProvenanceStamp {
  /**
   * `read`: exactly one stamp is visible and was read. `conflicting`: more than one is visible,
   * so none was read. `too-large`: the text is longer than STAMP_LIMITS.input characters and was
   * not read. `ambiguous`: the text before the last marker holds what may hide part of the page
   * from its reader (`reason`), so nothing was read. Only `read` has rows; the others say why
   * there are none, and none of them is "no stamp".
   */
  status: 'read' | 'conflicting' | 'too-large' | 'ambiguous';
  /**
   * Set exactly when `status` is `ambiguous`. `details-element`: `<details` or `</details`
   * appears before the last marker. `comment-opener`: an HTML comment opener there shares its line
   * with a backtick, or leaves a comment open without starting its line.
   */
  reason?: 'details-element' | 'comment-opener';
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
 * the last marker makes the text `ambiguous` (stampAmbiguity).
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
/** A fence opener. A backtick fence's info string holds no backtick (CommonMark), else no fence. */
const FENCE = /^ {0,3}(?:(`{3,})(?!.*`)|(~{3,}))/;
/** `<details` or `</details`, in any case, anywhere: GitHub may show its body collapsed. */
const DETAILS = /<\/?details/i;
/** A comment opener that starts its line: an HTML block (CommonMark type 2) on the page too. */
const BLOCK_COMMENT = /^ {0,3}<!--/;
/** A line the page shows as an indented code block when it does not continue a paragraph. */
const INDENTED = /^(?: {0,3}\t| {4})/;

type Hidden =
  | { in: 'none' }
  | { in: 'comment' }
  | { in: 'fence'; fence: string }
  | { in: 'raw'; close: RegExp };

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
  const open = FENCE.exec(line);
  const fence = open?.[1] ?? open?.[2];
  if (fence !== undefined) return { in: 'fence', fence };
  const raw = RAW_BLOCKS.find((b) => b.open.test(line));
  if (raw !== undefined)
    return raw.close.test(line) ? { in: 'none' } : { in: 'raw', close: raw.close };
  return scanComments(line).leavesOpen ? { in: 'comment' } : { in: 'none' };
}

/** The line that closes a fence: the same character, at least as many, nothing else. */
function closesFence(fence: string, line: string): boolean {
  const char = fence.startsWith('`') ? '`' : '~';
  return new RegExp(`^ {0,3}${char}{${fence.length},}\\s*$`).test(line);
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
      return leaveComment(line);
  }
}

/** Inside an HTML comment: where a line leaves the scan. */
function leaveComment(line: string): Hidden {
  const end = line.indexOf('-->');
  if (end < 0) return { in: 'comment' };
  return scanComments(line.slice(end + 3)).leavesOpen ? { in: 'comment' } : { in: 'none' };
}

/**
 * The line numbers of the markers a reader of the rendered page sees as a block of their own: a
 * line that is exactly the marker, at column 0, after an empty line (or first), and not inside
 * an HTML comment, a fenced code block or a raw HTML block (RAW_BLOCKS). A marker anywhere else (in a paragraph, a list item, a quote, a link reference definition's
 * title, a code block) is text, not a marker.
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

/** The visible stamps: neighbouring visible markers of which the first is followed by the heading. */
function stampRanges(lines: readonly string[]): Array<[number, number]> {
  const markers = visibleMarkers(lines);
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

/**
 * Why the text before the last marker leaves what the page shows unknown, or undefined. The scan
 * of hidden blocks (visibleMarkers) follows CommonMark, but a page can hide text it does not
 * track, and a code span can make an opener it does track into plain text. Two rules close that
 * gap by refusing, not by modelling it: any `<details` or `</details` (in a code span, a comment,
 * a code block or anywhere else); and any HTML comment opener that shares its line with a
 * backtick, or that leaves a comment open without starting its line (where only a block-level
 * comment, which nothing on the line can turn into text, may span lines). The markers themselves
 * are left out of the second rule. Linear in the text.
 */
function stampAmbiguity(lines: readonly string[]): ParsedProvenanceStamp['reason'] {
  let last = lines.length - 1;
  while (last >= 0 && !(lines[last] ?? '').includes(PROVENANCE_MARKER)) last--;
  for (const line of lines.slice(0, last + 1)) {
    const reason = lineAmbiguity(line);
    if (reason !== undefined) return reason;
  }
  return undefined;
}

/** One line's part in stampAmbiguity. */
function lineAmbiguity(line: string): ParsedProvenanceStamp['reason'] {
  if (DETAILS.test(line)) return 'details-element';
  const rest = line.replaceAll(PROVENANCE_MARKER, '');
  if (!rest.includes('<!--')) return undefined;
  const textual = rest.includes('`');
  const spans = scanComments(rest).leavesOpen && !BLOCK_COMMENT.test(rest);
  return textual || spans ? 'comment-opener' : undefined;
}

/** Why nothing was read from text that holds a marker, or the lines of its one visible stamp. */
type StampText =
  | { status: 'ambiguous'; reason: NonNullable<ParsedProvenanceStamp['reason']> }
  | { status: 'conflicting'; stamps: number }
  | { status: 'read'; lines: string[] };

/**
 * The lines of the one stamp a reader of the rendered page sees, or why none is read: ambiguous
 * text (stampAmbiguity), or more than one visible stamp. undefined: no stamp. HTML comments inside
 * the stamp are removed, each leaving a line break. A line indented four or more columns keeps
 * its indent, so it is never read as a table row or a note (the page shows a code block there);
 * any other line is trimmed.
 */
function stampText(body: string): StampText | undefined {
  const lines = body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd());
  if (!lines.some((l) => l.includes(PROVENANCE_MARKER))) return undefined;
  const reason = stampAmbiguity(lines);
  if (reason !== undefined) return { status: 'ambiguous', reason };
  const ranges = stampRanges(lines);
  if (ranges.length > 1) return { status: 'conflicting', stamps: ranges.length };
  const [range] = ranges;
  if (range === undefined) return undefined;
  const inside = lines
    .slice(range[0] + 2, range[1])
    .join('\n')
    .replace(HTML_COMMENT, '\n');
  return {
    status: 'read',
    lines: inside.split('\n').map((l) => (INDENTED.test(l) ? l : l.trim())),
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
 * characters is refused unread (`too-large`). Text whose part up to the last marker may hide
 * content the parser cannot place (stampAmbiguity) is refused unread (`ambiguous`). Otherwise only
 * what a reader of the rendered page sees as a stamp is read (stampText), and only when exactly
 * one is visible: two or more are `conflicting` and none of them is read. The stamp's first block
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
