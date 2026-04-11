import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTelemetryCommand } from '../../src/commands/telemetry/index';

describe('telemetry command', () => {
  it('creates telemetry command with subcommands', () => {
    const cmd = createTelemetryCommand();
    expect(cmd.name()).toBe('telemetry');
    const subcommands = cmd.commands.map((c) => c.name());
    expect(subcommands).toContain('identify');
    expect(subcommands).toContain('status');
  });
});

describe('telemetry identify', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-telemetry__');
  const harnessDir = path.join(tmpDir, '.harness');
  const telemetryFile = path.join(harnessDir, 'telemetry.json');
  const originalCwd = process.cwd();

  beforeEach(() => {
    fs.mkdirSync(harnessDir, { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sets all identity fields', async () => {
    const cmd = createTelemetryCommand();
    await cmd.parseAsync(
      ['identify', '--project', 'myapp', '--team', 'platform', '--alias', 'cwarner'],
      { from: 'user' }
    );
    const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
    expect(data.identity).toEqual({ project: 'myapp', team: 'platform', alias: 'cwarner' });
  });

  it('preserves existing fields when setting a single field', async () => {
    fs.writeFileSync(
      telemetryFile,
      JSON.stringify({ identity: { project: 'existing', team: 'oldteam' } }),
      'utf-8'
    );
    const cmd = createTelemetryCommand();
    await cmd.parseAsync(['identify', '--alias', 'newuser'], { from: 'user' });
    const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
    expect(data.identity).toEqual({ project: 'existing', team: 'oldteam', alias: 'newuser' });
  });

  it('clears all identity fields with --clear', async () => {
    fs.writeFileSync(
      telemetryFile,
      JSON.stringify({ identity: { project: 'myapp', alias: 'me' } }),
      'utf-8'
    );
    const cmd = createTelemetryCommand();
    await cmd.parseAsync(['identify', '--clear'], { from: 'user' });
    const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
    expect(data.identity).toEqual({});
  });

  it('sets exitCode=1 when no flags provided', async () => {
    const originalExitCode = process.exitCode;
    const cmd = createTelemetryCommand();
    await cmd.parseAsync(['identify'], { from: 'user' });
    expect(process.exitCode).toBe(1);
    process.exitCode = originalExitCode;
  });

  it('creates .harness directory if missing', async () => {
    fs.rmSync(harnessDir, { recursive: true, force: true });
    const cmd = createTelemetryCommand();
    await cmd.parseAsync(['identify', '--project', 'newproj'], { from: 'user' });
    expect(fs.existsSync(telemetryFile)).toBe(true);
    const data = JSON.parse(fs.readFileSync(telemetryFile, 'utf-8'));
    expect(data.identity.project).toBe('newproj');
  });
});

describe('telemetry status', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-telemetry-status__');
  const harnessDir = path.join(tmpDir, '.harness');
  const telemetryFile = path.join(harnessDir, 'telemetry.json');
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.DO_NOT_TRACK;
    delete process.env.HARNESS_TELEMETRY_OPTOUT;
    fs.mkdirSync(harnessDir, { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('outputs JSON with --json flag', async () => {
    fs.writeFileSync(telemetryFile, JSON.stringify({ identity: { project: 'testproj' } }), 'utf-8');
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    try {
      const cmd = createTelemetryCommand();
      await cmd.parseAsync(['status', '--json'], { from: 'user' });
    } finally {
      console.log = origLog;
    }

    const jsonOutput = logs.find((l) => {
      try {
        JSON.parse(l);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed).toHaveProperty('consent');
    expect(parsed).toHaveProperty('identity');
    expect(parsed).toHaveProperty('envOverrides');
  });

  it('shows disabled state when DO_NOT_TRACK=1', async () => {
    process.env.DO_NOT_TRACK = '1';
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    try {
      const cmd = createTelemetryCommand();
      await cmd.parseAsync(['status', '--json'], { from: 'user' });
    } finally {
      console.log = origLog;
    }

    const jsonOutput = logs.find((l) => {
      try {
        JSON.parse(l);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.consent.allowed).toBe(false);
    expect(parsed.consent.reason).toBe('DO_NOT_TRACK=1');
    expect(parsed.envOverrides.DO_NOT_TRACK).toBe('1');
  });
});
