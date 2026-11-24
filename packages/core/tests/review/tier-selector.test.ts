import { describe, it, expect } from 'vitest';
import {
  collectPackageEntryPoints,
  selectReviewTier,
  type SelectReviewTierInput,
} from '../../src/review/tier-selector';

type Phase = Extract<SelectReviewTierInput, { moment: 'phase' }>;
const diff = (perFile: Record<string, string>) => ({
  changedFiles: Object.keys(perFile),
  diffText: Object.values(perFile).join('\n'),
});
const quiet = diff({ 'packages/core/src/util/format.ts': '+const width = 2;' });
const input = (
  over: Partial<Phase> & { diff?: ReturnType<typeof diff>; commitMessage?: string } = {}
): Phase => {
  const { diff: d = quiet, commitMessage = 'refactor: tidy formatting helper', ...rest } = over;
  return { moment: 'phase', ...d, commitMessages: [commitMessage], ...rest };
};

describe('selectReviewTier', () => {
  it('is light when no rule holds, and says why not with an empty reason list', () => {
    expect(selectReviewTier(input({ complexity: 'medium', rigor: 'standard' }))).toEqual({
      tier: 'light',
      reasons: [],
    });
  });
  it('is full when the diff matches a risk keyword', () => {
    const d = diff({ 'src/login.ts': '+const token = read();' });
    expect(selectReviewTier(input({ diff: d }))).toEqual({
      tier: 'full',
      reasons: ['risk-keyword:token'],
    });
  });
  it('is full when the commit message alone matches a risk keyword', () => {
    expect(selectReviewTier(input({ commitMessage: 'feat: add webhook' })).tier).toBe('full');
  });
  it('is full when the diff touches src/index.ts at any package root', () => {
    const d = diff({ 'packages/core/src/index.ts': '+export * from "./x";' });
    expect(selectReviewTier(input({ diff: d })).reasons).toEqual([
      'entry-point:packages/core/src/index.ts',
    ]);
    const nested = diff({ 'packages/core/src/review/index.ts': '+export {};' });
    expect(selectReviewTier(input({ diff: nested })).tier).toBe('light');
  });
  it('is full when the diff touches a file named by a package.json entry field', () => {
    const d = diff({ 'packages\\cli\\bin\\run.js': '+x' });
    const r = selectReviewTier(input({ diff: d, entryPoints: ['packages/cli/bin/run.js'] }));
    expect(r).toEqual({ tier: 'full', reasons: ['entry-point:packages/cli/bin/run.js'] });
  });
  it('is full for high complexity and for thorough rigor, and lists every reason', () => {
    expect(selectReviewTier(input({ complexity: 'high' })).reasons).toEqual(['complexity:high']);
    expect(selectReviewTier(input({ rigor: 'thorough' })).reasons).toEqual(['rigor:thorough']);
    expect(selectReviewTier(input({ complexity: 'high', rigor: 'thorough' })).reasons).toEqual([
      'complexity:high',
      'rigor:thorough',
    ]);
  });
  it('fast rigor does not lower a phase that a rule makes full', () => {
    expect(selectReviewTier(input({ complexity: 'high', rigor: 'fast' })).tier).toBe('full');
  });
  it.each(['fast', 'standard', 'thorough'] as const)(
    'the final review is full at rigor %s, whatever the diff',
    () => {
      expect(selectReviewTier({ moment: 'final' })).toEqual({
        tier: 'full',
        reasons: ['moment:final'],
      });
    }
  );
  it('a standalone review is full (the skill lowers it only when it cannot dispatch)', () => {
    expect(selectReviewTier({ moment: 'standalone' }).tier).toBe('full');
  });
});

