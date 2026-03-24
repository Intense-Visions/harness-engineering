import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readLockfile,
  writeLockfile,
  updateLockfileEntry,
  removeLockfileEntry,
  type SkillsLockfile,
  type LockfileEntry,
} from '../../src/registry/lockfile';

describe('readLockfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns default empty lockfile when file does not exist', () => {
    const result = readLockfile(path.join(tmpDir, 'skills-lock.json'));
    expect(result).toEqual({ version: 1, skills: {} });
  });

  it('reads and parses existing lockfile', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    const data: SkillsLockfile = {
      version: 1,
      skills: {
        '@harness-skills/deploy': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/@harness-skills/deploy/-/deploy-1.0.0.tgz',
          integrity: 'sha512-abc123',
          platforms: ['claude-code'],
          installedAt: '2026-03-23T10:00:00Z',
          dependencyOf: null,
        },
      },
    };
    fs.writeFileSync(lockPath, JSON.stringify(data));
    const result = readLockfile(lockPath);
    expect(result.version).toBe(1);
    expect(result.skills['@harness-skills/deploy'].version).toBe('1.0.0');
  });
});

describe('writeLockfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes lockfile as formatted JSON with trailing newline', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    const data: SkillsLockfile = { version: 1, skills: {} };
    writeLockfile(lockPath, data);
    const raw = fs.readFileSync(lockPath, 'utf-8');
    // Keys are sorted alphabetically (deterministic), so "skills" comes before "version"
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(data);
    expect(raw.endsWith('\n')).toBe(true);
    // Verify it's formatted with 2-space indent
    expect(raw).toContain('  "skills"');
  });

  it('produces deterministic output with sorted keys', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    const data: SkillsLockfile = {
      version: 1,
      skills: {
        '@harness-skills/zebra': {
          version: '1.0.0',
          resolved: 'https://example.com/zebra.tgz',
          integrity: 'sha512-z',
          platforms: ['claude-code'],
          installedAt: '2026-03-23T10:00:00Z',
          dependencyOf: null,
        },
        '@harness-skills/alpha': {
          version: '2.0.0',
          resolved: 'https://example.com/alpha.tgz',
          integrity: 'sha512-a',
          platforms: ['claude-code'],
          installedAt: '2026-03-23T10:00:01Z',
          dependencyOf: null,
        },
      },
    };
    writeLockfile(lockPath, data);
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const alphaIdx = raw.indexOf('@harness-skills/alpha');
    const zebraIdx = raw.indexOf('@harness-skills/zebra');
    expect(alphaIdx).toBeLessThan(zebraIdx);
  });

  it('creates parent directories if they do not exist', () => {
    const lockPath = path.join(tmpDir, 'nested', 'dir', 'skills-lock.json');
    writeLockfile(lockPath, { version: 1, skills: {} });
    expect(fs.existsSync(lockPath)).toBe(true);
  });
});

describe('updateLockfileEntry', () => {
  const baseEntry: LockfileEntry = {
    version: '1.0.0',
    resolved: 'https://example.com/skill.tgz',
    integrity: 'sha512-abc',
    platforms: ['claude-code'],
    installedAt: '2026-03-23T10:00:00Z',
    dependencyOf: null,
  };

  it('adds a new entry to an empty lockfile', () => {
    const lockfile: SkillsLockfile = { version: 1, skills: {} };
    const result = updateLockfileEntry(lockfile, '@harness-skills/deploy', baseEntry);
    expect(result.skills['@harness-skills/deploy']).toEqual(baseEntry);
  });

  it('replaces an existing entry', () => {
    const lockfile: SkillsLockfile = {
      version: 1,
      skills: { '@harness-skills/deploy': baseEntry },
    };
    const updated = { ...baseEntry, version: '2.0.0' };
    const result = updateLockfileEntry(lockfile, '@harness-skills/deploy', updated);
    expect(result.skills['@harness-skills/deploy'].version).toBe('2.0.0');
  });

  it('does not mutate the input lockfile', () => {
    const lockfile: SkillsLockfile = { version: 1, skills: {} };
    const result = updateLockfileEntry(lockfile, '@harness-skills/deploy', baseEntry);
    expect(lockfile.skills['@harness-skills/deploy']).toBeUndefined();
    expect(result.skills['@harness-skills/deploy']).toBeDefined();
  });
});

describe('removeLockfileEntry', () => {
  it('removes an existing entry', () => {
    const lockfile: SkillsLockfile = {
      version: 1,
      skills: {
        '@harness-skills/deploy': {
          version: '1.0.0',
          resolved: 'https://example.com/deploy.tgz',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-23T10:00:00Z',
          dependencyOf: null,
        },
      },
    };
    const result = removeLockfileEntry(lockfile, '@harness-skills/deploy');
    expect(result.skills['@harness-skills/deploy']).toBeUndefined();
  });

  it('returns unchanged lockfile when entry does not exist', () => {
    const lockfile: SkillsLockfile = { version: 1, skills: {} };
    const result = removeLockfileEntry(lockfile, '@harness-skills/nonexistent');
    expect(result).toEqual(lockfile);
  });

  it('does not mutate the input lockfile', () => {
    const lockfile: SkillsLockfile = {
      version: 1,
      skills: {
        '@harness-skills/deploy': {
          version: '1.0.0',
          resolved: 'https://example.com/deploy.tgz',
          integrity: 'sha512-abc',
          platforms: ['claude-code'],
          installedAt: '2026-03-23T10:00:00Z',
          dependencyOf: null,
        },
      },
    };
    const result = removeLockfileEntry(lockfile, '@harness-skills/deploy');
    expect(lockfile.skills['@harness-skills/deploy']).toBeDefined();
    expect(result.skills['@harness-skills/deploy']).toBeUndefined();
  });
});
