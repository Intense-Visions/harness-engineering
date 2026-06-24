import { buildCiReviewVerdict, type CiReviewVerdict } from '../verdict-schema';

/** The inner verdict antigravity emits as plain-text JSON on stdout. */
interface AntigravityInnerVerdict {
  assessment: 'approve' | 'comment' | 'request-changes';
  findings?: unknown[];
}

/**
 * Strip an optional ```json ... ``` (or bare ``` ... ```) markdown fence,
 * returning the inner text. Returns the input unchanged if no fence is present.
 */
function stripJsonFence(text: string): string {
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(text.trim());
  const inner = fence?.[1];
  return inner !== undefined ? inner.trim() : text;
}

/**
 * Extract the first balanced top-level JSON object from `text`, ignoring any
 * surrounding prose. Returns the substring spanning the object, or undefined if
 * no balanced `{...}` is found. Brace counting is brace-only (sufficient for the
 * model's verdict envelopes; strings containing unbalanced braces are not
 * expected in this single-object payload).
 */
function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}

/**
 * Map antigravity's `agy --print <instruction>` plain-text output into a
 * normalized CiReviewVerdict.
 *
 * SINGLE-STAGE (confirmed against the real CLI — `agy` is Gemini-family, renamed
 * from `gemini`, and authenticated locally where the old `gemini` CLI did not):
 * `agy` has NO `--output-format`/`--json` flag (it errors `flags provided but not
 * defined: -output-format`); `--print` runs a single non-interactive prompt and
 * emits the model's response as plain text. When instructed to emit only JSON it
 * returns the verdict object DIRECTLY (no transcript wrapper), e.g. the literal
 * stdout `{"assessment":"approve","findings":[]}` — unlike claude (`.result`
 * envelope) or codex (JSONL).
 *
 * Defensive: trims whitespace, strips an optional ```json ... ``` markdown fence,
 * and falls back to extracting the first balanced top-level JSON object if the
 * model wrapped the verdict in prose. Throws a typed error (matching the existing
 * parser error convention — no silent pass) if no parseable JSON object is found.
 */
export function parseAntigravityVerdict(raw: string): CiReviewVerdict {
  const unfenced = stripJsonFence(raw.trim());

  let inner: AntigravityInnerVerdict;
  try {
    inner = JSON.parse(unfenced) as AntigravityInnerVerdict;
  } catch {
    // The text wasn't a bare JSON object — try to recover an embedded one from
    // surrounding prose before giving up.
    const candidate = extractFirstJsonObject(unfenced);
    if (candidate === undefined) {
      throw new Error(
        'parseAntigravityVerdict: no parseable JSON object found in antigravity (`agy --print`) output'
      );
    }
    try {
      inner = JSON.parse(candidate) as AntigravityInnerVerdict;
    } catch {
      throw new Error(
        'parseAntigravityVerdict: extracted candidate from antigravity output was not valid JSON'
      );
    }
  }

  // findings are still UNVALIDATED here; buildCiReviewVerdict schema-validates
  // them FIRST and then derives blockingFindings/exitCode from validated data.
  return buildCiReviewVerdict({
    runner: 'antigravity',
    ranLlmTier: true,
    assessment: inner.assessment,
    findings: inner.findings,
  });
}
