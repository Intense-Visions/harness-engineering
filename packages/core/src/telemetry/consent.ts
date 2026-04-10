import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConsentState, TelemetryConfig, TelemetryIdentity } from '@harness-engineering/types';
import { getOrCreateInstallId } from './install-id';

/**
 * Reads optional identity fields from `.harness/telemetry.json`.
 * Returns empty object if the file is missing or malformed.
 */
function readIdentity(projectRoot: string): TelemetryIdentity {
  const filePath = path.join(projectRoot, '.harness', 'telemetry.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.identity) {
      const { project, team, alias } = parsed.identity;
      const identity: TelemetryIdentity = {};
      if (typeof project === 'string') identity.project = project;
      if (typeof team === 'string') identity.team = team;
      if (typeof alias === 'string') identity.alias = alias;
      return identity;
    }
    return {};
  } catch {
    return {};
  }
}

const DISALLOWED: ConsentState = { allowed: false, identity: {}, installId: '' };

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
  if (process.env.DO_NOT_TRACK === '1') return DISALLOWED;
  if (process.env.HARNESS_TELEMETRY_OPTOUT === '1') return DISALLOWED;

  // Config check (default to enabled)
  const enabled = config?.enabled ?? true;
  if (!enabled) return DISALLOWED;

  // Telemetry is allowed -- gather identity and install ID
  const installId = getOrCreateInstallId(projectRoot);
  const identity = readIdentity(projectRoot);

  return { allowed: true, installId, identity };
}
