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
 * `roadmap.md` all keep byte-stable round-trips through the shared
 * `serializeFeature` / `parseFeatureBlock` seam.
 *
 * Encoding order matters: the backslash is escaped FIRST so every backslash in the
 * output is the start of exactly one `\\` / `\n` / `\r` pair, which makes
 * {@link decodeSummaryField} an exact left-to-right inverse. A plain single-line
 * summary contains none of these characters, so both directions are identities on
 * legacy content — existing roadmaps are unaffected.
 */
export function encodeSummaryField(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

/** Exact inverse of {@link encodeSummaryField}. */
export function decodeSummaryField(value: string): string {
  return value.replace(/\\([\\rn])/g, (_, ch: string) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    return '\\';
  });
}
