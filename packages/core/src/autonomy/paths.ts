import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';

/** Injected path inputs; production defaults read os.homedir() and the real filesystem. */
export interface AutonomyPathOptions {
  homeDir?: string;
  realpath?: (p: string) => string;
  /** Git toplevel containing `p`, or undefined when `p` is not in a work tree. */
  gitToplevel?: (p: string) => string | undefined;
  /** Absolute git common dir for `p` (shared by every worktree), or undefined outside a repo. */
  gitCommonDir?: (p: string) => string | undefined;
}

export function harnessHomeDir(opts: AutonomyPathOptions = {}): string {
  return path.join(opts.homeDir ?? os.homedir(), '.harness');
}

export function userConfigPath(opts: AutonomyPathOptions = {}): string {
  return path.join(harnessHomeDir(opts), 'config.json');
}

function defaultRealpath(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

/** Repo-location vars a parent process (e.g. a git hook) may set; they would override `cwd`. */
const GIT_LOCATION_ENV = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_OBJECT_DIRECTORY',
];

function runGit(p: string, args: string[]): string | undefined {
  const env = { ...process.env };
  for (const k of GIT_LOCATION_ENV) delete env[k];
  try {
    const out = execFileSync('git', args, {
      cwd: p,
      env,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    }).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

function defaultGitToplevel(p: string): string | undefined {
  return runGit(p, ['rev-parse', '--show-toplevel']);
}

function defaultGitCommonDir(p: string): string | undefined {
  const out = runGit(p, ['rev-parse', '--git-common-dir']);
  // Older git prints the common dir relative to cwd (e.g. ".git").
  return out === undefined ? undefined : path.resolve(p, out);
}

/**
 * The project root for `projectPath`: its git toplevel, or `projectPath` itself when it is not
 * in a git work tree (or git is unavailable). Each git worktree is its own toplevel, so this is
 * where that worktree's `.harness/sessions/` lives. Override keys use computeRepoKey (D15).
 */
export function resolveProjectRoot(projectPath: string, opts: AutonomyPathOptions = {}): string {
  return (opts.gitToplevel ?? defaultGitToplevel)(projectPath) ?? projectPath;
}

/**
 * sha256 of the realpath of the repo's git common dir, first 16 hex chars (D15). Every worktree
 * of a repo shares the common dir, so a human lowering in the main checkout reaches agents in
 * sibling worktrees. Outside a repo (or without git) the given path is hashed instead.
 */
export function computeRepoKey(projectPath: string, opts: AutonomyPathOptions = {}): string {
  const anchor = (opts.gitCommonDir ?? defaultGitCommonDir)(projectPath) ?? projectPath;
  const real = (opts.realpath ?? defaultRealpath)(anchor).replaceAll('\\', '/');
  return createHash('sha256').update(real).digest('hex').slice(0, 16);
}

export function validateOverrideSlug(slug: string): Result<string, Error> {
  if (!slug || slug.trim() === '') return Err(new Error('Session slug must not be empty'));
  if (/\.\.|[/\\:]/.test(slug)) {
    return Err(new Error(`Invalid session slug '${slug}': must not contain path characters`));
  }
  return Ok(slug);
}

export function sessionOverridePath(
  projectPath: string,
  slug: string,
  opts: AutonomyPathOptions = {}
): Result<string, Error> {
  const valid = validateOverrideSlug(slug);
  if (!valid.ok) return valid;
  return Ok(
    path.join(
      harnessHomeDir(opts),
      'session-overrides',
      computeRepoKey(projectPath, opts),
      `${slug}.json`
    )
  );
}
