/**
 * Parser for the optional `## Component Registry` section of DESIGN.md.
 *
 * The registry is a markdown table mapping a component Type to the File that
 * implements it — the component-type resolver's Layer 2 (Decision #3). See
 * docs/changes/design-pipeline/audit-component-anatomy/proposal.md → "DESIGN.md
 * schema additions".
 *
 *   ## Component Registry
 *
 *   | Type   | File                            | Notes    |
 *   | ------ | ------------------------------- | -------- |
 *   | Button | packages/ui/src/Button.tsx      |          |
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface RegistryEntry {
  type: string;
  /** File path exactly as written in the table (project-relative). */
  file: string;
}

/**
 * Extract the `Type`/`File` rows from a DESIGN.md `## Component Registry` table.
 * Tolerates extra columns (e.g. Notes), arbitrary heading depth, and the
 * separator row. Returns `[]` when the section is absent or has no data rows.
 */
export function parseComponentRegistry(designMd: string): RegistryEntry[] {
  const lines = designMd.split('\n');
  const headingIdx = lines.findIndex((l) => /^#{1,6}\s+Component Registry\b/i.test(l));
  if (headingIdx === -1) return [];

  const entries: RegistryEntry[] = [];
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    // Stop at the next heading — the section is over.
    if (/^#{1,6}\s+/.test(line)) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .slice(1, trimmed.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    const [type, file] = cells;
    if (!type || !file) continue;
    // Skip the header row and the `---` separator row.
    if (/^type$/i.test(type) || /^:?-{2,}:?$/.test(type)) continue;
    entries.push({ type, file });
  }
  return entries;
}

/**
 * Walk up from `fromPath`'s directory looking for a `DESIGN.md` (case-insensitive
 * filename). Returns the absolute path of the nearest one, or null. Bounded by
 * the filesystem root.
 */
export function findDesignMd(fromPath: string): string | null {
  let dir = path.dirname(path.resolve(fromPath));
  for (;;) {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      names = [];
    }
    const hit = names.find((n) => n.toLowerCase() === 'design.md');
    if (hit) return path.join(dir, hit);
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}
