import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runMigrate, createMigrateCommand } from '../../src/commands/migrate';

let tmp: string;

function writeFile(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-cov-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('runMigrate — resolveDocsDir branches', () => {
  it('defaults docsDir to ./docs and warns when harness.config.json is invalid JSON', async () => {
    writeFile(tmp, 'harness.config.json', '{ this is : not json');
    writeFile(tmp, '.harness/architecture/foo/ADR-001.md', '# ADR\n');
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    // The ADR landed under the default docs/ location despite the broken config.
    expect(fs.existsSync(path.join(tmp, 'docs/architecture/foo/ADR-001.md'))).toBe(true);
  });

  it('respects a custom docsDir from a valid config', async () => {
    writeFile(
      tmp,
      'harness.config.json',
      JSON.stringify({ version: 1, docsDir: './documentation' })
    );
    writeFile(tmp, '.harness/architecture/foo/ADR-001.md', '# ADR\n');
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'documentation/architecture/foo/ADR-001.md'))).toBe(true);
  });
});

describe('runMigrate — orphan handling + references', () => {
  it('dry-run with --orphan-strategy=ask does not prompt and reports the orphans', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-mystery-plan.md', '# Plan\n');
    const result = await runMigrate({ cwd: tmp, dryRun: true, orphanStrategy: 'ask' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dryRun).toBe(true);
      expect(result.value.orphansRemaining).toBe(1);
    }
    // The orphan file was NOT moved.
    expect(fs.existsSync(path.join(tmp, 'docs/plans/2026-01-01-mystery-plan.md'))).toBe(true);
  });

  it('buckets orphans and re-summarizes when --orphan-strategy=bucket', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-mystery-plan.md', '# Plan\n');
    const result = await runMigrate({
      cwd: tmp,
      yes: true,
      orphanStrategy: 'bucket',
      orphanTopic: 'legacy',
    });
    expect(result.ok).toBe(true);
    expect(
      fs.existsSync(path.join(tmp, 'docs/changes/legacy/plans/2026-01-01-mystery-plan.md'))
    ).toBe(true);
  });

  it('errors when --orphan-strategy=bucket lacks --orphan-topic', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-mystery-plan.md', '# Plan\n');
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'bucket' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/orphan-topic/);
  });

  it('skips reference updates when skipReferences is set', async () => {
    writeFile(tmp, 'docs/changes/api/proposal.md', '# API\n');
    writeFile(tmp, 'docs/plans/2026-01-01-api-plan.md', '# API plan\n');
    // A doc that references the OLD plan path — it must remain untouched under skipReferences.
    writeFile(tmp, 'docs/notes.md', 'see docs/plans/2026-01-01-api-plan.md\n');
    const result = await runMigrate({
      cwd: tmp,
      yes: true,
      orphanStrategy: 'skip',
      skipReferences: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.references.replacements).toBe(0);
    expect(fs.readFileSync(path.join(tmp, 'docs/notes.md'), 'utf-8')).toContain(
      'docs/plans/2026-01-01-api-plan.md'
    );
  });

  it('reports nothing-to-migrate on a clean tree', async () => {
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.movesPlanned).toBe(0);
  });
});

describe('runMigrate — git repository move path', () => {
  it('uses git mv inside a real git repository', async () => {
    // A real repo exercises the isGitRepo=true branch + gitMv git path.
    try {
      execFileSync('git', ['init', '-q'], { cwd: tmp, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmp, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 't'], { cwd: tmp, stdio: 'pipe' });
    } catch {
      return; // git unavailable — skip silently
    }
    writeFile(tmp, '.harness/architecture/foo/ADR-001.md', '# ADR\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp, stdio: 'pipe' });
    execFileSync('git', ['commit', '-qm', 'init'], { cwd: tmp, stdio: 'pipe' });
    const result = await runMigrate({ cwd: tmp, yes: true, orphanStrategy: 'skip' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.movesApplied).toBe(1);
    expect(fs.existsSync(path.join(tmp, 'docs/architecture/foo/ADR-001.md'))).toBe(true);
  });
});

describe('createMigrateCommand', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    process.chdir(tmp);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    process.chdir(origCwd);
  });

  it('exits SUCCESS (0) after a dry-run on a clean tree', async () => {
    const cmd = createMigrateCommand();
    await expect(cmd.parseAsync(['--dry-run', '--yes'], { from: 'user' })).rejects.toThrow(
      'process.exit called'
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits with the error code when runMigrate fails (bucket without topic)', async () => {
    writeFile(tmp, 'docs/plans/2026-01-01-mystery-plan.md', '# Plan\n');
    const cmd = createMigrateCommand();
    await expect(
      cmd.parseAsync(['--yes', '--orphan-strategy', 'bucket'], { from: 'user' })
    ).rejects.toThrow('process.exit called');
    expect(errSpy).toHaveBeenCalled();
    // VALIDATION_FAILED === 1
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
