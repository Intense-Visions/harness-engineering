import type {
  Roadmap,
  RoadmapFeature,
  RoadmapFrontmatter,
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
}
