import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runModelsDrift } from './models';
import { readSentinelHistory } from '@harness-engineering/core';
import { ExitCode } from '../utils/errors';

/**
 * Command-layer contract for `harness models drift`. Writes a real
 * harness.config.json into a temp project root (via HARNESS_PROJECT_ROOT) and
 * drives the sentinel end-to-end: baseline → swap → check → ack. The pure
 * detection logic is covered in core/model-sentinel/*.test.ts.
 */

function writeConfig(root: string, model: string): string {
  const configPath = join(root, 'harness.config.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      name: 'sentinel-fixture',
      layers: [{ name: 'src', pattern: 'src/**', allowedDependencies: [] }],
      agent: { backends: { primary: { type: 'anthropic', model } } },
    }),
    'utf-8'
  );
  return configPath;
}

describe('runModelsDrift', () => {
  let root: string;
  let prevRoot: string | undefined;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'models-drift-'));
    prevRoot = process.env['HARNESS_PROJECT_ROOT'];
    process.env['HARNESS_PROJECT_ROOT'] = root;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (prevRoot === undefined) delete process.env['HARNESS_PROJECT_ROOT'];
    else process.env['HARNESS_PROJECT_ROOT'] = prevRoot;
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('records the initial baseline on first run', async () => {
    const configPath = writeConfig(root, 'claude-opus-4-8');
    const code = await runModelsDrift({ config: configPath });
    expect(code).toBe(ExitCode.SUCCESS);
    expect(readSentinelHistory(root)).toHaveLength(1);
  });

  it('is a no-op on an unchanged config', async () => {
    const configPath = writeConfig(root, 'claude-opus-4-8');
    await runModelsDrift({ config: configPath });
    await runModelsDrift({ config: configPath });
    expect(readSentinelHistory(root)).toHaveLength(1);
  });

  it('detects a material model swap and --check then exits non-zero', async () => {
    const configPath = writeConfig(root, 'claude-opus-4-8');
    await runModelsDrift({ config: configPath });

    writeConfig(root, 'claude-opus-5'); // simulate a supplier model swap
    const driftCode = await runModelsDrift({ config: configPath });
    expect(driftCode).toBe(ExitCode.SUCCESS);
    expect(readSentinelHistory(root)).toHaveLength(2);

    const checkCode = await runModelsDrift({ config: configPath, check: true });
    expect(checkCode).toBe(ExitCode.ERROR);
    // --check does not append.
    expect(readSentinelHistory(root)).toHaveLength(2);
  });

  it('--ack clears the --check gate (append-only)', async () => {
    const configPath = writeConfig(root, 'm1');
    await runModelsDrift({ config: configPath });
    writeConfig(root, 'm2');
    await runModelsDrift({ config: configPath });
    expect(await runModelsDrift({ config: configPath, check: true })).toBe(ExitCode.ERROR);

    await runModelsDrift({ config: configPath, ack: 'reviewed' });
    expect(readSentinelHistory(root)).toHaveLength(3);
    expect(await runModelsDrift({ config: configPath, check: true })).toBe(ExitCode.SUCCESS);
  });

  it('--json emits machine-readable output', async () => {
    const configPath = writeConfig(root, 'm1');
    await runModelsDrift({ config: configPath, json: true });
    expect(logSpy).toHaveBeenCalled();
    const printed = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(() => JSON.parse(printed)).not.toThrow();
  });

  it('errors when no config can be resolved', async () => {
    const code = await runModelsDrift({ config: join(root, 'missing.json') });
    expect(code).toBe(ExitCode.ERROR);
  });
});
