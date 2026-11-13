import * as fs from 'node:fs';
import {
  DEFAULT_AUTONOMY_AUDIT,
  type AutonomyFlag,
  type AutonomyLevel,
  type AutonomyOverrideField,
  type AutonomySessionOverride,
  type AutonomySource,
  type AutonomyUserConfig,
  type ResolvedAutonomy,
} from '@harness-engineering/types';
import { parseUserConfig } from './schema';
import { userConfigPath } from './paths';

export const AUTONOMY_ENV = 'HARNESS_AUTONOMY';
export const AUTONOMY_AUDIT_ENV = 'HARNESS_AUTONOMY_AUDIT';

/**
 * Inputs for resolveAutonomy. User-sourced only (D3): there is deliberately no project path,
 * so project configuration can never influence the result.
 */
export interface ResolveAutonomyInput {
  flag?: AutonomyFlag;
  sessionOverride?: AutonomySessionOverride;
  env?: NodeJS.ProcessEnv;
  /** Defaults to <homeDir>/.harness/config.json. */
  userConfigPath?: string;
  homeDir?: string;
  /** Returns undefined when the file is absent/unreadable. */
  readFile?: (p: string) => string | undefined;
}

interface Picked<T> {
  value: T;
  source: AutonomySource;
}

const AUDIT_ENV_VALUES = new Map<string, boolean>([
  ['on', true],
  ['true', true],
  ['1', true],
  ['off', false],
  ['false', false],
  ['0', false],
]);

function defaultReadFile(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return undefined;
  }
}

/** Flag vs session override. */
function pickUserTier<T>(
  flagValue: T | undefined,
  field: AutonomyOverrideField<T> | undefined
): Picked<T> | undefined {
  if (flagValue !== undefined) return { value: flagValue, source: 'flag' };
  if (field !== undefined) return { value: field.value, source: 'session' };
  return undefined;
}

function readEnvLevel(env: NodeJS.ProcessEnv, warnings: string[]): AutonomyLevel | undefined {
  const raw = env[AUTONOMY_ENV];
  if (raw === undefined || raw.trim() === '') return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'supervised' || v === 'trusted') return v;
  warnings.push(`Ignoring ${AUTONOMY_ENV}="${raw}": expected supervised or trusted.`);
  return undefined;
}

function readEnvAudit(env: NodeJS.ProcessEnv, warnings: string[]): boolean | undefined {
  const raw = env[AUTONOMY_AUDIT_ENV];
  if (raw === undefined || raw.trim() === '') return undefined;
  const v = AUDIT_ENV_VALUES.get(raw.trim().toLowerCase());
  if (v === undefined) {
    warnings.push(`Ignoring ${AUTONOMY_AUDIT_ENV}="${raw}": expected on|off|true|false|1|0.`);
  }
  return v;
}

function loadUserConfig(input: ResolveAutonomyInput, warnings: string[]): AutonomyUserConfig {
  const p =
    input.userConfigPath ??
    userConfigPath(input.homeDir !== undefined ? { homeDir: input.homeDir } : {});
  const raw = (input.readFile ?? defaultReadFile)(p);
  if (raw === undefined) return {};
  const parsed = parseUserConfig(raw);
  if (!parsed.ok) {
    warnings.push(`Ignoring malformed ${p}: ${parsed.error.message}. Using defaults.`);
    return {};
  }
  return parsed.value;
}

function resolveLevel(
  input: ResolveAutonomyInput,
  env: NodeJS.ProcessEnv,
  user: AutonomyUserConfig,
  warnings: string[]
): Picked<AutonomyLevel> {
  const tier = pickUserTier(input.flag?.level, input.sessionOverride?.level);
  if (tier) return tier;
  const fromEnv = readEnvLevel(env, warnings);
  if (fromEnv !== undefined) return { value: fromEnv, source: 'env' };
  const fromUser = user.autonomy?.level;
  if (fromUser !== undefined) return { value: fromUser, source: 'user-config' };
  return { value: 'supervised', source: 'default' };
}

function resolveAudit(
  input: ResolveAutonomyInput,
  env: NodeJS.ProcessEnv,
  user: AutonomyUserConfig,
  level: AutonomyLevel,
  warnings: string[]
): Picked<boolean> {
  const tier = pickUserTier(input.flag?.audit, input.sessionOverride?.audit);
  if (tier) return tier;
  const fromEnv = readEnvAudit(env, warnings);
  if (fromEnv !== undefined) return { value: fromEnv, source: 'env' };
  const fromUser = user.autonomy?.audit?.[level];
  if (fromUser !== undefined) return { value: fromUser, source: 'user-config' };
  return { value: DEFAULT_AUTONOMY_AUDIT[level], source: 'default' };
}

/**
 * Resolve autonomy from user-sourced inputs only (D3): flag > session > env > user config >
 * default, per field. Pure aside from the user-config read. Never throws.
 */
export function resolveAutonomy(input: ResolveAutonomyInput = {}): ResolvedAutonomy {
  const warnings: string[] = [];
  const env = input.env ?? process.env;
  const user = loadUserConfig(input, warnings);
  const level = resolveLevel(input, env, user, warnings);
  const audit = resolveAudit(input, env, user, level.value, warnings);
  return {
    level: level.value,
    audit: audit.value,
    source: { level: level.source, audit: audit.source },
    warnings,
  };
}
