import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitScanOptions {
  since: string; // e.g. '7d', '30d' — passed to git --since=
  cwd: string;
}

export interface ScannedCommit {
  sha: string;
  subject: string;
  filesChanged: number;
  /**
   * Heuristic proxy for "branches that took multiple iterations". For v1: count
   * of commits in the lookback window whose changed file set overlaps this
   * commit's. Higher value implies repeated work in the same area.
   */
  branchIterations: number;
}

const FIX_RE = /^fix(\([^)]+\))?:/i;

interface RawCommit {
  sha: string;
  subject: string;
  files: string[];
}

/**
 * Normalize a shorthand lookback string (e.g. `7d`) into the form git's
 * `--since=` expects (`7 days ago`). Bare shorthand is rejected by git on
 * macOS, so this translation is required at the boundary.
 *
 * Accepted units:
 *   - `h`  — hours
 *   - `d`  — days
 *   - `w`  — weeks
 *   - `mo` — months
 *
 * Note: `m` is intentionally NOT accepted because it is ambiguous between
 * "minute" and "month". Any other input throws, so callers cannot pass
 * garbage to git — where `--since=foo` silently degrades to a no-op and
 * returns every commit in the repo.
 */
export function normalizeSince(since: string): string {
  const m = /^(\d+)(h|d|w|mo)$/i.exec(since.trim());
  if (!m) {
    throw new Error(
      `Invalid lookback "${since}": expected format like "24h", "7d", "4w", or "3mo"`
    );
  }
  const n = m[1];
  const unit = m[2]?.toLowerCase();
  switch (unit) {
    case 'h':
      return `${n} hours ago`;
    case 'd':
      return `${n} days ago`;
    case 'w':
      return `${n} weeks ago`;
    case 'mo':
      return `${n} months ago`;
    default:
      // Unreachable — regex guards the unit set — but TypeScript wants exhaustiveness.
      throw new Error(`Invalid lookback "${since}"`);
  }
}

// Mirrors hotspot.ts: a freshly-init repo or non-repo cwd is a normal no-op
// for the maintenance task, not a failure. Other git errors (misconfigured
// remote, etc.) propagate.
const EMPTY_REPO_RE = /(does not have any commits yet|not a git repository)/i;

async function readCommits(opts: GitScanOptions): Promise<RawCommit[]> {
  // %x1f = unit separator, %x1e = record separator. --name-only after --format
  // emits files on subsequent lines.
  let stdout: string;
  try {
    const r = await execFileAsync(
      'git',
      ['log', `--since=${normalizeSince(opts.since)}`, '--name-only', '--format=%x1e%H%x1f%s'],
      { cwd: opts.cwd, maxBuffer: 16 * 1024 * 1024 }
    );
    stdout = r.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (EMPTY_REPO_RE.test(msg)) {
      process.stderr.write(`gitScan: empty repo or non-repo at ${opts.cwd}; returning []\n`);
      return [];
    }
    throw err;
  }
  const records = stdout.split('\x1e').filter((r) => r.trim().length > 0);
  return records.map((rec) => {
    const [header, ...fileLines] = rec.split('\n');
    const [sha, subject] = (header ?? '').split('\x1f');
    const files = fileLines.map((l) => l.trim()).filter((l) => l.length > 0);
    return { sha: sha ?? '', subject: subject ?? '', files };
  });
}

export async function gitScan(opts: GitScanOptions): Promise<ScannedCommit[]> {
  const all = await readCommits(opts);
  const fixes = all.filter((c) => FIX_RE.test(c.subject));

  // branchIterations: for each fix commit, count other commits in the window
  // touching at least one of the same files.
  return fixes.map((c) => {
    const overlap = all.filter(
      (other) => other.sha !== c.sha && other.files.some((f) => c.files.includes(f))
    ).length;
    return {
      sha: c.sha,
      subject: c.subject,
      filesChanged: c.files.length,
      branchIterations: overlap,
    };
  });
}
