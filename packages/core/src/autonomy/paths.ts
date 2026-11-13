import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { sessionSlugError } from '../shared/session-slug';

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

/** Append-only log of every successful raise (D16). */
export function autonomyAuditLogPath(opts: AutonomyPathOptions = {}): string {
  return path.join(harnessHomeDir(opts), 'autonomy-audit.log');
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

/** The shared session-slug rule (S2); kept as a named export for autonomy callers. */
export function validateOverrideSlug(slug: string): Result<string, Error> {
  const error = sessionSlugError(slug);
  return error === null ? Ok(slug) : Err(new Error(error));
}

/** True when `p` exists and is a directory. */
export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export const AUTONOMY_SESSION_NOT_FOUND = 'AUTONOMY_SESSION_NOT_FOUND';

export class AutonomySessionNotFoundError extends Error {
  readonly code = AUTONOMY_SESSION_NOT_FOUND;
  constructor(slug: string, dir: string) {
    super(
      `Refusing to raise autonomy for session "${slug}": ${dir} does not exist. A raise is bound ` +
        'to a live session (D14); start the session first, or check the slug.'
    );
    this.name = 'AutonomySessionNotFoundError';
  }
}

/**
 * `<project root>/.harness/sessions/<slug>`: the resolveSessionDir layout, rooted at the git
 * toplevel (per worktree). Validates the slug; does not check that the directory exists.
 */
export function sessionDirPath(
  projectPath: string,
  slug: string,
  opts: AutonomyPathOptions = {}
): Result<string, Error> {
  const valid = validateOverrideSlug(slug);
  if (!valid.ok) return valid;
  return Ok(path.join(resolveProjectRoot(projectPath, opts), '.harness', 'sessions', slug));
}

/**
 * The session directory a raise is bound to (D14): `<project root>/.harness/sessions/<slug>/`,
 * where the root is the git toplevel (per worktree). Err unless it exists as a directory.
 */
export function sessionDirForRaise(
  projectPath: string,
  slug: string,
  opts: AutonomyPathOptions = {}
): Result<string, Error> {
  const dir = sessionDirPath(projectPath, slug, opts);
  if (!dir.ok) return dir;
  return isDirectory(dir.value) ? dir : Err(new AutonomySessionNotFoundError(slug, dir.value));
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
