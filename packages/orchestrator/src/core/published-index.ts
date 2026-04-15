import * as fs from 'node:fs';
import * as path from 'node:path';

const PUBLISHED_INDEX_RELATIVE = '.harness/metrics/published-analyses.json';

export interface PublishedIndex {
  [issueId: string]: string; // ISO timestamp of when published
}

/**
 * Load the published analyses index from disk.
 * Returns an empty object if the file does not exist or is unparseable.
 */
export function loadPublishedIndex(projectRoot: string): PublishedIndex {
  const p = path.join(projectRoot, PUBLISHED_INDEX_RELATIVE);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Persist the published analyses index to disk.
 * Creates parent directories if they do not exist.
 */
export function savePublishedIndex(projectRoot: string, index: PublishedIndex): void {
  const p = path.join(projectRoot, PUBLISHED_INDEX_RELATIVE);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(index, null, 2), 'utf-8');
}
