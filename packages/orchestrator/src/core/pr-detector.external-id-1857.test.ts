import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Issue } from '@harness-engineering/types';
import { PRDetector, type PRDetectorLogger } from './pr-detector';

/**
 * Regression suite for #1857 — `PRDetector` inlined its own pre-#1843 copy of the
 * External-ID regex (`/^github:([^/]+)\/([^#]+)#(\d+)$/`) instead of importing the
 * `@harness-engineering/core` authority, so the hardening landed by #1854 (for
 * #1843) did not reach this consumer.
 *
 * The parsed `owner`/`repo` are interpolated into `gh pr list --repo <owner>/<repo>`,
 * an AUTHENTICATED invocation. Two things bound the exposure and are stated here so
 * the tests are not read as claiming more than they prove: the value travels through
 * `execFile` ARGV rather than a shell string, so this is not command injection; and
 * `gh` performs its own `--repo` validation downstream. This is a drift defect with a
 * latent security dimension, not a second exploitable instance of #1843.
 *
 * Both of core's defences are exercised independently:
 *   layer 1 — the tightened regex, via `parseExternalId`
 *   layer 2 — the sink assertion `githubRepoPath`, via `fetchOpenPRClosures`, which
 *             is public, takes raw `owner`/`repo`, and never consults the regex.
 *
 * `PRDetector` is documented fail-open. Every rejection below must therefore degrade
 * exactly as an unparseable External-ID already did — candidates pass through, no
 * throw, no hard block.
 */

/** The #1843 payload. Under the old permissive regex this parsed to
 *  `owner="x"`, `repo="../../../user/emails?"` and resolved to
 *  `POST https://api.github.com/user/emails`. */
const TRAVERSAL_ID = 'github:x/../../../user/emails?#1';

const LEGIT_ID = 'github:Intense-Visions/harness-engineering#1857';

function makeMockLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } satisfies Record<
    keyof PRDetectorLogger,
    unknown
  >;
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'id-1',
    identifier: 'issue-abc12345',
    title: 'Test issue',
    description: null,
    state: 'Todo',
    externalId: null,
    url: null,
    ...overrides,
  } as Issue;
}

describe('#1857 PRDetector routes External-ID parsing through the core authority', () => {
  let detector: PRDetector;
  let execFileFn: ReturnType<typeof vi.fn>;
  let logger: ReturnType<typeof makeMockLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = makeMockLogger();
    execFileFn = vi.fn(
      (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, r: unknown) => void) => {
        cb(null, { stdout: '0\n', stderr: '' });
      }
    );
    detector = new PRDetector({
      logger: logger as unknown as PRDetectorLogger,
      execFileFn: execFileFn as never,
      projectRoot: '/tmp',
    });
  });

  describe('layer 1 — parseExternalId (the tightened core regex)', () => {
    it('rejects the #1843 path-traversing External-ID', () => {
      expect(detector.parseExternalId(TRAVERSAL_ID)).toBeNull();
    });

    it('rejects a bare dot-segment owner or repo', () => {
      expect(detector.parseExternalId('github:./repo#1')).toBeNull();
      expect(detector.parseExternalId('github:../repo#1')).toBeNull();
      expect(detector.parseExternalId('github:owner/.#1')).toBeNull();
      expect(detector.parseExternalId('github:owner/..#1')).toBeNull();
    });

    it('rejects owner/repo values carrying a path or query delimiter', () => {
      expect(detector.parseExternalId('github:x/a/b#1')).toBeNull();
      expect(detector.parseExternalId('github:x/repo?#1')).toBeNull();
    });

    it('still parses a legitimate External-ID (no false rejection)', () => {
      expect(detector.parseExternalId(LEGIT_ID)).toEqual({
        owner: 'Intense-Visions',
        repo: 'harness-engineering',
        number: 1857,
      });
    });

    it('still parses the punctuation GitHub actually permits in a repo name', () => {
      expect(detector.parseExternalId('github:a-b/c.d_e-f#7')).toEqual({
        owner: 'a-b',
        repo: 'c.d_e-f',
        number: 7,
      });
    });
  });

  describe('layer 2 — githubRepoPath at the authenticated `gh --repo` sink', () => {
    it('never issues a gh call for a traversing External-ID', async () => {
      const result = await detector.hasOpenPRForExternalId(TRAVERSAL_ID);
      expect(result).toBe(false);
      expect(execFileFn).not.toHaveBeenCalled();
    });

    it('rejects a traversing owner/repo handed straight to the sink, bypassing the regex', async () => {
      // `fetchOpenPRClosures` is public and takes raw owner/repo, so it exercises the
      // sink defence on its own. This is the case a regressed regex would re-open.
      const result = await detector.fetchOpenPRClosures('x', '../../../user/emails?');
      expect(result).toBeNull();
      expect(execFileFn).not.toHaveBeenCalled();
    });

    it('rejects a bare dot segment at the sink', async () => {
      expect(await detector.fetchOpenPRClosures('owner', '..')).toBeNull();
      expect(await detector.fetchOpenPRClosures('.', 'repo')).toBeNull();
      expect(execFileFn).not.toHaveBeenCalled();
    });

    it('passes a legitimate owner/repo through the sink unchanged', async () => {
      execFileFn.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, r: unknown) => void) => {
          cb(null, { stdout: '[]', stderr: '' });
        }
      );
      const result = await detector.fetchOpenPRClosures('Intense-Visions', 'harness-engineering');
      expect(result).toEqual(new Set());
      expect(execFileFn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--repo', 'Intense-Visions/harness-engineering']),
        expect.objectContaining({ timeout: 15_000 }),
        expect.any(Function)
      );
    });

    it('builds the same --repo argv as before for a legitimate External-ID', async () => {
      execFileFn.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: (e: unknown, r: unknown) => void) => {
          cb(null, { stdout: '1\n', stderr: '' });
        }
      );
      expect(await detector.hasOpenPRForExternalId(LEGIT_ID)).toBe(true);
      expect(execFileFn).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['--repo', 'Intense-Visions/harness-engineering']),
        expect.objectContaining({ timeout: 10_000 }),
        expect.any(Function)
      );
    });
  });

  describe('fail-open contract is preserved', () => {
    it('keeps a candidate whose External-ID is now rejected, rather than blocking it', async () => {
      const candidate = makeIssue({ identifier: 'traversal-1', externalId: TRAVERSAL_ID });
      const filtered = await detector.filterCandidatesWithOpenPRs([candidate]);
      expect(filtered).toEqual([candidate]);
      // No repo-scoped list is attempted; it degrades to the `feat/<identifier>`
      // branch lookup exactly as an unparseable External-ID always did.
      for (const call of execFileFn.mock.calls) {
        expect(call[1]).not.toContain('--repo');
      }
    });

    it('degrades an unparseable External-ID exactly as before', async () => {
      const result = await detector.hasOpenPRForExternalId('linear:TEAM-123');
      expect(result).toBe(false);
      expect(execFileFn).not.toHaveBeenCalled();
    });

    it('does not throw on a rejected External-ID', async () => {
      await expect(detector.hasOpenPRForExternalId(TRAVERSAL_ID)).resolves.toBe(false);
      await expect(
        detector.filterCandidatesWithOpenPRs([makeIssue({ externalId: 'github:owner/..#3' })])
      ).resolves.toHaveLength(1);
    });
  });
});
