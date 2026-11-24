/**
 * Code point ranges a terminal acts on or hides rather than shows: C0 controls (an ANSI escape,
 * a carriage return that repaints a line), DEL and the C1 controls (a one-byte CSI), the soft
 * hyphen, the Arabic letter mark and the Mongolian vowel separator, zero-width characters and
 * directional marks, the line and paragraph separators and the bidi embeddings and overrides,
 * the word joiner, invisible operators and bidi isolates, and the byte order mark.
 */
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];

function isUnsafe(codePoint: number): boolean {
  return UNSAFE_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi);
}

/**
 * Agent-written text made safe to print: each unsafe character becomes `\u{XXXX}`, so a receipt
 * or findings file cannot repaint a FAIL line as PASS or hide part of a message. The one rule
 * for every string the receipt gate's text output prints.
 */
export function escapeTerminalText(text: string): string {
  let out = '';
  for (const c of text) {
    const cp = c.codePointAt(0) ?? 0;
    out += isUnsafe(cp) ? `\\u{${cp.toString(16).toUpperCase().padStart(4, '0')}}` : c;
  }
  return out;
}
