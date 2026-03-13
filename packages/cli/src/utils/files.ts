import { glob } from 'glob';

/**
 * Find files matching a glob pattern
 */
export async function findFiles(pattern: string, cwd: string = process.cwd()): Promise<string[]> {
  return glob(pattern, { cwd, absolute: true });
}
