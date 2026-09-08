import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Command } from 'commander';
import * as path from 'path';
import { createCheckVocabularyCommand } from '../../src/commands/check-vocabulary';

const FIXTURES = path.join(__dirname, '../fixtures/semantic-vocabulary');

let logOutput: string[];
let errOutput: string[];
let exitCode: number | undefined;

const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  errOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);
const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(FIXTURES);

function run(configFile: string, flags: string[] = []): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--quiet').option('--verbose').option('--config <path>');
  parent.addCommand(createCheckVocabularyCommand());
  return parent.parseAsync(
    ['check-vocabulary', '--config', path.join(FIXTURES, configFile), ...flags],
    { from: 'user' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  errOutput = [];
  exitCode = undefined;
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
  cwdSpy.mockRestore();
});

describe('check-vocabulary command action (cov544b)', () => {
  it('prints violations and exits VALIDATION_FAILED for a deprecated config', async () => {
    await expect(run('enabled-config.json')).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
    const out = logOutput.join('\n');
    expect(out).toContain('violation');
    expect(out).toContain('Deprecated canonical terms');
  });

  it('prints a clean summary and exits SUCCESS for canonical prose', async () => {
    await expect(run('clean-config.json')).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain('clean');
  });

  it('prints the skipped summary when the gate is disabled', async () => {
    await expect(run('disabled-config.json')).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain('skipped');
  });

  it('emits JSON in --json mode for the deprecated config', async () => {
    await expect(run('enabled-config.json', ['--json'])).rejects.toThrow('exit:1');
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed.valid).toBe(false);
    expect(parsed.violations.length).toBeGreaterThan(0);
  });

  it('suppresses all output in --quiet mode but still sets the exit code', async () => {
    await expect(run('clean-config.json', ['--quiet'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toBe('');
  });

  it('logs an error and exits when the config cannot be resolved', async () => {
    const parent = new Command();
    parent.option('--json').option('--quiet').option('--config <path>');
    parent.addCommand(createCheckVocabularyCommand());
    await expect(
      parent.parseAsync(['check-vocabulary', '--config', '/nope/harness.config.json'], {
        from: 'user',
      })
    ).rejects.toThrow(/exit:/);
    expect(errOutput.join('\n').length).toBeGreaterThan(0);
    expect(exitCode).toBeGreaterThan(0);
  });

  it('emits a JSON error object when config resolution fails in --json mode', async () => {
    const parent = new Command();
    parent.option('--json').option('--config <path>');
    parent.addCommand(createCheckVocabularyCommand());
    await expect(
      parent.parseAsync(['check-vocabulary', '--json', '--config', '/nope/harness.config.json'], {
        from: 'user',
      })
    ).rejects.toThrow(/exit:/);
    expect(logOutput.join('\n')).toContain('error');
  });
});
