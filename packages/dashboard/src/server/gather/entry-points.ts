import { join } from 'node:path';
import { readdir, stat } from 'node:fs/promises';

/**
 * Discover monorepo package entry points (packages/{name}/src/index.ts).
 *
 * Only paths that exist as files are returned. The candidates are a guess at a
 * convention, not something an author configured, so a package without a
 * `src/index.ts` (a Vite app, a non-TS package, a stray file under `packages/`)
 * is skipped rather than handed to core. Core's `resolveEntryPoints` rejects
 * any explicit entry point that matches no file with `ENTRY_POINT_NOT_FOUND`,
 * so one guessed-but-absent root would turn the whole health/perf panel into
 * an error over a path nobody asked for.
 */
export async function discoverEntryPoints(projectPath: string): Promise<string[]> {
  const pkgDir = join(projectPath, 'packages');
  let entries: string[];
  try {
    entries = await readdir(pkgDir);
  } catch {
    return [];
  }
  const points: string[] = [];
  for (const name of entries.sort()) {
    const rel = join('packages', name, 'src', 'index.ts');
    if (await isFile(join(projectPath, rel))) points.push(rel);
  }
  return points;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
