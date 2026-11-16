/**
 * #2578 — `harness comprehend --prune`: delete orphan comprehension units.
 *
 * An orphan is a committed `_module.md` whose module the canonical enumerator
 * (`enumerateModules`, the `--all` set) no longer returns — its directory was
 * deleted, or it is one `--all` never walks (a dot-directory such as a git-ignored
 * `docs/.vitepress/cache`). No recompile can refresh an orphan, so `--check` stays
 * red until it is removed; this is the removal path.
 *
 * Token-free (ADR 0108's no-credential invariant): enumeration + unlink only, never
 * a provider or an LLM. Only modules of units the store itself lists are deleted,
 * each at `store.path(module)`; a module that could resolve outside the store root
 * (`..` segment, absolute/drive path, backslash) is refused, never unlinked.
 */
import * as fsp from 'node:fs/promises';
import type { ComprehensionStore } from '@harness-engineering/core';
import { findOrphanModules } from './compile-run';

export interface PruneOrphansResult {
  /** Modules whose orphan unit file was deleted (sorted). */
  removed: string[];
  /** Orphans that could not be deleted, with the reason (surfaced, never dropped). */
  failed: Array<{ module: string; reason: string }>;
}

/** Mirrors the store's own F3 guard: a module must stay inside the store root. */
function escapesRoot(module: string): boolean {
  return (
    module === '' ||
    module.includes('\\') ||
    module.startsWith('/') ||
    /^[a-zA-Z]:/.test(module) ||
    module.split('/').some((seg) => seg === '..')
  );
}

export async function pruneOrphanUnits(opts: {
  store: Pick<ComprehensionStore, 'list' | 'path'>;
  listModules: () => Promise<string[]>;
  /** Injectable unlink seam (defaults to `fs.promises.unlink`). */
  remove?: (path: string) => Promise<void>;
}): Promise<PruneOrphansResult> {
  const listing = await opts.store.list();
  if (!listing.ok) {
    return { removed: [], failed: [{ module: '<listing>', reason: listing.error.message }] };
  }
  const orphans = findOrphanModules(listing.value.units, await opts.listModules());
  const remove = opts.remove ?? ((p: string) => fsp.unlink(p));
  const result: PruneOrphansResult = { removed: [], failed: [] };
  for (const module of orphans) {
    if (escapesRoot(module)) {
      result.failed.push({ module, reason: 'module path escapes the comprehension root' });
      continue;
    }
    try {
      await remove(opts.store.path(module));
      result.removed.push(module);
    } catch (err) {
      result.failed.push({ module, reason: (err as Error).message });
    }
  }
  return result;
}
