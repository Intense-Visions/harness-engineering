import { execFile } from 'node:child_process';
import type { IdentityResponse } from '../shared/types';

let cached: IdentityResponse | null = null;

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

async function resolveFromGithubApi(): Promise<IdentityResponse | null> {
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

async function resolveFromGhCli(): Promise<IdentityResponse | null> {
  try {
    const login = await execAsync('gh', ['api', 'user', '--jq', '.login']);
    if (login) return { username: login, source: 'gh-cli' };
  } catch {
    // gh CLI unavailable or not authenticated
  }
  return null;
}

async function resolveFromGitConfig(): Promise<IdentityResponse | null> {
  try {
    const name = await execAsync('git', ['config', 'user.name']);
    if (name) return { username: name, source: 'git-config' };
  } catch {
    // git not available
  }
  return null;
}

/**
 * Resolve the current user's GitHub identity.
 * Waterfall: GitHub API -> gh CLI -> git config. Cached for server lifetime.
 */
export async function resolveIdentity(): Promise<IdentityResponse | null> {
  if (cached) return cached;

  const result =
    (await resolveFromGithubApi()) ?? (await resolveFromGhCli()) ?? (await resolveFromGitConfig());
  if (result) cached = result;
  return result;
}

/** Clear cached identity (for testing). */
export function clearIdentityCache(): void {
  cached = null;
}
