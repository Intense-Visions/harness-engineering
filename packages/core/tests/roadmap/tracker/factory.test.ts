import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTrackerClient } from '../../../src/roadmap/tracker/factory';
import { GitHubIssuesTrackerAdapter } from '../../../src/roadmap/tracker/adapters/github-issues';

describe('createTrackerClient', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a) returns Ok(GitHubIssuesTrackerAdapter) for kind: github-issues with explicit token', () => {
    const r = createTrackerClient({
      kind: 'github-issues',
      repo: 'owner/repo',
      token: 'x',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeInstanceOf(GitHubIssuesTrackerAdapter);
    }
  });

  it('b) returns Err on missing token (no explicit token, no env)', () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const r = createTrackerClient({
      kind: 'github-issues',
      repo: 'owner/repo',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/missing GitHub token/i);
    }
  });

  it('c) returns Err on invalid kind', () => {
    const r = createTrackerClient({
      // @ts-expect-error — runtime validation of unsupported kind
      kind: 'gitlab-issues',
      repo: 'owner/repo',
      token: 'x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toMatch(/Unsupported tracker kind/i);
    }
  });

  it('d) reads token from process.env.GITHUB_TOKEN when not in config', () => {
    vi.stubEnv('GITHUB_TOKEN', 'env-tok');
    const r = createTrackerClient({
      kind: 'github-issues',
      repo: 'owner/repo',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeInstanceOf(GitHubIssuesTrackerAdapter);
    }
  });

  it('passes selectorLabel and apiBase through to adapter options', () => {
    const r = createTrackerClient({
      kind: 'github-issues',
      repo: 'owner/repo',
      token: 'x',
      selectorLabel: 'my-label',
      apiBase: 'https://example.com/api/v3',
    });
    expect(r.ok).toBe(true);
  });
});
