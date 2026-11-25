import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import {
  createCheckReviewReceiptCommand,
  formatCheckReviewReceipt,
} from '../../src/commands/check-review-receipt';
import { runCheckReviewReceipt } from '../../src/review-receipts/gate';
import type { CwdGit } from '../../src/review-receipts/io';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const FULL = ['compliance', 'bug', 'security', 'architecture'];
let tmp: string;
let dir: string;

const git =
  (files: string[] = ['src/a.ts'], head = HEAD): CwdGit =>
  (args) => {
    if (args[0] === 'rev-parse') {
      // A full sha resolves to itself (`rev-parse --verify <sha>^{commit}`); anything else is HEAD.
      const named = (args[args.length - 1] ?? '').replace(/\^\{commit\}$/, '');
      return /^[0-9a-f]{40}$/.test(named) ? named : head;
    }
    if (args[0] === 'status') return '';
    if (args[0] === 'merge-base') return args[1] === '--is-ancestor' ? '' : BASE;
    if (args[0] === 'symbolic-ref') return 'origin/main';
    if (args[0] === 'diff') {
      // NUL-separated, as `git diff --name-only -z` prints: names arrive unquoted.
      if (!args.includes('-z')) throw new Error('diff file lists must be asked for with -z');
      return files.map((f) => `${f}\0`).join('');
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
const findingsFile = (id: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    reviewerId: id,
    base: BASE,
    head: HEAD,
    examinedFiles: ['src/a.ts'],
    findings: [],
    ...over,
  });
const receipt = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  moment: 'phase',
  tier: 'full',
  backend: 'agent',
  diff: { base: BASE, head: HEAD },
  coldContext: true,
  priorFindingsSupplied: false,
  reviewers: FULL.map((id) => ({ id, required: true, ran: true, findingsPath: `${id}.json` })),
  blocking: 0,
  advisory: 0,
  ...over,
});
function write(r: unknown, ids: string[] = FULL, over: Record<string, unknown> = {}) {
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(r));
  // Each reviewer was given the receipt's range: its file records that base.
  const base = (r as { diff?: { base?: unknown } }).diff?.base ?? BASE;
  for (const id of ids)
    fs.writeFileSync(path.join(dir, `${id}.json`), findingsFile(id, { base, ...over }));
}
const run = (g: CwdGit = git()) => runCheckReviewReceipt({ receiptPath: dir, cwd: tmp, git: g });

