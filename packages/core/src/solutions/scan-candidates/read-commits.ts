import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeSince } from './git-scan';

const execFileAsync = promisify(execFile);

/**
 * A single commit read from git history. `body` is the full commit message body
 * (everything after the subject line), captured so callers can parse issue
 * references (`Closes #123` / `Refs #123`) that live in the body rather than the
 * subject. `files` is the changed file set (from `--name-only`).
 */
export interface RawCommit {
  sha: string;
  subject: string;
  body: string;
  files: string[];
}

export interface ReadCommitsOptions {
  /** Lookback shorthand (e.g. `7d`, `30d`) — passed through `normalizeSince`. */
  since: string;
  cwd: string;
}

// Mirrors the original scan-candidates behaviour: a freshly-init repo or a
// non-repo cwd is a normal no-op for these report-only walkers, not a failure.
// Other git errors (misconfigured remote, etc.) propagate.
const EMPTY_REPO_RE = /(does not have any commits yet|not a git repository)/i;

// Field/record separators. %x1f = unit separator (between sha/subject/body),
// %x1e = record separator (between commits). A trailing %x1f isolates the body
// from the file list that `--name-only` emits on subsequent lines.
const FORMAT = '%x1e%H%x1f%s%x1f%b%x1f';

/**
 * Shared git-history reader for the scan-candidates + rework walkers. Reads
 * commits in the lookback window with their changed file sets AND bodies, and
 * returns them ordered **oldest → newest** (git's default is newest → oldest,
 * so this reader reverses — the rework model requires a documented time order).
 *
 * Degrade-safe: an empty repo or non-git cwd yields `[]`, never a throw.
 */
export async function readRawCommits(opts: ReadCommitsOptions): Promise<RawCommit[]> {
  let stdout: string;
  try {
    const r = await execFileAsync(
      'git',
      ['log', `--since=${normalizeSince(opts.since)}`, '--name-only', `--format=${FORMAT}`],
      { cwd: opts.cwd, maxBuffer: 16 * 1024 * 1024 }
    );
    stdout = r.stdout;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (EMPTY_REPO_RE.test(msg)) {
      process.stderr.write(`readRawCommits: empty repo or non-repo at ${opts.cwd}; returning []\n`);
      return [];
    }
    throw err;
  }

  const records = stdout.split('\x1e').filter((r) => r.trim().length > 0);
  const commits = records.map((rec) => {
    const parts = rec.split('\x1f');
    const sha = (parts[0] ?? '').trim();
    const subject = parts[1] ?? '';
    const body = (parts[2] ?? '').trim();
    // Everything after the body separator is the `--name-only` file list. Files
    // never contain a unit separator, so re-join defensively if the body did.
    const filesBlob = parts.slice(3).join('\x1f');
    const files = filesBlob
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return { sha, subject, body, files };
  });

  // git log is newest → oldest; the rework model walks oldest → newest.
  return commits.reverse();
}
