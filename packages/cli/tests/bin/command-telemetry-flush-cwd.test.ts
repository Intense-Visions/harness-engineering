import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const mockSpawn = vi.fn();
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: (...args: unknown[]) => mockSpawn(...args) };
});

import { _flushTelemetryBackground } from '../../src/bin/command-telemetry';

type SpawnOpts = { cwd?: string; env?: Record<string, string | undefined>; detached?: boolean };

/**
 * #2652 follow-up: the detached telemetry flush child outlives the CLI. On
 * Windows a process's current directory is an open handle, so a child whose
 * cwd is the user's project pins that directory (EBUSY on delete/rename). The
 * child must run from os.tmpdir() and receive the project root explicitly.
 */
describe('flushTelemetryBackground spawn cwd (#2652)', () => {
  let projectDir: string;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    mockSpawn.mockReset();
    mockSpawn.mockReturnValue({
      stdin: { on: vi.fn(), write: vi.fn(), end: vi.fn() },
      unref: vi.fn(),
    });
    // The global test setup opts out of telemetry; this suite needs it allowed.
    delete process.env.DO_NOT_TRACK;
    delete process.env.HARNESS_TELEMETRY_OPTOUT;
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-flush-cwd-'));
    fs.mkdirSync(path.join(projectDir, '.harness', 'metrics'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.harness', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.harness', 'metrics', 'adoption.jsonl'), '{}\n');
    fs.writeFileSync(path.join(projectDir, '.harness', 'hooks', 'telemetry-reporter.js'), '');
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('spawns the reporter from os.tmpdir(), never the project dir', () => {
    _flushTelemetryBackground(projectDir);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockSpawn.mock.calls[0]! as [string, string[], SpawnOpts];
    expect(cmd).toBe(process.execPath);
    expect(args[0]).toBe(path.join(projectDir, '.harness', 'hooks', 'telemetry-reporter.js'));
    expect(opts.detached).toBe(true);
    expect(opts.cwd).toBe(os.tmpdir());
    expect(opts.cwd).not.toBe(projectDir);
  });

  it('passes the project root to the reporter via HARNESS_TELEMETRY_PROJECT_ROOT', () => {
    _flushTelemetryBackground(projectDir);
    const opts = mockSpawn.mock.calls[0]![2] as SpawnOpts;
    expect(opts.env?.HARNESS_TELEMETRY_PROJECT_ROOT).toBe(projectDir);
    // The rest of the environment (PATH, consent vars) is still inherited.
    expect(opts.env?.PATH).toBe(process.env.PATH);
  });

  it('positive control: a project-config opt-out still suppresses the spawn', () => {
    fs.writeFileSync(
      path.join(projectDir, 'harness.config.json'),
      JSON.stringify({ telemetry: { enabled: false } })
    );
    _flushTelemetryBackground(projectDir);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
