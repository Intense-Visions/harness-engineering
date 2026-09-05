/**
 * DRIFT-T* — Token bypass detection.
 *
 * Scans source files for hardcoded values where a design token should be
 * used. Pattern detection is regex-based (mirrors legacy DESIGN-001/002
 * approach in DesignConstraintAdapter; v1 doesn't need richer parsing
 * for these checks).
 *
 * Codes:
 *   DRIFT-T001 — hex color outside palette
 *   DRIFT-T002 — font-family outside declared palette
 *   DRIFT-T003 — pixel margin/padding outside declared spacing scale
 *   DRIFT-T004 — reference to a deprecated token (e.g. CSS var or token-name string)
 *
 * Inputs:
 *   - TokenSet from resolvers/tokens.ts (returns null when tokens.json absent)
 *
 * Behavior when tokens.json absent: all 4 rules skip silently (no findings).
 * This is intentional — projects without a token system have nothing to bypass.
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Code namespace → DRIFT-T*).
 */

import type { DriftFinding, DriftStrictness } from '../findings/finding.js';
import { severityFor } from '../findings/finding.js';
import type { TokenSet } from '../resolvers/tokens.js';

// #1824: only CSS-valid hex lengths (3, 4, 6, 8). `{3,8}` also admitted 5 and 7,
// which can never be a colour. Longest alternative first so `#aabbccdd` matches as 8.
const HEX_PATTERN = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
const FONT_FAMILY_PATTERN = /(?:fontFamily|font-family)\s*[:=]\s*['"`]([^'"`,]+)['"`]/g;
const PX_VALUE_PATTERN =
  /\b(?:margin(?:Top|Right|Bottom|Left)?|padding(?:Top|Right|Bottom|Left)?|gap|top|right|bottom|left)\s*[:=]\s*['"`]?(\d+(?:\.\d+)?)px\b/g;

export interface TokenBypassRuleInput {
  source: string;
  file: string;
  tokens: TokenSet;
  strictness: DriftStrictness;
}

export function runTokenBypassRule(input: TokenBypassRuleInput): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const { source, file, tokens, strictness } = input;

  // #750: matches inside comments (and prose inside string literals) are not
  // style declarations. Classify every offset once so detectors can skip
  // comment-context matches and reject non-color hex refs in string prose.
  const ctx = classifyContext(source);

  findings.push(...detectHexBypass(source, ctx, file, tokens, strictness));
  findings.push(...detectFontFamilyBypass(source, file, tokens, strictness));
  findings.push(...detectPxSpacingBypass(source, ctx, file, tokens, strictness));
  findings.push(...detectDeprecatedTokenUsage(source, file, tokens, strictness));

  return findings;
}

function detectHexBypass(
  source: string,
  ctx: Uint8Array,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const seenAtLine = new Set<string>();
  let match: RegExpExecArray | null;
  HEX_PATTERN.lastIndex = 0;
  while ((match = HEX_PATTERN.exec(source)) !== null) {
    const hex = match[0]!;
    if (!isHexColorContext(source, ctx, match.index, hex)) continue;
    const lc = hex.toLowerCase();
    const line = lineOf(source, match.index);
    const key = `${line}:${lc}`;
    if (seenAtLine.has(key)) continue;
    seenAtLine.add(key);
    const inPalette = tokens.colors.has(lc);
    // Flag in BOTH cases:
    //   1. hex IS in palette but used as raw literal — align's T001 codemod
    //      converts these to token references (common drift case).
    //   2. hex is NOT in palette — out-of-system color (suggestion only).
    findings.push({
      code: 'DRIFT-T001',
      severity: severityFor('DRIFT-T001', strictness),
      file,
      line,
      message: inPalette
        ? `Hex color "${hex}" should use a token reference instead of a raw literal`
        : `Hardcoded color "${hex}" is not in the design token palette`,
      evidence: { snippet: extractLine(source, match.index) },
      rule: { id: 'DRIFT-T001', category: 'token-bypass' },
      fix: {
        kind: 'codemod-todo',
        description: inPalette
          ? `Replace "${hex}" with the matching token reference (align-design-system can codemod this).`
          : `Replace "${hex}" with a token reference. If the color is intentionally one-off, add it to tokens.json first.`,
      },
    });
  }
  return findings;
}

