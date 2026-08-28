// Pure, provider-agnostic helpers for recovering schema-conforming structured
// output from a chatty LLM/CLI reply. Kept separate from the provider class so
// each stays small and independently testable.

/**
 * Given `start` pointing at a `{`, return the index just past the matching `}`,
 * or -1 if unbalanced. String-literal + escape aware so braces inside strings do
 * not affect the depth count.
 */
function matchBalancedBrace(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (esc) {
      esc = false;
    } else if (ch === '\\') {
      esc = true;
    } else if (ch === '"') {
      inStr = !inStr;
    } else if (!inStr && ch === '{') {
      depth++;
    } else if (!inStr && ch === '}' && --depth === 0) {
      return j + 1;
    }
  }
  return -1;
}

/**
 * Mechanically salvage the first balanced JSON object embedded in prose. The
 * Claude CLI occasionally narrates (e.g. "I've already called the StructuredOutput
 * tool in my response above…") and leaves the schema-conforming object inside the
 * `result` string instead of the `structured_output` field. Rather than fail, scan
 * for the first `{ … }` that JSON-parses. Returns `undefined` when none is found.
 */
export function extractEmbeddedJson(text: string): unknown {
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    const end = matchBalancedBrace(text, i);
    if (end === -1) continue;
    try {
      return JSON.parse(text.slice(i, end));
    } catch {
      /* this `{` did not open a valid object — try the next candidate */
    }
  }
  return undefined;
}

/**
 * Extract the schema-conforming content from a Claude CLI JSON envelope, tolerant
 * of the CLI's shapes: prefer `structured_output`; else a `result` that is itself
 * JSON (object or JSON-encoded string); else salvage embedded JSON from a prose
 * `result`; else return the raw `result`/envelope so the CALLER's schema check
 * fails cleanly (and can fire a corrective retry) — this NEVER throws, so a chatty
 * reply degrades to a recoverable schema-mismatch instead of a hard parse error.
 */
export function coerceStructuredContent(envelope: Record<string, unknown>): unknown {
  if (envelope.structured_output !== undefined) return envelope.structured_output;
  const result = envelope.result;
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      /* not pure JSON — fall through to salvage */
    }
    const salvaged = extractEmbeddedJson(result);
    if (salvaged !== undefined) return salvaged;
    return result; // raw prose — the caller validates and retries
  }
  return result ?? envelope;
}

/**
 * Build the corrective retry prompt: show the model its own rejected output and
 * demand ONLY the JSON object. This is the "mechanical check → the model sees its
 * blunder → recovers" loop — fired once when the first reply fails schema validation.
 */
export function buildCorrectionPrompt(
  basePrompt: string,
  badOutput: string,
  schemaJson: string
): string {
  const trimmed = badOutput.length > 800 ? `${badOutput.slice(0, 800)}…` : badOutput;
  return (
    `${basePrompt}\n\n` +
    `---\nYOUR PREVIOUS REPLY WAS REJECTED: it was not a single JSON object matching the ` +
    `required schema. Do NOT narrate, do NOT say you already called a tool, and do NOT wrap ` +
    `the object in prose or code fences.\n\nYou returned:\n${trimmed}\n\n` +
    `Reply with ONLY the JSON object conforming to this schema, and nothing else:\n${schemaJson}`
  );
}
