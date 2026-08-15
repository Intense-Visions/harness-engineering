// packages/cli/src/shared/craft/fenced-json.ts
//
// Shared fenced-JSON payload extractor for the craft families' CRITIQUE
// phases. Every craft family (code / docs / spec / copy / naming / test /
// security / api / cli-ergonomics / knowledge) asks an LLM for a fenced JSON
// finding and then extracts the JSON body before `JSON.parse`.
//
// The previous per-family extractor used a LAZY fence regex
// (/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/). When a finding's `message` value
// itself contained a ``` fence (e.g. the model quotes a code block in its
// critique), the lazy match truncated at that INNER fence, producing an
// unterminated JSON body → `JSON.parse` threw → the finding was SILENTLY
// DROPPED (see issue #1369).
//
// A naive greedy fix (match to the LAST closing fence) is wrong the other
// way: given TWO separate fenced blocks it would merge everything between the
// first opener and the last closer into one invalid blob, losing both.
//
// This extractor is nesting-aware. It anchors on the opening fence when
// present, then performs a string-and-escape-aware, brace-balanced scan to
// return the FIRST complete JSON value. Because inner ``` fences live inside a
// JSON string (`"..."`), they never affect brace balance, so the full object
// is recovered; and because the scan stops at the first balanced value, two
// separate blocks are never merged.

/**
 * Extract the JSON payload string from a raw LLM response that MAY wrap it in
 * a ```json fence.
 *
 * Behaviour:
 * - Fenced JSON whose `message` contains an inner ``` fence → full object
 *   recovered (no truncation at the inner fence).
 * - Two separate fenced JSON blocks → only the FIRST complete value is
 *   returned; the blocks are never merged.
 * - Plain single fence (`` ```json\n{...}\n``` ``) → the `{...}` body.
 * - Bare (unfenced) JSON → returned as-is.
 * - Non-object literals such as the bare `null` sentinel → the trimmed
 *   literal (callers compare against `'null'`).
 *
 * Always returns a string (the caller owns `JSON.parse` + try/catch), matching
 * the pre-existing per-family contract of "return the body, let the caller
 * parse".
 */
export function extractFencedJsonPayload(raw: string): string {
  // Anchor at the opening fence when present so leading prose can't derail the
  // scan; otherwise scan from the top so bare JSON still parses.
  const opener = /```(?:json)?[ \t]*\r?\n?/.exec(raw);
  const searchFrom = opener !== null ? opener.index + opener[0].length : 0;
  const region = raw.slice(searchFrom);

  const balanced = firstBalancedJson(region);
  if (balanced !== null) return balanced;

  // No brace/bracket structure in the fenced region (e.g. the literal `null`).
  // Strip a trailing closing fence if present and return the trimmed remainder.
  const closer = region.indexOf('```');
  const tail = closer === -1 ? region : region.slice(0, closer);
  return tail.trim();
}

/**
 * Scan `s` for the first complete, brace-balanced JSON value (object or
 * array), tracking string and escape state so that braces/backticks inside
 * string literals are ignored. Returns the exact substring of that value, or
 * `null` when no balanced value is found (unterminated or none present).
 */
function firstBalancedJson(s: string): string | null {
  const start = s.search(/[{[]/);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }

  return null;
}
