import * as fs from 'fs';
import * as path from 'path';
import { Ok, Err, type Result } from '../shared/result';
import { RehearsalManifestSchema, type RehearsalManifest } from './types';

/** The manifest filename each fixture directory must contain. */
export const MANIFEST_FILENAME = 'rehearsal.json';

/**
 * Load and validate a single fixture manifest from a fixture directory.
 * Returns Err (never throws) on a missing or malformed manifest so a bad
 * fixture is reported, not fatal.
 */
export function loadManifest(fixtureDir: string): Result<RehearsalManifest, Error> {
  const manifestPath = path.join(fixtureDir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    return Err(new Error(`No ${MANIFEST_FILENAME} in ${fixtureDir}`));
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return Err(new Error(`Invalid JSON in ${manifestPath}: ${(e as Error).message}`));
  }
  const parsed = RehearsalManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return Err(new Error(`Invalid manifest ${manifestPath}: ${parsed.error.message}`));
  }
  // The id must match the directory name so `rehearse score --fixture <id>`
  // resolves the same directory the catalogue lists.
  const dirName = path.basename(fixtureDir);
  if (parsed.data.id !== dirName) {
    return Err(
      new Error(
        `Manifest id "${parsed.data.id}" does not match directory "${dirName}" in ${fixtureDir}`
      )
    );
  }
  return Ok(parsed.data);
}

/**
 * Enumerate every valid fixture manifest under a rehearsal-fixtures root
 * (`templates/rehearsal-fixtures/`). Directories without a valid manifest are
 * skipped silently — the catalogue only surfaces well-formed fixtures. Returns
 * an empty list when the root is absent (e.g. a stripped-down install).
 */
export function loadCatalog(fixturesRoot: string): RehearsalManifest[] {
  if (!fs.existsSync(fixturesRoot) || !fs.statSync(fixturesRoot).isDirectory()) {
    return [];
  }
  const manifests: RehearsalManifest[] = [];
  for (const entry of fs.readdirSync(fixturesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const result = loadManifest(path.join(fixturesRoot, entry.name));
    if (result.ok) manifests.push(result.value);
  }
  return manifests.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Resolve one fixture manifest by id under a fixtures root. */
export function findFixture(fixturesRoot: string, id: string): Result<RehearsalManifest, Error> {
  return loadManifest(path.join(fixturesRoot, id));
}