function detectFontFamilyBypass(
  source: string,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  FONT_FAMILY_PATTERN.lastIndex = 0;
  while ((match = FONT_FAMILY_PATTERN.exec(source)) !== null) {
    const family = match[1]!.trim();
    const lc = family.toLowerCase();
    // Common system fallbacks are always allowed
    if (['inherit', 'sans-serif', 'serif', 'monospace', 'system-ui'].includes(lc)) continue;
    if (seen.has(lc)) continue;
    seen.add(lc);
    const line = lineOf(source, match.index);
    const inPalette = tokens.fontFamilies.has(lc);
    // Flag in BOTH cases (mirrors T001):
    //   1. family IS in palette but used as raw literal — align can codemod
    //   2. family NOT in palette — out-of-system typography (suggestion)
    findings.push({
      code: 'DRIFT-T002',
      severity: severityFor('DRIFT-T002', strictness),
      file,
      line,
      message: inPalette
        ? `Font-family "${family}" should use a typography token reference instead of a raw literal`
        : `Font-family "${family}" is not in the typography token palette`,
      evidence: { snippet: extractLine(source, match.index) },
      rule: { id: 'DRIFT-T002', category: 'token-bypass' },
      fix: {
        kind: 'codemod-todo',
        description: inPalette
          ? `Replace "${family}" with the matching typography token (align-design-system can codemod this).`
          : `Replace "${family}" with a typography token or add it to tokens.json if it's an intentional addition.`,
      },
    });
  }
  return findings;
}

function detectPxSpacingBypass(
  source: string,
  ctx: Uint8Array,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  // Skip if no spacing tokens — the project might use a free-form scale
  if (tokens.spacingPx.size === 0) return findings;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  PX_VALUE_PATTERN.lastIndex = 0;
  while ((match = PX_VALUE_PATTERN.exec(source)) !== null) {
    // #750: spacing prose in comments is not a declaration.
    if (ctx[match.index] === CTX_COMMENT) continue;
    const value = parseFloat(match[1]!);
    const line = lineOf(source, match.index);
    const key = `${line}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inPalette = tokens.spacingPx.has(value);
    // Flag in BOTH cases (mirrors T001):
    //   1. value IS in spacing scale but used as raw literal — align can codemod
    //   2. value NOT in scale — off-scale spacing (suggestion)
    findings.push({
      code: 'DRIFT-T003',
      severity: severityFor('DRIFT-T003', strictness),
      file,
      line,
      message: inPalette
        ? `Spacing value ${value}px should use a spacing token reference instead of a raw literal`
        : `Spacing value ${value}px is not in the spacing scale (${[...tokens.spacingPx].sort((a, b) => a - b).join('px, ')}px)`,
      evidence: { snippet: extractLine(source, match.index) },
      rule: { id: 'DRIFT-T003', category: 'token-bypass' },
      fix: {
        kind: 'codemod-todo',
        description: inPalette
          ? `Replace ${value}px with the matching spacing token (align-design-system can codemod this).`
          : `Round ${value}px to the nearest spacing-scale value, or add it to tokens.json if intentional.`,
      },
    });
  }
  return findings;
}

function detectDeprecatedTokenUsage(
  source: string,
  file: string,
  tokens: TokenSet,
  strictness: DriftStrictness
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  if (tokens.deprecatedTokens.size === 0) return findings;
  for (const tokenPath of tokens.deprecatedTokens) {
    // Look for the token path used as a string literal (token references like
    // 'color.brand.500' or var(--color-brand-500) — match both literal path
    // form and css-var-kebab form)
    const patterns = [
      new RegExp(`['"\`]${escapeRegex(tokenPath)}['"\`]`, 'g'),
      new RegExp(`--${escapeRegex(tokenPath.replace(/\./g, '-'))}\\b`, 'g'),
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const line = lineOf(source, match.index);
        findings.push({
          code: 'DRIFT-T004',
          severity: severityFor('DRIFT-T004', strictness),
          file,
          line,
          message: `Token "${tokenPath}" is deprecated and should be migrated`,
          evidence: { snippet: extractLine(source, match.index) },
          rule: { id: 'DRIFT-T004', category: 'token-bypass' },
          fix: {
            kind: 'codemod-todo',
            description: `Migrate references to "${tokenPath}" to the replacement token noted in tokens.json $description, or remove the deprecation if the token is still load-bearing.`,
          },
        });
      }
    }
  }
  return findings;
}

// ─── lexical context (#750) ─────────────────────────────
//
// Classify every source offset as CODE, STRING, or COMMENT with a single
// left-to-right scan. This lets the token-bypass detectors ignore hex/px
// matches that live inside comments (never style declarations) and reject
// hex references embedded in string-literal prose (issue refs like "(#332)")
// while preserving genuine color literals like "#e63535" / bare CSS values.

const CTX_CODE = 0;
const CTX_STRING = 1;
const CTX_COMMENT = 2;

/** Mutable cursor threaded through the {@link classifyContext} scan. */
interface Scanner {
  readonly source: string;
  readonly ctx: Uint8Array;
  i: number;
  state: number;
  /** Active string quote char, or `'*'`/`'/'` for block/line comment. */
  delim: string;
}

