import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import {
  createReviewTierCommand,
  formatReviewTier,
  runReviewTier,
  type ReviewTierOptions,
} from '../../src/commands/review-tier';
import { commandCreators } from '../../src/commands/_registry';

let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();

/** Write files (keys use `/`), commit them, return the new head. */
function commit(files: Record<string, string>, message = 'chore: tidy'): string {
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(tmp, ...file.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  g('add', '-A');
  g('commit', '-q', '--no-verify', '-m', message);
  return g('rev-parse', 'HEAD');
}
let base: string;
const config = (c: unknown) =>
  fs.writeFileSync(path.join(tmp, 'harness.config.json'), JSON.stringify(c));
/** A phase review gets the fixture range; --base is an error for final and standalone (fix 7). */
const run = (over: Partial<ReviewTierOptions> = {}) =>
  runReviewTier({
    moment: 'phase',
    ...((over.moment ?? 'phase') === 'phase' && { base }),
    head: g('rev-parse', 'HEAD'),
    cwd: tmp,
    ...over,
  });
/** The successful result, or a thrown error naming why it was not one. */
function ok(over: Partial<ReviewTierOptions> = {}) {
  const out = run(over);
  if (!out.ok) throw out.error;
  return out.value;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-review-tier-'));
  g('init', '-q');
  base = commit({ 'README.md': 'seed\n' }, 'chore: seed');
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('runReviewTier: the phase tier is computed from the diff', () => {
  it('is light for a quiet diff, with no reasons', () => {
    commit({ 'src/util/format.ts': 'export const width = 2;\n' });
    expect(ok({ complexity: 'medium', rigor: 'standard' })).toMatchObject({
      moment: 'phase',
      tier: 'light',
      reasons: [],
      changedFiles: 1,
    });
  });
  it('is full when the diff content matches a risk keyword', () => {
    commit({ 'src/login.ts': 'export const token = read();\n' });
    expect(ok()).toMatchObject({ tier: 'full', reasons: ['risk-keyword:token'] });
  });
  it('is full when only the latest commit message matches a risk keyword', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' }, 'feat: add webhook receiver');
    expect(ok().reasons).toEqual(['risk-keyword:webhook']);
  });
  it('is full when the diff touches src/index.ts at a package root', () => {
    commit({ 'packages/core/src/index.ts': 'export {};\n' });
    expect(ok().reasons).toEqual(['entry-point:packages/core/src/index.ts']);
  });
  it('is full when the diff touches a file a package.json names in bin, main or exports', () => {
    commit({
      'packages/tool/package.json': JSON.stringify({ name: 'tool', bin: { tool: './bin/run.js' } }),
      'packages/tool/bin/run.js': '// start\n',
    });
    const before = g('rev-parse', 'HEAD');
    commit({ 'packages/tool/bin/run.js': '// start again\n' });
    expect(ok({ base: before }).reasons).toEqual(['entry-point:packages/tool/bin/run.js']);
  });
  it('is full for high complexity and for thorough rigor', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' });
    expect(ok({ complexity: 'high' }).reasons).toEqual(['complexity:high']);
    expect(ok({ rigor: 'thorough' }).reasons).toEqual(['rigor:thorough']);
    expect(ok({ rigor: 'fast', complexity: 'low' }).tier).toBe('light');
  });
  it('sees a changed file whose name git would quote', () => {
    commit({ 'src/é token.ts': 'export const a = 1;\n' });
    const r = ok();
    expect(r.changedFiles).toBe(1);
    expect(r.reasons).toEqual(['risk-keyword:token']);
  });
});

describe('runReviewTier: final and standalone are always full', () => {
  const noGit = () => {
    throw new Error('git must not be needed');
  };
  it.each(['final', 'standalone'] as const)('%s is full without reading the diff', (moment) => {
    const r = runReviewTier({ moment, cwd: tmp, git: noGit });
    expect(r).toMatchObject({
      ok: true,
      value: { moment, tier: 'full', reasons: [`moment:${moment}`] },
    });
  });
  it('--fast does not lower the final review', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' });
    expect(ok({ moment: 'final', rigor: 'fast', complexity: 'low' }).tier).toBe('full');
    expect(ok({ moment: 'standalone', rigor: 'fast' }).tier).toBe('full');
  });
});

