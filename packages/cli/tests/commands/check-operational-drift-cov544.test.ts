import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runCheckOperationalDrift,
  resolveBaseRef,
  collectChangedFiles,
  createCheckOperationalDriftCommand,
  type RunGit,
} from '../../src/commands/check-operational-drift';
import { ExitCode } from '../../src/utils/errors';

const exitSentinel = new Error('__exit__');

function writeConfig(dir: string, config: object | string): string {
  const p = path.join(dir, 'harness.config.json');
  fs.writeFileSync(p, typeof config === 'string' ? config : JSON.stringify(config));
  return p;
}

describe('resolveBaseRef (cov544)', () => {
  it('returns an explicit base ref verbatim', () => {
    const runGit: RunGit = () => {
      throw new Error('should not be called');
    };
    expect(resolveBaseRef({ base: 'abc123', runGit })).toBe('abc123');
  });

  it('resolves the default branch from origin/HEAD then merge-base', () => {
    const runGit: RunGit = (args) => {
      if (args[0] === 'symbolic-ref') return 'refs/remotes/origin/develop';
      if (args[0] === 'merge-base' && args[2] === 'origin/develop') return 'base-sha';
      throw new Error('nope');
    };
    expect(resolveBaseRef({ base: undefined, runGit })).toBe('base-sha');
  });

  it('falls back to HEAD when symbolic-ref and every merge-base candidate fail', () => {
    const runGit: RunGit = (args) => {
      if (args[0] === 'symbolic-ref') throw new Error('no origin/HEAD');
      throw new Error('no merge-base');
    };
    expect(resolveBaseRef({ base: undefined, runGit })).toBe('HEAD');
  });
});

describe('collectChangedFiles (cov544)', () => {
  it('unions tracked diff and untracked files, normalizing separators', () => {
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') return 'src/a.ts\n\nsrc/b.ts';
      if (args[0] === 'ls-files') return 'new/c.ts\n';
      throw new Error('x');
    };
    const files = collectChangedFiles('BASE', runGit);
    expect(files).toContain('src/a.ts');
    expect(files).toContain('src/b.ts');
    expect(files).toContain('new/c.ts');
  });

  it('tolerates a failing diff and a failing ls-files (returns what it can)', () => {
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') throw new Error('bad base');
      if (args[0] === 'ls-files') return 'only/untracked.ts';
      throw new Error('x');
    };
    expect(collectChangedFiles('HEAD', runGit)).toEqual(['only/untracked.ts']);
  });
});

describe('runCheckOperationalDrift (cov544)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opdrift-cov-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns Err on a malformed config', async () => {
    const cfg = writeConfig(tmpDir, '{ not json');
    const result = await runCheckOperationalDrift({
      cwd: tmpDir,
      configPath: cfg,
      runGit: () => '',
    });
    expect(result.ok).toBe(false);
  });

  it('is a no-op pass when the policy is disabled', async () => {
    const cfg = writeConfig(tmpDir, { version: 1, operationalPolicy: { enabled: false } });
    const result = await runCheckOperationalDrift({
      cwd: tmpDir,
      configPath: cfg,
      base: 'HEAD',
      runGit: () => 'ignored',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid).toBe(true);
    expect(result.value.flagged).toBe(false);
    expect(result.value.operationalChanges).toEqual([]);
  });

  it('flags a watched hook-script change with no ADR (advisory)', async () => {
    const cfg = writeConfig(tmpDir, { version: 1 });
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') return '.husky/pre-commit';
      if (args[0] === 'ls-files') return '';
      throw new Error('x');
    };
    const result = await runCheckOperationalDrift({
      cwd: tmpDir,
      configPath: cfg,
      base: 'HEAD',
      runGit,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.flagged).toBe(true);
    expect(result.value.valid).toBe(false);
    expect(result.value.severity).toBe('advisory');
    expect(result.value.operationalChanges.length).toBeGreaterThan(0);
  });

  it('does not flag when an ADR accompanies the operational change', async () => {
    const cfg = writeConfig(tmpDir, { version: 1 });
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') return '.husky/pre-commit\ndocs/knowledge/decisions/0001-hooks.md';
      if (args[0] === 'ls-files') return '';
      throw new Error('x');
    };
    const result = await runCheckOperationalDrift({
      cwd: tmpDir,
      configPath: cfg,
      base: 'HEAD',
      runGit,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.adrFiles.length).toBeGreaterThan(0);
    expect(result.value.flagged).toBe(false);
    expect(result.value.valid).toBe(true);
  });

  it('--strict forces blocking severity', async () => {
    const cfg = writeConfig(tmpDir, { version: 1 });
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') return '.husky/pre-commit';
      if (args[0] === 'ls-files') return '';
      throw new Error('x');
    };
    const result = await runCheckOperationalDrift({
      cwd: tmpDir,
      configPath: cfg,
      base: 'HEAD',
      strict: true,
      runGit,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.severity).toBe('blocking');
    expect(result.value.flagged).toBe(true);
  });

  it('diffs config threshold sub-trees field-by-field (changed threshold flags)', async () => {
    const cfg = writeConfig(tmpDir, {
      version: 1,
      architecture: { thresholds: { complexity: 20 } },
    });
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') return 'harness.config.json';
      if (args[0] === 'ls-files') return '';
      if (args[0] === 'show')
        return JSON.stringify({ version: 1, architecture: { thresholds: { complexity: 10 } } });
      throw new Error('x');
    };
    const result = await runCheckOperationalDrift({
      cwd: tmpDir,
      configPath: cfg,
      base: 'BASE',
      runGit,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.flagged).toBe(true);
    expect(
      result.value.operationalChanges.some((c) => c.surface.includes('harness.config.json'))
    ).toBe(true);
  });

  it('flags the whole config file when the base side is undiffable', async () => {
    const cfg = writeConfig(tmpDir, {
      version: 1,
      architecture: { thresholds: { complexity: 20 } },
    });
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') return 'harness.config.json';
      if (args[0] === 'ls-files') return '';
      if (args[0] === 'show') throw new Error('cannot read base blob');
      throw new Error('x');
    };
    const result = await runCheckOperationalDrift({
      cwd: tmpDir,
      configPath: cfg,
      base: 'BASE',
      runGit,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.flagged).toBe(true);
  });
});

