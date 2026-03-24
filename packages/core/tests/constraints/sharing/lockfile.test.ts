import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  readLockfile,
  writeLockfile,
  addProvenance,
  removeProvenance,
} from '../../../src/constraints/sharing/lockfile';
import type { Lockfile, LockfilePackage } from '../../../src/constraints/sharing/types';

const emptyLockfile: Lockfile = { version: 1, packages: {} };

function makeLockfilePackage(overrides?: Partial<LockfilePackage>): LockfilePackage {
  return {
    version: '1.0.0',
    source: './bundle.harness-constraints.json',
    installedAt: '2026-03-24T12:00:00Z',
    contributions: { layers: ['types'] },
    ...overrides,
  };
}

describe('readLockfile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-lockfile-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should return null when lockfile does not exist', async () => {
    const result = await readLockfile(path.join(tempDir, 'nonexistent.lock.json'));
    expect(result).toEqual({ ok: true, value: null });
  });

  it('should return parsed lockfile when file is valid', async () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'strict-api': makeLockfilePackage(),
      },
    };
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await fs.writeFile(filePath, JSON.stringify(lockfile), 'utf-8');

    const result = await readLockfile(filePath);
    expect(result).toEqual({ ok: true, value: lockfile });
  });

  it('should return error when file contains invalid JSON', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await fs.writeFile(filePath, '{not valid json!!!', 'utf-8');

    const result = await readLockfile(filePath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('parse');
    }
  });

  it('should return error when file fails schema validation', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await fs.writeFile(filePath, JSON.stringify({ version: 99, packages: {} }), 'utf-8');

    const result = await readLockfile(filePath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('validation');
    }
  });

  it('should return error when packages entry has invalid shape', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    const bad = {
      version: 1,
      packages: {
        broken: { version: 123 }, // version should be string
      },
    };
    await fs.writeFile(filePath, JSON.stringify(bad), 'utf-8');

    const result = await readLockfile(filePath);
    expect(result.ok).toBe(false);
  });
});

describe('writeLockfile', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-lockfile-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write a valid lockfile that can be read back', async () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'strict-api': makeLockfilePackage(),
      },
    };
    const filePath = path.join(tempDir, 'constraints.lock.json');

    await writeLockfile(filePath, lockfile);

    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(lockfile);
  });

  it('should write formatted JSON with trailing newline', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await writeLockfile(filePath, emptyLockfile);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe(JSON.stringify(emptyLockfile, null, 2) + '\n');
  });

  it('should overwrite an existing lockfile', async () => {
    const filePath = path.join(tempDir, 'constraints.lock.json');
    await writeLockfile(filePath, emptyLockfile);

    const updated: Lockfile = {
      version: 1,
      packages: { 'pkg-a': makeLockfilePackage() },
    };
    await writeLockfile(filePath, updated);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(content)).toEqual(updated);
  });
});

describe('addProvenance', () => {
  it('should add a new package to an empty lockfile', () => {
    const entry = makeLockfilePackage();
    const result = addProvenance(emptyLockfile, 'strict-api', entry);

    expect(result.packages['strict-api']).toEqual(entry);
    expect(Object.keys(result.packages)).toHaveLength(1);
  });

  it('should add a second package alongside an existing one', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { 'pkg-a': makeLockfilePackage() },
    };
    const entryB = makeLockfilePackage({
      version: '2.0.0',
      contributions: { 'security.rules': ['SEC-001'] },
    });

    const result = addProvenance(lockfile, 'pkg-b', entryB);

    expect(Object.keys(result.packages)).toHaveLength(2);
    expect(result.packages['pkg-a']).toEqual(lockfile.packages['pkg-a']);
    expect(result.packages['pkg-b']).toEqual(entryB);
  });

  it('should replace an existing package entry (upgrade)', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { 'strict-api': makeLockfilePackage({ version: '1.0.0' }) },
    };
    const upgraded = makeLockfilePackage({
      version: '2.0.0',
      contributions: { layers: ['types', 'core'] },
    });

    const result = addProvenance(lockfile, 'strict-api', upgraded);

    expect(result.packages['strict-api']).toEqual(upgraded);
    expect(Object.keys(result.packages)).toHaveLength(1);
  });

  it('should not mutate the original lockfile', () => {
    const entry = makeLockfilePackage();
    const original: Lockfile = { version: 1, packages: {} };
    const originalCopy = JSON.parse(JSON.stringify(original));

    addProvenance(original, 'pkg', entry);

    expect(original).toEqual(originalCopy);
  });

  it('should preserve version field', () => {
    const result = addProvenance(emptyLockfile, 'pkg', makeLockfilePackage());
    expect(result.version).toBe(1);
  });
});

describe('removeProvenance', () => {
  it('should remove an existing package and return its contributions', () => {
    const contributions = { layers: ['types', 'core'], 'security.rules': ['SEC-001'] };
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'strict-api': makeLockfilePackage({ contributions }),
      },
    };

    const result = removeProvenance(lockfile, 'strict-api');

    expect(result.lockfile.packages).toEqual({});
    expect(result.contributions).toEqual(contributions);
  });

  it('should return null contributions when package is not found', () => {
    const result = removeProvenance(emptyLockfile, 'nonexistent');

    expect(result.lockfile).toEqual(emptyLockfile);
    expect(result.contributions).toBeNull();
  });

  it('should preserve other packages when removing one', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: {
        'pkg-a': makeLockfilePackage({ version: '1.0.0' }),
        'pkg-b': makeLockfilePackage({ version: '2.0.0' }),
      },
    };

    const result = removeProvenance(lockfile, 'pkg-a');

    expect(Object.keys(result.lockfile.packages)).toEqual(['pkg-b']);
    expect(result.lockfile.packages['pkg-b']).toEqual(lockfile.packages['pkg-b']);
  });

  it('should not mutate the original lockfile', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { pkg: makeLockfilePackage() },
    };
    const originalCopy = JSON.parse(JSON.stringify(lockfile));

    removeProvenance(lockfile, 'pkg');

    expect(lockfile).toEqual(originalCopy);
  });

  it('should preserve version field', () => {
    const lockfile: Lockfile = {
      version: 1,
      packages: { pkg: makeLockfilePackage() },
    };

    const result = removeProvenance(lockfile, 'pkg');
    expect(result.lockfile.version).toBe(1);
  });
});
