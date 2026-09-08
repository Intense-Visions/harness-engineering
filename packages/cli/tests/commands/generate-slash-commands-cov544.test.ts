import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import {
  createGenerateSlashCommandsCommand,
  generateSlashCommands,
  resolveSkillSources,
} from '../../src/commands/generate-slash-commands';

function makeSkillDir(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-cov-'));
  const skill = path.join(tmp, 'my-skill');
  fs.mkdirSync(skill, { recursive: true });
  fs.writeFileSync(
    path.join(skill, 'skill.yaml'),
    'name: my-skill\nversion: "1.0.0"\ndescription: a skill\ntriggers:\n  - manual\nplatforms:\n  - claude-code\n  - gemini-cli\n  - codex\ntools:\n  - Read\ntype: rigid\ntier: 1\n'
  );
  fs.writeFileSync(path.join(skill, 'SKILL.md'), '# My Skill\n');
  return tmp;
}

interface RunOutcome {
  exitCode: number | null;
  out: string[];
  err: string[];
}

async function run(args: string[], globalFlags: string[] = []): Promise<RunOutcome> {
  const program = new Command();
  program.option('--json');
  program.addCommand(createGenerateSlashCommandsCommand());

  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit__:${exitCode}`);
  }) as never);
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => out.push(String(m)));
  const errSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((m?: unknown) => err.push(String(m)));

  try {
    await program.parseAsync([...globalFlags, 'generate-slash-commands', ...args], {
      from: 'user',
    });
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { exitCode, out, err };
}

describe('generate-slash-commands command action', () => {
  let skillsDir: string;
  let outDir: string;

  beforeEach(() => {
    skillsDir = makeSkillDir();
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-out-'));
  });
  afterEach(() => {
    fs.rmSync(skillsDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('rejects an invalid platform via handleError', async () => {
    const { exitCode } = await run(['--platforms', 'not-a-platform']);
    expect(exitCode).toBe(1); // ExitCode.VALIDATION_FAILED
  });

  it('rejects an invalid --cursor-mode', async () => {
    const { exitCode } = await run([
      '--platforms',
      'cursor',
      '--cursor-mode',
      'bogus',
      '--skills-dir',
      skillsDir,
      '--skills-dir-only',
    ]);
    expect(exitCode).toBe(1);
  });

  it('prints a human summary of generated commands', async () => {
    const { exitCode, out } = await run([
      '--platforms',
      'claude-code',
      '--skills-dir',
      skillsDir,
      '--skills-dir-only',
      '--output',
      outDir,
      '--yes',
    ]);
    expect(exitCode).toBeNull();
    const joined = out.join('\n');
    expect(joined).toContain('claude-code');
    expect(joined).toContain('my-skill.md');
  });

  it('emits JSON results in --json mode', async () => {
    const { exitCode, out } = await run(
      [
        '--platforms',
        'claude-code',
        '--skills-dir',
        skillsDir,
        '--skills-dir-only',
        '--output',
        outDir,
        '--yes',
      ],
      ['--json']
    );
    expect(exitCode).toBeNull();
    const parsed = JSON.parse(out.join('\n'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].platform).toBe('claude-code');
  });

  it('reports "No skills found" when the scoped dir is empty', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-empty-'));
    const { exitCode, out } = await run([
      '--platforms',
      'claude-code',
      '--skills-dir',
      emptyDir,
      '--skills-dir-only',
      '--output',
      outDir,
    ]);
    fs.rmSync(emptyDir, { recursive: true, force: true });
    expect(exitCode).toBeNull();
    expect(out.join('\n')).toContain('No skills found');
  });

  it('adds the dry-run notice when --dry-run is set', async () => {
    const { exitCode, out } = await run([
      '--platforms',
      'claude-code',
      '--skills-dir',
      skillsDir,
      '--skills-dir-only',
      '--output',
      outDir,
      '--dry-run',
    ]);
    expect(exitCode).toBeNull();
    expect(out.join('\n')).toContain('dry run');
  });
});

describe('generateSlashCommands — codex + output-dir branches (dry-run, no writes)', () => {
  let skillsDir: string;
  beforeEach(() => {
    skillsDir = makeSkillDir();
  });
  afterEach(() => fs.rmSync(skillsDir, { recursive: true, force: true }));

  it('produces a codex result for the codex platform', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-codex-'));
    const results = generateSlashCommands({
      platforms: ['codex'],
      global: false,
      includeGlobal: false,
      skillsDir,
      skillsDirOnly: true,
      output: outDir,
      dryRun: false,
      yes: false,
    });
    const codex = results.find((r) => r.platform === 'codex');
    expect(codex).toBeDefined();
    // AGENTS.md is written at the codex root
    expect(fs.existsSync(path.join(outDir, 'AGENTS.md'))).toBe(true);
    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('resolves default (non-output) relative output dirs under dry-run without writing', () => {
    const results = generateSlashCommands({
      platforms: ['claude-code', 'gemini-cli', 'cursor', 'codex'],
      global: false,
      includeGlobal: false,
      skillsDir,
      skillsDirOnly: true,
      dryRun: true,
      yes: false,
    });
    expect(results.map((r) => r.platform)).toEqual(
      expect.arrayContaining(['claude-code', 'gemini-cli', 'cursor', 'codex'])
    );
    const claude = results.find((r) => r.platform === 'claude-code');
    expect(claude!.outputDir).toContain(path.join('agents', 'commands', 'claude-code', 'harness'));
  });

  it('resolves global (home) output dirs under dry-run without writing', () => {
    const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-home-'));
    const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
    const results = generateSlashCommands({
      platforms: ['claude-code', 'gemini-cli', 'cursor', 'codex'],
      global: true,
      includeGlobal: false,
      skillsDir,
      skillsDirOnly: true,
      dryRun: true,
      yes: false,
    });
    homeSpy.mockRestore();
    const claude = results.find((r) => r.platform === 'claude-code');
    expect(claude!.outputDir).toContain(path.join(fakeHome, '.claude', 'commands', 'harness'));
    // dry-run wrote nothing to the fake home
    expect(fs.existsSync(path.join(fakeHome, '.claude'))).toBe(false);
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });
});

describe('resolveSkillSources', () => {
  it('returns only the scoped source when skillsDirOnly is set', () => {
    const skillsDir = makeSkillDir();
    const sources = resolveSkillSources({
      platforms: ['claude-code'],
      global: false,
      includeGlobal: false,
      skillsDir,
      skillsDirOnly: true,
      dryRun: true,
      yes: false,
    });
    expect(sources).toEqual([{ dir: skillsDir, source: 'community' }]);
    fs.rmSync(skillsDir, { recursive: true, force: true });
  });
});