/** The session's autopilot-state.json: phase-0's base is its starting commit (fix 1). */
const startAt = (startingCommit: string | undefined) =>
  fs.writeFileSync(
    path.join(tmp, '.harness', 'sessions', 's1', 'autopilot-state.json'),
    JSON.stringify(startingCommit === undefined ? {} : { startingCommit })
  );
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-check-receipt-'));
  dir = path.join(tmp, '.harness', 'sessions', 's1', 'reviews', 'phase-0');
  fs.mkdirSync(dir, { recursive: true });
  startAt(BASE);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('runCheckReviewReceipt', () => {
  it('passes a full receipt whose reviewers each wrote a findings file over the diff', () => {
    write(receipt());
    const r = run();
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ pass: true, reviewersRun: 4, reviewersRequired: 4, tier: 'full' });
  });
  it('SC16: a missing receipt fails with RECEIPT_MISSING', () => {
    const r = run();
    expect(r.pass).toBe(false);
    expect(r.failures.map((f) => f.code)).toEqual(['RECEIPT_MISSING']);
    expect(r.failures[0]?.message).toContain('receipt.json');
  });
  it('SC2: names the required reviewer that did not run', () => {
    const reviewers = FULL.map((id) =>
      id === 'security'
        ? { id, required: true, ran: false, skippedReason: 'timeout' }
        : { id, required: true, ran: true, findingsPath: `${id}.json` }
    );
    write(receipt({ reviewers }));
    const r = run();
    expect(r.pass).toBe(false);
    expect(formatCheckReviewReceipt(r).join('\n')).toMatch(/REQUIRED_REVIEWER_NOT_RUN.*"security"/);
  });
  it('SC3: fails when a reviewer marked ran has no findings file on disk', () => {
    write(receipt(), ['compliance', 'security', 'architecture']);
    const r = run();
    expect(r.failures).toEqual([
      expect.objectContaining({ code: 'FINDINGS_FILE_MISSING', reviewerId: 'bug' }),
    ]);
  });
  it('SC4: fails a final receipt that is not full, cold and free of prior findings', () => {
    dir = path.join(path.dirname(dir), 'final-all');
    fs.mkdirSync(dir);
    write(receipt({ moment: 'final', coldContext: false, priorFindingsSupplied: true }));
    const r = runCheckReviewReceipt({ receiptPath: dir, cwd: tmp, git: git() });
    expect(r.failures.map((f) => f.code)).toEqual(['FINAL_NOT_COLD', 'FINAL_PRIOR_FINDINGS']);
  });
  it('recomputes HEAD and the diff: a stale head or an out-of-diff file fails', () => {
    write(receipt());
    expect(run(git(['src/a.ts'], 'c'.repeat(40))).failures.map((f) => f.code)).toEqual([
      'HEAD_MISMATCH',
    ]);
    expect(run(git(['src/other.ts'])).failures.map((f) => f.code)).toContain(
      'EXAMINED_OUTSIDE_DIFF'
    );
  });
  it('asks git for the receipt range and nothing else, and only with full shas', () => {
    write(receipt());
    const calls: string[][] = [];
    run((args) => {
      calls.push(args);
      return git()(args, tmp);
    });
    expect(calls).toEqual([
      ['rev-parse', '--show-toplevel'],
      // phase-0's base: the session's starting commit, which must be an ancestor of the head
      ['merge-base', '--is-ancestor', BASE, HEAD],
      ['rev-parse', 'HEAD'],
      ['diff', '--name-only', '--no-renames', '-z', `${BASE}..${HEAD}`],
      ['merge-base', '--is-ancestor', BASE, HEAD],
      ['status', '--porcelain=v1', '-z', '--untracked-files=no'],
    ]);
    write({ ...receipt(), diff: { base: '--output=/tmp/x', head: HEAD } });
    const unsafe: string[][] = [];
    const r = run((args) => {
      unsafe.push(args);
      return git()(args, tmp);
    });
    expect(unsafe).toEqual([]);
    expect(r.failures.map((f) => f.code)).toEqual(['RECEIPT_INVALID']);
  });
  it('fails closed when git cannot run', () => {
    write(receipt());
    const r = run(() => {
      throw new Error('git: not found');
    });
    expect(r.pass).toBe(false);
    expect(r.failures.map((f) => f.code)).toEqual(
      expect.arrayContaining(['HEAD_MISMATCH', 'DIFF_UNRESOLVED'])
    );
  });
  it('SC15: a receipt that records backend agent after a pipeline fallback is judged as an agent review', () => {
    write(receipt({ backend: 'agent' }));
    expect(run()).toMatchObject({ pass: true, backend: 'agent' });
  });
  it('SC13: the result does not depend on any model or GitHub credential', () => {
    write(receipt());
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GITHUB_TOKEN', '');
    const without = run();
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    vi.stubEnv('OPENAI_API_KEY', 'sk-x');
    vi.stubEnv('GITHUB_TOKEN', 'ghp_' + 'x'.repeat(36));
    expect(run()).toEqual(without);
    expect(without.pass).toBe(true);
  });
  it('SC13: no gate source reads the environment', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const sources = [
      path.join(root, 'core', 'src', 'receipts', 'review-gate.ts'),
      path.join(root, 'core', 'src', 'receipts', 'schema.ts'),
      path.join(root, 'core', 'src', 'receipts', 'load.ts'),
      path.join(root, 'cli', 'src', 'commands', 'check-review-receipt.ts'),
      path.join(root, 'cli', 'src', 'review-receipts', 'gate.ts'),
      path.join(root, 'cli', 'src', 'review-receipts', 'io.ts'),
    ];
    for (const file of sources) {
      expect(fs.readFileSync(file, 'utf-8'), file).not.toMatch(/process\.env|API_KEY|fetch\(/);
    }
  });
});

