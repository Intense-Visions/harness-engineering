import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { ComprehensionIO } from './store';
import { UNIT_FILE } from './store';

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
