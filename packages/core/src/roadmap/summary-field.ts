/**
 * Escape codec for the free-text `- **Summary:** <value>` bullet.
 *
 * The roadmap grammar is line-oriented: `serializeFeature` emits every field on a
 * single `- **Field:** value` line and `extractFieldMap` reads each one back with a
 * per-line, non-dotAll regex (`/^- \*\*(.+?):\*\* (.+)$/gm`). A `summary` that
 * carries an embedded newline therefore split across two markdown lines on write
 * and had its continuation silently dropped on the next parse (#1756).
 *
 * Summary is the only free-text field a caller can put a newline into (status,
 * spec, priority, ids are constrained; blockers/plans are comma lists — the comma
 * grammar is a SEPARATE bug, #1757, deliberately out of scope here). So the fix is
 * scoped to this one field: encode embedded control characters into a reversible
 * single-line escape on write, decode them back on read. The line grammar itself
 * is untouched, so the shard store, the comprehension shards, and the monolith
 * roadmap document all keep byte-stable round-trips through the shared
 * `serializeFeature` / `parseFeatureBlock` seam.
 *
 * Encoding order matters: backslashes are escaped FIRST, so every `\\` / `\n` / `\r`
 * pair in the output is one the encoder wrote, which makes
 * {@link decodeSummaryField} an exact left-to-right inverse.
 *
 * ONLY A BACKSLASH THE DECODER WOULD MISREAD IS ESCAPED (#2166): one followed by a
 * backslash, `n`, `r`, or a raw newline / carriage return (which encode to `\n` /
 * `\r`). Every other backslash — the `\d` of a regex documented in prose — decodes
 * verbatim already, so leaving it alone makes encode(decode(text)) === text for
 * authored prose. The old encoder doubled every backslash, which rewrote prose on
 * the first unrelated write; a value it wrote (`\\d`) still decodes to `\d` and is
 * re-encoded in the un-doubled form.
 */
export function encodeSummaryField(value: string): string {
  return value
    .replace(/\\(?=[\\nr\n\r])/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

/** Exact inverse of {@link encodeSummaryField}. */
export function decodeSummaryField(value: string): string {
  return value.replace(/\\([\\rn])/g, (_, ch: string) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    return '\\';
  });
}
