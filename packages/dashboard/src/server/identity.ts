import { execFile } from 'node:child_process';
import type { ResolvedIdentity } from '../shared/types';
import { coerceRole, type DashboardRole } from '../shared/roles';

let pending: Promise<ResolvedIdentity | null> | null = null;

function execAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(cmd, args, { timeout: 5_000 }, (err, stdout) => {
      if (err) {
        reject(err as Error);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function resolveFromGithubApi(): Promise<ResolvedIdentity | null> {
  const token = process.env['GITHUB_TOKEN'];
  if (!token) return null;
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'harness-dashboard',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { login?: string };
    if (data.login) return { username: data.login, source: 'github-api' };
  } catch {
    // Network error or token invalid
  }
  return null;
}

async function resolveFromGhCli(): Promise<ResolvedIdentity | null> {
  try {
    const login = await execAsync('gh', ['api', 'user', '--jq', '.login']);
    if (login) return { username: login, source: 'gh-cli' };
  } catch {
    // gh CLI unavailable or not authenticated
  }
  return null;
}

async function resolveFromGitConfig(): Promise<ResolvedIdentity | null> {
  try {
    const name = await execAsync('git', ['config', 'user.name']);
    if (name) return { username: name, source: 'git-config' };
  } catch {
    // git not available
  }
  return null;
}

async function resolveInner(): Promise<ResolvedIdentity | null> {
  return (
    (await resolveFromGithubApi()) ?? (await resolveFromGhCli()) ?? (await resolveFromGitConfig())
  );
}

/**
 * Resolve the current user's GitHub identity.
 * Waterfall: GitHub API -> gh CLI -> git config. Cached for server lifetime.
 * Concurrent calls share the same in-flight promise to avoid redundant API calls.
 */
export async function resolveIdentity(): Promise<ResolvedIdentity | null> {
  if (!pending) {
    pending = resolveInner();
  }
  return pending;
}

/** Clear cached identity (for testing). */
export function clearIdentityCache(): void {
  pending = null;
}

/**
 * Resolve the dashboard `role` preference from the environment.
 *
 * Reads `HARNESS_DASHBOARD_ROLE` and validates it against the known roles,
 * defaulting to `dev` when unset or invalid. This is a PRESENTATION-ONLY
 * preference (it selects the client's navigation lane); it is not a security
 * boundary and is intentionally not cached, so an operator can change lanes by
 * restarting with a different value.
 */
export function resolveRole(): DashboardRole {
  return coerceRole(process.env['HARNESS_DASHBOARD_ROLE']);
}
