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
export function readIdentity(projectRoot: string): TelemetryIdentity {
  const identity: TelemetryIdentity = {};

  // Primary source: .harness/telemetry.json
  const filePath = path.join(projectRoot, '.harness', 'telemetry.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.identity) {
      const { project, team, alias } = parsed.identity;
      if (typeof project === 'string') identity.project = project;
      if (typeof team === 'string') identity.team = team;
      if (typeof alias === 'string') identity.alias = alias;
    }
  } catch {
    // Missing or malformed — continue with fallbacks
  }

  // Fallback: project name from harness.config.json
  if (!identity.project) {
    try {
      const configPath = path.join(projectRoot, 'harness.config.json');
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      if (typeof config?.name === 'string') identity.project = config.name;
    } catch {
      // Missing or malformed — skip
    }
  }

  // Fallback: alias from git config user.name
  if (!identity.alias) {
    try {
      const gitName = execFileSync('git', ['config', 'user.name'], {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (gitName) identity.alias = gitName;
    } catch {
      // Git not available or no user.name set — skip
    }
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
