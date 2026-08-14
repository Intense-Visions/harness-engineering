/**
 * Knowledge entry discovery — walks docs/knowledge/ recursively, EXCLUDING
 * `decisions/` (which is spec-craft's territory) and any user-supplied
 * extra exclude dirs.
 *
 * Source: docs/changes/craft-pipeline/knowledge-craft/proposal.md
 *   (Technical Design → Entry discovery).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const KNOWLEDGE_ROOT = 'docs/knowledge';

/** Always excluded — ADRs are spec-craft's territory (avoids double-critique). */
export const DEFAULT_EXCLUDED_DIRS: ReadonlyArray<string> = ['decisions'];

export interface DiscoveredEntry {
  /** Absolute path to the entry file. */
  file: string;
  /** Path relative to docs/knowledge/ (e.g. 'design/component-anatomy.md'). */
  relative: string;
}

export function discoverKnowledgeEntries(
  projectRoot: string,
  extraExcludeDirs?: ReadonlyArray<string>
): DiscoveredEntry[] {
  const root = path.join(projectRoot, KNOWLEDGE_ROOT);
  if (!fs.existsSync(root)) return [];
  const exclude = new Set<string>([...DEFAULT_EXCLUDED_DIRS, ...(extraExcludeDirs ?? [])]);
  const out: DiscoveredEntry[] = [];
  walk(root, root, out, exclude);
  return out;
}

function walk(dir: string, root: string, out: DiscoveredEntry[], exclude: Set<string>): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (exclude.has(entry.name)) continue;
      walk(full, root, out, exclude);
      continue;
    }
    if (!entry.isFile()) continue;
    // Case-insensitive extension gate — mirrors the case-insensitive README
    // exclusion below so a `NOTES.MD` entry is not silently skipped.
    if (!entry.name.toLowerCase().endsWith('.md')) continue;
    if (entry.name.toLowerCase() === 'readme.md') continue;
    const rel = path.relative(root, full).replaceAll('\\', '/');
    out.push({ file: full, relative: rel });
  }
}