describe('runReviewTier: it never guesses a tier it could not compute', () => {
  it('fails when a phase is given no range', () => {
    const out = runReviewTier({ moment: 'phase', cwd: tmp });
    expect(out).toMatchObject({ ok: false });
    expect(!out.ok && out.error.message).toMatch(/--base and --head/);
  });
  it('fails on a ref git cannot resolve, and on a range that changes nothing', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' });
    const bad = run({ base: 'no-such-ref' });
    expect(!bad.ok && bad.error.message).toMatch(/cannot resolve "no-such-ref"/);
    const head = g('rev-parse', 'HEAD');
    const empty = run({ base: head, head });
    expect(!empty.ok && empty.error.message).toMatch(/changes no files/);
  });
  it('fails when git is unavailable rather than reporting light', () => {
    const out = run({
      git: () => {
        throw new Error('git: not found');
      },
    });
    expect(out.ok).toBe(false);
  });
});

describe('runReviewTier: the backend (SC15)', () => {
  beforeEach(() => {
    commit({ 'src/login.ts': 'export const token = read();\n' });
  });
  it('is agent when review.backend is unset or there is no config file', () => {
    expect(ok().backend).toEqual({ backend: 'agent', degraded: false });
    config({ version: 1 });
    expect(ok().backend).toEqual({ backend: 'agent', degraded: false });
  });
  it('pipeline configured with no runner yields agent and says it is degraded', () => {
    config({ review: { backend: 'pipeline' } });
    const r = ok({ pipelineRunner: false });
    expect(r.tier).toBe('full');
    expect(r.backend).toMatchObject({ backend: 'agent', degraded: true, configured: 'pipeline' });
    expect(r.backend.reason).toMatch(/no pipeline runner resolved/);
    const text = formatReviewTier(r).join('\n');
    expect(text).toContain('Review tier: full (risk-keyword:token)');
    expect(text).toMatch(/Review backend: agent \(DEGRADED: review\.backend is "pipeline"/);
  });
  it('pipeline configured with a runner yields pipeline for a full review', () => {
    config({ review: { backend: 'pipeline' } });
    expect(ok({ pipelineRunner: true }).backend).toEqual({
      backend: 'pipeline',
      degraded: false,
      configured: 'pipeline',
    });
  });
  it('a light review runs on the agent backend whatever is configured, and is not degraded', () => {
    config({ review: { backend: 'pipeline' } });
    const before = g('rev-parse', 'HEAD');
    commit({ 'src/util/format.ts': 'export const width = 2;\n' });
    const r = ok({ base: before, pipelineRunner: true });
    expect(r.tier).toBe('light');
    expect(r.backend).toMatchObject({ backend: 'agent', degraded: false, configured: 'pipeline' });
    expect(r.backend.reason).toMatch(/full tier only/);
  });
  it('reads the config file named with --config, and rejects an unknown backend', () => {
    const other = path.join(tmp, 'other.json');
    fs.writeFileSync(other, JSON.stringify({ review: { backend: 'pipeline' } }));
    expect(ok({ configPath: other, pipelineRunner: true }).backend.backend).toBe('pipeline');
    config({ review: { backend: 'robots' } });
    const out = run();
    expect(!out.ok && out.error.message).toMatch(/review\.backend must be one of agent, pipeline/);
  });
});

describe('harness review-tier', () => {
  async function invoke(args: string[]) {
    const program = new Command().option('--json').option('-c, --config <path>');
    program.exitOverride();
    program.addCommand(createReviewTierCommand({ cwd: () => tmp }));
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
    await program.parseAsync(['node', 'harness', ...args]);
    return { out: out.join('\n'), err: err.join('\n') };
  }
  it('is registered as a top-level command', () => {
    expect(commandCreators.map((create) => create().name())).toContain('review-tier');
  });
  it('prints the tier with its reasons and the backend, and exits 0', async () => {
    const head = commit({ 'src/login.ts': 'export const token = read();\n' });
    const { out } = await invoke([
      'review-tier',
      '--base',
      base,
      '--head',
      head,
      '--complexity',
      'high',
    ]);
    expect(out).toContain('Review tier: full (risk-keyword:token, complexity:high)');
    expect(out).toContain('Review backend: agent');
    expect(process.exitCode ?? 0).toBe(0);
  });
  it('prints one JSON document under --json', async () => {
    const head = commit({ 'src/a.ts': 'export const a = 1;\n' });
    const { out } = await invoke(['--json', 'review-tier', '--base', base, '--head', head]);
    expect(JSON.parse(out)).toEqual({
      moment: 'phase',
      tier: 'light',
      reasons: [],
      backend: { backend: 'agent', degraded: false },
      base,
      head,
      changedFiles: 1,
    });
  });
  it('--moment final --rigor fast is full, and --pipeline-runner is passed through', async () => {
    config({ review: { backend: 'pipeline' } });
    const { out } = await invoke([
      '--json',
      'review-tier',
      '--moment',
      'final',
      '--rigor',
      'fast',
      '--pipeline-runner',
    ]);
    expect(JSON.parse(out)).toMatchObject({
      tier: 'full',
      reasons: ['moment:final'],
      backend: { backend: 'pipeline', degraded: false },
    });
  });
  it('exits 1 and prints no tier when the range cannot be resolved', async () => {
    const { out, err } = await invoke(['review-tier', '--base', 'no-such-ref', '--head', 'HEAD']);
    expect(process.exitCode).toBe(1);
    expect(out).not.toMatch(/Review tier/);
    expect(err).toMatch(/cannot resolve "no-such-ref"/);
  });
  it('-c selects the project the tier is computed for, not only the config file', async () => {
    config({ version: 1, name: 'fixture', review: { backend: 'pipeline' } });
    const head = commit({ 'src/login.ts': 'export const token = read();\n' });
    // Run from a directory that is not the project and not a git checkout at all.
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-review-tier-elsewhere-'));
    try {
      const program = new Command().option('--json').option('-c, --config <path>');
      program.addCommand(createReviewTierCommand({ cwd: () => elsewhere }));
      const out: string[] = [];
      vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await program.parseAsync([
        'node',
        'harness',
        '--json',
        '-c',
        path.join(tmp, 'harness.config.json'),
        'review-tier',
        '--base',
        base,
        '--head',
        head,
      ]);
      expect(process.exitCode ?? 0).toBe(0);
      expect(JSON.parse(out.join('\n'))).toMatchObject({
        tier: 'full',
        reasons: ['risk-keyword:token'],
        backend: { backend: 'agent', degraded: true, configured: 'pipeline' },
        head,
      });
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });
  it('rejects a value outside the documented choices', async () => {
    await expect(invoke(['review-tier', '--moment', 'weekly'])).rejects.toThrow();
  });
});

describe('fix 19: the answer is the same from any directory of the repository', () => {
  it("finds a package.json entry point from a subdirectory (the reviewers' reproduction)", () => {
    commit({
      'app/package.json': JSON.stringify({ main: 'lib/main.js', bin: { app: './lib/cli.js' } }),
      'app/lib/main.js': '// one\n',
      'app/lib/cli.js': '// one\n',
      'docs/notes.md': 'notes\n',
    });
    const before = g('rev-parse', 'HEAD');
    commit({ 'app/lib/main.js': '// two\n', 'app/lib/cli.js': '// two\n' });
    const fromRoot = ok({ base: before });
    expect(fromRoot.reasons).toEqual(['entry-point:app/lib/cli.js', 'entry-point:app/lib/main.js']);
    for (const sub of ['app', path.join('app', 'lib'), 'docs']) {
      expect(ok({ base: before, cwd: path.join(tmp, sub) })).toEqual(fromRoot);
    }
  });
  it('reads review.backend from the project config when run from a subdirectory (V2-2)', () => {
    config({ review: { backend: 'pipeline' } });
    commit({ 'bin/x.js': '// x\n', 'package.json': JSON.stringify({ bin: 'bin/x.js' }) });
    const before = g('rev-parse', 'HEAD');
    commit({ 'bin/x.js': '// y\n', 'packages/a/keep.txt': 'k\n' });
    const fromRoot = ok({ base: before });
    expect(fromRoot).toMatchObject({ tier: 'full', backend: { degraded: true } });
    expect(ok({ base: before, cwd: path.join(tmp, 'packages', 'a') })).toEqual(fromRoot);
  });
  it('fails outside a git repository instead of answering', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-review-tier-out-'));
    const out = runReviewTier({ moment: 'phase', base: 'a', head: 'b', cwd: outside });
    expect(!out.ok && out.error.message).toMatch(/not inside a git repository/);
    fs.rmSync(outside, { recursive: true, force: true });
  });
});

describe('fix 20: what the phase tier reads', () => {
  it('matches a risk keyword in an earlier commit message of the range', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' }, 'feat: add webhook receiver');
    commit({ 'src/b.ts': 'export const b = 1;\n' }, 'chore: tidy');
    expect(ok().reasons).toEqual(['risk-keyword:webhook']);
  });
  it('a session trailer on every commit does not force full', () => {
    const trailer = '\n\nClaude-Session: https://claude.ai/code/session_x';
    commit({ 'src/a.ts': 'export const a = 1;\n' }, `chore: tidy${trailer}`);
    commit({ 'src/b.ts': 'export const b = 1;\n' }, `docs: notes${trailer}`);
    expect(ok()).toMatchObject({ tier: 'light', reasons: [] });
  });
  it('catches a renamed entry point', () => {
    commit({ 'packages/core/src/index.ts': 'export const a = 1;\nexport const b = 2;\n' });
    const before = g('rev-parse', 'HEAD');
    g('mv', 'packages/core/src/index.ts', 'packages/core/src/main.ts');
    g('commit', '-q', '--no-verify', '-m', 'refactor: rename');
    expect(ok({ base: before }).reasons).toEqual(['entry-point:packages/core/src/index.ts']);
  });
  it('a ref that looks like an option is never read as one', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' });
    for (const ref of ['--all', '--show-toplevel', '--output=/tmp/x']) {
      const out = run({ base: ref });
      expect(!out.ok && out.error.message).toBe(`cannot resolve "${ref}" to a commit`);
    }
  });
  it('asks git for the diff with external drivers off, and terminates options before a ref', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' });
    const calls: string[][] = [];
    const out = run({
      git: (args) => {
        calls.push(args);
        return g(...args);
      },
    });
    expect(out.ok).toBe(true);
    const text = calls.find((a) => a[0] === 'diff' && !a.includes('--name-only'));
    expect(text).toEqual(
      expect.arrayContaining(['--no-ext-diff', '--no-textconv', '--no-renames'])
    );
    for (const parse of calls.filter((a) => a.includes('--verify'))) {
      expect(parse.indexOf('--end-of-options')).toBe(parse.length - 2);
    }
  });
  it('on failure with --json prints a JSON error object on stdout and exits 1 (V2-7)', async () => {
    const program = new Command().option('--json');
    program.addCommand(createReviewTierCommand({ cwd: () => tmp }));
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await program.parseAsync([
      'node',
      'harness',
      '--json',
      'review-tier',
      '--base',
      'nope',
      '--head',
      'HEAD',
    ]);
    expect(JSON.parse(out.join('\n'))).toEqual({ error: 'cannot resolve "nope" to a commit' });
    expect(process.exitCode).toBe(1);
  });
});

