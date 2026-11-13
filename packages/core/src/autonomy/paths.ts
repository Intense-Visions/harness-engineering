import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';

/** Injected path inputs; production defaults read os.homedir() and the real filesystem. */
export interface AutonomyPathOptions {
  homeDir?: string;
  realpath?: (p: string) => string;
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

/** sha256 of the normalized repo-root realpath, first 16 hex chars (D12). */
export function computeRepoKey(projectPath: string, opts: AutonomyPathOptions = {}): string {
  const real = (opts.realpath ?? defaultRealpath)(projectPath).replaceAll('\\', '/');
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
