import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isTelemetryConfigured,
  writeTelemetryConfig,
  ensureTelemetryConfigured,
} from '../../src/commands/telemetry-wizard';

describe('isTelemetryConfigured', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-telem-wizard__');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when harness.config.json does not exist', () => {
    expect(isTelemetryConfigured(tmpDir)).toBe(false);
  });

  it('returns false when config has no telemetry or adoption keys', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test' }),
      'utf-8'
    );
    expect(isTelemetryConfigured(tmpDir)).toBe(false);
  });

  it('returns false when only telemetry is set (adoption missing)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, telemetry: { enabled: true } }),
      'utf-8'
    );
    expect(isTelemetryConfigured(tmpDir)).toBe(false);
  });

  it('returns false when only adoption is set (telemetry missing)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, adoption: { enabled: true } }),
      'utf-8'
    );
    expect(isTelemetryConfigured(tmpDir)).toBe(false);
  });

  it('returns true when both telemetry and adoption are set', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        telemetry: { enabled: true },
        adoption: { enabled: false },
      }),
      'utf-8'
    );
    expect(isTelemetryConfigured(tmpDir)).toBe(true);
  });

  it('returns true even when both are disabled', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        telemetry: { enabled: false },
        adoption: { enabled: false },
      }),
      'utf-8'
    );
    expect(isTelemetryConfigured(tmpDir)).toBe(true);
  });
});

describe('writeTelemetryConfig', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-telem-write__');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test-project' }),
      'utf-8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes telemetry and adoption to harness.config.json', () => {
    writeTelemetryConfig(tmpDir, {
      telemetryEnabled: true,
      adoptionEnabled: false,
      identity: {},
    });

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
    expect(config.telemetry).toEqual({ enabled: true });
    expect(config.adoption).toEqual({ enabled: false });
    // Existing keys preserved
    expect(config.name).toBe('test-project');
    expect(config.version).toBe(1);
  });

  it('writes identity to .harness/telemetry.json when fields are set', () => {
    writeTelemetryConfig(tmpDir, {
      telemetryEnabled: true,
      adoptionEnabled: true,
      identity: { project: 'myapp', team: 'platform' },
    });

    const telemetry = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.harness', 'telemetry.json'), 'utf-8')
    );
    expect(telemetry.identity).toEqual({ project: 'myapp', team: 'platform' });
  });

  it('does not write telemetry.json when identity is empty', () => {
    writeTelemetryConfig(tmpDir, {
      telemetryEnabled: true,
      adoptionEnabled: true,
      identity: {},
    });

    expect(fs.existsSync(path.join(tmpDir, '.harness', 'telemetry.json'))).toBe(false);
  });
});

describe('ensureTelemetryConfigured', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-telem-ensure__');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns warn when no harness.config.json exists', async () => {
    const result = await ensureTelemetryConfigured(tmpDir);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('Not a harness project');
  });

  it('returns pass when telemetry is already configured', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({
        version: 1,
        telemetry: { enabled: true },
        adoption: { enabled: true },
      }),
      'utf-8'
    );

    const result = await ensureTelemetryConfigured(tmpDir);
    expect(result.status).toBe('pass');
    expect(result.message).toBe('Telemetry already configured');
  });

  it('returns warn in non-interactive mode when telemetry not configured', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ version: 1 }),
      'utf-8'
    );

    // stdin.isTTY is undefined/false in test environment
    const result = await ensureTelemetryConfigured(tmpDir);
    expect(result.status).toBe('warn');
    expect(result.message).toContain('Non-interactive');
  });
});