/**
 * Round 3, fix 16. Input partition for what can hide a diff's content from the keyword match:
 * no attribute, `-diff` and `binary` for the file's pattern, each in an untracked .gitattributes,
 * in a committed one, and in .git/info/attributes. The tier is a function of the range, so none
 * of them may turn a phase that touches a password into a light one.
 */
describe('round 3, fix 16: git attributes cannot hide content from the tier', () => {
  const SECRET = 'export const password = token + crypto;\n';
  const FULL = ['risk-keyword:password', 'risk-keyword:token', 'risk-keyword:crypto'];
  const tierAfter = (hide: () => void) => {
    const before = commit({ 'src/svc.ts': 'export {};\n' });
    commit({ 'src/svc.ts': SECRET }, 'chore: tidy');
    hide();
    return ok({ base: before }).reasons;
  };
  it.each<[string, () => void]>([
    ['no attribute', () => {}],
    [
      'an untracked .gitattributes with -diff',
      () => fs.writeFileSync(path.join(tmp, '.gitattributes'), '*.ts -diff\n'),
    ],
    [
      'an untracked .gitattributes with binary',
      () => fs.writeFileSync(path.join(tmp, '.gitattributes'), '*.ts binary\n'),
    ],
    [
      '.git/info/attributes with -diff',
      () => {
        fs.mkdirSync(path.join(tmp, '.git', 'info'), { recursive: true });
        fs.writeFileSync(path.join(tmp, '.git', 'info', 'attributes'), '*.ts -diff\n');
      },
    ],
    [
      'a .gitattributes naming a textconv driver',
      () => {
        fs.writeFileSync(path.join(tmp, '.gitattributes'), '*.ts diff=hide\n');
        g('config', 'diff.hide.textconv', 'true');
      },
    ],
  ])('%s -> full, on the keywords in the content', (_name, hide) => {
    expect(tierAfter(hide)).toEqual(FULL);
  });
  it('a committed .gitattributes with -diff in the range does not hide the content either', () => {
    const before = commit({ 'src/svc.ts': 'export {};\n' });
    commit({ 'src/svc.ts': SECRET, '.gitattributes': '*.ts -diff\n' }, 'chore: tidy');
    expect(ok({ base: before }).reasons).toEqual(FULL);
  });
  it('asks git for the diff as text', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' });
    const calls: string[][] = [];
    run({ git: (args) => (calls.push(args), g(...args)) });
    const text = calls.find((a) => a[0] === 'diff' && !a.includes('--name-only'));
    expect(text).toEqual(expect.arrayContaining(['--text', '--no-ext-diff', '--no-textconv']));
  });
});