describe('harness check-review-receipt', () => {
  async function invoke(args: string[]) {
    const program = new Command().option('--json');
    program.addCommand(createCheckReviewReceiptCommand({ cwd: () => tmp, git: git() }));
    const out: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a) => void out.push(a.join(' ')));
    await program.parseAsync(['node', 'harness', ...args]);
    return out.join('\n');
  }
  it('exits 0 on a passing receipt and prints the denominator', async () => {
    write(receipt());
    const out = await invoke(['check-review-receipt', dir]);
    expect(out).toMatch(/PASS.*4\/4 required reviewers ran and wrote a readable findings file/);
    expect(process.exitCode ?? 0).toBe(0);
  });
  it('SC16: exits 1 when no receipt exists', async () => {
    await invoke(['check-review-receipt', path.join(dir, 'nope')]);
    expect(process.exitCode).toBe(1);
  });
  /** Every character the text output must not print raw: C0, DEL, C1, bidi, invisible. */
  const RAW =
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;
  it('fix 10: agent-written text in a failure is escaped in the text output (receipt mode)', async () => {
    const reviewers = FULL.map((id) =>
      id === 'security'
        ? { id, required: true, ran: false, skippedReason: '\u001b[2K\rPASS \u202eSSAP' }
        : { id, required: true, ran: true, findingsPath: `${id}.json` }
    );
    write(receipt({ reviewers }), FULL, { examinedFiles: ['src/a.ts', 'x\u001b]0;t\u0007.ts'] });
    const out = await invoke(['check-review-receipt', dir]);
    expect(process.exitCode).toBe(1);
    expect(out).toMatch(/REQUIRED_REVIEWER_NOT_RUN/);
    expect(out).not.toMatch(RAW);
    expect(out).toContain('\\u{001B}[2K\\u{000D}PASS \\u{202E}SSAP');
  });
  it('fix 10: agent-written text in a failure is escaped in the text output (--findings mode)', async () => {
    const f = path.join(tmp, 'f.json');
    fs.writeFileSync(f, findingsFile('bug', { examinedFiles: ['y\u009b31m\u200b.ts'] }));
    const out = await invoke([
      'check-review-receipt',
      '--findings',
      f,
      '--base',
      BASE,
      '--head',
      HEAD,
    ]);
    expect(process.exitCode).toBe(1);
    expect(out).toMatch(/EXAMINED_OUTSIDE_DIFF/);
    expect(out).not.toMatch(RAW);
  });
  /**
   * Fix 11: a flag the chosen mode does not read is an error (exit 1), never silently ignored.
   * Partition: receipt mode with --base, --head, both; --findings with --moment; and the flags
   * each mode does read, as controls.
   */
  it.each([
    ['receipt mode with --base', ['--base', BASE], /--base and --head apply to --findings only/],
    ['receipt mode with --head', ['--head', HEAD], /--base and --head apply to --findings only/],
    ['receipt mode with both', ['--base', BASE, '--head', HEAD], /apply to --findings only/],
  ])('fix 11: %s exits 1 and runs no gate', async (_n, flags, message) => {
    write(receipt());
    const out = await invoke(['check-review-receipt', dir, ...flags]);
    expect(process.exitCode).toBe(1);
    expect(out).toMatch(message);
    expect(out).not.toMatch(/review receipt gate:/);
  });
  it.each([[['--target', 'origin/x']], [['--findings', 'f.json', '--target', 'origin/x']]])(
    'round 2: --target is not an option of the gate (the final receipt records it): %j',
    async (flags) => {
      write(receipt());
      const program = new Command().option('--json').exitOverride();
      const cmd = createCheckReviewReceiptCommand({ cwd: () => tmp, git: git() }).exitOverride();
      cmd.configureOutput({ writeErr: () => {} });
      program.addCommand(cmd);
      const argv = [
        'node',
        'harness',
        'check-review-receipt',
        ...(flags[0] === '--target' ? [dir] : []),
        ...flags,
      ];
      await expect(program.parseAsync(argv)).rejects.toMatchObject({
        code: 'commander.unknownOption',
      });
    }
  );
  it('fix 11: --findings with --moment exits 1 and checks no file', async () => {
    const f = path.join(tmp, 'f.json');
    fs.writeFileSync(f, findingsFile('bug'));
    const out = await invoke(['check-review-receipt', '--findings', f, '--moment', 'final']);
    expect(process.exitCode).toBe(1);
    expect(out).toMatch(/--moment applies to a receipt path only/);
    expect(out).not.toMatch(/findings file check:/);
  });
  it('fix 11 (control): receipt mode with --moment and --findings with a range still run', async () => {
    write(receipt());
    const a = await invoke(['check-review-receipt', dir, '--moment', 'phase']);
    expect(a).toMatch(/review receipt gate: PASS/);
    const f = path.join(dir, 'bug.json');
    const b = await invoke([
      'check-review-receipt',
      '--findings',
      f,
      '--base',
      BASE,
      '--head',
      HEAD,
    ]);
    expect(b).toMatch(/findings file check: PASS/);
  });
  it('emits one JSON document under --json, with the verdict agreeing with the exit code', async () => {
    write(receipt(), ['compliance']);
    const out = await invoke(['--json', 'check-review-receipt', dir]);
    const doc = JSON.parse(out);
    expect(doc.pass).toBe(false);
    expect(doc.failures.length).toBeGreaterThan(0);
    expect(process.exitCode).toBe(1);
  });
});

