import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Walk up from a given start directory to find a directory by name.
 * Uses a marker file/dir to distinguish from same-named code directories.
 */
export function findUpFrom(
  startDir: string,
  targetName: string,
  marker: string,
  maxLevels: number
): string | null {
  let dir = startDir;
  for (let i = 0; i < maxLevels; i++) {
    const candidate = path.join(dir, targetName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      if (fs.existsSync(path.join(candidate, marker))) {
        return candidate;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * Walk up from the current file to find a directory by name.
 * Uses a marker file/dir to distinguish from same-named code directories.
 * Works for both src (vitest) and dist (compiled) contexts.
 */
function findUpDir(targetName: string, marker: string, maxLevels = 8): string | null {
  // First try from the compiled module location (works in monorepo dev and bundled dist)
  const fromModule = findUpFrom(__dirname, targetName, marker, maxLevels);
  if (fromModule) return fromModule;
  // Fallback: search from cwd (works when running via npx from project root)
  return findUpFrom(process.cwd(), targetName, marker, maxLevels);
}

export function resolveTemplatesDir(): string {
  // Look for templates/ dir containing base/template.json (not src/templates/ which has code)
  // Walk up first (works in monorepo dev), then fall back to bundled templates in dist/
  return findUpDir('templates', 'base') ?? path.join(__dirname, 'templates');
}

export function resolvePersonasDir(): string {
  // Walk up first (works in monorepo dev), then fall back to bundled agents in dist/
  const agentsDir = findUpDir('agents', 'personas');
  if (agentsDir) {
    return path.join(agentsDir, 'personas');
  }
  return path.join(__dirname, 'agents', 'personas');
}

/**
 * Resolve the PROJECT's `agents/personas` dir by walking up from cwd. Returns
 * null when the project has none — unlike {@link resolvePersonasDir}, it never
 * falls back to the CLI's bundled personas (in `dist`/`node_modules`). Callers
 * that WRITE into the project (e.g. `persona sync-workflows`) use this so they
 * never generate the harness's own bundled personas into an adopter's tree.
 */
export function resolveProjectPersonasDir(cwd?: string): string | null {
  const agentsDir = findUpFrom(cwd ?? process.cwd(), 'agents', 'personas', 8);
  return agentsDir ? path.join(agentsDir, 'personas') : null;
}

export function resolveSkillsDir(): string {
  // Walk up first (works in monorepo dev), then fall back to bundled agents in dist/
  const agentsDir = findUpDir('agents', 'skills');
  if (agentsDir) {
    return path.join(agentsDir, 'skills', 'claude-code');
  }
  return path.join(__dirname, 'agents', 'skills', 'claude-code');
}

/**
 * Resolve project-level skills directory by walking up from cwd.
 * Returns null if no project agents/skills/ directory is found.
 */
export function resolveProjectSkillsDir(cwd?: string): string | null {
  let dir = cwd ?? process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'agents', 'skills', 'claude-code');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      // Verify this looks like a real skills directory by checking for the parent
      // agents/skills/ marker (consistent with findUpDir pattern)
      const agentsDir = path.join(dir, 'agents');
      if (fs.existsSync(path.join(agentsDir, 'skills'))) {
        return candidate;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolve the global (bundled) skills directory shipped with the CLI package.
 */
export function resolveGlobalSkillsDir(): string {
  const agentsDir = findUpDir('agents', 'skills');
  if (agentsDir) {
    return path.join(agentsDir, 'skills', 'claude-code');
  }
  return path.join(__dirname, 'agents', 'skills', 'claude-code');
}

/**
 * Resolve the community-installed skills directory.
 * Community skills live under agents/skills/community/{platform}/.
 */
export function resolveCommunitySkillsDir(platform: string = 'claude-code'): string {
  const agentsDir = findUpDir('agents', 'skills');
  if (agentsDir) {
    return path.join(agentsDir, 'skills', 'community', platform);
  }
  return path.join(__dirname, 'agents', 'skills', 'community', platform);
}

/**
 * Resolve the global community skills directory.
 * Global community skills live under ~/.harness/skills/community/{platform}/
 * and are available to all harness projects on this machine.
 */
export function resolveGlobalCommunitySkillsDir(platform: string = 'claude-code'): string {
  return path.join(os.homedir(), '.harness', 'skills', 'community', platform);
}

/**
 * Resolve the global community skills base directory (no platform suffix).
 * Used by the install command to place skills for multiple platforms.
 */
export function resolveGlobalCommunityBaseDir(): string {
  return path.join(os.homedir(), '.harness', 'skills', 'community');
}

/**
 * Resolve all skill directories in priority order:
 * 1. Project-local (highest priority)
 * 2. Community-installed
 * 3. Bundled/global (fallback)
 *
 * Only directories that exist on disk are included.
 * The existing resolveSkillsDir() is unchanged for backward compatibility.
 */
export function resolveAllSkillsDirs(platform: string = 'claude-code'): string[] {
  return resolveAllSkillsDirsWithSource(platform).map((d) => d.dir);
}

/** A skills directory paired with the provenance of the skills inside it. */
export interface SkillsDirWithSource {
  dir: string;
  source: 'project' | 'community' | 'bundled';
}

/**
 * Resolve all skill directories with their provenance, in priority order
 * (project > community > bundled). Only directories that exist are included.
 *
 * Provenance travels with each directory rather than being inferred from array
 * position: positional mapping mislabels entries whenever a higher-priority
 * directory is absent (e.g. a downstream repo with no project skills had its
 * bundled catalog labeled `source:"project"` — issue #902).
 *
 * When `projectRoot` is given, the project-local directory is resolved against
 * it (`<projectRoot>/agents/skills/<platform>`) so downstream repos are indexed
 * even when the process cwd is elsewhere; otherwise it is found by walking up
 * from cwd as before.
 */
export function resolveAllSkillsDirsWithSource(
  platform: string = 'claude-code',
  projectRoot?: string
): SkillsDirWithSource[] {
  const dirs: SkillsDirWithSource[] = [];

  // 1. Project-local (highest priority)
  const projectDir = projectRoot
    ? path.join(projectRoot, 'agents', 'skills', platform)
    : (() => {
        const found = resolveProjectSkillsDir();
        return found ? path.join(path.dirname(found), platform) : null;
      })();
  if (projectDir && fs.existsSync(projectDir)) {
    dirs.push({ dir: projectDir, source: 'project' });
  }

  // 2. Community-installed
  const communityDir = resolveCommunitySkillsDir(platform);
  if (fs.existsSync(communityDir)) {
    dirs.push({ dir: communityDir, source: 'community' });
  }

  // 3. Bundled/global (fallback)
  const globalDir = resolveGlobalSkillsDir();
  const globalPlatformDir = path.join(path.dirname(globalDir), platform);
  if (fs.existsSync(globalPlatformDir)) {
    // Avoid duplicating project dir if they resolve to the same path
    if (!dirs.some((d) => path.resolve(d.dir) === path.resolve(globalPlatformDir))) {
      dirs.push({ dir: globalPlatformDir, source: 'bundled' });
    }
  }

  return dirs;
}

/**
 * Resolve a single skill directory by name across all skill sources.
 *
 * Searches in priority order (project-local -> community -> bundled), returning
 * the first `<dir>/<name>` that exists as a directory. This mirrors how
 * `skill list` discovers skills, so `skill info`/`skill run` resolve the same
 * project-local skills that `skill list --local` surfaces (issue #587).
 *
 * Returns null if no source contains the named skill.
 */
export function resolveSkillDir(name: string, platform: string = 'claude-code'): string | null {
  for (const dir of resolveAllSkillsDirs(platform)) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}
