import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateStackProfile, loadOrGenerateProfile } from '../../src/skill/stack-profile';

describe('generateStackProfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-profile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty signals and domains for empty project', () => {
    const profile = generateStackProfile(tmpDir);
    expect(profile.generatedAt).toBeTruthy();
    expect(profile.detectedDomains).toEqual([]);
    // All signals should be false
    for (const value of Object.values(profile.signals)) {
      expect(value).toBe(false);
    }
  });

  it('detects Dockerfile and reports containerization domain', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20');
    const profile = generateStackProfile(tmpDir);
    expect(profile.signals['Dockerfile']).toBe(true);
    expect(profile.detectedDomains).toContain('containerization');
  });

  it('detects .env and reports secrets domain', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=value');
    const profile = generateStackProfile(tmpDir);
    expect(profile.signals['.env']).toBe(true);
    expect(profile.detectedDomains).toContain('secrets');
  });

  it('detects multiple patterns simultaneously', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20');
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=value');
    fs.mkdirSync(path.join(tmpDir, 'migrations'));
    const profile = generateStackProfile(tmpDir);
    expect(profile.detectedDomains).toContain('containerization');
    expect(profile.detectedDomains).toContain('secrets');
    expect(profile.detectedDomains).toContain('database');
  });

  it('returns sorted domains', () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET=value');
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20');
    const profile = generateStackProfile(tmpDir);
    const sorted = [...profile.detectedDomains].sort();
    expect(profile.detectedDomains).toEqual(sorted);
  });
});

describe('loadOrGenerateProfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-profile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates and caches profile on first call', () => {
    const profile = loadOrGenerateProfile(tmpDir);
    expect(profile.generatedAt).toBeTruthy();
    const cachePath = path.join(tmpDir, '.harness', 'stack-profile.json');
    expect(fs.existsSync(cachePath)).toBe(true);
  });

  it('returns cached profile on second call', () => {
    const first = loadOrGenerateProfile(tmpDir);
    const second = loadOrGenerateProfile(tmpDir);
    expect(second.generatedAt).toBe(first.generatedAt);
  });

  it('regenerates on corrupt cache', () => {
    const cachePath = path.join(tmpDir, '.harness', 'stack-profile.json');
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, '{ broken json');
    const profile = loadOrGenerateProfile(tmpDir);
    expect(profile.generatedAt).toBeTruthy();
    expect(profile.signals).toBeDefined();
  });
});