describe('diff file names git would quote (N2)', () => {
  const ODD = ['é.ts', 'with space.ts', 'dir é/b c.ts'];
  function realRepo(): { base: string; head: string } {
    const g = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=t',
          '-c',
          'user.email=t@example.com',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
      ).trim();
    g('init', '-q');
    fs.writeFileSync(path.join(tmp, 'seed.txt'), 'seed\n');
    g('add', 'seed.txt');
    g('commit', '-q', '--no-verify', '-m', 'seed');
    const base = g('rev-parse', 'HEAD');
    for (const f of ODD) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.writeFileSync(path.join(tmp, f), 'export {};\n');
    }
    g('add', '--', ...ODD);
    g('commit', '-q', '--no-verify', '-m', 'odd names');
    startAt(base);
    return { base, head: g('rev-parse', 'HEAD') };
  }
  function writeExamined(r: { diff: { head: string } }, examinedFiles: string[]) {
    write(r, FULL, { examinedFiles, head: r.diff.head });
  }
  it('passes a review of files with a non-ASCII name and a space, against real git', () => {
    const { base, head } = realRepo();
    writeExamined(receipt({ diff: { base, head } }), ODD);
    const r = runCheckReviewReceipt({ receiptPath: dir, cwd: tmp });
    expect(r.failures).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it('still fails a file that is not in that diff', () => {
    const { base, head } = realRepo();
    writeExamined(receipt({ diff: { base, head } }), [...ODD, 'seed.txt']);
    const r = runCheckReviewReceipt({ receiptPath: dir, cwd: tmp });
    expect(r.failures.map((f) => f.code)).toEqual(Array(4).fill('EXAMINED_OUTSIDE_DIFF'));
    expect(r.failures[0]?.message).toContain('seed.txt');
    expect(r.failures[0]?.message).not.toContain('é.ts');
  });
  it('asks git for a NUL-separated list and keeps a name with a space whole', () => {
    const seen: string[][] = [];
    write(receipt(), FULL, { examinedFiles: ['a b.ts'] });
    const r = run((args) => {
      seen.push(args);
      return args[0] === 'diff' ? 'a b.ts\0' : git()(args, tmp);
    });
    expect(r.pass).toBe(true);
    expect(seen.find((a) => a[0] === 'diff')).toEqual([
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      `${BASE}..${HEAD}`,
    ]);
  });
});

