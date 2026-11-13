import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AutonomyOverrideOrigin,
  AutonomySessionOverride,
  AutonomySetting,
} from '@harness-engineering/types';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { parseSessionOverride, validateAutonomySetting } from './schema';
import { sessionOverridePath, type AutonomyPathOptions } from './paths';

export interface OverrideStoreOptions extends AutonomyPathOptions {
  now?: () => Date;
  readFile?: (p: string) => string | undefined;
}

export interface ReadOverrideResult {
  override: AutonomySessionOverride | null;
  warnings: string[];
}

function defaultReadFile(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return undefined;
  }
}

export function readSessionOverride(
  projectPath: string,
  slug: string,
  opts: OverrideStoreOptions = {}
): Result<ReadOverrideResult, Error> {
  const p = sessionOverridePath(projectPath, slug, opts);
  if (!p.ok) return p;
  const raw = (opts.readFile ?? defaultReadFile)(p.value);
  if (raw === undefined) return Ok({ override: null, warnings: [] });
  const parsed = parseSessionOverride(raw);
  if (!parsed.ok) {
    return Ok({
      override: null,
      warnings: [`Ignoring malformed session override ${p.value}: ${parsed.error.message}`],
    });
  }
  return Ok({ override: parsed.value, warnings: [] });
}

function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * Merge `change` into the session override. Each written field gets its own setAt/origin;
 * untouched fields keep theirs. The change is schema-validated (a mistyped value is rejected,
 * never written). No raise/lower policy here: callers enforce it
 * (writeLoweringOverride for agent paths, the CLI TTY gate for raises).
 */
export function writeSessionOverride(
  projectPath: string,
  slug: string,
  change: AutonomySetting,
  origin: AutonomyOverrideOrigin,
  opts: OverrideStoreOptions = {}
): Result<AutonomySessionOverride, Error> {
  const valid = validateAutonomySetting(change);
  if (!valid.ok) return valid;
  if (change.level === undefined && change.audit === undefined) {
    return Err(new Error('An autonomy override requires level and/or audit'));
  }
  const p = sessionOverridePath(projectPath, slug, opts);
  if (!p.ok) return p;
  const current = readSessionOverride(projectPath, slug, opts);
  if (!current.ok) return current;
  const setAt = (opts.now ?? (() => new Date()))().toISOString();
  const next: AutonomySessionOverride = {
    ...(current.value.override ?? {}),
    ...(change.level !== undefined && { level: { value: change.level, setAt, origin } }),
    ...(change.audit !== undefined && { audit: { value: change.audit, setAt, origin } }),
  };
  try {
    atomicWrite(p.value, `${JSON.stringify(next, null, 2)}\n`);
  } catch (err) {
    return Err(err instanceof Error ? err : new Error(String(err)));
  }
  return Ok(next);
}
