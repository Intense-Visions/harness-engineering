import { execFileSync } from 'child_process';
import { readLockfile, type SkillSource } from '../../registry/lockfile';
import { evaluateEntry, MAX_PROVIDERS, PROBE_BUDGET_MS } from '../../registry/freshness-checker';
import { runInstall } from '../install';
import { logger } from '../../output/logger';
import { prompt } from '../../output/prompt';

/** A lockfile to probe, tagged with its install scope for re-pull routing. */
export interface LockfileRef {
  path: string;
  global: boolean;
}

/** A freshness-eligible provider resolved (and probed) from a lockfile entry. */
export interface ProbedProvider {
  name: string;
  kind: 'github' | 'npm';
  current: string;
  latest: string | null;
  outdated: boolean;
  source: SkillSource;
  global: boolean;
}

/** A lockfile entry that cannot be probed (legacy v1 / no source field). */
export interface SourcelessEntry {
  name: string;
  global: boolean;
}

export interface ProbeResult {
  providers: ProbedProvider[];
  sourceless: SourcelessEntry[];
}

/** Reject any value git/npm would parse as an option flag (leading dash). */
function hasLeadingDash(v: string | undefined): boolean {
  return typeof v === 'string' && v.charAt(0) === '-';
}

/**
 * Reject an owner/repo carrying an embedded '/' or '#'. These are the two
 * delimiters parseGitHubRef uses in the leading `owner/repo` segment, so an
 * owner/repo field carrying one would round-trip through a reconstructed
 * `github:owner/repo#ref` spec into a DIFFERENT owner/repo/ref than the
 * lockfile recorded — silently redirecting the re-pull to another repo.
 * Defense-in-depth on top of the leading-dash guard.
 */
function ownerRepoHasInjectionChar(v: string | undefined): boolean {
  return typeof v === 'string' && (v.includes('/') || v.includes('#'));
}

/**
 * Reject a ref carrying an embedded '#'. A '#' would split the ref and change
 * where the spec's ref boundary falls. '/' is intentionally ALLOWED: it sits
 * after the single '#' delimiter, so a slash-containing branch name (e.g.
 * `feature/foo`) round-trips cleanly through parseGitHubRef
 * (`github:owner/repo#feature/foo` -> ref `feature/foo`).
 */
function refHasInjectionChar(v: string | undefined): boolean {
  return typeof v === 'string' && v.includes('#');
}

