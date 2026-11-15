import {
  DEFAULT_AUTONOMY_AUDIT,
  type AutonomySessionOverride,
  type ResolvedAutonomy,
} from '@harness-engineering/types';
import { resolveAutonomy, type ResolveAutonomyInput } from './resolve';
import { readSessionOverride, type OverrideStoreOptions } from './override-store';
import { sessionDirForRaise } from './paths';

export interface ResolveForSessionInput
  extends Omit<ResolveAutonomyInput, 'sessionOverride'>, OverrideStoreOptions {
  /** Used only to key the home-dir override (repoKey); project files are never read. */
  projectPath: string;
  session?: string;
}

/**
 * Read the session's home-dir override (if any) and resolve. Never throws (S1): any internal
 * failure (an unreadable path, a throwing injected reader, a non-string session from an
 * untrusted caller) resolves to the supervised default with the error as a warning. Failing
 * to resolve never grants autonomy, even over a trusted flag.
 */
export function resolveAutonomyForSession(input: ResolveForSessionInput): ResolvedAutonomy {
  try {
    return resolveOrThrow(input);
  } catch (err) {
    return {
      level: 'supervised',
      audit: DEFAULT_AUTONOMY_AUDIT.supervised,
      source: { level: 'default', audit: 'default' },
      warnings: [
        `Autonomy resolution failed; using the supervised default: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

interface SessionInputs {
  warnings: string[];
  sessionOverride?: AutonomySessionOverride;
  raiseSessionError?: () => string | undefined;
}

/** Read the named session's override, degrading an unreadable one to a warning. */
function readSessionInputs(input: ResolveForSessionInput): SessionInputs {
  if (input.session === undefined) return { warnings: [] };
  const slug = input.session;
  // D14 at read time: a raise is honoured only where its session dir exists in THIS worktree.
  const raiseSessionError = (): string | undefined => {
    const dir = sessionDirForRaise(input.projectPath, slug);
    return dir.ok ? undefined : dir.error.message;
  };
  const read = readSessionOverride(input.projectPath, slug, input);
  if (!read.ok) {
    return { warnings: [`Session override unavailable: ${read.error.message}`], raiseSessionError };
  }
  return {
    warnings: [...read.value.warnings],
    ...(read.value.override && { sessionOverride: read.value.override }),
    raiseSessionError,
  };
}

/** Copy only the keys the caller set, so `resolveAutonomy` sees absent, not `undefined`. */
function definedOnly<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function resolveOrThrow(input: ResolveForSessionInput): ResolvedAutonomy {
  const { warnings, sessionOverride, raiseSessionError } = readSessionInputs(input);
  const resolved = resolveAutonomy(
    definedOnly({
      flag: input.flag,
      sessionOverride,
      env: input.env,
      userConfigPath: input.userConfigPath,
      homeDir: input.homeDir,
      readFile: input.readFile,
      now: input.now,
      raiseSessionError,
    })
  );
  return { ...resolved, warnings: [...warnings, ...resolved.warnings] };
}