describe('receipt counts against the findings files (N6)', () => {
  it('fails a receipt claiming blocking: 0 while bug.json holds a critical finding', () => {
    write(receipt({ blocking: 0, advisory: 0 }));
    const critical = {
      id: 'b1',
      file: 'src/a.ts',
      lineRange: [1, 1],
      severity: 'critical',
      title: 't',
      findingClass: 'edge-case',
      escapedFrom: 'plan',
    };
    fs.writeFileSync(path.join(dir, 'bug.json'), findingsFile('bug', { findings: [critical] }));
    const r = run();
    expect(r.pass).toBe(false);
    expect(r.failures.map((f) => f.code)).toEqual(['COUNTS_MISMATCH']);
    expect(formatCheckReviewReceipt(r).join('\n')).toMatch(/hold 1 blocking and 0 advisory/);
    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt({ blocking: 1 })));
    expect(run().pass).toBe(true);
  });
});

/** A real repository with `origin/main` at the seed commit and two commits after it. */
function realRepo(): { g: (...args: string[]) => string; seed: string; mid: string; head: string } {
  const g = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  const commit = (file: string) => {
    fs.mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true });
    fs.writeFileSync(path.join(tmp, file), `${file}\n`);
    g('add', '--', file);
    g('commit', '-q', '--no-verify', '-m', `add ${file}`);
    return g('rev-parse', 'HEAD');
  };
  g('init', '-q', '-b', 'work');
  const seed = commit('seed.txt');
  g('update-ref', 'refs/remotes/origin/main', seed);
  const mid = commit('src/a.ts');
  // A phase review here runs mid..head: the session started at mid (fix 1).
  startAt(mid);
  return { g, seed, mid, head: commit('src/b.ts') };
}
const real = (moment?: 'phase' | 'final' | 'standalone', at = dir) =>
  runCheckReviewReceipt({ receiptPath: at, cwd: tmp, ...(moment !== undefined && { moment }) });
const codesOf = (r: { failures: Array<{ code: string }> }) => r.failures.map((f) => f.code);

