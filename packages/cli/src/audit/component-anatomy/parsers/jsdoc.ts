/**
 * Minimal JSDoc tag reader for the anatomy resolvers.
 *
 * The audit only needs to read a handful of `@anatomy-*` / `@component-type`
 * tags from the *leading* documentation block of a component file — it does not
 * need a full JSDoc AST. This extracts that block and reads its tags with small,
 * dependency-free regexes (the tag grammar is one tag per line; see
 * docs/changes/design-pipeline/audit-component-anatomy/proposal.md → "JSDoc tag
 * grammar").
 */

/**
 * Return the text inside the first leading `/** ... *\/` block comment, with the
 * leading ` * ` decoration stripped from each line. Returns null when the file
 * does not open with a block comment (ignoring a shebang / `use client` banner
 * and surrounding whitespace).
 */
export function extractLeadingJsDoc(source: string): string | null {
  // Skip an optional shebang, a leading "use client"/"use server" directive,
  // and whitespace, then require a /** block comment.
  const re = /^\s*(?:#![^\n]*\n)?\s*(?:['"]use (?:client|server)['"];?\s*)?\s*\/\*\*([\s\S]*?)\*\//;
  const match = re.exec(source);
  if (!match) return null;
  return match[1]!
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, ''))
    .join('\n')
    .trim();
}

/**
 * Read every value of a JSDoc tag from a doc block, in document order. Each match
 * is the remainder of the tag's line, trimmed. e.g. for `@anatomy-slot content
 * required` the value is `content required`.
 */
export function readJsDocTag(jsdoc: string, tag: string): string[] {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`@${escaped}\\b[ \\t]*(.*)$`, 'gm');
  const values: string[] = [];
  for (const m of jsdoc.matchAll(re)) {
    values.push((m[1] ?? '').trim());
  }
  return values;
}

/**
 * Read a single-value tag (the first occurrence), or null when absent/empty.
 * Used for `@component-type <Type>`.
 */
export function readJsDocTagValue(jsdoc: string, tag: string): string | null {
  const [first] = readJsDocTag(jsdoc, tag);
  return first ? first : null;
}