/**
 * Returns a byte-per-char classification of `source`. Handles `//` line
 * comments, `/* *\/` block comments (multi-line), and single/double/backtick
 * string literals with backslash escapes. A comment opener inside a string is
 * inert, and a quote inside a comment does not open a string.
 *
 * Note: this is a lightweight lexer, not a full JS/CSS parser. Template-literal
 * `${...}` interpolations are treated as string content, which is acceptable
 * here — the detectors only key off comment vs non-comment. Whether a match is
 * a colour is decided separately by {@link hexValuePosition} (#1824).
 */
function classifyContext(source: string): Uint8Array {
  const scan: Scanner = {
    source,
    ctx: new Uint8Array(source.length),
    i: 0,
    state: CTX_CODE,
    delim: '',
  };
  while (scan.i < source.length) {
    if (scan.state === CTX_COMMENT) stepComment(scan);
    else if (scan.state === CTX_STRING) stepString(scan);
    else stepCode(scan);
    scan.i++;
  }
  return scan.ctx;
}

/** Advance one char while inside a comment; may close it. */
function stepComment(s: Scanner): void {
  const ch = s.source[s.i]!;
  s.ctx[s.i] = CTX_COMMENT;
  if (s.delim === '*' && ch === '*' && s.source[s.i + 1] === '/') {
    s.ctx[s.i + 1] = CTX_COMMENT;
    s.i++;
    s.state = CTX_CODE;
    s.delim = '';
  } else if (s.delim === '/' && ch === '\n') {
    // line comment ends at newline (the newline itself is code)
    s.ctx[s.i] = CTX_CODE;
    s.state = CTX_CODE;
    s.delim = '';
  }
}

/** Advance one char while inside a string literal; may close it. */
function stepString(s: Scanner): void {
  const ch = s.source[s.i]!;
  s.ctx[s.i] = CTX_STRING;
  if (ch === '\\') {
    // escape: consume the next char as part of the string
    if (s.i + 1 < s.source.length) s.ctx[++s.i] = CTX_STRING;
  } else if (ch === s.delim) {
    s.state = CTX_CODE;
    s.delim = '';
  }
}

/** Advance one char in code context; may open a comment or string. */
function stepCode(s: Scanner): void {
  const ch = s.source[s.i]!;
  const opener = commentOpener(ch, s.source[s.i + 1]);
  if (opener) {
    s.state = CTX_COMMENT;
    s.delim = opener;
    s.ctx[s.i] = CTX_COMMENT;
  } else if (ch === '"' || ch === "'" || ch === '`') {
    s.state = CTX_STRING;
    s.delim = ch;
    s.ctx[s.i] = CTX_STRING;
  } else {
    s.ctx[s.i] = CTX_CODE;
  }
}

/** Returns the comment delimiter (`'/'` line, `'*'` block) or `''`. */
function commentOpener(ch: string, next: string | undefined): string {
  if (ch !== '/') return '';
  if (next === '/') return '/';
  if (next === '*') return '*';
  return '';
}

// ─── colour value position (#1824) ──────────────────────
//
// An issue reference is hex-shaped — `0-9` are all valid hex digits — so `#1824`
// and `#493` were reported as hardcoded colours (143 of 413 findings, 35%, on one
// project's first adoption). The #750 pass only rejected comments and the
// parenthesized `(#NNN)` idiom, so a reference in ordinary string prose survived.
//
// Two gates now run together, mirroring the anchored shape that already keeps
// DRIFT-T002/T003 quiet (both require a declaring property before the value):
//
//   (c) The match must sit in a VALUE position — after a declaration separator, as
//       the content of a string literal, or inside a colour function's argument
//       list — with only CSS value tokens between the separator and the `#`.
//   (b) An all-decimal match (`#1824`, `#493`) is rejected unless that value
//       position carries a colour: a colour-bearing property or variable name, or
//       a colour function. This keeps genuine greys like `background: '#666'`.

/** No legal colour position. */
const POS_NONE = 0;
/** A value position, but nothing says the value is a colour. */
const POS_VALUE = 1;
/** A value position with a colour-bearing carrier (property, variable, function). */
const POS_COLOR = 2;

