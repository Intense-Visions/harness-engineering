import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

/** Discover monorepo package entry points (packages/{name}/src/index.ts). */
export async function discoverEntryPoints(projectPath: string): Promise<string[]> {
  const pkgDir = join(projectPath, 'packages');
  let entries: string[];
  try {
    entries = await readdir(pkgDir);
  } catch {
    return [];
  }
  const points: string[] = [];
  for (const name of entries) {
    points.push(join('packages', name, 'src', 'index.ts'));
  }
  return points;
}
