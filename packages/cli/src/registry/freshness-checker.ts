import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { isUpdateCheckEnabled } from '@harness-engineering/core';
import type { SkillSource } from './lockfile';

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

// ---------------------------------------------------------------------------
// Comparison — pure, unit-tested. The detached probe (spawnBackgroundFreshnessCheck)
// inlines the identical trivial `!==` comparison because a `node -e` string cannot
// import project TS; this mirrors how update-checker.ts inlines its write logic.
// ---------------------------------------------------------------------------

/**
 * Builds a provider record for a lockfile entry, or returns null to skip it.
 * Skips: no source (legacy v1), kind 'local' (recorded, never probed), and any
 * unrecognized kind (defensive against future/legacy lockfiles).
 * `latest === null` (failed probe) is fail-safe: outdated is false.
 */
export function evaluateEntry(
  name: string,
  source: SkillSource | undefined,
  entryVersion: string,
  latest: string | null
): FreshnessProvider | null {
  if (!source) return null;
  if (source.kind === 'github') {
    return { name, kind: 'github', current: source.commit, latest, outdated: latest != null && latest !== source.commit };
  }
  if (source.kind === 'npm') {
    return { name, kind: 'npm', current: entryVersion, latest, outdated: latest != null && latest !== entryVersion };
  }
  return null; // local or unrecognized kind
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * Returns a one-line nudge naming the count of outdated providers, or null
 * when the state is absent or nothing is outdated.
 */
export function getFreshnessNotification(): string | null {
  const state = readFreshnessState();
  if (!state) return null;
  const n = state.providers.filter((p) => p.outdated).length;
  if (n === 0) return null;
  const noun = n === 1 ? 'provider' : 'providers';
  const verb = n === 1 ? 'has' : 'have';
  return `${n} skill ${noun} ${verb} updates — run \`harness skill update\``;
}
