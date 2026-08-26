import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import matter from 'gray-matter';
import type { SolutionEnforcement } from './report';

/**
 * IO side of the provenance reporter (ADR 0100): walk `docs/solutions` and
 * collect the `enforces:` links declared in each solution's frontmatter.
 *
 * Only solutions that declare a non-empty `enforces` contribute to the join;
 * docs without it are silently skipped (fill-forward — legacy docs are valid).
 */

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}

function extractEnforces(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const value = (data as Record<string, unknown>).enforces;
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

/**
 * Collect `{ slug, enforces }` for every solution doc under `docs/solutions`
 * that declares a non-empty `enforces:` list. Slug is the doc path relative to
 * the solutions root, POSIX-normalized, without the `.md` suffix. Returns an
 * empty array when the directory is absent (the reporter degrades gracefully).
 */
export async function collectSolutionEnforcements(cwd: string): Promise<SolutionEnforcement[]> {
  const root = path.join(cwd, 'docs', 'solutions');
  const out: SolutionEnforcement[] = [];
  for await (const file of walk(root)) {
    let raw: string;
    try {
      raw = await fs.readFile(file, 'utf-8');
    } catch {
      continue;
    }
    let data: unknown;
    try {
      data = matter(raw).data;
    } catch {
      continue;
    }
    const enforces = extractEnforces(data);
    if (enforces.length === 0) continue;
    const slug = path.relative(root, file).replaceAll('\\', '/').replace(/\.md$/, '');
    out.push({ slug, enforces });
  }
  return out;
}
