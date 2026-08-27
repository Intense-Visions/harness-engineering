import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { ComprehensionIO } from './store';
import { UNIT_FILE } from './store';
import type { ModuleSourceReader } from './serve-gate';
import type { SourceFile } from './types';
import { DEFAULT_SOURCE_EXTENSIONS } from './types';

/**
 * Node-fs `ComprehensionIO` — the only node:fs binding for the comprehension
 * store (mirrors `createNodeRoadmapIO`). `writeFile` creates missing parent
 * dirs so first-time tree-mirrored writes succeed; `listUnitPaths` walks the
 * tree, returns `/`-normalized paths, and treats an absent root as "no units"
 * (no throw) so a fresh repo lists cleanly.
 */
export function createNodeComprehensionIO(): ComprehensionIO {
  return {
    readFile: (p) => fsp.readFile(p, 'utf-8'),
    writeFile: async (p, data) => {
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p, data, 'utf-8');
    },
    listUnitPaths: async (root) => {
      const out: string[] = [];
      async function walk(dir: string): Promise<void> {
        let entries: import('node:fs').Dirent[];
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
          return; // absent dir ⇒ no units
        }
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) await walk(full);
          else if (e.name === UNIT_FILE) out.push(full.replaceAll('\\', '/'));
        }
      }
      await walk(root);
      return out;
    },
  };
}

/**
 * Node-fs `ModuleSourceReader` — the CANONICAL module-directory enumeration used
 * by the serve-time gate (and, in a later phase, the compiler, so the recomputed
 * hash matches the compiled one — single source of truth). Enumerates the module
 * directory's DIRECT source files (non-recursive: a nested directory is its own
 * module, D3), keys each `SourceFile.path` by its module-relative posix basename,
 * and returns `null` when the directory is absent (a deleted module → source-stale
 * at the gate). No LLM, no credential.
 */
export function createNodeModuleSourceReader(
  projectRoot: string,
  options: { extensions?: string[] } = {}
): ModuleSourceReader {
  const exts = new Set(options.extensions ?? DEFAULT_SOURCE_EXTENSIONS);
  return {
    readModuleSource: async (module) => {
      const dir = path.join(projectRoot, module);
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return null; // absent/deleted module dir ⇒ source-stale at the gate
      }
      const files: SourceFile[] = [];
      for (const e of entries) {
        if (!e.isFile() || !exts.has(path.extname(e.name))) continue;
        files.push({ path: e.name, content: await fsp.readFile(path.join(dir, e.name), 'utf-8') });
      }
      return files;
    },
  };
}
