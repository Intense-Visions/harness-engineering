/**
 * Language-aware comment masking for the security scanner.
 *
 * Code-pattern rules (prototype pollution, weak hashes, unvalidated JSON.parse,
 * …) are line regexes. Run over raw source they also match PROSE: a comment
 * that names `__proto__` inside the very guard that defends against prototype
 * pollution, or a JSDoc that mentions `createHash('sha1')`, was reported as a
 * vulnerability. Masking blanks comment text so those rules only ever see code.
 *
 * Masking replaces each comment character with a space, so line count and
 * column positions are preserved. Only C-style-comment languages are masked
 * (see {@link supportsCommentMasking}); every other file is returned as-is.
 *
 * The lexer tracks single/double-quoted strings, template literals (including
 * nested `${ … }` interpolations), regex literals, and block comments that span
 * lines, so a `//` inside `'https://…'` or `/https?:\/\//` is never mistaken for
 * a comment opener. When it is unsure it errs toward treating text as CODE —
 * an unmasked comment only costs a false positive, while masked code would hide
 * a real finding.
 */

const C_STYLE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|go)$/i;

/** True when `filePath` is a language whose `//` and `/* *\/` are comments. */
export function supportsCommentMasking(filePath: string): boolean {
  return C_STYLE_EXTENSIONS.test(filePath);
}

type Context = 'code' | 'single' | 'double' | 'template' | 'regex' | 'block';

interface LexState {
  context: Context;
  /** Inside a regex `[...]` class, where `/` does not end the literal. */
  charClass: boolean;
  /** Code brace depth at each open template `${`, innermost last. */
  templateSpans: number[];
  depth: number;
}

const REGEX_PRECEDING_PUNCTUATION = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
]);
// A keyword only when it is not part of a longer identifier (`$in`) or a
// property access (`obj.in`) — both of those are operands, so `/` divides.
const REGEX_PRECEDING_KEYWORDS =
  /(?<![\w$.])(?:return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/;
const CONTROL_HEADER_KEYWORD = /(?<![\w$.])(?:if|while|for|with)\s*$/;

/**
 * True when `before` ends with the `)` that closes an `if (…)` / `while (…)` /
 * `for (…)` / `with (…)` header: a statement follows, so `/` opens a regex.
 * Any other `)` closes an operand and `/` divides.
 */
function closesControlHeader(before: string): boolean {
  let depth = 0;
  for (let k = before.length - 1; k >= 0; k--) {
    const ch = before[k];
    if (ch === ')') depth++;
    else if (ch === '(' && --depth === 0) {
      return CONTROL_HEADER_KEYWORD.test(before.slice(0, k));
    }
  }
  return false;
}

function startsRegexLiteral(line: string, index: number): boolean {
  const before = line.slice(0, index).trimEnd();
  if (before === '') return true;
  // Postfix `i++ / 2` / `i-- / 2`: the operand is complete, so `/` divides.
  if (before.endsWith('++') || before.endsWith('--')) return false;
  const last = before[before.length - 1] as string;
  if (last === ')') return closesControlHeader(before);
  if (REGEX_PRECEDING_PUNCTUATION.has(last)) return true;
  return REGEX_PRECEDING_KEYWORDS.test(before);
}

/** True when `line` ends with an odd run of backslashes (a line continuation). */
function endsWithLineContinuation(line: string): boolean {
  let run = 0;
  for (let k = line.length - 1; k >= 0 && line[k] === '\\'; k--) run++;
  return run % 2 === 1;
}

const QUOTE_CONTEXT: Record<string, Context | undefined> = {
  "'": 'single',
  '"': 'double',
  '`': 'template',
};
const QUOTE_CLOSER: Partial<Record<Context, string>> = {
  single: "'",
  double: '"',
  template: '`',
};

function blank(chars: string[], from: number, to: number): void {
  for (let k = from; k < to; k++) chars[k] = ' ';
}

/** Advance inside a string/template/regex. Returns the index of the last consumed char. */
function advanceLiteral(line: string, c: number, state: LexState): number {
  const ch = line[c];
  if (ch === '\\') return c + 1;
  if (state.context === 'regex') {
    if (ch === '[') state.charClass = true;
    else if (ch === ']') state.charClass = false;
    else if (ch === '/' && !state.charClass) state.context = 'code';
    return c;
  }
  if (ch === QUOTE_CLOSER[state.context]) {
    state.context = 'code';
    return c;
  }
  if (state.context === 'template' && ch === '$' && line[c + 1] === '{') {
    state.templateSpans.push(state.depth);
    state.depth++;
    state.context = 'code';
    return c + 1;
  }
  return c;
}

/**
 * Advance one code character. Returns the index of the last consumed char, or
 * -1 when the rest of the line is a `//` comment (already blanked).
 */
function advanceCode(line: string, c: number, state: LexState, chars: string[]): number {
  const ch = line[c] as string;
  const quote = QUOTE_CONTEXT[ch];
  if (quote) {
    state.context = quote;
    return c;
  }
  if (ch === '{') {
    state.depth++;
    return c;
  }
  if (ch === '}') {
    state.depth--;
    const span = state.templateSpans[state.templateSpans.length - 1];
    if (span !== undefined && state.depth === span) {
      state.templateSpans.pop();
      state.context = 'template';
    }
    return c;
  }
  if (ch !== '/') return c;
  const next = line[c + 1];
  if (next === '/') {
    blank(chars, c, line.length);
    return -1;
  }
  if (next === '*') {
    state.context = 'block';
    blank(chars, c, c + 2);
    return c + 1;
  }
  if (startsRegexLiteral(line, c)) {
    state.context = 'regex';
    state.charClass = false;
  }
  return c;
}

function maskLine(line: string, state: LexState): string {
  const chars = line.split('');
  for (let c = 0; c < line.length; c++) {
    if (state.context === 'block') {
      const close = line.indexOf('*/', c);
      if (close === -1) {
        blank(chars, c, line.length);
        break;
      }
      blank(chars, c, close + 2);
      state.context = 'code';
      c = close + 1;
      continue;
    }
    if (state.context !== 'code') {
      c = advanceLiteral(line, c, state);
      continue;
    }
    const consumed = advanceCode(line, c, state, chars);
    if (consumed === -1) break;
    c = consumed;
  }
  // Quoted strings and regex literals cannot span lines; reset so one
  // mis-lexed character can never leak its context into the next line. The one
  // exception is a quoted string whose line ends in a `\` continuation: it
  // genuinely continues, and resetting would lex its tail (`'…\` / `//…'`) as
  // code and blank the real code after it.
  const quoted = state.context === 'single' || state.context === 'double';
  if ((quoted && !endsWithLineContinuation(line)) || state.context === 'regex') {
    state.context = 'code';
  }
  return chars.join('');
}

/**
 * Return `lines` with every comment character replaced by a space. Lines and
 * columns are preserved one-for-one.
 */
export function maskComments(lines: readonly string[]): string[] {
  const state: LexState = { context: 'code', charClass: false, templateSpans: [], depth: 0 };
  return lines.map((line) => maskLine(line, state));
}
