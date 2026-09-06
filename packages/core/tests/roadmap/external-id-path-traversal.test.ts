/**
 * Regression tests for #1843 — a roadmap `External-ID` could choose the path of an
 * authenticated `api.github.com` request.
 *
 * The External-ID arrives verbatim from `docs/roadmap.d/*.md` shard content, which is
 * fleet-written and PR-contributable. `parseExternalId` used to accept
 * `github:x/../../../user/emails?#1`, and every adapter spliced the resulting captures
 * unencoded into `${apiBase}/repos/${owner}/${repo}/issues/${n}/...` on a request
 * carrying `Authorization: Bearer <token>`. Under WHATWG URL normalization the dot
 * segments collapse and the trailing `?` truncates the intended suffix into a query
 * string, so `POST .../assignees` became `POST https://api.github.com/user/emails`.
 *
 * These tests exercise the *traversal* — the URL the adapter actually hands to `fetch` —
 * not merely the shape of the regex. Both defence layers are covered independently:
 * the tightened regex (`parseExternalId`) and the sink-side assertion + percent-encoding
 * (`githubRepoPath`), so a future regression in either one is caught on its own.
 *
 * Sibling of #1842, which hardened the dashboard instance of the same class.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseExternalId, githubRepoPath } from '../../src/roadmap/external-id';
import { GitHubIssuesSyncAdapter } from '../../src/roadmap/adapters/github-issues';
import { GitHubIssuesTrackerAdapter } from '../../src/roadmap/tracker/adapters/github-issues';
import type { TrackerSyncConfig } from '@harness-engineering/types';

/**
 * External-IDs that steer the credentialed request off `/repos/`. Every one of these
 * parsed successfully before the fix.
 */
const TRAVERSING_IDS = [
  'github:x/../../../user/emails?#1',
  'github:a/../../../applications/CLIENTID/token?#1',
  'github:o/../../../user/repos?#1',
  'github:owner/repo/../../../user/emails?#1',
  'github:../../user/emails?#1',
  'github:owner/..#1',
  'github:./x#1',
  'github:owner/repo?scope=x#1',
];

const BENIGN_ID = 'github:Intense-Visions/harness-engineering#1843';

const SYNC_CONFIG: TrackerSyncConfig = {
  kind: 'github',
  repo: 'Intense-Visions/harness-engineering',
  labels: ['harness-managed'],
  statusMap: {
    backlog: 'open',
    planned: 'open',
    'in-progress': 'open',
    done: 'closed',
    blocked: 'open',
    'needs-human': 'open',
  },
  reverseStatusMap: {
    closed: 'done',
    'open:in-progress': 'in-progress',
    'open:blocked': 'blocked',
    'open:planned': 'planned',
    'open:needs-human': 'needs-human',
  },
};

function recordingFetch(): { fetchFn: typeof fetch; urls: () => string[] } {
  const urls: string[] = [];
  const fn = vi.fn(async (url: unknown) => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => '[]',
      json: async () => [],
    };
  });
  return { fetchFn: fn as unknown as typeof fetch, urls: () => urls };
}

/**
 * The invariant the traversal breaks: after WHATWG normalization the request must still
 * address an issue under `/repos/`. Asserting on the *resolved* URL rather than the
 * template is what makes this a traversal test — `/repos/x/../../../user/emails?...`
 * matches a naive prefix check but resolves to `/user/emails`.
 */
function expectStaysUnderRepos(rawUrl: string, externalId: string): void {
  const resolved = new URL(rawUrl);
  expect(
    resolved.pathname.startsWith('/repos/'),
    `External-ID ${externalId} escaped /repos/: ${rawUrl} resolved to ${resolved.toString()}`
  ).toBe(true);
  expect(
    resolved.pathname.includes('/issues/'),
    `External-ID ${externalId} escaped the issues path: ${resolved.toString()}`
  ).toBe(true);
}

describe('#1843 layer 1 — parseExternalId rejects owner/repo that can steer a URL path', () => {
  for (const externalId of TRAVERSING_IDS) {
    it(`rejects ${externalId}`, () => {
      expect(parseExternalId(externalId)).toBeNull();
    });
  }

  it('still parses a real External-ID', () => {
    expect(parseExternalId(BENIGN_ID)).toEqual({
      owner: 'Intense-Visions',
      repo: 'harness-engineering',
      number: 1843,
    });
  });

  it('still parses the owner/repo name characters GitHub actually issues', () => {
    expect(parseExternalId('github:a-b/c.d_e-f#7')).toEqual({
      owner: 'a-b',
      repo: 'c.d_e-f',
      number: 7,
    });
  });
});

