import { describe, it, expect } from 'vitest';
import {
  escapeUnsafeText as escapeTerminalText,
  isUnsafeTextChar,
} from '../../src/shared/unsafe-text';
import { isUnsafeLogChar } from '../../src/autonomy/decision-schema';

/**
 * Partition of what the gate prints from receipts and findings files: empty, plain, letters
 * outside ASCII, and each class of character that can repaint or hide terminal output.
 */
describe('escapeTerminalText', () => {
  it.each([
    ['empty', '', ''],
    ['plain ASCII', 'reviewer "bug" lists no files', 'reviewer "bug" lists no files'],
    ['letters outside ASCII', 'src/\u00e9/\u65e5\u672c.ts', 'src/\u00e9/\u65e5\u672c.ts'],
    ['an emoji', 'ok \u{1F642}', 'ok \u{1F642}'],
    ['the character after a range (U+00A0)', '\u00a0', '\u00a0'],
    // Round 2: one rule with the auto-decision log, which allows ZWNJ and ZWJ (review N1).
    ['Persian ZWNJ', '\u0645\u06cc\u200c\u062e', '\u0645\u06cc\u200c\u062e'],
    ['an emoji ZWJ sequence', '\u{1F469}\u200d\u{1F4BB}', '\u{1F469}\u200d\u{1F4BB}'],
  ])('%s is unchanged', (_n, input, out) => {
    expect(escapeTerminalText(input)).toBe(out);
  });
  it.each([
    ['NUL', '\u0000', '\\u{0000}'],
    ['ESC (an ANSI sequence)', '\u001b[2K\rPASS', '\\u{001B}[2K\\u{000D}PASS'],
    ['line feed', 'a\nb', 'a\\u{000A}b'],
    ['tab', 'a\tb', 'a\\u{0009}b'],
    ['unit separator (last C0)', '\u001f', '\\u{001F}'],
    ['DEL', '\u007f', '\\u{007F}'],
    ['C1 CSI', '\u009b31m', '\\u{009B}31m'],
    ['right-to-left override', 'FAIL\u202eSSAP', 'FAIL\\u{202E}SSAP'],
    ['bidi isolate', '\u2066x\u2069', '\\u{2066}x\\u{2069}'],
    ['right-to-left mark', '\u200f', '\\u{200F}'],
    ['Arabic letter mark', '\u061c', '\\u{061C}'],
    ['Mongolian vowel separator', '\u180e', '\\u{180E}'],
    ['zero-width space', 'a\u200bb', 'a\\u{200B}b'],
    ['word joiner', '\u2060', '\\u{2060}'],
    ['byte order mark', '\ufeff', '\\u{FEFF}'],
    ['soft hyphen', '\u00ad', '\\u{00AD}'],
    ['line separator', '\u2028', '\\u{2028}'],
  ])('%s is escaped', (_n, input, out) => {
    expect(escapeTerminalText(input)).toBe(out);
  });
});

describe('the gate escapes at least what the auto-decision log rejects (review round 3)', () => {
  it('every code point the log rejects on one line the gate escapes; the log keeps its own rule', () => {
    for (let cp = 0; cp <= 0x30000; cp++) {
      if (isUnsafeLogChar(cp, false) && !isUnsafeTextChar(cp)) {
        throw new Error(`U+${cp.toString(16)} is rejected by the log but printed raw by the gate`);
      }
    }
    // The log's rule is main's: the soft hyphen and the word joiner are not in it.
    expect(isUnsafeLogChar(0x00ad, false)).toBe(false);
    expect(isUnsafeLogChar(0x2060, false)).toBe(false);
  });
});
