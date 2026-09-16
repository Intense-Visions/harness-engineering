/**
 * Escape codec for the comma-separated list bullets `- **Blockers:** a, b` and
 * `- **Plan:** a, b`.
 *
 * The roadmap grammar joins a feature's `blockedBy` / `plans` array with `", "`
 * on write (`listOrDash`) and splits the re-read value back on `","` on read
 * (`parseListField`). With no escaping, a single list item that itself contains a
 * comma — e.g. a feature name authored via the MCP `manage_roadmap` write path,
 * `"Notification System, phase 2"` — split into TWO items on the next parse,
 * silently fabricating a blocker (or plan step) that never existed (#1757).
 *
 * The fix mirrors the sibling summary codec (#1756, `./summary-field`): encode the
 * separator into a reversible per-item escape on write, decode it back on read.
 * The line grammar is untouched — items are still emitted on one `- **Field:**`
 * bullet joined by `", "` — so the shard store, the comprehension shards, and the
 * monolith roadmap document all keep byte-stable round-trips through the shared
 * `serializeFeature` / `parseFeatureBlock` seam.
 *
 * Encoding order matters: the backslash is escaped FIRST so every backslash in the
 * output is the start of exactly one `\\` / `\,` pair, which makes
 * {@link decodeListField} an exact left-to-right inverse. A legacy item that happens
 * to contain a bare backslash (never an escape the old serializer emitted) decodes
 * unchanged because an unrecognized `\x` sequence is preserved verbatim.
 *
 * ## Both directions are identities, and the second one had to be earned (#2162)
 *
 * The original codec claimed "a plain item contains no backslash and no comma, so
 * both directions are identities on legacy content". That was true of the item →
 * text → item direction and FALSE of text → items → text, because legacy `Plan`
 * and `Blockers` values in the wild are not lists of tidy tokens: they hold prose
 * authored by humans and agents, and prose is full of commas.
 *
 * Splitting on every bare comma and rejoining with `", "` therefore INSERTED A
 * SPACE that was never in the file. Every thousands separator in a roadmap decayed
 * a little on each unrelated write — `1,166` → `1, 166` — and because a whole-file
 * round-trip happens on every `manage_roadmap` call, one `add` silently rewrote
 * rows nobody touched. One project found 25 such corruptions accumulated over weeks.
 *
 * The rule that fixes it is the grammar's own: `", "` is the only separator
 * {@link encodeListField} ever writes, so it is the only one
 * {@link decodeListField} should read, and the only one
 * {@link encodeListItem} needs to escape. A comma with no following whitespace is
 * content in both directions and is now left exactly as found.
 */

/**
 * Encode a single list item so its separators and backslashes survive the join/split.
 *
 * ONLY A COMMA FOLLOWED BY WHITESPACE IS ESCAPED, because only `", "` is ever
 * emitted as a separator (see {@link encodeListField}). A comma with no following
 * space — `1,166`, `Q4,FY26` — is ordinary content that {@link decodeListField}
 * will not split on, so escaping it would write a backslash into prose that never
 * needed one. See #2162.
 */
export function encodeListItem(item: string): string {
  return item.replace(/\\/g, '\\\\').replace(/,(?=\s)/g, '\\,');
}

/**
 * Serialize a list field to its bullet value: encode each item, join with `", "`.
 * Returns `undefined` for an empty list so the caller can emit the em-dash form.
 */
export function encodeListField(items: string[]): string | null {
  if (items.length === 0) return null;
  return items.map(encodeListItem).join(', ');
}

/**
 * Split an encoded list-field value back into its items, honoring `\,` escapes,
 * and decode each one. The scan is a strict left-to-right inverse of
 * {@link encodeListItem}: only a comma NOT part of a `\,` escape is a separator.
 * Items are trimmed to preserve the historical `", "` join spacing.
 */
export function decodeListField(raw: string): string[] {
  const items: string[] = [];
  let current = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === '\\') {
        current += '\\';
        i += 1;
        continue;
      }
      if (next === ',') {
        current += ',';
        i += 1;
        continue;
      }
      // Unrecognized escape (e.g. legacy content with a bare backslash): keep the
      // backslash literally so decode is a no-op on pre-codec roadmaps.
      current += ch;
      continue;
    }
    // A separator is a comma followed by whitespace, because `", "` is the only
    // separator the serializer emits. A bare `1,166` is content, not a boundary.
    if (ch === ',' && i + 1 < raw.length && /\s/.test(raw[i + 1]!)) {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  items.push(current.trim());
  return items;
}
