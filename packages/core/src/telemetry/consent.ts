import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { ConsentState, TelemetryConfig, TelemetryIdentity } from '@harness-engineering/types';
import { getOrCreateInstallId } from './install-id';

/**
 * Reads optional identity fields from `.harness/telemetry.json`,
 * with fallbacks from harness.config.json (project name) and git config (alias).
 * Returns empty object if no sources are available.
 */
function parseIdentityFromTelemetryFile(filePath: string): TelemetryIdentity {
  const identity: TelemetryIdentity = {};
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const src = parsed?.identity;
    if (!src || typeof src !== 'object') return identity;
    if (typeof src.project === 'string') identity.project = src.project;
    if (typeof src.team === 'string') identity.team = src.team;
    if (typeof src.alias === 'string') identity.alias = src.alias;
  } catch {
    // Missing or malformed — continue with fallbacks
  }
  return identity;
}

function readProjectNameFallback(configPath: string): string | undefined {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    return typeof config?.name === 'string' ? config.name : undefined;
  } catch {
    return undefined;
  }
}

function readGitAliasFallback(cwd: string): string | undefined {
  try {
    const gitName = execFileSync('git', ['config', 'user.name'], {
      cwd,
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return gitName || undefined;
  } catch {
    return undefined;
  }
}

export function readIdentity(projectRoot: string): TelemetryIdentity {
  const filePath = path.join(projectRoot, '.harness', 'telemetry.json');
  const identity = parseIdentityFromTelemetryFile(filePath);

  if (!identity.project) {
    const fallbackProject = readProjectNameFallback(path.join(projectRoot, 'harness.config.json'));
    if (fallbackProject) identity.project = fallbackProject;
  }

  if (!identity.alias) {
    const fallbackAlias = readGitAliasFallback(projectRoot);
    if (fallbackAlias) identity.alias = fallbackAlias;
  }

  return identity;
}

/**
 * Resolves telemetry consent by checking (in order):
 * 1. DO_NOT_TRACK=1 env var (ecosystem standard)
 * 2. HARNESS_TELEMETRY_OPTOUT=1 env var
 * 3. config.enabled (from harness.config.json telemetry section)
 *
 * If allowed, reads install ID and optional identity fields.
 */
export function resolveConsent(
  projectRoot: string,
  config: TelemetryConfig | undefined
): ConsentState {
  // Env vars always win
  if (process.env.DO_NOT_TRACK === '1') return { allowed: false };
  if (process.env.HARNESS_TELEMETRY_OPTOUT === '1') return { allowed: false };

  // Config check (default to enabled)
  const enabled = config?.enabled ?? true;
  if (!enabled) return { allowed: false };

  // Telemetry is allowed -- gather identity and install ID
  const installId = getOrCreateInstallId(projectRoot);
  const identity = readIdentity(projectRoot);

  return { allowed: true, installId, identity };
}
