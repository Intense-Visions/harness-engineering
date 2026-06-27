import { isDeepStrictEqual } from 'node:util';
import type { Roadmap, Result } from '@harness-engineering/types';
import { Ok, Err } from '@harness-engineering/types';
import { slugifyFeatureName } from './monolith-store';
import { assembleRoadmap } from './assembler';
import { serializeRoadmap } from '../serialize';
import { parseRoadmap } from '../parse';
import type { Shard, RoadmapMeta } from './roadmap-store';

/**
 * Decompose a `Roadmap` into per-row shards + roadmap-level `_meta`.
 *
 * Slugs come from `slugifyFeatureName` and are disambiguated deterministically
 * in parsed document order: a colliding base gets `-2`, `-3`, … suffixes, and a
 * name with no alphanumerics (empty slug) falls back to `row-<n>` where `n` is
 * the feature's 1-based position in iteration order. This guarantees every shard
 * filename (`<slug>.md`) is unique and equals its frontmatter `slug`, so
 * `readShardDir`'s duplicate-slug and filename-mismatch guards never trip.
 *
 * `order` is the feature's index WITHIN its milestone (0,1,2,…). Because the
 * assembler sorts by `order` ascending first and these orders are unique per
 * milestone, the round-trip reproduces document order exactly (status/slug
 * tiebreakers never engage). Frontmatter, milestone order, and assignment
 * history are copied verbatim — no timestamps are bumped — so a strict semantic
 * round-trip holds.
 */
export function roadmapToShards(roadmap: Roadmap): { shards: Shard[]; meta: RoadmapMeta } {
  const shards: Shard[] = [];
  const used = new Set<string>();
  let rowCounter = 0;
  for (const milestone of roadmap.milestones) {
    milestone.features.forEach((feature, index) => {
      rowCounter += 1;
      const base = slugifyFeatureName(feature.name) || `row-${rowCounter}`;
      let slug = base;
      let n = 2;
      while (used.has(slug)) slug = `${base}-${n++}`;
      used.add(slug);
      shards.push({ slug, milestone: milestone.name, order: index, feature });
    });
  }
  const meta: RoadmapMeta = {
    frontmatter: roadmap.frontmatter,
    milestones: roadmap.milestones.map((m) => m.name),
    assignmentHistory: roadmap.assignmentHistory ?? [],
  };
  return { shards, meta };
}

/**
 * The load-bearing safety check for the `shard` migration: assert that the
 * shards+meta faithfully reproduce the original roadmap before any destructive
 * write. Compares CANONICAL parsed forms — `parse(serialize(original))` vs
 * `parse(serialize(assemble(shards, meta)))` — via `node:util.isDeepStrictEqual`
 * to honor the spec's "deep-equals". Canonicalizing the original neutralizes the
 * serializer's documented prose/comment lossiness, so the comparison reflects
 * exactly what the shard store can represent. Returns `Err` (never throws) so
 * callers can abort cleanly and leave the monolith untouched.
 */
export function assertSemanticRoundTrip(
  original: Roadmap,
  shards: Shard[],
  meta: RoadmapMeta
): Result<void> {
  return assertRegeneratedRoundTrip(original, serializeRoadmap(assembleRoadmap(shards, meta)));
}

/**
 * The disk-level twin of {@link assertSemanticRoundTrip}: assert that an ALREADY
 * SERIALIZED regenerated roadmap (`regeneratedMd`) re-parses deep-equal to the
 * original. Whereas `assertSemanticRoundTrip` serializes the in-memory assembled
 * shards itself, this variant takes the regenerated markdown verbatim — so the
 * `shard` CLI can feed it the bytes produced by `serializeShard`/`serializeMeta`
 * → `parseShard`/`parseMeta` → `assembleRoadmap` → `serializeRoadmap` ON DISK,
 * exercising the exact layer whose output replaces the monolith. Both the
 * original and the regenerated form are canonicalized via `parse(serialize(...))`
 * before comparison (neutralizing the serializer's prose/comment lossiness), and
 * the check is `node:util.isDeepStrictEqual` to honor the spec's "deep-equals".
 * Returns `Err` (never throws) so the caller can abort and protect the monolith.
 */
export function assertRegeneratedRoundTrip(original: Roadmap, regeneratedMd: string): Result<void> {
  const regenParsed = parseRoadmap(regeneratedMd);
  if (!regenParsed.ok)
    return Err(
      new Error(`round-trip: regenerated roadmap failed to parse: ${regenParsed.error.message}`)
    );

  const originalCanonical = parseRoadmap(serializeRoadmap(original));
  if (!originalCanonical.ok)
    return Err(
      new Error(
        `round-trip: original roadmap failed to canonicalize: ${originalCanonical.error.message}`
      )
    );

  if (!isDeepStrictEqual(originalCanonical.value, regenParsed.value)) {
    return Err(
      new Error(
        'round-trip: parse(original) does not deep-equal parse(regenerate(shards)); aborting to protect the monolith'
      )
    );
  }
  return Ok(undefined);
}
