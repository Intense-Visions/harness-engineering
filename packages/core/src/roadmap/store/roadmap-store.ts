import type {
  Roadmap,
  RoadmapFeature,
  RoadmapFrontmatter,
  AssignmentRecord,
  Result,
} from '@harness-engineering/types';

/** A single per-row shard: frontmatter metadata + the parsed row body. */
export interface Shard {
  slug: string;
  milestone: string;
  order: number;
  feature: RoadmapFeature;
}

/** Parsed `_meta.md`: roadmap-level frontmatter + the ordered milestone list. */
export interface RoadmapMeta {
  frontmatter: RoadmapFrontmatter;
  /** Milestone names in canonical document order (includes 'Backlog'). */
  milestones: string[];
  /**
   * The aggregate's preamble (the directive block under `# Roadmap`), carried in
   * the `_meta.md` body ahead of any `## Assignment History` section. Roadmap-level
   * and NOT derivable from shards, so — like the assignment history — `_meta.md` is
   * its only home; without it `shard` → `regen` silently deleted the block (#1328).
   * Absent means no preamble, and `_meta.md` stays byte-stable with Phase 1.
   */
  preamble?: string;
  /**
   * Roadmap-level assignment audit log, carried in the `_meta.md` body as an
   * optional trailing `## Assignment History` section. Empty or absent means no
   * section is emitted (byte-stable with history-free `_meta.md`). This is the
   * only roadmap-level home for roadmap-level audit data, so a strict semantic
   * round-trip (`parse(old) deep-equals parse(regen(shards)))` preserves it.
   */
  assignmentHistory?: AssignmentRecord[];
}

/** A pure mutation applied to one feature during patchFeature. */
export type FeatureMutation = (feature: RoadmapFeature) => RoadmapFeature;

/** Input for addFeature — slug + placement + the feature body. */
export interface AddFeatureInput {
  slug: string;
  milestone: string;
  order: number;
  feature: RoadmapFeature;
}

/**
 * Backend-agnostic roadmap store. `load()` MUST return the same in-memory
 * Roadmap regardless of backend (monolith vs shards), so downstream call
 * sites are unchanged (spec D3 / invariant: store parity).
 */
export interface RoadmapStore {
  load(): Promise<Result<Roadmap>>;
  /** Patch exactly one feature/shard. Phase 4 wires real callers. */
  patchFeature(slug: string, mutate: FeatureMutation): Promise<Result<void>>;
  /** Add a new feature/shard. Phase 4 wires real callers. */
  addFeature(input: AddFeatureInput): Promise<Result<void>>;
  /** Delete exactly one feature/shard by slug. `Err` if the slug resolves to none. */
  removeFeature(slug: string): Promise<Result<void>>;
  /**
   * Patch roadmap-level frontmatter (e.g. `lastManualEdit`/`lastSynced`). The
   * monolith backend rewrites the whole file; the shard backend treats this as a
   * no-op — the aggregate's frontmatter is regenerated from `_meta.md`, so
   * per-feature writes never touch `_meta`, preserving the single-shard,
   * conflict-free write guarantee.
   */
  patchFrontmatter(
    mutate: (frontmatter: RoadmapFrontmatter) => RoadmapFrontmatter
  ): Promise<Result<void>>;
  /**
   * Replace the roadmap-level assignment audit log. Unlike frontmatter timestamps
   * this is NOT derivable from shards, so it genuinely persists in both backends —
   * monolith rewrites the whole file; the shard backend rewrites only `_meta.md`
   * (never a feature shard).
   */
  patchAssignmentHistory(history: AssignmentRecord[]): Promise<Result<void>>;
  /**
   * Stamp the roadmap-level `lastSynced` timestamp on a successful sync (#1037).
   * A distinct operation from {@link patchFrontmatter} (a deliberate no-op in
   * sharded mode to protect the single-shard write invariant): `lastSynced` lives
   * in `_meta.md` in sharded mode, so it needs a real write there — the shard
   * backend rewrites only `_meta.md` (never a feature shard); monolith rewrites the
   * whole file. Callers invoke this after a successful writeback so the aggregate's
   * `last_synced` reflects when the sync actually ran.
   */
  stampLastSynced(timestamp: string): Promise<Result<void>>;
}
