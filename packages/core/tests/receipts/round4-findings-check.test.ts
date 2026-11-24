import { describe, it, expect } from 'vitest';
import { checkReviewerFindingsText } from '../../src/receipts/review-gate';
import { HEAD, OTHER, finding, findingsText } from './round4-helpers';

/**
 * Round 4, fix 9: one findings file checked with the gate's own parser, and, with a range,
 * against the diff and the head. Partition: absent, not JSON, schema-invalid, valid; with no
 * range, a range whose diff is unknown / empty / holds the files / lacks one; head equal or not.
 */
const codes = (...args: Parameters<typeof checkReviewerFindingsText>) =>
  checkReviewerFindingsText(...args).map((f) => f.code);
const withFiles = (examinedFiles: string[], findings: unknown[] = []) =>
  JSON.stringify({ ...JSON.parse(findingsText('bug', findings)), examinedFiles });

describe('checkReviewerFindingsText', () => {
  const rows: Array<
    [string, string | undefined, Parameters<typeof checkReviewerFindingsText>[2], string[]]
  > = [
    ['absent file', undefined, { ranged: false }, ['FINDINGS_FILE_MISSING']],
    ['not JSON', '{', { ranged: false }, ['FINDINGS_FILE_INVALID']],
    ['empty object', '{}', { ranged: false }, ['FINDINGS_FILE_INVALID']],
    [
      'a blocking finding without findingClass',
      withFiles(['src/a.ts'], [{ ...finding('f1'), findingClass: undefined }]),
      { ranged: false },
      ['FINDINGS_FILE_INVALID'],
    ],
    ['valid, no range', findingsText('bug'), { ranged: false }, []],
    ['valid, no examined files', withFiles([]), { ranged: false }, ['EXAMINED_FILES_EMPTY']],
    [
      'duplicate finding ids in the file',
      findingsText('bug', [finding('f1'), finding('f1')]),
      { ranged: false },
      ['DUPLICATE_FINDING_ID'],
    ],
    [
      'range: diff unknown',
      findingsText('bug'),
      { ranged: true, head: HEAD, worktreeHead: HEAD, worktreeClean: true, diffFiles: undefined },
      ['DIFF_UNRESOLVED'],
    ],
    [
      'range: empty diff',
      findingsText('bug'),
      { ranged: true, head: HEAD, worktreeHead: HEAD, worktreeClean: true, diffFiles: [] },
      ['EMPTY_DIFF', 'EXAMINED_OUTSIDE_DIFF'],
    ],
    [
      'range: files in the diff, head equal',
      findingsText('bug'),
      {
        ranged: true,
        head: HEAD,
        worktreeHead: HEAD,
        worktreeClean: true,
        diffFiles: ['src/a.ts'],
      },
      [],
    ],
    [
      'range: a file outside the diff',
      withFiles(['src/a.ts', 'src/z.ts']),
      {
        ranged: true,
        head: HEAD,
        worktreeHead: HEAD,
        worktreeClean: true,
        diffFiles: ['src/a.ts'],
      },
      ['EXAMINED_OUTSIDE_DIFF'],
    ],
    [
      'range: the reviewer worktree is not at --head (round 2)',
      findingsText('bug'),
      {
        ranged: true,
        head: HEAD,
        worktreeHead: OTHER,
        worktreeClean: true,
        diffFiles: ['src/a.ts'],
      },
      ['HEAD_MISMATCH'],
    ],
    [
      'range: the reviewer worktree HEAD unresolved (round 2)',
      findingsText('bug'),
      {
        ranged: true,
        head: HEAD,
        worktreeHead: undefined,
        worktreeClean: true,
        diffFiles: ['src/a.ts'],
      },
      ['HEAD_MISMATCH'],
    ],
    [
      'range: head differs',
      findingsText('bug'),
      {
        ranged: true,
        head: OTHER,
        worktreeHead: OTHER,
        worktreeClean: true,
        diffFiles: ['src/a.ts'],
      },
      ['FINDINGS_HEAD_MISMATCH'],
    ],
    [
      'range: a ./ and \\ path normalise to the diff path',
      withFiles(['./src\\a.ts']),
      {
        ranged: true,
        head: HEAD,
        worktreeHead: HEAD,
        worktreeClean: true,
        diffFiles: ['src/a.ts'],
      },
      [],
    ],
  ];
  it.each(rows)('%s', (_name, text, range, expected) => {
    expect(codes(text, 'bug.json', range)).toEqual(expected);
  });
  /** Fix 11: the reviewer id, checked as the gate checks it. Each known id, an unknown one. */
  const KNOWN = [
    'compliance',
    'bug',
    'security',
    'architecture',
    'adversarial',
    'typescript-strict',
    'frontend-races',
    'compliance-bug',
  ];
  it.each(KNOWN)('the known reviewer id %j passes', (id) => {
    expect(codes(findingsText(id), `${id}.json`, { ranged: false })).toEqual([]);
  });
  it.each(['frontend', 'bugs', 'compliance-bug-2', 'x'])(
    'an unknown reviewer id %j fails UNKNOWN_REVIEWER, as the gate would',
    (id) => {
      expect(codes(findingsText(id), `${id}.json`, { ranged: false })).toEqual([
        'UNKNOWN_REVIEWER',
      ]);
    }
  );
  it('names the file in every message', () => {
    const [f] = checkReviewerFindingsText('{', 'x/bug.json', { ranged: false });
    expect(f?.message).toContain('x/bug.json');
  });
});