/** Chars that may appear inside a CSS value run between a separator and the hex. */
const VALUE_RUN_CHAR = /[\w.%+\-/,# \t]/;

/** A single token that may legally precede a colour inside one value. */
const CSS_VALUE_TOKEN =
  /^(?:-?\d+(?:\.\d+)?(?:px|rem|em|ex|ch|%|vh|vw|vmin|vmax|pt|pc|cm|mm|in|deg|rad|turn|s|ms|fr)?|--[\w-]+|#[0-9a-fA-F]{3,8}|solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden|thin|medium|thick|inherit|initial|unset|revert|transparent|currentcolor|to|from|at|in|top|bottom|left|right|center|circle|ellipse|farthest-side|farthest-corner|closest-side|closest-corner)$/i;

/** Functions whose arguments are colours. */
const COLOR_FUNCTION_CALL =
  /(?:^|[^\w-])(?:var|rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|drop-shadow|linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\s*\($/i;

/** Property / variable names whose value is a colour. */
const COLOR_CARRIER_NAME =
  /colou?r|background|\bbg\b|border|outline|fill|stroke|shadow|gradient|palette|swatch|theme|brand|accent|primary|secondary|tertiary|surface|foreground|\bfg\b|backdrop|overlay|highlight|placeholder|caret|selection|divider|scrollbar|ink|tint|shade|hue|grey|gray|white|black|danger|warning|success|error|info|muted|dark|light/i;

/** Trailing identifier immediately left of a declaration separator. */
const TRAILING_NAME = /([\w$@-]+)\s*["'`]?\s*$/;

/**
 * Classify the position a hex match at `offset` occupies: not a value at all,
 * a plain value, or a value a colour carrier vouches for (#1824).
 */
function hexValuePosition(source: string, offset: number): number {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
  const sepIndex = scanBackToSeparator(source, lineStart, offset);
  if (sepIndex < lineStart) return POS_NONE; // nothing on this line anchors the match
  if (!isCssValueRun(source.slice(sepIndex + 1, offset))) return POS_NONE;
  const separator = source[sepIndex]!;
  if (separator === '(') {
    return COLOR_FUNCTION_CALL.test(source.slice(lineStart, sepIndex + 1)) ? POS_COLOR : POS_NONE;
  }
  if (isQuote(separator)) return stringLiteralPosition(source, lineStart, sepIndex);
  return declarationPosition(source, lineStart, sepIndex, separator);
}

/** Index of the nearest separator left of `offset`, or `lineStart - 1` when there is none. */
function scanBackToSeparator(source: string, lineStart: number, offset: number): number {
  let i = offset - 1;
  while (i >= lineStart && VALUE_RUN_CHAR.test(source[i]!)) i--;
  return i;
}

function isQuote(ch: string): boolean {
  return ch === '"' || ch === "'" || ch === '`';
}

/**
 * The hex leads the content of a string literal, which is itself a value. Step out
 * of the quote to see whether a declaration on the left names that value a colour.
 */
function stringLiteralPosition(source: string, lineStart: number, quoteIndex: number): number {
  let i = quoteIndex - 1;
  while (i >= lineStart && /\s/.test(source[i]!)) i--;
  if (i < lineStart) return POS_VALUE;
  return Math.max(POS_VALUE, declarationPosition(source, lineStart, i, source[i]!));
}

/** Value position reached through `name:` / `name=`; POS_COLOR when the name carries colour. */
function declarationPosition(
  source: string,
  lineStart: number,
  separatorIndex: number,
  separator: string
): number {
  if (separator !== ':' && separator !== '=') return POS_NONE;
  const name = TRAILING_NAME.exec(source.slice(lineStart, separatorIndex))?.[1];
  if (!name) return POS_VALUE;
  return COLOR_CARRIER_NAME.test(name) ? POS_COLOR : POS_VALUE;
}

/** True when every token between the separator and the hex is a CSS value token. */
function isCssValueRun(run: string): boolean {
  const trimmed = run.trim();
  if (trimmed === '') return true;
  return trimmed.split(/\s+/).every((token) => CSS_VALUE_TOKEN.test(token.replace(/,+$/, '')));
}

/** True when the hex digits are all decimal — the issue-reference shape (#1824). */
function isAllDecimal(hex: string): boolean {
  return !/[a-fA-F]/.test(hex);
}

/**
 * Decide whether a hex match at `offset` is a genuine color literal worth
 * flagging (#750, #1824).
 *
 * - COMMENT context → always rejected (comments are never style declarations;
 *   covers issue refs `(#529)` in JSDoc and hex prose `e.g. \`#e63535\``).
 * - Outside a value position → rejected (#1824). Prose such as
 *   `'see #1824 for the triage'`, a test title `(#332 Tier-3)`, or bare JSX text
 *   is never where a declaration value can appear. This generalizes — and
 *   replaces — the narrower `(#NNN)`-only rejection from #750.
 * - All-decimal in a value position with no colour carrier → rejected (#1824).
 *   `const ISSUE = '#1824'` is a reference; `background: '#666'` is a colour,
 *   and the carrier is what tells them apart.
 */
function isHexColorContext(source: string, ctx: Uint8Array, offset: number, hex: string): boolean {
  if (ctx[offset] === CTX_COMMENT) return false;
  const position = hexValuePosition(source, offset);
  if (position === POS_NONE) return false;
  return position === POS_COLOR || !isAllDecimal(hex);
}

// ─── helpers ───────────────────────────────────────────

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractLine(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', offset) + 1;
  const endIdx = source.indexOf('\n', offset);
  const end = endIdx === -1 ? source.length : endIdx;
  return source.slice(start, end).trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
