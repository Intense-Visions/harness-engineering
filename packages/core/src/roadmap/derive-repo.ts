import { execFileSync } from 'node:child_process';

/**
 * Derive an `owner/repo` slug from the project's `origin` git remote.
 *
 * Downstream repos that copy a `harness.config.json` template inherit either a
 * literal `roadmap.tracker.repo` (mis-targeting sync at the template source's
 * repo) or omit the key entirely (turning roadmap sync into a silent no-op).
 * Deriving the default from `git remote get-url origin` makes tracker sync
 * work out-of-the-box; an explicitly configured `repo` always wins (issue #902).
 */

/**
 * Parse an `owner/repo` slug out of a git remote URL.
 *
 * Supported forms (with or without a trailing `.git` / `/`):
 * - `https://github.com/owner/repo.git`
 * - `ssh://git@github.com/owner/repo.git`
 * - `git@github.com:owner/repo.git` (scp-style)
 *
 * Returns null when the URL does not contain an owner + repo path.
 */
export function parseOwnerRepoFromRemoteUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // URL form: <scheme>://<host>/<owner>/<repo>  |  scp form: <user>@<host>:<owner>/<repo>
  const match =
    /^[a-zA-Z][\w+.-]*:\/\/[^/]+\/(.+)$/.exec(trimmed) ?? /^[^/@\s]+@[^/:\s]+:(.+)$/.exec(trimmed);
  if (!match) return null;

  const segments = match[1]!
    .replace(/\/+$/, '')
    .split('/')
    .filter((s) => s.length > 0);
  if (segments.length < 2) return null;

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/, '');
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

/**
 * Read the `origin` remote of the repository at `projectRoot` and derive an
 * `owner/repo` slug from it. Returns null when the directory is not a git
 * repository, has no `origin` remote, or the remote URL is unparseable —
 * callers fall back to their existing missing-repo handling.
 */
export function deriveRepoFromGitRemote(projectRoot: string): string | null {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    return parseOwnerRepoFromRemoteUrl(url);
  } catch {
    return null;
  }
}