describe('fix 1: the moment is bound to where the receipt sits', () => {
  const lightPhase = (head: string, base: string) =>
    receipt({
      tier: 'light',
      diff: { base, head },
      coldContext: false,
      priorFindingsSupplied: true,
      reviewers: [{ id: 'compliance-bug', required: true, ran: true, findingsPath: 'c.json' }],
    });
  function writeLight(at: string, head: string, base: string) {
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(path.join(at, 'receipt.json'), JSON.stringify(lightPhase(head, base)));
    const file = findingsFile('compliance-bug', { base, head, examinedFiles: ['src/b.ts'] });
    fs.writeFileSync(path.join(at, 'c.json'), file);
  }
  it("fails a receipt in final-all that says moment phase (the reviewers' reproduction)", () => {
    const { mid, head } = realRepo();
    const finalDir = path.join(path.dirname(dir), 'final-all');
    writeLight(finalDir, head, mid);
    expect(codesOf(real(undefined, finalDir))).toEqual(['MOMENT_MISMATCH']);
    writeLight(dir, head, mid);
    expect(real().failures).toEqual([]);
  });
  /**
   * Input partition: where the receipt sits {phase-0, final-all, .harness/reviews/x, a directory
   * that says nothing} x --moment {absent, phase, final, standalone}; the receipt itself says
   * phase throughout. Sixteen rows, six of them a directory and a flag that disagree.
   */
  describe('the directory wins over --moment (16 rows)', () => {
    const places: Array<[string, () => string, 'phase' | 'final' | 'standalone' | undefined]> = [
      ['phase-0', () => dir, 'phase'],
      ['final-all', () => path.join(path.dirname(dir), 'final-all'), 'final'],
      ['.harness/reviews/x', () => path.join(tmp, '.harness', 'reviews', 'x'), 'standalone'],
      ['somewhere/else', () => path.join(tmp, 'somewhere', 'else'), undefined],
    ];
    const rows = places.flatMap(([name, at, directory]) =>
      ([undefined, 'phase', 'final', 'standalone'] as const).map((flag) => {
        const expected = directory ?? flag;
        let codes: string[] = [];
        if (expected === undefined) codes = ['MOMENT_UNKNOWN'];
        else if (directory !== undefined && flag !== undefined && flag !== directory) {
          codes = ['MOMENT_MISMATCH'];
        } else if (expected !== 'phase') codes = ['MOMENT_MISMATCH'];
        // Fix 1: a phase receipt outside a session has no earlier phase or starting commit to
        // name its base, so its base is unknown.
        if (directory !== 'phase' && directory !== 'final')
          codes = [...codes, 'PHASE_BASE_UNKNOWN'];
        // Review round 3, fix 5: a light standalone review is a demotion. The receipt says phase,
        // so it is standalone only where the directory, or a flag it does not contradict, says so.
        const agreed = directory === undefined || flag === undefined || flag === directory;
        if (expected === 'standalone' && agreed) codes = [...codes, 'TIER_DEMOTED'];
        return [name, flag, codes, at] as const;
      })
    );
    it.each(rows)('receipt in %s with --moment %s -> %j', (_name, flag, codes, at) => {
      const { mid, head } = realRepo();
      writeLight(at(), head, mid);
      expect(codesOf(real(flag, at()))).toEqual(codes);
    });
  });
  it('reads a directory under .harness/reviews as a standalone review', () => {
    const { mid, head } = realRepo();
    const standalone = path.join(tmp, '.harness', 'reviews', `work-${head}`);
    writeLight(standalone, head, mid);
    expect(codesOf(real(undefined, standalone))).toEqual([
      'MOMENT_MISMATCH',
      'PHASE_BASE_UNKNOWN',
      'TIER_DEMOTED',
    ]);
  });
  it('the command takes --moment', async () => {
    const { mid, head } = realRepo();
    // A phase receipt outside a session fails PHASE_BASE_UNKNOWN, so this one says standalone.
    const odd = path.join(tmp, 'x');
    writeLight(odd, head, mid);
    const light = JSON.parse(fs.readFileSync(path.join(odd, 'receipt.json'), 'utf-8'));
    fs.writeFileSync(
      path.join(odd, 'receipt.json'),
      // A light standalone review is a demotion (review round 3, fix 5), so it says so.
      JSON.stringify({ ...light, moment: 'standalone', demotion: 'no-subagent-tool' })
    );
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const invoke = async (...args: string[]) => {
      const program = new Command().option('--json');
      program.addCommand(createCheckReviewReceiptCommand({ cwd: () => tmp }));
      process.exitCode = undefined;
      await program.parseAsync(['node', 'harness', 'check-review-receipt', odd, ...args]);
      return process.exitCode ?? 0;
    };
    expect(await invoke('--moment', 'standalone')).toBe(0);
    expect(await invoke()).toBe(1);
    expect(await invoke('--moment', 'final')).toBe(1);
  });
  it.each(['fianl', '', 'PHASE', 'phase '])(
    'the command refuses --moment %j as an invalid argument, before any gate runs',
    async (value) => {
      const { mid, head } = realRepo();
      writeLight(dir, head, mid);
      const program = new Command().option('--json').exitOverride();
      const cmd = createCheckReviewReceiptCommand({ cwd: () => tmp }).exitOverride();
      cmd.configureOutput({ writeErr: () => {} });
      program.addCommand(cmd);
      const argv = ['node', 'harness', 'check-review-receipt', dir, '--moment', value];
      await expect(program.parseAsync(argv)).rejects.toMatchObject({
        code: 'commander.invalidArgument',
      });
    }
  );
});

/**
 * Round 3, fix 4. Input partition for the range a receipt claims, before git is asked anything:
 * the receipt is not an object, has no diff, has a diff that is not an object, and a base that
 * is a short sha, an upper-case sha, a number, or an ARRAY HOLDING a sha (String([sha]) is the
 * sha, so a String() test let it through). Git is asked only when both ends are sha strings.
 */
