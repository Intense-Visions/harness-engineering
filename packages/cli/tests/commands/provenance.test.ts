import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runProvenanceCommand,
  createProvenanceCommand,
  type RunGit,
} from '../../src/commands/provenance';

const WELL_FORMED = [
  'feat: something',
  '',
  'Harness-Run: roadmap-fleet@5.12.0',
  'Harness-Provenance-Version: 1',
  'Harness-Run-Id: run_abc',
  'Harness-Lane: build',
].join('\n');

const MALFORMED = 'feat: mangled\n\nHarness-Run: broken\nHarness-Run: broken';

const SHA = 'a'.repeat(40);

/**
 * Fake git. `messages` maps a resolved sha to its commit message; any ref not
 * in `refs` fails to resolve, as real git would.
 */
function fakeGit(options: {
  refs?: Record<string, string>;
  messages?: Record<string, string>;
  log?: Array<[string, string]>;
  logThrows?: boolean;
  notARepo?: boolean;
}): RunGit {
  return (args) => {
    if (args[0] === 'rev-parse' && args[1] === '--git-dir') {
      if (options.notARepo === true) throw new Error('fatal: not a git repository');
      return '.git\n';
    }
    if (args[0] === 'rev-parse') {
      const ref = args[args.length - 1]!.replace(/\^\{commit\}$/, '');
      const resolved = options.refs?.[ref];
      if (resolved === undefined) throw new Error('fatal: ambiguous argument');
      return `${resolved}\n`;
    }
    if (args[0] === 'show') {
      return options.messages?.[args[args.length - 1]!] ?? '';
    }
    if (args[0] === 'log') {
      if (options.logThrows === true) throw new Error('fatal: bad revision');
      return (options.log ?? []).map(([sha, msg]) => `${sha}\x1f${msg}\x1e`).join('');
    }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

let stdout: string;
let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdout = '';
  writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
});

afterEach(() => {
  writeSpy.mockRestore();
});

describe('harness provenance — reader mode', () => {
  it('prints every populated key and exits 0 for a well-formed trailer', () => {
    const { report, exitCode } = runProvenanceCommand({
      commitish: 'HEAD',
      runGit: fakeGit({ refs: { HEAD: SHA }, messages: { [SHA]: WELL_FORMED } }),
    });

    expect(exitCode).toBe(0);
    expect(report.mode).toBe('read');
    expect(stdout).toContain('Harness-Run');
    expect(stdout).toContain('roadmap-fleet@5.12.0');
    expect(stdout).toContain('run_abc');
    expect(stdout).toContain('build');
  });

  it('reports honestly and exits 3 — never 0 — when the commit carries no trailer', () => {
    const { report, exitCode } = runProvenanceCommand({
      commitish: SHA,
      runGit: fakeGit({ refs: { [SHA]: SHA }, messages: { [SHA]: 'chore: a human commit' } }),
    });

    expect(exitCode).toBe(3);
    expect(stdout).toBe(`no provenance trailer on ${SHA}\n`);
    if (report.mode !== 'read') throw new Error('expected read mode');
    expect(report.status).toBe('absent');
  });

  it('exits 1 and names each issue when the trailer is malformed', () => {
    const { exitCode } = runProvenanceCommand({
      commitish: 'HEAD',
      runGit: fakeGit({ refs: { HEAD: SHA }, messages: { [SHA]: MALFORMED } }),
    });

    expect(exitCode).toBe(1);
    expect(stdout).toContain('MALFORMED');
    expect(stdout).toContain('duplicate-key');
    expect(stdout).toContain('missing-version');
  });

  it('defaults to HEAD when no commit-ish is given', () => {
    const { report } = runProvenanceCommand({
      runGit: fakeGit({ refs: { HEAD: SHA }, messages: { [SHA]: WELL_FORMED } }),
    });
    if (report.mode !== 'read') throw new Error('expected read mode');
    expect(report.commit).toBe(SHA);
  });

  it('raises an actionable error naming the ref, not a raw git failure', () => {
    expect(() =>
      runProvenanceCommand({ commitish: 'nope', runGit: fakeGit({ refs: {} }) })
    ).toThrowError(/cannot resolve "nope" to a commit/);
  });

  it('raises an actionable error outside a git repository', () => {
    expect(() =>
      runProvenanceCommand({ cwd: '/nowhere', runGit: fakeGit({ notARepo: true }) })
    ).toThrowError(/not a git repository/);
  });

  it('emits a single JSON document and no human lines under --json', () => {
    runProvenanceCommand({
      commitish: 'HEAD',
      json: true,
      runGit: fakeGit({ refs: { HEAD: SHA }, messages: { [SHA]: WELL_FORMED } }),
    });

    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed.mode).toBe('read');
    expect(parsed.commit).toBe(SHA);
    expect(parsed.status).toBe('valid');
    expect(parsed).toHaveProperty('trailer');
    expect(parsed).toHaveProperty('issues');
    expect(parsed).toHaveProperty('warnings');
  });
});

