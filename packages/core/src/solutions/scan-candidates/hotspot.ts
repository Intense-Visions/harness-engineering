import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeSince } from './git-scan';
import { checkRankStability, type StableRanking, type ScoredItem } from '../../ranking';

const execFileAsync = promisify(execFile);

export interface HotspotOptions {
  since: string;
  cwd: string;
  threshold: number; // file appears more than `threshold` times in window
}

export interface Hotspot {
  path: string;
  churn: number;
}

/** A hotspot carrying the {@link ScoredItem} shape the stability gate consumes. */
export interface ScoredHotspot extends Hotspot, ScoredItem {}

async function churnInWindow(
  cwd: string,
  since: string,
  until: string | undefined,
  threshold: number
): Promise<Hotspot[]> {
  const args = ['log', `--since=${normalizeSince(since)}`];
  if (until !== undefined) args.push(`--until=${normalizeSince(until)}`);
  args.push('--name-only', '--format=');
  let stdout: string;
  try {
    const r = await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    stdout = r.stdout;
  } catch {
    return [];
  }
  const counts = new Map<string, number>();
  for (const line of stdout.split('\n')) {
    const path = line.trim();
    if (path.length === 0) continue;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c > threshold)
    .map(([path, churn]) => ({ path, churn }))
    .sort((a, b) => b.churn - a.churn);
}

export async function computeHotspots(opts: HotspotOptions): Promise<Hotspot[]> {
  return churnInWindow(opts.cwd, opts.since, undefined, opts.threshold);
}

export interface StableHotspotOptions {
  cwd: string;
  threshold: number;
  /** Length of each window, e.g. `"45d"`. The two windows are adjacent. */
  window: string;
  /** Correlation below which the hotspot ranking degrades to tiers. */
  correlationThreshold?: number | undefined;
  /** Number of tiers when the ranking is unstable. */
  tierCount?: number | undefined;
}

const HOURS_RE = /^(\d+)h$/i;
const DAYS_RE = /^(\d+)d$/i;
const WEEKS_RE = /^(\d+)w$/i;
const MONTHS_RE = /^(\d+)mo$/i;

/**
 * Double a shorthand window (e.g. `"45d"` -> `"90d"`) so the secondary window is
 * the adjacent, equal-length window immediately preceding the primary one.
 */
function doubleWindow(window: string): string {
  const w = window.trim();
  for (const re of [HOURS_RE, DAYS_RE, WEEKS_RE, MONTHS_RE]) {
    const m = re.exec(w);
    if (m) return w.replace(m[1]!, String(Number(m[1]) * 2));
  }
  throw new Error(`Invalid window "${window}": expected format like "24h", "45d", "4w", or "3mo"`);
}

/**
 * Compute a hotspot ranking over two adjacent, equal-length windows and gate it
 * through {@link checkRankStability}. The primary window is the most recent
 * `window`; the secondary is the equal-length window immediately before it.
 * The result carries the rank correlation and both window definitions, and
 * degrades to tiers when the churn ordering is not reproducible across windows.
 */
export async function computeStableHotspots(
  opts: StableHotspotOptions
): Promise<StableRanking<ScoredHotspot>> {
  const primaryRaw = await churnInWindow(opts.cwd, opts.window, undefined, opts.threshold);
  const secondaryRaw = await churnInWindow(
    opts.cwd,
    doubleWindow(opts.window),
    opts.window,
    opts.threshold
  );
  const toScored = (h: Hotspot): ScoredHotspot => ({ ...h, id: h.path, score: h.churn });
  return checkRankStability(
    { label: `most recent ${opts.window}`, items: primaryRaw.map(toScored) },
    { label: `preceding ${opts.window}`, items: secondaryRaw.map(toScored) },
    { correlationThreshold: opts.correlationThreshold, tierCount: opts.tierCount }
  );
}