function probeGitHub(source: Extract<SkillSource, { kind: 'github' }>): string | null {
  if (hasLeadingDash(source.owner) || hasLeadingDash(source.repo) || hasLeadingDash(source.ref)) return null;
  try {
    const url = `https://github.com/${source.owner}/${source.repo}.git`;
    const ref = source.ref || 'HEAD';
    const out = execFileSync('git', ['ls-remote', url, ref], {
      encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? (out.split(/\s+/)[0] ?? null) : null;
  } catch {
    return null;
  }
}

function probeNpm(source: Extract<SkillSource, { kind: 'npm' }>): string | null {
  if (hasLeadingDash(source.package) || hasLeadingDash(source.registry)) return null;
  try {
    const args = ['view', source.package, 'version'];
    if (source.registry) args.push('--registry', source.registry);
    const latest = execFileSync('npm', args, {
      encoding: 'utf-8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return latest || null;
  } catch {
    return null;
  }
}

/**
 * Reads each lockfile and, per freshness-eligible entry, synchronously probes
 * the recorded source (git ls-remote / npm view) and classifies it via the
 * shared evaluateEntry comparison. On-demand counterpart to the detached
 * background checker. Entries with no source are returned as `sourceless`;
 * local and unrecognized kinds are silently skipped.
 *
 * Probing is bounded by the same MAX_PROVIDERS / PROBE_BUDGET_MS caps the
 * background child uses (freshness-checker FIX #4), so a maliciously large
 * lockfile can't cause an unbounded sequential run of 15s-each probes during
 * an interactive `harness skill update`. Non-probeable entries
 * (sourceless / local / unrecognized) do not count against the cap.
 */
export function probeProviders(lockfiles: LockfileRef[]): ProbeResult {
  const providers: ProbedProvider[] = [];
  const sourceless: SourcelessEntry[] = [];
  const startedAt = Date.now();
  let probeCount = 0;
  outer: for (const { path: lockfilePath, global } of lockfiles) {
    const lockfile = readLockfile(lockfilePath);
    for (const [name, entry] of Object.entries(lockfile.skills)) {
      const source = entry.source;
      if (!source) {
        sourceless.push({ name, global });
        continue;
      }
      let latest: string | null;
      if (source.kind === 'github' || source.kind === 'npm') {
        // Bound total probe work: stop once the provider cap or wall-clock
        // budget is hit. Checked before each probe so combined they cap both
        // the count and the total time.
        if (probeCount >= MAX_PROVIDERS || Date.now() - startedAt > PROBE_BUDGET_MS) break outer;
        probeCount++;
        latest = source.kind === 'github' ? probeGitHub(source) : probeNpm(source);
      } else {
        continue; // local / unrecognized -> skip silently
      }
      const probed = evaluateEntry(name, source, entry.version, latest);
      if (!probed) continue;
      providers.push({ ...probed, source, global });
    }
  }
  return { providers, sourceless };
}

export interface UpdateOptions {
  yes?: boolean;
}

export interface UpdateOutcome {
  name: string;
  updated: boolean;
  skipped?: 'declined' | 'unsafe';
}

/** Reconstruct the `--from` spec for a github source (null if unsafe). */
function reconstructGitHubSpec(source: Extract<SkillSource, { kind: 'github' }>): string | null {
  if (hasLeadingDash(source.owner) || hasLeadingDash(source.repo) || hasLeadingDash(source.ref)) return null;
  // Defense-in-depth: reject embedded spec delimiters so the reconstructed
  // spec can't round-trip to a different owner/repo/ref. Field-specific — a
  // slash-containing branch ref (e.g. `feature/foo`) is legitimate and round-
  // trips cleanly, so only '#' is rejected in the ref position.
  if (
    ownerRepoHasInjectionChar(source.owner) ||
    ownerRepoHasInjectionChar(source.repo) ||
    refHasInjectionChar(source.ref)
  ) {
    return null;
  }
  const ref = source.ref && source.ref !== 'HEAD' ? `#${source.ref}` : '';
  return `github:${source.owner}/${source.repo}${ref}`;
}

/**
 * Re-pulls each outdated provider from its recorded source (github via a
 * reconstructed `--from` spec, npm via its package name), forcing a reinstall
 * so the lockfile commit/version is rewritten. Per-provider confirm (default
 * N) unless `yes`. Entries whose source fields start with a dash are skipped
 * as unsafe. Best-effort per provider — one failure is logged and does not
 * abort the rest.
 */
export async function updateProviders(
  outdated: ProbedProvider[],
  opts: UpdateOptions = {}
): Promise<UpdateOutcome[]> {
  const outcomes: UpdateOutcome[] = [];
  for (const p of outdated) {
    if (!opts.yes) {
      const answer = await prompt(`Update ${p.name} (${p.current} -> ${p.latest}) — proceed? (y/N) `);
      if (answer !== 'y' && answer !== 'yes') {
        outcomes.push({ name: p.name, updated: false, skipped: 'declined' });
        continue;
      }
    }
    try {
      if (p.source.kind === 'github') {
        const spec = reconstructGitHubSpec(p.source);
        if (!spec) {
          logger.warn(`Skipping ${p.name}: unsafe source fields.`);
          outcomes.push({ name: p.name, updated: false, skipped: 'unsafe' });
          continue;
        }
        await runInstall(p.name, { from: spec, force: true, global: p.global, generate: false });
      } else if (p.source.kind === 'npm') {
        if (hasLeadingDash(p.source.package) || hasLeadingDash(p.source.registry)) {
          logger.warn(`Skipping ${p.name}: unsafe source fields.`);
          outcomes.push({ name: p.name, updated: false, skipped: 'unsafe' });
          continue;
        }
        await runInstall(p.source.package, {
          force: true,
          global: p.global,
          generate: false,
          ...(p.source.registry ? { registry: p.source.registry } : {}),
        });
      }
      outcomes.push({ name: p.name, updated: true });
    } catch (err) {
      logger.warn(`Failed to update ${p.name}: ${err instanceof Error ? err.message : String(err)}`);
      outcomes.push({ name: p.name, updated: false });
    }
  }
  return outcomes;
}
