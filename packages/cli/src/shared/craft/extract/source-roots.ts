/**
 * Source-root resolution shared by the craft discoverers (code-craft,
 * security-craft).
 *
 * A `packages/` monorepo contributes each `packages/<pkg>/src`. A project with
 * no `packages/` directory falls back to the conventional single-package roots
 * in FALLBACK_SOURCE_ROOTS. Without the fallback a single-package repo reports
 * zero source files, which reads as a silent clean pass (#2234 — security-craft
 * had the monorepo branch but not the fallback that code-craft already had).
 *
 * Each discoverer still owns its own walk (extension set, test-file and
 * excluded-dir rules differ per skill); only the ROOTS are shared, so a layout
 * one craft can see is a layout every craft can see.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Fallback source roots (relative to the project root) tried, in order, when a
 * project has no `packages/` directory. `src` is the near-universal convention;
 * `app` covers frameworks (Next.js App Router, some Node services) that root
 * code there. Every one that exists as a directory is walked.
 */
export const FALLBACK_SOURCE_ROOTS: ReadonlyArray<string> = ['src', 'app'];

/**
 * The directories a craft discoverer should walk for `projectRoot`.
 *
 * `packagesFilter` restricts the `packages/<pkg>/src` set by package directory
 * name; it has no meaning without a `packages/` directory and is ignored there.
 */
export function resolveSourceRoots(
  projectRoot: string,
  packagesFilter?: ReadonlyArray<string>
): string[] {
  const packagesDir = path.join(projectRoot, 'packages');
  if (!fs.existsSync(packagesDir)) return fallbackRoots(projectRoot);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(packagesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const roots: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('.')) continue;
    if (packagesFilter !== undefined && !packagesFilter.includes(entry.name)) continue;
    const srcDir = path.join(packagesDir, entry.name, 'src');
    if (!fs.existsSync(srcDir)) continue;
    roots.push(srcDir);
  }
  return roots;
}

function fallbackRoots(projectRoot: string): string[] {
  const roots: string[] = [];
  for (const root of FALLBACK_SOURCE_ROOTS) {
    const dir = path.join(projectRoot, root);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    roots.push(dir);
  }
  return roots;
}