describe('collectPackageEntryPoints', () => {
  it('collects main, bin and every exports leaf, relative to the package directory', () => {
    const pkg = {
      main: './dist/index.js',
      bin: { harness: 'dist/bin/harness.js' },
      exports: {
        '.': { import: './dist/index.mjs', require: './dist/index.js' },
        './x': './x.js',
      },
    };
    expect(collectPackageEntryPoints(pkg, 'packages/cli')).toEqual([
      'packages/cli/dist/bin/harness.js',
      'packages/cli/dist/index.js',
      'packages/cli/dist/index.mjs',
      'packages/cli/x.js',
    ]);
  });
  it('accepts a string bin, a root package and junk without throwing', () => {
    expect(collectPackageEntryPoints({ bin: './cli.js' })).toEqual(['cli.js']);
    expect(collectPackageEntryPoints(null)).toEqual([]);
    expect(collectPackageEntryPoints({ exports: 7 })).toEqual([]);
  });
});

/**
 * Round 3, fix 16. Input partition for one commit message and the trailers GIT identified in it
 * (`git log --format=%(trailers:only)`), which the caller passes beside the message:
 *   trailers: none given, an empty list, one identity trailer, several, a folded one, a trailer
 *     that is not an identity trailer, a mix;
 *   the message: no keyword, a keyword in the subject, in the body, in a trailer KEY, in a
 *     trailer VALUE, in a line that looks like a trailer and that git did not identify.
 * An identity trailer (Signed-off-by and the other *-by keys, Cc, Change-Id, Claude-Session)
 * says nothing about the change and is not matched. Every other trailer is matched whole: git
 * itself reads "Security: the token check now runs" as a trailer when it ends a message, and it
 * is still a statement about the change.
 */