describe('round 3, fix 4: git is asked about a claimed range only when both ends are sha strings', () => {
  const asked = (raw: unknown) => {
    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(raw));
    const calls: string[][] = [];
    const r = runCheckReviewReceipt({
      receiptPath: dir,
      cwd: tmp,
      git: (args, cwd) => {
        calls.push(args);
        return git()(args, cwd);
      },
    });
    return { calls, codes: r.failures.map((f) => f.code) };
  };
  it.each([
    ['a number', 7],
    ['null', null],
    ['an array', []],
    ['no diff', receipt({ diff: undefined })],
    ['a diff that is a string', receipt({ diff: `${BASE}..${HEAD}` })],
    ['a short base', receipt({ diff: { base: 'abc1234', head: HEAD } })],
    ['an upper-case base', receipt({ diff: { base: BASE.toUpperCase(), head: HEAD } })],
    ['a numeric base', receipt({ diff: { base: 7, head: HEAD } })],
    ['a base that is an array holding a sha', receipt({ diff: { base: [BASE], head: HEAD } })],
    ['a head that is an array holding a sha', receipt({ diff: { base: BASE, head: [HEAD] } })],
  ])('%s: RECEIPT_INVALID and git is never called', (_name, raw) => {
    expect(asked(raw)).toEqual({ calls: [], codes: ['RECEIPT_INVALID'] });
  });
  it('two sha strings: git is asked', () => {
    const { calls, codes } = asked(receipt());
    expect(codes).not.toContain('RECEIPT_INVALID');
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('round 3, fix 3: a findings path that is not a regular file', () => {
  it.skipIf(process.platform === 'win32')(
    "a FIFO named as a findings file fails FINDINGS_FILE_MISSING instead of hanging (the reviewers' reproduction)",
    () => {
      write(receipt());
      fs.rmSync(path.join(dir, 'security.json'));
      execFileSync('mkfifo', [path.join(dir, 'security.json')]);
      const r = run();
      expect(r.failures).toEqual([
        expect.objectContaining({ code: 'FINDINGS_FILE_MISSING', reviewerId: 'security' }),
      ]);
      expect(r.failures[0]?.message).toMatch(/regular file/);
    }
  );
});

describe('fix 3: a findings file left from an earlier round does not count at a new head', () => {
  it("fails every reviewer whose file names another head (the reviewers' reproduction)", () => {
    const { mid, head } = realRepo();
    write(receipt({ diff: { base: mid, head } }), FULL, { head: mid, examinedFiles: ['src/b.ts'] });
    const r = real();
    expect(codesOf(r)).toEqual(Array(4).fill('FINDINGS_HEAD_MISMATCH'));
    write(receipt({ diff: { base: mid, head } }), FULL, { head, examinedFiles: ['src/b.ts'] });
    expect(real().pass).toBe(true);
  });
});

describe('fix 4: diff.base is checked as far as git allows', () => {
  beforeEach(() => {
    dir = path.join(path.dirname(dir), 'final-all');
    fs.mkdirSync(dir);
  });
  it("fails a final receipt narrowed to the last commit (the reviewers' reproduction)", () => {
    const { seed, mid, head } = realRepo();
    const final = (base: string, over: Record<string, unknown> = {}) =>
      receipt({ moment: 'final', diff: { base, head, ...over } });
    write(final(mid), FULL, { head, examinedFiles: ['src/b.ts'] });
    const narrowed = real();
    expect(codesOf(narrowed)).toEqual(['FINAL_BASE_NOT_MERGE_BASE']);
    expect(narrowed.failures[0]?.message).toContain(seed);
    write(final(seed), FULL, { head });
    expect(real().failures).toEqual([]);
    // Round 3, fix 2: declaring a starting commit does not switch the check off while the
    // default branch resolves (the adversarial reviewer's reproduction).
    write(final(mid, { baseSource: 'starting-commit' }), FULL, {
      head,
      examinedFiles: ['src/b.ts'],
    });
    const declared = real();
    expect(codesOf(declared)).toEqual(['FINAL_BASE_NOT_MERGE_BASE']);
    expect(declared.failures[0]?.message).toMatch(/starting-commit is accepted only when/);
    // Review round 3 on unit 1, fix 7: the label itself is refused while a merge base resolves.
    write(final(seed, { baseSource: 'starting-commit' }), FULL, { head });
    expect(codesOf(real())).toEqual(['FINAL_BASE_NOT_MERGE_BASE']);
  });
  it('fails a final receipt when no default branch resolves, unless it declares a starting commit', () => {
    const { g, seed, head } = realRepo();
    g('update-ref', '-d', 'refs/remotes/origin/main');
    write(receipt({ moment: 'final', diff: { base: seed, head } }), FULL, { head });
    const r = real();
    expect(codesOf(r)).toEqual(['FINAL_BASE_NOT_MERGE_BASE']);
    expect(r.failures[0]?.message).toContain('could not be resolved');
    const declared = { base: seed, head, baseSource: 'starting-commit' };
    write(receipt({ moment: 'final', diff: declared }), FULL, { head });
    // Round 4, fix 1: only when it is the session's starting commit, which must be known.
    startAt(undefined);
    expect(codesOf(real())).toEqual(['STARTING_COMMIT_UNKNOWN']);
    const state = path.join(tmp, '.harness', 'sessions', 's1', 'autopilot-state.json');
    fs.writeFileSync(state, JSON.stringify({ startingCommit: seed, phases: [] }));
    expect(real().pass).toBe(true);
  });
  it('resolves the default branch from origin/HEAD when it is not main', () => {
    const { g, seed, head } = realRepo();
    g('update-ref', '-d', 'refs/remotes/origin/main');
    g('update-ref', 'refs/remotes/origin/trunk', seed);
    g('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    write(receipt({ moment: 'final', diff: { base: seed, head } }), FULL, { head });
    expect(real().failures).toEqual([]);
  });
  it('fails a base that is not an ancestor of the head', () => {
    dir = path.join(path.dirname(dir), 'phase-0');
    const { g, seed, mid, head } = realRepo();
    g('checkout', '-q', '-b', 'side', seed);
    fs.writeFileSync(path.join(tmp, 'side.txt'), 'side\n');
    g('add', 'side.txt');
    g('commit', '-q', '--no-verify', '-m', 'side');
    const side = g('rev-parse', 'HEAD');
    g('checkout', '-q', 'work');
    write(receipt({ diff: { base: side, head } }), FULL, { head });
    expect(codesOf(real())).toContain('DIFF_BASE_NOT_ANCESTOR');
    write(receipt({ diff: { base: mid, head } }), FULL, { head, examinedFiles: ['src/b.ts'] });
    expect(real().pass).toBe(true);
  });
});

describe('V2-8: a renamed file is in the diff under both names', () => {
  it('accepts a reviewer that lists the old path of a renamed file', () => {
    const { g, head: before } = realRepo();
    startAt(before);
    g('mv', 'src/a.ts', 'src/renamed.ts');
    g('commit', '-q', '--no-verify', '-m', 'rename');
    const head = g('rev-parse', 'HEAD');
    write(receipt({ diff: { base: before, head } }), FULL, { head, examinedFiles: ['src/a.ts'] });
    expect(real().failures).toEqual([]);
  });
});

describe('fix 7: a findings file that is a symlink out of the review directory is not read', () => {
  it.skipIf(process.platform === 'win32')('fails the reviewer as having no file', () => {
    const { seed, head } = realRepo();
    startAt(seed);
    write(receipt({ diff: { base: seed, head } }), FULL, { head });
    const outside = path.join(tmp, 'outside.json');
    fs.renameSync(path.join(dir, 'bug.json'), outside);
    fs.symlinkSync(outside, path.join(dir, 'bug.json'));
    const r = real();
    expect(r.failures).toEqual([
      expect.objectContaining({ code: 'FINDINGS_FILE_MISSING', reviewerId: 'bug' }),
    ]);
    expect(r).toMatchObject({ reviewersRun: 3, reviewersRequired: 4 });
    expect(formatCheckReviewReceipt(r)[0]).toContain('3/4 required reviewers ran');
  });
});
