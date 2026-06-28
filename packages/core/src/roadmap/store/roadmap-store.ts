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
}
