/**
 * Single source of truth for the roadmap H3 feature-heading grammar.
 *
 * The grammar — "an H3 heading, optionally escaped with a `Feature: ` prefix" —
 * used to be encoded three times (a reader in `./parse`, a second reader in
 * `./store/shard`, and the emitter in `./serialize`). They had to agree but
 * nothing kept them in sync, and one whitespace divergence already existed: the
 * monolith reader required exactly one space while the shard reader accepted
 * `\s+`, so a heading the shard path read fine failed through the monolith path
 * and could silently reclassify a tracked row. This module collapses all three
 * onto one grammar so a divergence is structurally impossible.
 *
 * Whitespace is settled deliberately here (issue #1261, human-confirmed):
 * **lenient read, one-space emit**. {@link parseFeatureHeading} and
 * {@link matchFeatureHeadings} ACCEPT `\s+` after `###` and after `Feature:`
 * (Postel's law — both readers keep accepting everything they accepted before),
 * while {@link serializeFeatureHeading} EMITS exactly one space. That makes
 * `serialize → parse` an identity for every feature name.
 *
 * This is a pure grammar helper: it knows nothing about the surrounding document
 * or its on-disk representation.
 */

/**
 * Heading-text prefix that marks an H3 as a narrative group rather than a
 * feature. Consumed by the monolith reader to classify a `### Group: <name>`
 * section, and by {@link serializeFeatureHeading} to decide when a feature name
 * must be escaped.
 */
export const GROUP_PREFIX = 'Group: ';

/**
 * Heading-text prefix that explicitly marks an H3 as a feature. It takes
 * precedence over {@link GROUP_PREFIX}, so `### Feature: Group: x` is a feature
 * named `Group: x`. Also the escape {@link serializeFeatureHeading} emits for any
 * name that begins with either prefix.
 */
export const FEATURE_PREFIX = 'Feature: ';

/**
 * The canonical, lenient H3 heading grammar, as a source fragment so the same
 * definition can be compiled with different flags (`m` for a single line, `gm`
 * to iterate a whole body). Group 1 captures the optional `Feature: ` escape
 * (its presence is the `explicitFeature` signal); group 2 captures the name.
 * `\s+` — not a literal single space — is the lenient read.
 */
const HEADING_SOURCE = String.raw`^###\s+(Feature:\s+)?(.+)$`;

/** A parsed H3 heading: the raw name text and whether it carried the escape. */
export interface ParsedFeatureHeading {
  /** The heading text after the `### ` (and after any `Feature: ` escape). Not trimmed. */
  name: string;
  /** True when the heading carried an explicit `Feature: ` escape prefix. */
  explicitFeature: boolean;
}

/** A {@link ParsedFeatureHeading} plus its position within the searched body. */
export interface FeatureHeadingMatch extends ParsedFeatureHeading {
  /** Offset of the heading within the body passed to {@link matchFeatureHeadings}. */
  startIndex: number;
  /** The full matched heading line, for slicing the body that follows it. */
  fullMatch: string;
}

/**
 * Parse a single line as an H3 feature heading, or return `null` if it is not
 * one. The `name` is returned verbatim (untrimmed) so callers can decide their
 * own trimming policy.
 */
export function parseFeatureHeading(line: string): ParsedFeatureHeading | null {
  const match = new RegExp(HEADING_SOURCE, 'm').exec(line);
  if (!match) return null;
  return { name: match[2]!, explicitFeature: match[1] !== undefined };
}

/**
 * Find every H3 feature heading in `body`, in document order, with the position
 * and full text of each so the caller can slice out the section a heading owns.
 */
export function matchFeatureHeadings(body: string): FeatureHeadingMatch[] {
  const pattern = new RegExp(HEADING_SOURCE, 'gm');
  const matches: FeatureHeadingMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    matches.push({
      name: match[2]!,
      explicitFeature: match[1] !== undefined,
      startIndex: match.index,
      fullMatch: match[0],
    });
  }
  return matches;
}

/**
 * Emit a feature's H3 heading. Normally the bare `### <name>` form, but a name
 * that begins with either marker prefix MUST be escaped with an explicit
 * `### Feature: ` prefix, because the two readers of an H3 heading would
 * otherwise disagree:
 *
 *  - `Feature: x` — BOTH readers strip a leading `Feature: `, so in either format
 *    the row would be read back as plain `x`: silently renamed, and in the shard
 *    format re-slugged with it.
 *  - `Group: x` — the monolith reader treats this as a narrative group (silently
 *    dropping the tracked row). The shard reader has no `Group:` handling and
 *    would round-trip it unescaped; escaping anyway lets one emitter serve both
 *    formats so the shard reader needs no knowledge of the group marker.
 *
 * Exactly one space is emitted after `###` and after the `Feature:` escape, which
 * is what makes `serialize → parse` an identity for every feature name.
 */
export function serializeFeatureHeading(name: string): string {
  return name.startsWith(GROUP_PREFIX) || name.startsWith(FEATURE_PREFIX)
    ? `### ${FEATURE_PREFIX}${name}`
    : `### ${name}`;
}
