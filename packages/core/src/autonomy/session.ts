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

function resolveOrThrow(input: ResolveForSessionInput): ResolvedAutonomy {
  const warnings: string[] = [];
  let sessionOverride: AutonomySessionOverride | undefined;
  let raiseSessionError: (() => string | undefined) | undefined;
  if (input.session !== undefined) {
    const slug = input.session;
    // D14 at read time: a raise is honoured only where its session dir exists in THIS worktree.
    raiseSessionError = () => {
      const dir = sessionDirForRaise(input.projectPath, slug, input);
      return dir.ok ? undefined : dir.error.message;
    };
    const read = readSessionOverride(input.projectPath, input.session, input);
    if (!read.ok) {
      warnings.push(`Session override unavailable: ${read.error.message}`);
    } else {
      warnings.push(...read.value.warnings);
      if (read.value.override) sessionOverride = read.value.override;
    }
  }
  const resolved = resolveAutonomy({
    ...(input.flag !== undefined && { flag: input.flag }),
    ...(sessionOverride !== undefined && { sessionOverride }),
    ...(input.env !== undefined && { env: input.env }),
    ...(input.userConfigPath !== undefined && { userConfigPath: input.userConfigPath }),
    ...(input.homeDir !== undefined && { homeDir: input.homeDir }),
    ...(input.readFile !== undefined && { readFile: input.readFile }),
    ...(input.now !== undefined && { now: input.now }),
    ...(raiseSessionError !== undefined && { raiseSessionError }),
  });
  return { ...resolved, warnings: [...warnings, ...resolved.warnings] };
}
