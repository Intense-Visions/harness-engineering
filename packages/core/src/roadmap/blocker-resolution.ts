import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';
import { slugifyFeatureName } from './store/monolith-store';

/**
 * Blocker resolution for the pilot scorer's eligibility filter (#2255).
 *
 * A row's `blockedBy` holds whatever the `- **Blockers:**` bullet says, and in a
 * real roadmap that is rarely a bare feature name. The shapes in use are:
 *
 * - a feature name: `Build harness:outcome-eval skill`
 * - a backticked slug inside prose: ``Depends on `duplication-detection` ``
 * - the comma-split fragments of one multi-dependency sentence, which the list
 *   codec decodes into separate items: ``Depends on `a` ``, `` `b` ``, ``and `c` ``
 * - an issue reference: `Waits on #552` (matched against `External-ID`)
 * - prose that names no row at all: `Needs 5+ active harness-managed projects`
 *
 * The scorer used to count a blocker only when its whole text was exactly a
 * feature name, so every other shape was silently treated as "not a blocker" and
 * the row was ranked as dispatchable.
 *
 * ## Semantics
 *
 * A blocker item is SATISFIED when it resolves to at least one row and every row
 * it resolves to is `done`. It HOLDS otherwise:
 *
 * - `open` — it resolves to at least one row that is not `done`;
 * - `unresolved` — it names no row the scorer can find. This fails closed: a
 *   `Blockers` entry is an explicit statement that something is in the way, and
 *   a scorer that cannot see it cleared must not offer the row as dispatchable.
 *   Clearing the field (or pointing it at a row) is how a human releases it.
 *
 * Within one item, a backticked token that resolves to no row is ignored as long
 * as some other reference in the item resolves (backticks also format ordinary
 * code words in prose).
 *
 * ## Shard slugs
 *
 * In a sharded roadmap a row's identity is its shard's frontmatter `slug`, which is
 * often a hand-shortened form of the title (`rejection-ledger-negative-knowledge`
 * for "Rejection ledger — durable negative knowledge that stops re-proposal"), and
 * Blockers reference rows by that slug. `assembleRoadmap` discards shard slugs, so
 * a caller that loaded shards passes them in as `slugAliases` (see
 * {@link shardSlugAliases}). Without them, a slug that differs from the slugified
 * title resolves to no row and its blocker holds as `unresolved` — still withheld,
 * but it would stay withheld after the referenced row reaches `done`.
 */

/** Why a single blocker item still holds. */
export type BlockerHoldReason = 'open' | 'unresolved';

/** One blocker item that still holds, with the not-done rows it names (if any). */
export interface HeldBlocker {
  /** The blocker item exactly as parsed from the row. */
  text: string;
  reason: BlockerHoldReason;
  /** Names of the not-done rows this item references (empty when `unresolved`). */
  openRefs: string[];
}

/** A planned/backlog row the scorer withholds because at least one blocker holds. */
export interface BlockedCandidate {
  feature: RoadmapFeature;
  milestone: string;
  blockers: HeldBlocker[];
}

/** Resolves a feature's blockers against one roadmap snapshot. */
export type BlockerResolver = (feature: RoadmapFeature) => HeldBlocker[];

/** Shard slug → feature name, for rows whose shard slug is not the slugified title. */
export type SlugAliases = ReadonlyMap<string, string>;

/** Options shared by the scorer's eligibility filter and the blocked report. */
export interface BlockerResolutionOptions {
  /** Shard slug → feature name. Build it with {@link shardSlugAliases}. */
  slugAliases?: SlugAliases;
}

/** Build {@link SlugAliases} from loaded shards (e.g. `readShardDir(...).shards`). */
export function shardSlugAliases(
  shards: ReadonlyArray<{ slug: string; feature: { name: string } }>
): Map<string, string> {
  return new Map(shards.map((s) => [s.slug, s.feature.name]));
}

