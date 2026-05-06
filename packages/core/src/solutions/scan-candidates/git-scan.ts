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
 * Translate harness shorthand windows into a form git --since accepts. Git
 * does NOT accept bare `7d`/`24h` shorthand; only `<N> days ago`/`<N> hours
 * ago` (or absolute dates). Plan Uncertainty #2 calls this out — translate
 * locally rather than push the burden onto callers.
 */
export function normalizeSince(since: string): string {
  const m = /^(\d+)([dhwm])$/i.exec(since.trim());
  if (!m) return since;
  const n = m[1];
  const unit = m[2]?.toLowerCase();
  switch (unit) {
    case 'h':
      return `${n} hours ago`;
    case 'd':
      return `${n} days ago`;
    case 'w':
      return `${n} weeks ago`;
    case 'm':
      return `${n} months ago`;
    default:
      return since;
  }
}

async function readCommits(opts: GitScanOptions): Promise<RawCommit[]> {
  // %x1f = unit separator, %x1e = record separator. --name-only after --format
  // emits files on subsequent lines.
  const { stdout } = await execFileAsync(
    'git',
    ['log', `--since=${normalizeSince(opts.since)}`, '--name-only', '--format=%x1e%H%x1f%s'],
    { cwd: opts.cwd, maxBuffer: 16 * 1024 * 1024 }
  );
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
