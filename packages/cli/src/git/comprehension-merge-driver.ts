/**
 * ADR 0109 slice 5 — the `comprehension` git merge driver.
 *
 * A comprehension `_module.md` shard is a pure function of its module's source, so
 * a merge conflict on it never needs a hand-merge: it is resolved by REGENERATING
 * from the merged working-tree source. Combined with byte-stable shards (slice 1 —
 * same source ⇒ identical shard ⇒ no conflict at all), the developer never sees a
 * comprehension merge marker.
 *
 * Git invokes the driver as `<cmd> %O %A %B %P` and takes the contents of `%A`
 * (the "ours" temp file) as the resolved result on exit 0. This driver recompiles
 * the shard STATIC-ONLY (no provider, no LLM at merge time) and writes it to `%A`.
 * Semantic is re-added on the next in-session touch (slices 2-3). It is
 * ALWAYS non-blocking: any failure (not a shard path, no source, compile error)
 * leaves `%A` as ours and still resolves — a merge is never blocked by the driver,
 * and a resulting stale shard is caught by `comprehend --check` and healed later.
 */

import {
  compileModule,
  serializeUnit,
  COMPREHENSION_ROOT,
  type ComprehensionSourceFile,
  type ExtractStatic,
} from '@harness-engineering/core';

/**
 * Derive the module directory from a shard path
 * (`.harness/comprehension/<module>/_module.md` → `<module>`). Returns null when
 * the path is not a comprehension shard.
 */
export function moduleFromShardPath(shardPath: string): string | null {
  const posix = shardPath.replaceAll('\\', '/');
  const prefix = `${COMPREHENSION_ROOT}/`;
  const suffix = '/_module.md';
  if (!posix.startsWith(prefix) || !posix.endsWith(suffix)) return null;
  const module = posix.slice(prefix.length, posix.length - suffix.length);
  return module.length > 0 ? module : null;
}

/** IO seams so the driver is disk-free in tests. */
export interface MergeDriverIO {
  readModuleSource(module: string): Promise<ComprehensionSourceFile[] | null>;
  makeExtractStatic(module: string): ExtractStatic;
  /** Write the resolved shard content to the "ours" temp path git will keep. */
  writeOurs(content: string): void;
}

export interface MergeDriverResult {
  /** True when the shard was regenerated and written to the ours path. */
  resolved: boolean;
  /** Why the driver fell back to ours (kept the merge non-blocking). */
  reason?: string;
}

/**
 * Resolve a comprehension shard conflict by regenerating it (static-only) from the
 * merged working-tree source and writing it to the ours path. NEVER throws — a
 * failure returns `{ resolved: false, reason }` and the caller still exits 0
 * (keeping ours), so a merge is never blocked.
 */
export async function runComprehensionMergeDriver(
  args: { oursPath: string; shardPath: string },
  io: MergeDriverIO
): Promise<MergeDriverResult> {
  const module = moduleFromShardPath(args.shardPath);
  if (!module) return { resolved: false, reason: 'not a comprehension shard path' };

  let source: ComprehensionSourceFile[] | null;
  try {
    source = await io.readModuleSource(module);
  } catch {
    source = null;
  }
  if (!source || source.length === 0) {
    return { resolved: false, reason: `no source for ${module} (kept ours)` };
  }

  try {
    const unit = await compileModule(module, source, {
      extractStatic: io.makeExtractStatic(module),
    });
    io.writeOurs(serializeUnit(unit));
    return { resolved: true };
  } catch (err) {
    return {
      resolved: false,
      reason: `recompile failed for ${module} (kept ours): ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
