import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { createCheckSecurityCommand, runCheckSecurity } from '../../src/commands/check-security';

const CLEAN_FIXTURES = path.join(__dirname, '../fixtures/valid-project');
const INSECURE_FIXTURES = path.join(__dirname, '../fixtures/security-findings');
const NO_SOURCE_FIXTURES = path.join(__dirname, '../fixtures/security-no-source');

let logOutput: string[];
let exitCode: number | undefined;
const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

let originalCwd: string;

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.option('--json').option('--verbose').option('--quiet');
  parent.addCommand(createCheckSecurityCommand());
  parent.exitOverride();
  return parent.parseAsync(['check-security', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  exitCode = undefined;
  originalCwd = process.cwd();
});

afterEach(() => {
  process.chdir(originalCwd);
});

afterAll(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('check-security action (cov544)', () => {
  it('clean project (text) exits 0 and prints the scanned-file denominator', async () => {
    process.chdir(CLEAN_FIXTURES);
    await expect(run([])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toMatch(/file\(s\) scanned/);
  });

  it('quiet mode suppresses the denominator line', async () => {
    process.chdir(CLEAN_FIXTURES);
    await expect(run(['--quiet'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).not.toMatch(/file\(s\) scanned/);
  });

  it('verbose mode still exits 0 on a clean project', async () => {
    process.chdir(CLEAN_FIXTURES);
    await expect(run(['--verbose'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('insecure project exits VALIDATION_FAILED (1)', async () => {
    process.chdir(INSECURE_FIXTURES);
    await expect(run(['--severity', 'error'])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('json mode emits valid + scannedNothing + stats', async () => {
    process.chdir(CLEAN_FIXTURES);
    await expect(run(['--json'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed).toHaveProperty('valid');
    expect(parsed).toHaveProperty('scannedNothing');
    expect(parsed).toHaveProperty('stats');
  });

  it('zero-file scan surfaces the ABSTAINED issue (json) and stays exit 0', async () => {
    process.chdir(NO_SOURCE_FIXTURES);
    await expect(run(['--severity', 'error', '--json'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed.scannedNothing).toBe(true);
    expect(JSON.stringify(parsed.issues)).toContain('ABSTAINED');
  });

  it('zero-file scan still runs the text renderer without throwing', async () => {
    process.chdir(NO_SOURCE_FIXTURES);
    await expect(run(['--severity', 'error'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });

  it('--fail-on-empty flips a zero-file scan to VALIDATION_FAILED (1)', async () => {
    process.chdir(NO_SOURCE_FIXTURES);
    await expect(run(['--severity', 'error', '--fail-on-empty'])).rejects.toThrow('exit:1');
    expect(exitCode).toBe(1);
  });

  it('--findings-json prints the findings contract line', async () => {
    process.chdir(CLEAN_FIXTURES);
    await expect(run(['--findings-json'])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('check-security');
  });

  it('preAction hook rejects an invalid --severity with ERROR (2)', async () => {
    process.chdir(CLEAN_FIXTURES);
    await expect(run(['--severity', 'nope'])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
  });

  it('--changed-only forwards the flag through the action spread', async () => {
    process.chdir(NO_SOURCE_FIXTURES);
    await expect(run(['--severity', 'error', '--changed-only'])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
  });
});

describe('getChangedFiles (cov544)', () => {
  it('returns [] (catch path) when the dir is not a git repo', async () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'cs-nogit-'));
    try {
      const result = await runCheckSecurity(tmp, { changedOnly: true, severity: 'error' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // No git history → getChangedFiles caught the error and scanned nothing.
        expect(result.value.stats.filesScanned).toBe(0);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('runs the git-diff success path against the real repo without throwing', async () => {
    const result = await runCheckSecurity(process.cwd(), { changedOnly: true, severity: 'error' });
    expect(result.ok).toBe(true);
  });
});
