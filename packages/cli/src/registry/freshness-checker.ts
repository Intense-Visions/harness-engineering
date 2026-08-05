import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { isUpdateCheckEnabled } from '@harness-engineering/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FreshnessProvider {
  name: string;
  kind: 'github' | 'npm';
  current: string;
  latest: string | null;
  outdated: boolean;
}

export interface FreshnessState {
  lastCheckTime: number;
  providers: FreshnessProvider[];
}

function getStatePath(): string {
  const home = process.env['HOME'] || os.homedir();
  return path.join(home, '.harness', 'skill-freshness.json');
}

// ---------------------------------------------------------------------------
// Gating — reuse the CLI-version update-check switches so a single
// HARNESS_NO_UPDATE_CHECK / interval controls all background network probes.
// ---------------------------------------------------------------------------

export const isFreshnessCheckEnabled = isUpdateCheckEnabled;

/** Re-expresses core's shouldRunCheck for the freshness state shape. */
export function shouldRunFreshnessCheck(state: FreshnessState | null, intervalMs: number): boolean {
  if (state === null) return true;
  return state.lastCheckTime + intervalMs <= Date.now();
}

// ---------------------------------------------------------------------------
// State IO + validation
// ---------------------------------------------------------------------------

function isValidProvider(p: unknown): p is FreshnessProvider {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as FreshnessProvider).name === 'string' &&
    ((p as FreshnessProvider).kind === 'github' || (p as FreshnessProvider).kind === 'npm') &&
    typeof (p as FreshnessProvider).current === 'string' &&
    (typeof (p as FreshnessProvider).latest === 'string' || (p as FreshnessProvider).latest === null) &&
    typeof (p as FreshnessProvider).outdated === 'boolean'
  );
}

/**
 * Reads ~/.harness/skill-freshness.json. Returns null if the file is missing,
 * unreadable, or mis-shaped. Malformed provider entries are dropped.
 */
export function readFreshnessState(): FreshnessState | null {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'lastCheckTime' in parsed &&
      typeof (parsed as FreshnessState).lastCheckTime === 'number' &&
      'providers' in parsed &&
      Array.isArray((parsed as FreshnessState).providers)
    ) {
      return {
        lastCheckTime: (parsed as FreshnessState).lastCheckTime,
        providers: ((parsed as FreshnessState).providers as unknown[]).filter(isValidProvider),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Atomically writes state (tmp-file + rename), mirroring update-checker. */
export function writeFreshnessState(state: FreshnessState): void {
  const statePath = getStatePath();
  const stateDir = path.dirname(statePath);
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpFile = path.join(stateDir, '.skill-freshness-' + crypto.randomBytes(4).toString('hex') + '.tmp');
  fs.writeFileSync(tmpFile, JSON.stringify(state), { mode: 0o644 });
  fs.renameSync(tmpFile, statePath);
}
