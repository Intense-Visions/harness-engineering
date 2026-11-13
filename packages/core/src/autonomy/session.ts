import type { AutonomySessionOverride, ResolvedAutonomy } from '@harness-engineering/types';
import { resolveAutonomy, type ResolveAutonomyInput } from './resolve';
import { readSessionOverride, type OverrideStoreOptions } from './override-store';

export interface ResolveForSessionInput
  extends Omit<ResolveAutonomyInput, 'sessionOverride'>, OverrideStoreOptions {
  /** Used only to key the home-dir override (repoKey); project files are never read. */
  projectPath: string;
  session?: string;
}

/** Read the session's home-dir override (if any) and resolve. Never throws. */
export function resolveAutonomyForSession(input: ResolveForSessionInput): ResolvedAutonomy {
  const warnings: string[] = [];
  let sessionOverride: AutonomySessionOverride | undefined;
  if (input.session !== undefined) {
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
  });
  return { ...resolved, warnings: [...warnings, ...resolved.warnings] };
}