const BACKTICK_REF = /`([^`]+)`/g;
const ISSUE_REF = /#(\d+)\b/g;

function issueNumberOf(externalId: string | null): string | null {
  if (!externalId) return null;
  const match = /#(\d+)\s*$/.exec(externalId);
  return match ? match[1]! : null;
}

function addTo(index: Map<string, RoadmapFeature[]>, key: string, feature: RoadmapFeature): void {
  if (!key) return;
  const bucket = index.get(key);
  if (bucket) {
    if (!bucket.includes(feature)) bucket.push(feature);
  } else {
    index.set(key, [feature]);
  }
}

/**
 * Build a resolver over every feature in `roadmap`. Rows are indexed by
 * lowercased name, by slug (`slugifyFeatureName`, the shard-file identity), and
 * by the issue number at the end of their `External-ID`, plus any shard slug
 * supplied in `options.slugAliases`.
 */
export function createBlockerResolver(
  roadmap: Roadmap,
  options?: BlockerResolutionOptions
): BlockerResolver {
  const byKey = new Map<string, RoadmapFeature[]>();
  const byIssue = new Map<string, RoadmapFeature[]>();
  for (const feature of roadmap.milestones.flatMap((m) => m.features)) {
    addTo(byKey, feature.name.trim().toLowerCase(), feature);
    addTo(byKey, slugifyFeatureName(feature.name), feature);
    const issue = issueNumberOf(feature.externalId);
    if (issue) addTo(byIssue, issue, feature);
  }
  for (const [slug, name] of options?.slugAliases ?? []) {
    for (const feature of byKey.get(name.trim().toLowerCase()) ?? []) {
      addTo(byKey, slug.trim().toLowerCase(), feature);
    }
  }

  const lookup = (token: string): RoadmapFeature[] => {
    const trimmed = token.trim().replace(/[.;:]+$/, '');
    return byKey.get(trimmed.toLowerCase()) ?? byKey.get(slugifyFeatureName(trimmed)) ?? [];
  };

  const resolveItem = (text: string): RoadmapFeature[] => {
    const whole = lookup(text);
    if (whole.length > 0) return whole;
    const refs = new Set<RoadmapFeature>();
    for (const match of text.matchAll(BACKTICK_REF)) {
      for (const f of lookup(match[1]!)) refs.add(f);
    }
    for (const match of text.matchAll(ISSUE_REF)) {
      for (const f of byIssue.get(match[1]!) ?? []) refs.add(f);
    }
    return [...refs];
  };

  return (feature) => {
    const held: HeldBlocker[] = [];
    for (const text of feature.blockedBy) {
      if (text.trim() === '') continue;
      const refs = resolveItem(text).filter((f) => f !== feature);
      if (refs.length === 0) {
        held.push({ text, reason: 'unresolved', openRefs: [] });
        continue;
      }
      const open = refs.filter((f) => f.status !== 'done');
      if (open.length > 0) {
        held.push({ text, reason: 'open', openRefs: open.map((f) => f.name) });
      }
    }
    return held;
  };
}

/** Status gate shared by the scorer and the blocked report. */
export function isPilotStatus(feature: RoadmapFeature): boolean {
  return feature.status === 'planned' || feature.status === 'backlog';
}

/**
 * Report every planned/backlog row the pilot scorer withholds as blocked, in
 * roadmap order, with the blockers that still hold. Together with
 * `scoreRoadmapCandidates` this partitions the planned/backlog rows: every such
 * row is either scored or reported here, never both and never neither.
 */
export function findBlockedRoadmapCandidates(
  roadmap: Roadmap,
  options?: BlockerResolutionOptions
): BlockedCandidate[] {
  const resolve = createBlockerResolver(roadmap, options);
  const blocked: BlockedCandidate[] = [];
  for (const ms of roadmap.milestones) {
    for (const feature of ms.features) {
      if (!isPilotStatus(feature)) continue;
      const blockers = resolve(feature);
      if (blockers.length > 0) blocked.push({ feature, milestone: ms.name, blockers });
    }
  }
  return blocked;
}