describe('check-operational-drift command action (cov544)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logs: string[];
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opdrift-action-'));
    logs = [];
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw exitSentinel;
    }) as never);
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.join(' '));
    });
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  function git(args: string[]): void {
    const r = spawnSync('git', args, { cwd: tmpDir, encoding: 'utf-8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }

  function initRepo(config: object): void {
    git(['init', '-q']);
    git(['config', 'user.email', 't@example.com']);
    git(['config', 'user.name', 'Test']);
    writeConfig(tmpDir, config);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'base']);
  }

  async function run(globalFlags: string[], subArgs: string[]): Promise<number | undefined> {
    const p = new Command();
    p.exitOverride();
    p.option('--json');
    p.option('--quiet');
    p.option('--verbose');
    p.option('-c, --config <path>');
    p.addCommand(createCheckOperationalDriftCommand());
    try {
      await p.parseAsync(['check-operational-drift', ...globalFlags, ...subArgs], { from: 'user' });
    } catch (e) {
      if (e !== exitSentinel) throw e;
    }
    return exitSpy.mock.calls.at(-1)?.[0] as number | undefined;
  }

  it('errors (text) on a malformed config', async () => {
    const cfg = writeConfig(tmpDir, '{ broken');
    const code = await run([], ['--config', cfg]);
    expect(code).toBe(ExitCode.ERROR);
  });

  it('errors (JSON) on a malformed config, printing {error}', async () => {
    const cfg = writeConfig(tmpDir, '{ broken');
    const code = await run(['--json'], ['--config', cfg]);
    expect(JSON.parse(logs.join('\n')).error).toBeDefined();
    expect(code).toBe(ExitCode.ERROR);
  });

  it('clean pass: prints the no-surfaces line and exits 0 (disabled policy, no repo)', async () => {
    const cfg = writeConfig(tmpDir, { version: 1, operationalPolicy: { enabled: false } });
    const code = await run([], ['--config', cfg, '--base', 'HEAD']);
    expect(logs.join('\n')).toContain('No operational-policy surfaces changed');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('clean pass in JSON mode emits the structured result', async () => {
    const cfg = writeConfig(tmpDir, { version: 1, operationalPolicy: { enabled: false } });
    const code = await run(['--json'], ['--config', cfg, '--base', 'HEAD']);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.valid).toBe(true);
    expect(parsed.flagged).toBe(false);
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('flagged advisory: prints the ⚠ advisory guidance and still exits 0', async () => {
    initRepo({ version: 1 });
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.husky'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.husky', 'pre-commit'), 'SKIP="foo"\n');
    const code = await run([], ['--base', 'HEAD']);
    const out = logs.join('\n');
    expect(out).toContain('Operational-policy surfaces changed');
    expect(out).toContain('advisory');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('flagged blocking (--strict): prints ✗ and exits with VALIDATION_FAILED', async () => {
    initRepo({ version: 1 });
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.husky'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.husky', 'pre-commit'), 'SKIP="foo"\n');
    const code = await run([], ['--base', 'HEAD', '--strict']);
    expect(logs.join('\n')).toContain('No ADR found');
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
  });

  it('flagged with an accompanying ADR: prints the documented-by-ADR line, exits 0', async () => {
    initRepo({ version: 1 });
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.husky'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.husky', 'pre-commit'), 'SKIP="foo"\n');
    fs.mkdirSync(path.join(tmpDir, 'docs', 'knowledge', 'decisions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'knowledge', 'decisions', '0001-x.md'), '# adr\n');
    const code = await run([], ['--base', 'HEAD', '--strict']);
    expect(logs.join('\n')).toContain('documented by an ADR');
    expect(code).toBe(ExitCode.SUCCESS);
  });

  it('quiet mode suppresses the human report but exits per gate', async () => {
    initRepo({ version: 1 });
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.husky'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.husky', 'pre-commit'), 'SKIP="foo"\n');
    const code = await run(['--quiet'], ['--base', 'HEAD']);
    expect(logs.join('\n')).not.toContain('Operational-policy surfaces changed');
    expect(code).toBe(ExitCode.SUCCESS);
  });
});
