/**
 * Pending-changeset discovery for the release-inventory metric.
 *
 * Pure over the injected {@link ReleaseInventoryFsPort} and {@link
 * ReleaseInventoryGitPort}: lists `.changeset/*.md`, drops the two non-changeset
 * files (`README.md`, `config.json`), parses each file's frontmatter for the
 * package → bump map, and ages it from the git date it entered history.
 */

import type { PendingChangeset, ReleaseInventoryFsPort, ReleaseInventoryGitPort } from './types';
import { diffInWholeDays } from './dates';

const CHANGESET_DIR = '.changeset';

/** Files under `.changeset/` that are configuration, not changesets. */
const NON_CHANGESET_FILES = new Set(['README.md', 'config.json']);

/**
 * Parse the leading YAML-ish frontmatter of a changeset for its package bumps.
 *
 * A changeset frontmatter is delimited by `---` fences and holds lines like
 * `'@scope/pkg': minor`. We parse it directly (rather than pulling a YAML dep
 * into a hot pure path) because the grammar is fixed and tiny. Unparseable or
 * absent frontmatter yields an empty bump list — the changeset still counts.
 */
export function parseChangesetBumps(content: string): Array<{ package: string; level: string }> {
  const lines = content.split(/\r?\n/);
  // Find the first fence.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      start = i;
      break;
    }
  }
  if (start === -1) return [];
  const bumps: Array<{ package: string; level: string }> = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '---') break; // closing fence
    // Match `'pkg': level`, `"pkg": level`, or `pkg: level`.
    const m = /^\s*['"]?([^'":]+)['"]?\s*:\s*['"]?([A-Za-z]+)['"]?\s*$/.exec(line);
    if (m) {
      const pkg = (m[1] ?? '').trim();
      const level = (m[2] ?? '').trim();
      if (pkg && level) bumps.push({ package: pkg, level });
    }
  }
  return bumps;
}

/**
 * Read pending changesets from `.changeset/`, aged against `now`.
 *
 * Returns [] when the directory is absent (a repo not using changesets) — the
 * metric still reports (unreleased commits carry the signal in that case).
 */
export function readPendingChangesets(
  fsPort: ReleaseInventoryFsPort,
  gitPort: ReleaseInventoryGitPort,
  now: Date
): PendingChangeset[] {
  const entries = fsPort.listDir(CHANGESET_DIR);
  const changesets: PendingChangeset[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    if (NON_CHANGESET_FILES.has(entry)) continue;
    const relPath = `${CHANGESET_DIR}/${entry}`;
    const content = fsPort.readFile(relPath) ?? '';
    const bumps = parseChangesetBumps(content);
    const addedAt = gitPort.fileAddedDate(relPath);
    const ageDays = addedAt ? diffInWholeDays(now, new Date(addedAt)) : null;
    changesets.push({ file: relPath, bumps, addedAt, ageDays });
  }
  // Oldest first for stable, human-scannable ordering.
  changesets.sort((a, b) => (b.ageDays ?? -1) - (a.ageDays ?? -1));
  return changesets;
}
