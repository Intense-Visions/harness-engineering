/**
 * Extract GitHub issue references from arbitrary PR text (body + title).
 *
 * Backstop for the roadmap auto-done workflow: when a PR's malformed closing
 * keyword (e.g. `Closes roadmap #569`) leaves GitHub's `closingIssuesReferences`
 * empty, the workflow parses references from raw text instead. Matches `#123`,
 * `Closes/Fixes/Resolves #123`, and `owner/repo#123`; dedupes preserving
 * first-seen order; ignores bare numbers with no leading `#` (noise).
 */
export function parseReferencedIssues(text: string): number[] {
  if (!text) return [];
  // A `#` optionally preceded by `owner/repo`, then the digits. The `#` is
  // mandatory, so a bare number (e.g. "issue 123") never matches.
  const re = /(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#(\d+)/g;
  const seen = new Set<number>();
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const n = Number.parseInt(m[1]!, 10);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