describe('round 3, fix 16: risk keywords in commit messages, identity trailers excluded', () => {
  const quietDiff = { changedFiles: ['docs/notes.md'], diffText: '+a line' };
  const reasons = (message: string, trailers?: string[]) =>
    selectReviewTier({
      moment: 'phase',
      ...quietDiff,
      commitMessages: [message],
      ...(trailers !== undefined && { commitTrailers: [trailers] }),
    }).reasons;
  const SESSION = 'Claude-Session: https://claude.ai/code/session_019CjYGjGHr1vyduZ4f9uGuf';
  const COAUTHOR = 'Co-Authored-By: Auth Token <token@example.com>';
  const SECURITY = 'Security: the token check now runs before the cache lookup';
  it.each<[string, string, string[] | undefined, string[]]>([
    [
      'no trailers given: the message is matched whole',
      `docs: tidy\n\n${SESSION}`,
      undefined,
      ['risk-keyword:session'],
    ],
    [
      'an empty trailer list: the message is matched whole',
      `docs: tidy\n\n${SESSION}`,
      [],
      ['risk-keyword:session'],
    ],
    ['a session trailer', `docs: tidy\n\nBody text.\n\n${SESSION}`, [SESSION], []],
    ['a co-author trailer naming keywords', `docs: tidy\n\n${COAUTHOR}`, [COAUTHOR], []],
    [
      'a lower-case identity key',
      'docs: tidy\n\nsigned-off-by: Auth <auth@x.y>',
      ['signed-off-by: Auth <auth@x.y>'],
      [],
    ],
    [
      'several identity trailers',
      `docs: tidy\n\nReviewed-by: Token <t@x.y>\nCc: auth@x.y\nChange-Id: Ipassword\n${SESSION}`,
      ['Reviewed-by: Token <t@x.y>', 'Cc: auth@x.y', 'Change-Id: Ipassword', SESSION],
      [],
    ],
    [
      'a folded identity trailer: its continuation lines go with it',
      `docs: tidy\n\n${COAUTHOR}\n and the billing team`,
      [COAUTHOR, ' and the billing team'],
      [],
    ],
    [
      "a body line git reads as a trailer is still matched (the reviewers' reproduction)",
      `refactor: tidy helper\n\n${SECURITY}`,
      [SECURITY],
      ['risk-keyword:token'],
    ],
    [
      'the same line beside identity trailers',
      `refactor: tidy\n\n${SECURITY}\n${SESSION}\n${COAUTHOR}`,
      [SECURITY, SESSION, COAUTHOR],
      ['risk-keyword:token'],
    ],
    [
      'a keyword in the key of a trailer that is not an identity trailer',
      'docs: tidy\n\nMigration: none',
      ['Migration: none'],
      ['risk-keyword:migration'],
    ],
    [
      'a keyword in the subject, with an identity trailer',
      `fix: session expiry\n\n${SESSION}`,
      [SESSION],
      ['risk-keyword:session'],
    ],
    [
      'a keyword in the body above the trailers',
      `docs: tidy\n\nRotates the token.\n\n${SESSION}`,
      [SESSION],
      ['risk-keyword:token'],
    ],
    [
      'a line that looks like an identity trailer and that git did not identify',
      'docs: tidy\n\nReviewed-by: the auth team, see below\n\nMore prose here.',
      [],
      ['risk-keyword:auth'],
    ],
    [
      'the same text as an identity trailer, earlier in the body, is still matched',
      `docs: tidy\n\n${COAUTHOR}\n\nMore prose.\n\n${COAUTHOR}`,
      [COAUTHOR],
      ['risk-keyword:auth', 'risk-keyword:token'],
    ],
    // Fix 12: git prints the trailers it parsed in its own normal form ("Key: value"), which
    // need not be the message's text. They are compared by key and value, not by line.
    [
      'an identity trailer with a space before the colon (git prints it without)',
      'docs: tidy\n\nSigned-off-by :   Auth  Bot <x@y.z>',
      ['Signed-off-by: Auth  Bot <x@y.z>'],
      [],
    ],
    [
      'an identity trailer with no space after the colon',
      'docs: tidy\n\nReviewed-by:Auth Team <a@b.c>',
      ['Reviewed-by: Auth Team <a@b.c>'],
      [],
    ],
    [
      'an identity trailer with a tab after the colon and trailing spaces',
      'docs: tidy\n\nCo-Authored-By:\tToken Bot <t@x.y>   ',
      ['Co-Authored-By: Token Bot <t@x.y>'],
      [],
    ],
    [
      'a folded identity trailer with odd spacing: its continuation goes with it',
      'docs: tidy\n\nCo-Authored-By :  Auth Bot\n   and the token team',
      ['Co-Authored-By: Auth Bot', '   and the token team'],
      [],
    ],
    [
      'a line with an identity key whose value git did not report is still matched',
      'docs: tidy\n\nReviewed-by: Auth Team\nReviewed-by: Token Team',
      ['Reviewed-by: Auth Team'],
      ['risk-keyword:token'],
    ],
    [
      'a non-identity trailer with odd spacing is still matched',
      'docs: tidy\n\nSecurity :  token check first',
      ['Security: token check first'],
      ['risk-keyword:token'],
    ],
    ['a one-line message', 'auth: rework', [], ['risk-keyword:auth']],
    [
      'a message with no keyword anywhere',
      'docs: tidy\n\nSigned-off-by: A <a@b.c>',
      ['Signed-off-by: A <a@b.c>'],
      [],
    ],
  ])('%s', (_name, message, trailers, expected) => {
    expect(reasons(message, trailers)).toEqual(expected);
  });
  it('is full when only an earlier commit of the range names a risk keyword', () => {
    const selection = selectReviewTier({
      moment: 'phase',
      ...quietDiff,
      commitMessages: ['docs: tidy', 'feat: add webhook retry'],
      commitTrailers: [[], []],
    });
    expect(selection.reasons).toEqual(['risk-keyword:webhook']);
  });
  it('a trailer list shorter than the message list strips nothing from the rest', () => {
    const selection = selectReviewTier({
      moment: 'phase',
      ...quietDiff,
      commitMessages: [`docs: a\n\n${SESSION}`, `docs: b\n\n${SESSION}`],
      commitTrailers: [[SESSION]],
    });
    expect(selection.reasons).toEqual(['risk-keyword:session']);
  });
});
