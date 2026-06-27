/**
 * Roadmap store: backend-agnostic roadmap storage.
 *
 * Provides the shard/`_meta` file format (parse + byte-stable serialize), a
 * `RoadmapStore` interface with `MonolithStore` (legacy single-file) and
 * `ShardStore` (one file per row) backends, a pure assembler (shards + meta →
 * Roadmap), and a deterministic regenerator (shards → aggregate `roadmap.md`).
 *
 * Phase 1 wires no callers — writers (manage_roadmap, promote, claim, sync) move
 * onto `RoadmapStore` in Phase 4; sharded-mode detection lands in Phase 6.
 */
export type {
  RoadmapStore,
  Shard,
  RoadmapMeta,
  FeatureMutation,
  AddFeatureInput,
} from './roadmap-store';
export { parseShard, serializeShard } from './shard';
export { parseMeta, serializeMeta } from './meta';
export { assembleRoadmap } from './assembler';
export { MonolithStore, slugifyFeatureName } from './monolith-store';
export type { FileIO, MonolithStoreOptions } from './monolith-store';
export { ShardStore, readShardDir } from './shard-store';
export type { ShardIO } from './shard-store';
export { regenerate, writeRegeneratedRoadmap } from './regenerator';
export { roadmapToShards, assertSemanticRoundTrip } from './migration';
