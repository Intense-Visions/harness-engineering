import type { JudgedAgainst } from './types.js';

/**
 * Result of resolving the judgment section from a spec's markdown.
 * `body` is the matched section's content (heading excluded, blank-trimmed).
 */
export interface ResolvedSection {
  judgedAgainst: JudgedAgainst;
  body: string;
}

/**
 * Fallback chain, highest priority first. Each entry pairs the JudgedAgainst
 * tag with a predicate over the NORMALIZED heading text (lowercased, trimmed,
 * hyphens collapsed to spaces) so matching is case- and hyphen-insensitive.
 */
const CHAIN: ReadonlyArray<{ tag: JudgedAgainst; matches: (normalized: string) => boolean }> = [
  { tag: 'success-criteria', matches: (h) => h === 'success criteria' },
  { tag: 'user-visible-behavior', matches: (h) => h === 'user visible behavior' },
  { tag: 'overview', matches: (h) => h === 'overview' },
];

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

// Opening or closing of a fenced code block (``` or ~~~), allowing leading
// whitespace. Headings inside a fence are code, not document structure.
const FENCE_RE = /^\s*(```|~~~)/;

const normalizeHeading = (text: string): string =>
  text.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Resolve the judgment input from a spec's markdown via the fallback chain
 * Success Criteria -> User-Visible Behavior -> Overview, returning the matched
 * section body plus which heading matched.
 *
 * Returns `null` when no judgable section exists. The caller (a later phase)
 * maps that null to an INCONCLUSIVE verdict — this resolver never throws and
 * never decides verdict authority.
 *
 * Self-contained string parsing: imports only the JudgedAgainst type, honoring
 * the intelligence layer rule (no `core` dependency).
 */
export function resolveSection(markdown: string): ResolvedSection | null {
  const lines = markdown.split(/\r?\n/);

  // Index every heading once: { lineIndex, level, tag|null }. Headings inside
  // fenced code blocks (``` / ~~~) are skipped — they are example content, not
  // document structure. `inFence` toggles on each fence delimiter line.
  const headings: Array<{ index: number; level: number; tag: JudgedAgainst | null }> = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = HEADING_RE.exec(line);
    // Both capture groups are guaranteed present when exec returns non-null;
    // the explicit guard satisfies noUncheckedIndexedAccess.
    if (!m || m[1] === undefined || m[2] === undefined) return;
    const level = m[1].length;
    const normalized = normalizeHeading(m[2]);
    const entry = CHAIN.find((c) => c.matches(normalized));
    headings.push({ index, level, tag: entry ? entry.tag : null });
  });

  for (const { tag } of CHAIN) {
    const start = headings.find((h) => h.tag === tag);
    if (!start) continue;

    // Body runs from the line after the heading to the next heading of the
    // same-or-shallower level (deeper sub-headings stay inside the body).
    const next = headings.find((h) => h.index > start.index && h.level <= start.level);
    const endExclusive = next ? next.index : lines.length;
    const body = lines
      .slice(start.index + 1, endExclusive)
      .join('\n')
      .trim();
    return { judgedAgainst: tag, body };
  }

  return null;
}
