import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveConsent } from '../../src/telemetry/consent';

describe('resolveConsent', () => {
  const tmpDir = path.join(__dirname, '__test-tmp-consent__');
  const harnessDir = path.join(tmpDir, '.harness');
  const telemetryJsonFile = path.join(harnessDir, 'telemetry.json');

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DO_NOT_TRACK;
    delete process.env.HARNESS_TELEMETRY_OPTOUT;
    fs.mkdirSync(harnessDir, { recursive: true });
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Env var blocking ---

  it('returns allowed:false when DO_NOT_TRACK=1', () => {
    process.env.DO_NOT_TRACK = '1';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(false);
    expect(result).toEqual({ allowed: false });
  });

  it('returns allowed:false when HARNESS_TELEMETRY_OPTOUT=1', () => {
    process.env.HARNESS_TELEMETRY_OPTOUT = '1';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(false);
    expect(result).toEqual({ allowed: false });
  });

  it('ignores DO_NOT_TRACK when value is not "1"', () => {
    process.env.DO_NOT_TRACK = 'false';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
  });

  it('ignores HARNESS_TELEMETRY_OPTOUT when value is not "1"', () => {
    process.env.HARNESS_TELEMETRY_OPTOUT = '0';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
  });

  // --- Config blocking ---

  it('returns allowed:false when config.enabled is false', () => {
    const result = resolveConsent(tmpDir, { enabled: false });
    expect(result.allowed).toBe(false);
  });

  // --- Env vars override config ---

  it('DO_NOT_TRACK=1 overrides config enabled:true', () => {
    process.env.DO_NOT_TRACK = '1';
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(false);
  });

  // --- Allowed path ---

  it('returns allowed:true with installId when no blockers', () => {
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
    expect(result.installId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    // identity.project/team should not be set without telemetry.json or config
    expect(result.identity.project).toBeUndefined();
    expect(result.identity.team).toBeUndefined();
    // alias may be populated from git config user.name if available
  });

  it('returns identity fields from .harness/telemetry.json', () => {
    fs.writeFileSync(
      telemetryJsonFile,
      JSON.stringify({ identity: { project: 'myapp', team: 'platform' } }),
      'utf-8'
    );
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
    expect(result.identity).toMatchObject({ project: 'myapp', team: 'platform' });
  });

  it('falls back to harness.config.json name when telemetry.json has no project', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ name: 'my-project' }),
      'utf-8'
    );
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.allowed).toBe(true);
    expect(result.identity.project).toBe('my-project');
  });

  it('prefers telemetry.json project over harness.config.json name', () => {
    fs.writeFileSync(
      telemetryJsonFile,
      JSON.stringify({ identity: { project: 'from-telemetry' } }),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'harness.config.json'),
      JSON.stringify({ name: 'from-config' }),
      'utf-8'
    );
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.identity.project).toBe('from-telemetry');
  });

  it('returns no project/team when telemetry.json does not exist and no config name', () => {
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.identity.project).toBeUndefined();
    expect(result.identity.team).toBeUndefined();
  });

  it('returns no project/team when telemetry.json is malformed', () => {
    fs.writeFileSync(telemetryJsonFile, 'not json', 'utf-8');
    const result = resolveConsent(tmpDir, { enabled: true });
    expect(result.identity.project).toBeUndefined();
    expect(result.identity.team).toBeUndefined();
  });

  it('defaults config to enabled:true when undefined', () => {
    const result = resolveConsent(tmpDir, undefined);
    expect(result.allowed).toBe(true);
  });
});
