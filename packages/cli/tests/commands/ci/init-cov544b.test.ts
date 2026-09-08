import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createInitCommand, generateCIConfig } from '../../../src/commands/ci/init';

/**
 * Branch coverage for ci/init.ts: platform auto-detection, config file writing
 * (mkdir + chmod), JSON vs human action output, unknown-platform Err path, and
 * --checks parsing (skip-flag emission).
 */

const ORIG_CWD = process.cwd();
let tmpDir: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;
const EXIT = new Error('exit');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-init-cov544b-'));
  process.chdir(tmpDir);
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw EXIT;
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(ORIG_CWD);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function program(): Command {
  const p = new Command('harness').option('--json');
  p.addCommand(createInitCommand());
  return p;
}

async function drive(args: string[]): Promise<void> {
  try {
    await program().parseAsync(args, { from: 'user' });
  } catch (e) {
    if (e !== EXIT) throw e;
  }
}

describe('ci init — platform auto-detection', () => {
  it('detects github when a .github directory exists and writes the workflow', async () => {
    fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
    await drive(['init']);
    const written = path.join(tmpDir, '.github', 'workflows', 'ci.yml');
    expect(fs.existsSync(written)).toBe(true);
    expect(fs.readFileSync(written, 'utf-8')).toContain('harness ci check');
  });

  it('detects gitlab when .gitlab-ci.yml exists', async () => {
    fs.writeFileSync(path.join(tmpDir, '.gitlab-ci.yml'), 'stages: [test]\n');
    await drive(['init']);
    expect(fs.existsSync(path.join(tmpDir, '.gitlab-ci-harness.yml'))).toBe(true);
  });

  it('falls back to the generic script and makes it executable on non-Windows', async () => {
    await drive(['init']);
    const script = path.join(tmpDir, 'harness-ci.sh');
    expect(fs.existsSync(script)).toBe(true);
    if (process.platform !== 'win32') {
      const mode = fs.statSync(script).mode & 0o777;
      expect(mode & 0o100).toBeTruthy(); // owner-executable bit set
    }
  });
});

describe('ci init — action output & options', () => {
  it('--json prints the file+platform record', async () => {
    await drive(['init', '--platform', 'github']);
    // human mode: nothing on the JSON path yet — now with --json:
    logSpy.mockClear();
    await drive(['--json', 'init', '--platform', 'github']);
    const jsonLine = logSpy.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.trim().startsWith('{'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);
    expect(parsed.platform).toBe('github');
    expect(parsed.file).toBe('.github/workflows/ci.yml');
  });

  it('human mode logs a success line (no exit)', async () => {
    await drive(['init', '--platform', 'gitlab']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('parses --checks into a skip flag for the omitted checks', async () => {
    await drive(['init', '--platform', 'gitlab', '--checks', 'validate, deps']);
    const content = fs.readFileSync(path.join(tmpDir, '.gitlab-ci-harness.yml'), 'utf-8');
    expect(content).toContain('--skip');
    // omitted checks appear in the skip list
    expect(content).toMatch(/--skip [a-z,-]*security/);
  });

  it('passes --language through to the generator', async () => {
    await drive(['init', '--platform', 'github', '--language', 'python']);
    const content = fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'utf-8');
    expect(content).toContain('pytest');
  });
});

describe('generateCIConfig — unknown platform', () => {
  it('returns Err for an unrecognized platform', () => {
    const result = generateCIConfig({ platform: 'bitbucket' as never });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Unknown platform');
    }
  });

  it('emits no skip flag when all checks are selected', () => {
    const all = [
      'validate',
      'deps',
      'docs',
      'entropy',
      'security',
      'perf',
      'phase-gate',
      'arch',
      'traceability',
    ] as never;
    const result = generateCIConfig({ platform: 'generic', checks: all });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.content).not.toContain('--skip');
  });
});
