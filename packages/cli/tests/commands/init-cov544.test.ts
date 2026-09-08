import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Command } from 'commander';
import { createInitCommand } from '../../src/commands/init';

interface RunOutcome {
  exitCode: number | null;
  out: string[];
  err: string[];
}

async function runInitCmd(
  args: string[],
  cwd: string,
  globalFlags: string[] = []
): Promise<RunOutcome> {
  const program = new Command();
  program.option('--quiet');
  program.addCommand(createInitCommand());

  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
    exitCode = c ?? 0;
    throw new Error(`__exit__:${exitCode}`);
  }) as never);
  const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = vi
    .spyOn(console, 'log')
    .mockImplementation((...a: unknown[]) => out.push(a.map(String).join(' ')));
  const errSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((...a: unknown[]) => err.push(a.map(String).join(' ')));

  try {
    await program.parseAsync([...globalFlags, 'init', ...args], { from: 'user' });
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
  } finally {
    exitSpy.mockRestore();
    cwdSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { exitCode, out, err };
}

describe('init command dispatch', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'init-cov-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('rejects an unknown --tier', async () => {
    const { exitCode, err } = await runInitCmd(['--tier', 'bogus'], tmp);
    expect(exitCode).toBe(2);
    expect(err.join('\n')).toContain('Invalid --tier');
  });

  it('scaffolds a full project and prints the success summary', async () => {
    const { exitCode, out } = await runInitCmd(['--name', 'demo'], tmp);
    expect(exitCode).toBe(0);
    const joined = out.join('\n');
    expect(joined).toContain('Project initialized!');
    expect(joined).toContain('Next steps');
    expect(fs.existsSync(path.join(tmp, 'harness.config.json'))).toBe(true);
  });

  it('scaffolds the minimal tier and prints the minimal success path', async () => {
    const { exitCode, out } = await runInitCmd(['--tier', 'minimal', '--name', 'mini'], tmp);
    expect(exitCode).toBe(0);
    // minimal init writes exactly the MVH artifacts
    expect(fs.existsSync(path.join(tmp, 'harness.config.json'))).toBe(true);
    expect(out.join('\n').length).toBeGreaterThan(0);
  });

  it('suppresses the success summary under global --quiet', async () => {
    const { exitCode, out } = await runInitCmd(['--name', 'q'], tmp, ['--quiet']);
    expect(exitCode).toBe(0);
    expect(out.join('\n')).not.toContain('Project initialized!');
  });

  it('errors when the project is already initialized (no --force)', async () => {
    fs.writeFileSync(path.join(tmp, 'harness.config.json'), '{}');
    const { exitCode, err } = await runInitCmd(['--name', 'dup'], tmp);
    expect(exitCode).toBe(2);
    expect(err.join('\n')).toContain('already initialized');
  });

  it('errors when the minimal tier hits an already-initialized project', async () => {
    fs.writeFileSync(path.join(tmp, 'harness.config.json'), '{}');
    const { exitCode } = await runInitCmd(['--tier', 'minimal'], tmp);
    expect(exitCode).toBe(2);
  });
});
