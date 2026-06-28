import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Result } from '@harness-engineering/types';
import type { RoadmapFrontmatter, AssignmentRecord } from '@harness-engineering/types';
import type { RoadmapStore, FeatureMutation, AddFeatureInput } from './roadmap-store';
import type { ShardIO } from './shard-store';
import { ShardStore } from './shard-store';
import { MonolithStore } from './monolith-store';
import { createNodeRoadmapIO } from './node-io';
import { writeRegeneratedRoadmap } from './regenerator';
import { detectRoadmapStorageMode } from '../load-mode';

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
 * Phase 6 DONE: storage-mode detection lives in `load-mode.ts`
 * (`detectRoadmapStorageMode`); this factory delegates to that single authority
 * so the formal mode and the store backend can never disagree. In sharded mode
 * every mutation regenerates the aggregate
 * `docs/roadmap.md` immediately after the single-shard write (in addition to the
 * Phase-3 git hook) so same-process readers and the on-disk aggregate stay fresh.
 *
 * NOTE: this file legitimately names `roadmap.md` as a path constant (not a
 * content read); it is permitted under invariant R (see ROADMAP_READ_ALLOWLIST).
 */
/**
 * Whether a roadmap SOURCE exists for a project — either the sharded
 * `docs/roadmap.d/` directory or the monolith `docs/roadmap.md` aggregate. Callers
 * use this to preserve a distinct "roadmap not found" response now that reads go
 * through {@link resolveRoadmapStore}().load(), whose `Err` covers both not-found
 * and parse failures. Lives here (not in the CLI) so the literal aggregate path is
 * named only in this already-permitted store module — keeping callers free of any
 * `roadmap.md` reference (invariant R).
 */
export function roadmapSourceExists(
  projectRoot: string,
  exists: (target: string) => boolean = (target) => fs.existsSync(target)
): boolean {
  // Delegate the shard-dir probe to the single detection authority so the
  // `roadmap.d` directory name lives in exactly one place (`load-mode.ts`); only
  // the aggregate path is named here, in this already-sanctioned store module.
  return (
    detectRoadmapStorageMode(projectRoot, exists) === 'sharded' ||
    // Normalize to '/' to match detectRoadmapStorageMode's probe contract cross-OS.
    exists(path.join(projectRoot, 'docs', 'roadmap.md').replaceAll('\\', '/'))
  );
}

/**
 * The absolute path to a project's generated aggregate (`<root>/docs/roadmap.md`).
 *
 * Exposed so callers that still need to NAME the aggregate path for non-content
 * purposes — a file-watch target, a serialization lock key — can do so WITHOUT
 * hardcoding the `roadmap.md` literal themselves (which would make them trip the
 * read-source guard, invariant R). The literal lives only here, in the already
 * store-sanctioned module. This is NOT a content read: callers must still go
 * through {@link resolveRoadmapStore}().load() to read roadmap content.
 */
export function roadmapAggregatePath(projectRoot: string): string {
  return path.join(projectRoot, 'docs', 'roadmap.md');
}

export function resolveRoadmapStore(options: ResolveRoadmapStoreOptions): RoadmapStore {
  const forFile: ResolveRoadmapStoreForFileOptions = {
    roadmapPath: roadmapAggregatePath(options.projectRoot),
  };
  if (options.io !== undefined) forFile.io = options.io;
  if (options.exists !== undefined) forFile.exists = options.exists;
  return resolveRoadmapStoreForFile(forFile);
}

/** Options for {@link resolveRoadmapStoreForFile}. */
export interface ResolveRoadmapStoreForFileOptions {
  /**
   * Path to the aggregate roadmap file (e.g. `docs/roadmap.md`). The shard
   * directory is its sibling `roadmap.d/`. May be relative or absolute.
   */
  roadmapPath: string;
  /** Filesystem IO; defaults to a node-fs adapter. */
  io?: ShardIO;
  /** Existence probe for the shard dir; defaults to `fs.existsSync`. */
  exists?: (target: string) => boolean;
}

/**
 * Resolve a {@link RoadmapStore} anchored on an explicit aggregate FILE path
 * rather than the conventional `<root>/docs/roadmap.md`. The shard backend is
 * chosen when a sibling `roadmap.d/` exists next to the file. For callers whose
 * configured roadmap path is not guaranteed to follow the `docs/` layout — e.g.
 * the orchestrator's roadmap tracker adapter, whose `TrackerConfig.filePath`
 * points directly at the roadmap file. {@link resolveRoadmapStore} delegates here.
 */
export function resolveRoadmapStoreForFile(
  options: ResolveRoadmapStoreForFileOptions
): RoadmapStore {
  const { roadmapPath } = options;
  const shardDir = path.join(path.dirname(roadmapPath), 'roadmap.d');
  const io = options.io ?? createNodeRoadmapIO();
  const exists = options.exists ?? ((target: string) => fs.existsSync(target));

  // Delegate to the single detection authority. `detectRoadmapStorageMode`
  // probes `<projectRoot>/docs/roadmap.d`; map that one probe to this file's
  // actual sibling shard dir so detection stays correct even when `roadmapPath`
  // does not follow the conventional `docs/` layout (e.g. the orchestrator's
  // tracker adapter). Behaviorally identical to a direct `exists(shardDir)`.
  const projectRoot = path.dirname(path.dirname(roadmapPath));
  // Match detectRoadmapStorageMode's normalized probe (forward slashes) so the
  // remap comparison holds on Windows; the real `shardDir` (used for IO) is
  // left as-is for the injected/fs probe.
  const shardDirProbe = path.join(projectRoot, 'docs', 'roadmap.d').replaceAll('\\', '/');
  const mode = detectRoadmapStorageMode(projectRoot, (target) =>
    target === shardDirProbe ? exists(shardDir) : exists(target)
  );

  if (mode === 'sharded') {
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
    // Writes _meta.md in sharded mode → regenerate the aggregate so its audit log
    // section stays fresh.
    patchAssignmentHistory: async (history: AssignmentRecord[]) =>
      regen(await base.patchAssignmentHistory(history)),
  };
}
