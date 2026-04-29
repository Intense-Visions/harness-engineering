import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveIdentity, clearIdentityCache } from '../../src/server/identity';
import { execFile } from 'node:child_process';

vi.mock('node:child_process');

// Store original env
const origEnv = { ...process.env };

describe('resolveIdentity', () => {
  beforeEach(() => {
    clearIdentityCache();
    vi.resetAllMocks();
    process.env = { ...origEnv };
    delete process.env['GITHUB_TOKEN'];
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    process.env = origEnv;
    vi.unstubAllGlobals();
  });

  it('returns github-api source when GITHUB_TOKEN is set and API succeeds', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_test123';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ login: 'octocat' }),
    } as Response);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'octocat', source: 'github-api' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer ghp_test123' }),
      })
    );
  });

  it('falls through to gh-cli when GITHUB_TOKEN is not set', async () => {
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      if (cmd === 'gh') {
        cb(null, 'gh-user\n');
      } else {
        cb(new Error('not called'), '');
      }
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'gh-user', source: 'gh-cli' });
  });

  it('falls through to gh-cli when GitHub API returns non-ok', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_bad';
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      if (cmd === 'gh') {
        cb(null, 'gh-fallback\n');
      } else {
        cb(new Error('skip'), '');
      }
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'gh-fallback', source: 'gh-cli' });
  });

  it('falls through to git-config when gh-cli fails', async () => {
    vi.mocked(execFile).mockImplementation(((
      cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      if (cmd === 'git') {
        cb(null, 'Git User\n');
      } else {
        cb(new Error('gh not found'), '');
      }
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toEqual({ username: 'Git User', source: 'git-config' });
  });

  it('returns null when all methods fail', async () => {
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: Error | null, stdout: string) => void
    ) => {
      cb(new Error('fail'), '');
    }) as typeof execFile);

    const result = await resolveIdentity();
    expect(result).toBeNull();
  });

  it('caches the result across calls', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_cache';
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'cached-user' }),
    } as Response);

    const first = await resolveIdentity();
    const second = await resolveIdentity();
    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clearIdentityCache allows re-resolution', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp_clear';
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'user1' }),
    } as Response);

    await resolveIdentity();
    clearIdentityCache();

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ login: 'user2' }),
    } as Response);

    const result = await resolveIdentity();
    expect(result!.username).toBe('user2');
  });
});
