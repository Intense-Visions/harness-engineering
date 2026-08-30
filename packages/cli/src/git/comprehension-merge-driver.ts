/**
 * ADR 0109 slice 5 — the `comprehension` git merge driver.
 *
 * A comprehension `_module.md` shard is a pure function of its module's source, so
 * a merge conflict on it never needs a hand-merge. Git invokes the driver as
 * `<cmd> %O %A %B %P` and keeps the contents of `%A` (the "ours" temp file) as the
 * resolved result on exit 0.
 *
 * Resolution strategy (review-hardened):
 *  1. **Keep OURS when it is source-fresh.** If the ours shard's `sourceHash`
 *     matches the current working-tree source (serve-gate accepts it), ours is
 *     already the correct resolution — the conflict was only on non-semantic bytes
 *     (e.g. a differing theirs summary). Keeping ours PRESERVES its semantic
 *     content and is byte-stable (no recompile, no `compiledAt` churn). This is
 *     strictly better than a plain `merge=ours` (which could keep a stale shard)
 *     and than an always-static recompile (which would drop semantic).
 *  2. **Recompile STATIC-ONLY as a stale fallback.** If ours is source-stale,
 *     missing, or unparseable, recompile the static half from the current source.
 *     This may drop semantic (re-added on the next in-session touch), but the
 *     result is source-fresh so it is not flagged stale by `comprehend --check`.
 *
 * IMPORTANT (timing honesty): the driver reads the CURRENT WORKING-TREE source,
 * which under git's default `ort` strategy is typically the pre-merge *ours*
 * source during the driver call — NOT a fully merged tree. That is fine: step 1
 * validates ours against whatever source is present, and after the human resolves
 * any real *source* conflict, the pre-commit hook / `comprehend --check` reconcile
 * the shard. Correctness of the semantic half is deferred to that reconciliation,
 * not claimed at merge time.
 *
 * It is ALWAYS non-blocking: any failure (not a shard path, no source, parse or
 * compile error) leaves `%A` as ours and still resolves — a merge is never blocked.
 */

import {
  compileModule,
  serializeUnit,
  parseUnit,
  serveGate,
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
  /** Current ours (`%A`) shard content, or null when unreadable. */
  readOursShard(): string | null;
  readModuleSource(module: string): Promise<ComprehensionSourceFile[] | null>;
  makeExtractStatic(module: string): ExtractStatic;
  /** Write the resolved shard content to the ours (`%A`) path git will keep. */
  writeOurs(content: string): void;
}

export type MergeDriverResult =
  | { resolved: true; kept: 'ours' | 'recompiled-static' }
  | { resolved: false; reason: string };

/**
 * Resolve a comprehension shard conflict. Keeps ours when it is source-fresh
 * (preserving semantic), else recompiles static-only from current source. NEVER
 * throws — a failure returns `{ resolved: false, reason }` and the caller still
 * exits 0 (keeping ours), so a merge is never blocked.
 */
export async function runComprehensionMergeDriver(
  shardPath: string,
  io: MergeDriverIO
): Promise<MergeDriverResult> {
  const module = moduleFromShardPath(shardPath);
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
  const currentSource = source;

  // 1. Prefer ours when it is source-fresh — preserves semantic, byte-stable.
  let ours: string | null;
  try {
    ours = io.readOursShard();
  } catch {
    ours = null;
  }
  if (ours !== null) {
    const parsed = parseUnit(ours);
    if (parsed.ok) {
      try {
        const verdict = await serveGate(parsed.value, {
          readModuleSource: async () => currentSource,
        });
        if (verdict.serve) return { resolved: true, kept: 'ours' };
      } catch {
        /* fall through to recompile */
      }
    }
  }

  // 2. Stale/missing/unparseable ours ⇒ recompile static-only as a fallback.
  try {
    const unit = await compileModule(module, currentSource, {
      extractStatic: io.makeExtractStatic(module),
    });
    io.writeOurs(serializeUnit(unit));
    return { resolved: true, kept: 'recompiled-static' };
  } catch (err) {
    return {
      resolved: false,
      reason: `recompile failed for ${module} (kept ours): ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
