import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
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

/**
 * Atomically writes state (tmp-file + rename), mirroring update-checker.
 *
 * NOTE (reference mirror — see FIX #3 / buildProbeScript): the shipped write
 * path lives inline in the detached child produced by buildProbeScript(), which
 * cannot import project TS. This function is the tested reference mirror of that
 * inlined logic (same tmp-file + rename + 0o644 shape). Keep the two in sync —
 * a divergence here means the child's on-disk format drifts from what
 * readFreshnessState() expects.
 */
export function writeFreshnessState(state: FreshnessState): void {
  const statePath = getStatePath();
  const stateDir = path.dirname(statePath);
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpFile = path.join(stateDir, '.skill-freshness-' + crypto.randomBytes(4).toString('hex') + '.tmp');
  fs.writeFileSync(tmpFile, JSON.stringify(state), { mode: 0o644 });
  fs.renameSync(tmpFile, statePath);
}

// ---------------------------------------------------------------------------
// Comparison — pure, unit-tested reference mirror.
//
// The shipped probe path lives inline in the detached child string built by
// buildProbeScript() below, because a `node -e` string cannot import project TS
// (this mirrors how core/update-checker.ts inlines its write logic). evaluateEntry
// re-expresses that child's skip rules and `!==` comparison in importable TS so
// they can be unit-tested directly. buildProbeScript's own end-to-end test guards
// the shipped copy; keep the two in sync — a divergence means the child probes
// entries evaluateEntry would skip, or classifies outdated differently.
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

// ---------------------------------------------------------------------------
// Background probe
// ---------------------------------------------------------------------------

/**
 * Hard cap on how many providers a single background run will probe. Bounds the
 * subprocess storm a maliciously large lockfile (thousands of entries) could
 * otherwise trigger — cheap DoS hardening (FIX #4). Non-probeable entries
 * (local / unrecognized / skipped) do not count against this cap.
 */
export const MAX_PROVIDERS = 100;

/**
 * Total wall-clock budget across all probes in a single run. Checked between
 * probes so, combined with MAX_PROVIDERS, the detached child can never run for
 * an unbounded time (FIX #4). A run stops probing once this elapses; whatever
 * was collected so far is still written.
 */
export const PROBE_BUDGET_MS = 120_000;

/**
 * Builds the self-contained `node -e` script body for the detached freshness
 * probe. Extracted as a pure, testable builder (FIX #2) so the *shipped* probe
 * logic — not just a parallel copy — can be exercised end-to-end against stub
 * git/npm executables. The returned string must remain self-contained: it
 * cannot import project TS and must swallow every error so the user never sees
 * a failure. Uses execFileSync (argument arrays, no shell) so lockfile-sourced
 * strings are never shell-interpolated.
 */
export function buildProbeScript(lockfilePaths: string[], statePath: string, stateDir: string): string {
  return `
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
try {
  const lockfilePaths = ${JSON.stringify(lockfilePaths)};
  const statePath = ${JSON.stringify(statePath)};
  const stateDir = ${JSON.stringify(stateDir)};
  const MAX_PROVIDERS = ${MAX_PROVIDERS};
  const PROBE_BUDGET_MS = ${PROBE_BUDGET_MS};
  // Argument-injection defense-in-depth (FIX #1): a leading '-' in any
  // lockfile-sourced value would be parsed by git/npm as an option flag rather
  // than a positional value. execFileSync already avoids the shell, but a
  // hostile lockfile could still smuggle flags this way, so skip such entries.
  const dash = (v) => typeof v === 'string' && v.charAt(0) === '-';
  const providers = [];
  const startedAt = Date.now();
  let probed = 0;
  outer:
  for (const lp of lockfilePaths) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(lp, 'utf-8')); } catch (_) { continue; }
    const skills = parsed && parsed.skills ? parsed.skills : {};
    for (const name of Object.keys(skills)) {
      // Bound total work: stop once the provider cap or wall-clock budget is hit.
      if (probed >= MAX_PROVIDERS || Date.now() - startedAt > PROBE_BUDGET_MS) break outer;
      const entry = skills[name];
      const source = entry && entry.source;
      if (!source || !source.kind) continue;
      try {
        if (source.kind === 'github') {
          if (dash(source.owner) || dash(source.repo) || dash(source.ref)) continue;
          probed++;
          const url = 'https://github.com/' + source.owner + '/' + source.repo + '.git';
          const ref = source.ref || 'HEAD';
          const out = execFileSync('git', ['ls-remote', url, ref], { encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          const sha = out ? out.split(/\\s+/)[0] : null;
          if (sha) providers.push({ name: name, kind: 'github', current: source.commit, latest: sha, outdated: sha !== source.commit });
        } else if (source.kind === 'npm') {
          if (dash(source.package) || dash(source.registry)) continue;
          probed++;
          const args = ['view', source.package, 'version'];
          if (source.registry) { args.push('--registry', source.registry); }
          const latest = execFileSync('npm', args, { encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          if (latest) providers.push({ name: name, kind: 'npm', current: entry.version, latest: latest, outdated: latest !== entry.version });
        }
        // local / unrecognized kinds are skipped
      } catch (_) { /* per-provider probe failure -> skip */ }
    }
  }
  fs.mkdirSync(stateDir, { recursive: true });
  const tmpFile = path.join(stateDir, '.skill-freshness-' + crypto.randomBytes(4).toString('hex') + '.tmp');
  fs.writeFileSync(tmpFile, JSON.stringify({ lastCheckTime: Date.now(), providers: providers }), { mode: 0o644 });
  fs.renameSync(tmpFile, statePath);
} catch (_) {}
`.trim();
}

/**
 * Spawns a detached, unref-ed Node process that reads the given lockfile(s)
 * and, per freshness-eligible entry:
 *   github -> `git ls-remote <https-url> <ref>`  (outdated = upstream SHA !== source.commit)
 *   npm    -> `npm view <pkg> version` (honoring source.registry) (outdated = latest !== version)
 * then writes ~/.harness/skill-freshness.json atomically (tmp-file + rename).
 *
 * The script body comes from buildProbeScript() (a pure, tested builder). It is
 * fully self-contained, handles every error internally so the user never sees a
 * failure, and matches the structure of core/update-checker.ts.
 */
export function spawnBackgroundFreshnessCheck(lockfilePaths: string[]): void {
  const statePath = getStatePath();
  const stateDir = path.dirname(statePath);
  const script = buildProbeScript(lockfilePaths, statePath, stateDir);

  try {
    const child = spawn(process.execPath, ['-e', script], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch {
    // spawn() itself can throw (e.g. ENOENT). Swallow silently.
  }
}
