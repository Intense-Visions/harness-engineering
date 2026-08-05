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
    expect(result).toEqual({ version: 2, skills: {} });
  });

  it('throws on malformed JSON', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    fs.writeFileSync(lockPath, '{ invalid json');
    expect(() => readLockfile(lockPath)).toThrow('Failed to parse lockfile');
  });

  it('throws on invalid lockfile schema (wrong version)', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    fs.writeFileSync(lockPath, JSON.stringify({ version: 99, skills: {} }));
    expect(() => readLockfile(lockPath)).toThrow('Invalid lockfile format');
  });

  it('throws on invalid lockfile schema (missing skills)', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    fs.writeFileSync(lockPath, JSON.stringify({ version: 1 }));
    expect(() => readLockfile(lockPath)).toThrow('Invalid lockfile format');
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

describe('lockfile v2 provenance', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a v1 lockfile without source, does not crash, and does not rewrite', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    const v1 = {
      version: 1,
      skills: {
        '@harness-skills/legacy': {
          version: '1.0.0',
          resolved: 'https://example.com/legacy.tgz',
          integrity: 'sha512-x',
          platforms: ['claude-code'],
          installedAt: '2026-03-01T00:00:00Z',
          dependencyOf: null,
        },
      },
    };
    fs.writeFileSync(lockPath, JSON.stringify(v1, null, 2));
    const before = fs.readFileSync(lockPath, 'utf-8');
    const result = readLockfile(lockPath);
    expect(result.version).toBe(1);
    expect(result.skills['@harness-skills/legacy'].source).toBeUndefined();
    expect(fs.readFileSync(lockPath, 'utf-8')).toBe(before);
  });

  it('loads a v2 lockfile and preserves the source field', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    const source = { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'sha1' };
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        version: 2,
        skills: {
          '@harness-skills/x': {
            version: '1.0.0',
            resolved: 'local:/x',
            integrity: '',
            platforms: ['claude-code'],
            installedAt: '2026-08-05T00:00:00Z',
            dependencyOf: null,
            source,
          },
        },
      })
    );
    const result = readLockfile(lockPath);
    expect(result.version).toBe(2);
    expect(result.skills['@harness-skills/x'].source).toEqual(source);
  });

  it('rejects an unsupported version (3)', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    fs.writeFileSync(lockPath, JSON.stringify({ version: 3, skills: {} }));
    expect(() => readLockfile(lockPath)).toThrow('Invalid lockfile format');
  });

  it('rejects literal null content with the friendly error (not a raw TypeError)', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    fs.writeFileSync(lockPath, 'null');
    expect(() => readLockfile(lockPath)).toThrow('Invalid lockfile format');
  });

  it('always writes version 2 even when the in-memory lockfile is version 1', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    writeLockfile(lockPath, { version: 1, skills: {} });
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    expect(parsed.version).toBe(2);
  });

  it('round-trips a github source through write then read', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    const entry: LockfileEntry = {
      version: '1.0.0',
      resolved: 'local:/tmp/x',
      integrity: '',
      platforms: ['claude-code'],
      installedAt: '2026-08-05T00:00:00Z',
      dependencyOf: null,
      source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'abc' },
    };
    writeLockfile(lockPath, { version: 2, skills: { '@harness-skills/x': entry } });
    const result = readLockfile(lockPath);
    expect(result.version).toBe(2);
    expect(result.skills['@harness-skills/x'].source).toEqual(entry.source);
  });

  it('serializes the nested source object with sorted keys', () => {
    const lockPath = path.join(tmpDir, 'skills-lock.json');
    const entry: LockfileEntry = {
      version: '1.0.0',
      resolved: 'local:/tmp/x',
      integrity: '',
      platforms: ['claude-code'],
      installedAt: '2026-08-05T00:00:00Z',
      dependencyOf: null,
      source: { kind: 'github', owner: 'o', repo: 'r', ref: 'main', commit: 'abc' },
    };
    writeLockfile(lockPath, { version: 2, skills: { '@harness-skills/x': entry } });
    const raw = fs.readFileSync(lockPath, 'utf-8');
    expect(raw.indexOf('"commit"')).toBeLessThan(raw.indexOf('"kind"'));
    expect(raw.indexOf('"kind"')).toBeLessThan(raw.indexOf('"owner"'));
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
    const data: SkillsLockfile = { version: 2, skills: {} };
    writeLockfile(lockPath, data);
    const raw = fs.readFileSync(lockPath, 'utf-8');
    // Keys are sorted alphabetically (deterministic), so "skills" comes before "version"
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(data);
    expect(parsed.version).toBe(2);
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
