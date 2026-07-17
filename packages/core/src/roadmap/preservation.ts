/**
 * Monolith write-preservation guard (#839).
 *
 * `serializeRoadmap` emits ONLY the fields `parseRoadmap` models, each on a single
 * line. A whole-file rewrite of a hand-authored single-file roadmap therefore silently
 * discards everything the parser does not capture: continuation lines of a
 * multi-line field body, `- **Key:**` bullets whose key is not modeled (e.g.
 * `- **Issue:**` links), `>` blockquote intros, HTML comments, and any other
 * prose. This module detects that unpreservable content so the monolith store can
 * refuse the destructive write instead of losing it.
 */

/**
 * Field keys the roadmap model round-trips. Source of truth is
 * `parseFeatureBlock` in `./parse` (which reads exactly these keys, including the
 * `Blocked by`/`Plans` input aliases the serializer canonicalizes to
 * `Blockers`/`Plan`). Kept in sync by `preservation.test.ts`, which asserts that
 * `findUnpreservedLines(serializeRoadmap(...))` is empty for representative
 * roadmaps — so a new serialized field fails that test until it is added here.
 */
const MODELED_FIELD_KEYS: ReadonlySet<string> = new Set([
  'Status',
  'Spec',
  'Summary',
  'Blockers',
  'Blocked by',
  'Plan',
  'Plans',
  'Assignee',
  'Priority',
  'External-ID',
  'Updated-At',
]);

/** A source line whose content a monolith rewrite would drop. */
export interface UnpreservedLine {
  /** 1-based line number in the original document. */
  line: number;
  /** The line's text (trailing whitespace trimmed). */
  text: string;
}

/**
 * Return the lines of `markdown` that a `serializeRoadmap` rewrite would silently
 * drop. A line is preservable iff it is frontmatter (regenerated from the model),
 * blank, an H1 title, an H2/H3 heading, an assignment-history table row, or a
 * single-line modeled `- **Key:** …` field. Everything else — multi-line field
 * continuations, unmodeled bullets, blockquotes, comments, arbitrary prose — is
 * reported. An empty result means the document round-trips without content loss.
 *
 * H1 / heading-prefix / frontmatter differences are treated as preservable: the
 * serializer canonicalizes the title to `# Roadmap` and strips `Milestone:`/
 * `Feature:` prefixes, and it rewrites frontmatter timestamps — all cosmetic,
 * single-line normalizations the reporter explicitly did not count as loss. The
 * guard fires only on the catastrophic body loss (#839): dropped prose, Issue
 * bullets, blockquote intros, and truncated multi-line summaries.
 *
 * Patterns are anchored at column 0 to mirror `parseRoadmap`'s own anchoring: an
 * indented `  ### x` or `  - **Status:** x` is NOT parsed as a heading/field and
 * so is (correctly) reported as unpreserved.
 */
export function findUnpreservedLines(markdown: string): UnpreservedLine[] {
  const lines = markdown.split('\n');
  const lost: UnpreservedLine[] = [];

  let inFrontmatter = false;
  let frontmatterDone = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const text = line.replace(/\s+$/, '');
    const trimmed = line.trim();

    // Frontmatter fence: the opening `---` on line 0 through the next `---`. Every
    // frontmatter line is regenerated from the model, so none can be "lost".
    if (!frontmatterDone) {
      if (i === 0 && trimmed === '---') {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (trimmed === '---') {
          inFrontmatter = false;
          frontmatterDone = true;
        }
        continue;
      }
      // No frontmatter fence at all: begin body classification immediately.
      frontmatterDone = true;
    }

    if (trimmed === '') continue; // blank lines carry no content
    if (/^# /.test(text)) continue; // H1 title (serializer canonicalizes it to `# Roadmap`)
    if (/^## /.test(text)) continue; // milestone / Backlog / Assignment History heading
    if (/^### /.test(text)) continue; // feature heading (`### x` or `### Feature: x`)
    if (/^\s*\|.*\|\s*$/.test(text)) continue; // assignment-history table row/header/separator

    // Single-line modeled field. The value is optional: the serializer emits
    // `- **Status:** …` etc. unconditionally, so the line survives whether or not
    // it carries a value. A modeled key with a MULTI-line body still surfaces its
    // continuation lines here — they fail every pattern above and are reported.
    const field = text.match(/^- \*\*(.+?):\*\*/);
    if (field && MODELED_FIELD_KEYS.has(field[1]!)) continue;

    lost.push({ line: i + 1, text });
  }

  return lost;
}