describe('harness provenance --check — shape gate', () => {
  it('exits 1 and names the offending commit when any trailer is malformed', () => {
    const { report, exitCode } = runProvenanceCommand({
      range: 'origin/main...HEAD',
      check: true,
      runGit: fakeGit({
        log: [
          ['1'.repeat(40), WELL_FORMED],
          ['2'.repeat(40), MALFORMED],
        ],
      }),
    });

    expect(exitCode).toBe(1);
    if (report.mode !== 'check') throw new Error('expected check mode');
    expect(report.malformed).toBe(1);
    expect(stdout).toContain('2'.repeat(40));
    expect(stdout).toContain('duplicate-key');
  });

  it('exits 0 over unclaimed commits and states the counts it examined', () => {
    const { report, exitCode } = runProvenanceCommand({
      range: 'origin/main...HEAD',
      check: true,
      runGit: fakeGit({
        log: [
          ['1'.repeat(40), 'chore: human one'],
          ['2'.repeat(40), 'chore: human two'],
        ],
      }),
    });

    expect(exitCode).toBe(0);
    if (report.mode !== 'check') throw new Error('expected check mode');
    expect(report).toMatchObject({ examined: 2, carried: 0, unclaimed: 2, malformed: 0 });
    // The denominator must always be stated: "nothing to validate" can never be
    // mistaken for "validated everything".
    expect(stdout).toContain('examined 2 · carried a trailer 0 · unclaimed 2 · malformed 0');
    expect(stdout).toContain('checks SHAPE only');
  });

  it('exits 3 when the range resolves to no commits at all', () => {
    const { exitCode } = runProvenanceCommand({
      range: 'HEAD..HEAD',
      check: true,
      runGit: fakeGit({ log: [] }),
    });

    expect(exitCode).toBe(3);
    expect(stdout).toContain('nothing examined');
  });

  it('raises an actionable error naming an unresolvable range', () => {
    expect(() =>
      runProvenanceCommand({
        range: 'nope..HEAD',
        check: true,
        runGit: fakeGit({ logThrows: true }),
      })
    ).toThrowError(/cannot resolve "nope\.\.HEAD" to a commit range/);
  });

  it('shape-checks a single commit when --check is used without --range', () => {
    const { report, exitCode } = runProvenanceCommand({
      commitish: 'HEAD',
      check: true,
      runGit: fakeGit({ refs: { HEAD: SHA }, messages: { [SHA]: WELL_FORMED } }),
    });

    expect(exitCode).toBe(0);
    if (report.mode !== 'check') throw new Error('expected check mode');
    expect(report).toMatchObject({ examined: 1, carried: 1, malformed: 0 });
  });
});

describe('harness provenance — command registration', () => {
  it('registers as a top-level command distinct from `rules provenance`', () => {
    const command = createProvenanceCommand();
    expect(command.name()).toBe('provenance');
    const flags = command.options.map((o) => o.long);
    expect(flags).toContain('--check');
    expect(flags).toContain('--range');
    // Declared locally so Commander accepts it after the command name, even
    // though the value is read via optsWithGlobals() (issue #2069).
    expect(flags).toContain('--json');
  });
});

describe('harness provenance — against real git', () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'harness-provenance-'));
    const git = (args: string[], input?: string): void => {
      execFileSync('git', args, { cwd: repo, input, stdio: ['pipe', 'ignore', 'ignore'] });
    };
    git(['init', '-q']);
    git(['config', 'user.email', 'lane@example.com']);
    git(['config', 'user.name', 'lane']);
    writeFileSync(join(repo, 'f'), '1');
    git(['add', 'f']);
    git(['commit', '-q', '-m', 'chore: unclaimed human commit']);
    writeFileSync(join(repo, 'f'), '2');
    git(['add', 'f']);
    git(['commit', '-q', '-F', '-'], WELL_FORMED);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('reads a real commit message through the default git seam', () => {
    const { report, exitCode } = runProvenanceCommand({ cwd: repo, commitish: 'HEAD' });
    expect(exitCode).toBe(0);
    if (report.mode !== 'read') throw new Error('expected read mode');
    expect(report.trailer?.skill).toBe('roadmap-fleet');
    expect(report.trailer?.runId).toBe('run_abc');
  });

  it('exits 3 on a real trailer-less commit', () => {
    const { exitCode } = runProvenanceCommand({ cwd: repo, commitish: 'HEAD~1' });
    expect(exitCode).toBe(3);
  });

  it('shape-checks a real range, skipping the unclaimed commit', () => {
    const { report, exitCode } = runProvenanceCommand({
      cwd: repo,
      check: true,
      range: 'HEAD~1..HEAD',
    });
    expect(exitCode).toBe(0);
    if (report.mode !== 'check') throw new Error('expected check mode');
    expect(report).toMatchObject({ examined: 1, carried: 1, malformed: 0 });
  });
});
