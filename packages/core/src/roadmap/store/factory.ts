import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Result } from '@harness-engineering/types';
import type { RoadmapFrontmatter } from '@harness-engineering/types';
import type { RoadmapStore, FeatureMutation, AddFeatureInput } from './roadmap-store';
import type { ShardIO } from './shard-store';
import { ShardStore } from './shard-store';
import { MonolithStore } from './monolith-store';
import { createNodeRoadmapIO } from './node-io';
import { writeRegeneratedRoadmap } from './regenerator';

/**
 * Options for {@link resolveRoadmapStore}. `io`/`exists` are injectable so the
 * factory is unit-testable without touching the real filesystem.
 */
export interface ResolveRoadmapStoreOptions {
  /** Project root that contains `docs/roadmap.md` and (in sharded mode) `docs/roadmap.d/`. */
  projectRoot: string;
  /** Filesystem IO; defaults to a node-fs adapter. */
  io?: ShardIO;
  /** Existence probe for the shard dir; defaults to `fs.existsSync`. */
  exists?: (target: string) => boolean;
}

/**
 * Resolve the right {@link RoadmapStore} for a project by mode detection:
 * a `ShardStore` when `docs/roadmap.d/` is present, else a `MonolithStore` over
 * `docs/roadmap.md`.
 *
 * This is a minimal, presence-based detector pulled forward into Phase 4 so
 * writers work in both modes now; Phase 6 folds full mode detection into
 * `load-mode.ts`. In sharded mode every mutation regenerates the aggregate
 * `docs/roadmap.md` immediately after the single-shard write (in addition to the
 * Phase-3 git hook) so same-process readers and the on-disk aggregate stay fresh.
 *
 * NOTE: this file legitimately names `roadmap.md` as a path constant (not a
 * content read); it is permitted under invariant R (see ROADMAP_READ_ALLOWLIST).
 */
export function resolveRoadmapStore(options: ResolveRoadmapStoreOptions): RoadmapStore {
  const { projectRoot } = options;
  const shardDir = path.join(projectRoot, 'docs', 'roadmap.d');
  const roadmapPath = path.join(projectRoot, 'docs', 'roadmap.md');
  const io = options.io ?? createNodeRoadmapIO();
  const exists = options.exists ?? ((target: string) => fs.existsSync(target));

  if (exists(shardDir)) {
    return withAggregateRegen(new ShardStore({ shardDir, io }), shardDir, roadmapPath, io);
  }
  return new MonolithStore({ roadmapPath, io });
}

/**
 * Decorate a sharded store so each successful mutation regenerates the aggregate
 * `roadmap.md`. `load()` and read paths are untouched; a failed mutation skips
 * regeneration (nothing changed).
 */
function withAggregateRegen(
  base: RoadmapStore,
  shardDir: string,
  roadmapPath: string,
  io: ShardIO
): RoadmapStore {
  const regen = async (result: Result<void>): Promise<Result<void>> => {
    if (!result.ok) return result;
    return writeRegeneratedRoadmap(shardDir, roadmapPath, io);
  };
  return {
    load: () => base.load(),
    patchFeature: async (slug: string, mutate: FeatureMutation) =>
      regen(await base.patchFeature(slug, mutate)),
    addFeature: async (input: AddFeatureInput) => regen(await base.addFeature(input)),
    removeFeature: async (slug: string) => regen(await base.removeFeature(slug)),
    // No-op in sharded mode (see ShardStore.patchFrontmatter); nothing to
    // regenerate since no shard/_meta changed.
    patchFrontmatter: (mutate: (fm: RoadmapFrontmatter) => RoadmapFrontmatter) =>
      base.patchFrontmatter(mutate),
  };
}