describe('#1843 layer 2 — githubRepoPath re-asserts at the sink, independent of the regex', () => {
  // This layer is what survives a future regression in EXTERNAL_ID_RE: it never consults
  // the regex, so it holds even if the regex is loosened again.
  it.each([
    ['..', 'repo'],
    ['owner', '..'],
    ['.', 'repo'],
    ['owner', '.'],
    ['x', '../../../user/emails?'],
    ['owner/../..', 'repo'],
    ['owner', 'repo?scope=x'],
    ['owner', 'repo#frag'],
    ['owner', 'a b'],
    ['', 'repo'],
    ['owner', ''],
  ])('rejects owner=%j repo=%j', (owner, repo) => {
    expect(githubRepoPath(owner, repo)).toBeNull();
  });

  it('returns the encoded path for a real owner/repo', () => {
    expect(githubRepoPath('Intense-Visions', 'harness-engineering')).toBe(
      'Intense-Visions/harness-engineering'
    );
  });

  it('percent-encodes rather than trusting the caller — a lone surrogate does not throw', () => {
    expect(githubRepoPath('owner', '\uD800')).toBeNull();
  });
});

describe('#1843 sink — GitHubIssuesSyncAdapter never fetches outside /repos/', () => {
  const methods: Array<[string, (a: GitHubIssuesSyncAdapter, id: string) => Promise<unknown>]> = [
    ['assignTicket', (a, id) => a.assignTicket(id, 'someone')],
    ['addComment', (a, id) => a.addComment(id, 'hello')],
    ['fetchTicketState', (a, id) => a.fetchTicketState(id)],
    ['fetchComments', (a, id) => a.fetchComments(id)],
  ];

  for (const [name, call] of methods) {
    for (const externalId of TRAVERSING_IDS) {
      it(`${name} refuses ${externalId}`, async () => {
        const { fetchFn, urls } = recordingFetch();
        const adapter = new GitHubIssuesSyncAdapter({
          token: 'secret-token',
          config: SYNC_CONFIG,
          fetchFn,
        });

        const result = (await call(adapter, externalId)) as { ok: boolean };

        // The contract for a malformed External-ID is already `Err` — traversing IDs
        // must land in exactly that bucket rather than being issued.
        expect(result.ok).toBe(false);
        for (const url of urls()) expectStaysUnderRepos(url, externalId);
        expect(urls()).toHaveLength(0);
      });
    }
  }

  it('still issues the real request for a valid External-ID', async () => {
    const { fetchFn, urls } = recordingFetch();
    const adapter = new GitHubIssuesSyncAdapter({
      token: 'secret-token',
      config: SYNC_CONFIG,
      fetchFn,
    });

    await adapter.assignTicket(BENIGN_ID, 'someone');

    expect(urls()).toEqual([
      'https://api.github.com/repos/Intense-Visions/harness-engineering/issues/1843/assignees',
    ]);
    expectStaysUnderRepos(urls()[0]!, BENIGN_ID);
  });
});

describe('#1843 sink — GitHubIssuesTrackerAdapter never fetches outside /repos/', () => {
  const methods: Array<[string, (a: GitHubIssuesTrackerAdapter, id: string) => Promise<unknown>]> =
    [
      ['appendHistory', (a, id) => a.appendHistory(id, { at: '2026-01-01T00:00:00Z' } as never)],
      ['fetchHistory', (a, id) => a.fetchHistory(id)],
      ['fetchById', (a, id) => a.fetchById(id)],
    ];

  for (const [name, call] of methods) {
    for (const externalId of TRAVERSING_IDS) {
      it(`${name} refuses ${externalId}`, async () => {
        const { fetchFn, urls } = recordingFetch();
        const adapter = new GitHubIssuesTrackerAdapter({
          token: 'secret-token',
          repo: 'Intense-Visions/harness-engineering',
          fetchFn,
        });

        const result = (await call(adapter, externalId)) as { ok: boolean };

        expect(result.ok).toBe(false);
        for (const url of urls()) expectStaysUnderRepos(url, externalId);
        expect(urls()).toHaveLength(0);
      });
    }
  }
});
