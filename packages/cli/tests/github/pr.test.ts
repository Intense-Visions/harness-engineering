import { describe, it, expect, vi, beforeEach } from 'vitest';

const gh = vi.fn();
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: (...args: unknown[]) => gh(...args),
}));

import { commentsOf, defaultPrReader } from '../../src/github/pr';

beforeEach(() => {
  gh.mockReset();
});
const argsOf = (call: unknown[]) => call[1] as string[];

describe('defaultPrReader, against a stub gh', () => {
  it('asks gh for the PR of the checked-out branch when no number is given', () => {
    gh.mockReturnValue('{"number":4,"body":"hello","headRefOid":"abc"}');
    expect(defaultPrReader('/repo')).toEqual({ number: 4, body: 'hello', headSha: 'abc' });
    expect(argsOf(gh.mock.calls[0]!)).toEqual([
      'pr',
      'view',
      '--json',
      'number,body,headRefOid,comments',
    ]);
    expect(gh.mock.calls[0]![2]).toMatchObject({ cwd: '/repo' });
  });
  it('names the PR when a number is given, as a detached merge ref needs', () => {
    gh.mockReturnValue('{"number":31,"body":""}');
    expect(defaultPrReader('/repo', 31)).toEqual({ number: 31, body: '' });
    expect(argsOf(gh.mock.calls[0]!)).toEqual([
      'pr',
      'view',
      '31',
      '--json',
      'number,body,headRefOid,comments',
    ]);
  });
  it.each([
    ['not an object', '7'],
    ['null', 'null'],
    ['an array', '[{"number":4,"body":"x"}]'],
    ['no number', '{"body":"x"}'],
    ['a number that is a string', '{"number":"4","body":"x"}'],
    ['a number that is not a positive integer', '{"number":1.5,"body":"x"}'],
    ['a body that is null', '{"number":4,"body":null}'],
    ['a body that is not a string', '{"number":4,"body":7}'],
    ['no body', '{"number":4}'],
    ['not JSON', 'Welcome to GitHub CLI'],
  ])('throws on output that is %s: an unreadable reply is unknown, never "no PR"', (_name, out) => {
    gh.mockReturnValue(out);
    expect(() => defaultPrReader('/repo')).toThrow();
  });
  it('a head that is not a string is left out, not passed on', () => {
    gh.mockReturnValue('{"number":4,"body":"","headRefOid":7}');
    expect(defaultPrReader('/repo')).toEqual({ number: 4, body: '' });
  });
  it('a branch with no PR is "no PR", not a failure', () => {
    gh.mockImplementation(() => {
      throw Object.assign(new Error('exit 1'), {
        stderr: 'no pull requests found for branch "x"',
      });
    });
    expect(defaultPrReader('/repo')).toBeUndefined();
  });
  it.each([
    ['gh is not installed', { code: 'ENOENT' }],
    ['gh is not authenticated', { stderr: 'To get started with GitHub CLI, run: gh auth login' }],
    ['the API fails', { stderr: 'HTTP 502: Bad Gateway' }],
    ['a detached checkout', { stderr: 'could not determine current branch: not on any branch' }],
  ])('throws when %s: that is unknown, not "no PR"', (_name, props) => {
    gh.mockImplementation(() => {
      throw Object.assign(new Error('gh failed'), props);
    });
    expect(() => defaultPrReader('/repo')).toThrow('gh failed');
  });
});

/**
 * Fix round 1 (architecture-4): the brief and its poster share one `gh pr view` a run. Input
 * partition for the comments of a reply: absent, not a list, a list with entries of each shape
 * (numeric id and string body; a string id; no body; not an object).
 */
describe('defaultPrReader: the comments the poster reuses', () => {
  it('reads the comments with a numeric id and a string body, and leaves the rest out', () => {
    gh.mockReturnValue(
      JSON.stringify({
        number: 4,
        body: 'b',
        comments: [{ id: 1, body: 'one' }, { id: 'IC_x', body: 'two' }, { id: 3 }, null, 'x'],
      })
    );
    expect(defaultPrReader('/repo')?.comments).toEqual([{ id: 1, body: 'one' }]);
  });
  it.each([
    ['absent', '{"number":4,"body":"b"}'],
    ['not a list', '{"number":4,"body":"b","comments":{}}'],
  ])('comments that are %s are left out, so the poster lists them itself', (_n, out) => {
    gh.mockReturnValue(out);
    expect(defaultPrReader('/repo')).toEqual({ number: 4, body: 'b' });
  });
  it('commentsOf keeps only entries the upsert can use', () => {
    expect(commentsOf([{ id: 2, body: 'x', url: 'u' }, { id: 2.5 }, []])).toEqual([
      { id: 2, body: 'x' },
    ]);
  });
});