/**
 * Round 3, fix 16. The trailers are the ones git identifies in each commit of the range. Input
 * partition, through real commits: identity trailers only, a closing line git reads as a trailer
 * and that states the change, both, a keyword above the trailers, and no trailer at all.
 */
describe('round 3, fix 16: trailers are identified by git, and only identity trailers are left out', () => {
  const SESSION = 'Claude-Session: https://claude.ai/code/session_019CjYGjGHr1vyduZ4f9uGuf';
  const COAUTHOR = 'Co-Authored-By: Auth Token <token@example.com>';
  const phase = (message: string) => {
    commit({ 'docs/notes.md': `${message.length}\n` }, message);
    return ok().reasons;
  };
  it.each([
    ['identity trailers only', `docs: notes\n\nBody.\n\n${SESSION}\n${COAUTHOR}`, []],
    [
      "a closing body line git reads as a trailer (the reviewers' reproduction)",
      'refactor: tidy helper\n\nSecurity: the token check now runs before the cache lookup',
      ['risk-keyword:token'],
    ],
    [
      'that line beside identity trailers',
      `refactor: tidy\n\nSecurity: the token check now runs\n${SESSION}`,
      ['risk-keyword:token'],
    ],
    [
      'a keyword in the body above the trailers',
      `docs: notes\n\nRotates the cookie.\n\n${SESSION}`,
      ['risk-keyword:cookie'],
    ],
    // Fix 12: git normalises a trailer's spacing when it prints it; it is still left out.
    [
      'identity trailers with odd spacing',
      'docs: notes\n\nBody.\n\nSigned-off-by :   Auth  Bot <x@y.z>\nReviewed-by:Token Team <t@x.y>',
      [],
    ],
    ['no trailer', 'docs: notes', []],
    [
      'the same sentence without a key',
      'refactor: tidy helper\n\nThe token check now runs before the cache lookup',
      ['risk-keyword:token'],
    ],
  ])('%s', (_name, message, expected) => {
    expect(phase(message)).toEqual(expected);
  });
  it('a session trailer on every commit of the range does not force full', () => {
    commit({ 'src/a.ts': 'export const a = 1;\n' }, `chore: tidy\n\n${SESSION}`);
    commit({ 'src/b.ts': 'export const b = 1;\n' }, `docs: notes\n\n${SESSION}`);
    expect(ok()).toMatchObject({ tier: 'light', reasons: [] });
  });
});

/** Round 3, fix 16: the light-tier backend rule is core's, and the command adds nothing to it. */
describe('round 3, fix 16: a light review runs on the agent backend whatever is configured', () => {
  it.each([
    [true, 'light', { backend: 'agent', degraded: false, configured: 'pipeline' }],
    [false, 'light', { backend: 'agent', degraded: false, configured: 'pipeline' }],
    [true, 'full', { backend: 'pipeline', degraded: false, configured: 'pipeline' }],
    [false, 'full', { backend: 'agent', degraded: true, configured: 'pipeline' }],
  ] as const)('pipeline configured, runner %s, tier %s', (pipelineRunner, tier, backend) => {
    config({ review: { backend: 'pipeline' } });
    commit({ 'docs/notes.md': 'n\n' }, tier === 'full' ? 'feat: webhook' : 'docs: notes');
    const out = ok({ pipelineRunner, configPath: path.join(tmp, 'harness.config.json') });
    expect(out.tier).toBe(tier);
    expect(out.backend).toMatchObject(backend);
  });
});
