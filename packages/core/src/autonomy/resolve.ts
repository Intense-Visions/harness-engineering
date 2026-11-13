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

function sessionIsNewer(flagAt: string | undefined, setAt: string): boolean {
  if (flagAt === undefined) return false;
  const f = Date.parse(flagAt);
  const s = Date.parse(setAt);
  if (Number.isNaN(f) || Number.isNaN(s)) return false;
  return s > f;
}

/** Flag vs session override: the more recent wins; a flag without a parseable `at` wins (D3). */
function pickUserTier<T>(
  flagValue: T | undefined,
  flagAt: string | undefined,
  field: AutonomyOverrideField<T> | undefined
): Picked<T> | undefined {
  if (flagValue !== undefined && field !== undefined) {
    return sessionIsNewer(flagAt, field.setAt)
      ? { value: field.value, source: 'session' }
      : { value: flagValue, source: 'flag' };
  }
  if (flagValue !== undefined) return { value: flagValue, source: 'flag' };
  if (field !== undefined) return { value: field.value, source: 'session' };
  return undefined;
}

const ENV_RAISE_HINT =
  'the environment may only lower autonomy (D13: .env files and agent settings can set it). ' +
  'Raise with ~/.harness/config.json or an interactive `harness autonomy set`.';

/** Lower-only (D13): `supervised` is honoured; `trusted` is ignored with a warning naming it. */
function readEnvLevel(env: NodeJS.ProcessEnv, warnings: string[]): AutonomyLevel | undefined {
  const raw = env[AUTONOMY_ENV];
  if (raw === undefined || raw.trim() === '') return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'supervised') return v;
  if (v === 'trusted') {
    warnings.push(`Ignoring ${AUTONOMY_ENV}="${raw}": ${ENV_RAISE_HINT}`);
    return undefined;
  }
  warnings.push(`Ignoring ${AUTONOMY_ENV}="${raw}": expected supervised (env may only lower).`);
  return undefined;
}

/** Lower-only (D13): audit on is honoured; off is ignored with a warning naming it. */
function readEnvAudit(env: NodeJS.ProcessEnv, warnings: string[]): true | undefined {
  const raw = env[AUTONOMY_AUDIT_ENV];
  if (raw === undefined || raw.trim() === '') return undefined;
  const v = AUDIT_ENV_VALUES.get(raw.trim().toLowerCase());
  if (v === true) return true;
  if (v === false) {
    warnings.push(`Ignoring ${AUTONOMY_AUDIT_ENV}="${raw}": ${ENV_RAISE_HINT}`);
    return undefined;
  }
  warnings.push(
    `Ignoring ${AUTONOMY_AUDIT_ENV}="${raw}": expected on|true|1 (env may only lower).`
  );
  return undefined;
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
  const tier = pickUserTier(input.flag?.level, input.flag?.at, input.sessionOverride?.level);
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
  const tier = pickUserTier(input.flag?.audit, input.flag?.at, input.sessionOverride?.audit);
  if (tier) return tier;
  const fromEnv = readEnvAudit(env, warnings);
  if (fromEnv !== undefined) return { value: fromEnv, source: 'env' };
  const fromUser = user.autonomy?.audit?.[level];
  if (fromUser !== undefined) return { value: fromUser, source: 'user-config' };
  return { value: DEFAULT_AUTONOMY_AUDIT[level], source: 'default' };
}

/**
 * Resolve autonomy (D3): flag > session > env > user config > default, per field. The env tier
 * is lower-only (D13). Pure aside from the user-config read. Never throws.
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
