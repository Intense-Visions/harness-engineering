import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadManifest, loadCatalog, findFixture, MANIFEST_FILENAME } from './catalog';

const validManifest = {
  id: 'hardcoded-secret',
  title: 'Hardcoded API secret in source',
  failureMode: 'leaked-secret',
  difficulty: 'easy',
  summary: 'A live-looking API key is committed directly in source.',
  plantedFile: 'config.ts',
  plantedDescription: 'An API secret is hardcoded as a string literal.',
  expectedCheck: 'harness check-security',
  expectedFix: 'Read the secret from the environment.',
  rubric: {
    detected: 'Agent names the leaked secret.',
    correctCheck: 'Agent runs harness check-security.',
    fixed: 'The literal is gone.',
    noCollateral: 'Sibling files still valid.',
  },
};

let root: string;

function writeFixture(id: string, manifest: unknown): void {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MANIFEST_FILENAME), JSON.stringify(manifest));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rehearsal-catalog-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('loadManifest', () => {
  it('loads a valid manifest', () => {
    writeFixture('hardcoded-secret', validManifest);
    const r = loadManifest(path.join(root, 'hardcoded-secret'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toBe('hardcoded-secret');
  });

  it('errors (never throws) on a missing manifest', () => {
    fs.mkdirSync(path.join(root, 'empty'));
    const r = loadManifest(path.join(root, 'empty'));
    expect(r.ok).toBe(false);
  });

  it('errors on an id/directory-name mismatch', () => {
    writeFixture('renamed', { ...validManifest, id: 'hardcoded-secret' });
    const r = loadManifest(path.join(root, 'renamed'));
    expect(r.ok).toBe(false);
  });

  it('errors on a schema-invalid manifest', () => {
    writeFixture('bad', { ...validManifest, id: 'bad', failureMode: 'not-a-mode' });
    const r = loadManifest(path.join(root, 'bad'));
    expect(r.ok).toBe(false);
  });
});

describe('loadCatalog', () => {
  it('returns an empty list for an absent root', () => {
    expect(loadCatalog(path.join(root, 'nope'))).toEqual([]);
  });

  it('lists only well-formed fixtures, sorted by id', () => {
    writeFixture('layer-violation', {
      ...validManifest,
      id: 'layer-violation',
      failureMode: 'layer-violation',
    });
    writeFixture('hardcoded-secret', validManifest);
    fs.mkdirSync(path.join(root, 'garbage')); // no manifest — skipped
    const catalog = loadCatalog(root);
    expect(catalog.map((m) => m.id)).toEqual(['hardcoded-secret', 'layer-violation']);
  });
});

describe('findFixture', () => {
  it('resolves a fixture by id', () => {
    writeFixture('hardcoded-secret', validManifest);
    const r = findFixture(root, 'hardcoded-secret');
    expect(r.ok).toBe(true);
  });

  it('errors for an unknown id', () => {
    expect(findFixture(root, 'ghost').ok).toBe(false);
  });
});
