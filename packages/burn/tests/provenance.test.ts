import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readProvenance } from '../src/provenance';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'burn-prov-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeProvenance(slug: string, body: string): void {
  const dir = path.join(root, 'docs', 'changes', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'provenance.json'), body);
}

describe('readProvenance', () => {
  it('returns [] when docs/changes is absent', () => {
    expect(readProvenance(root)).toEqual([]);
  });

  it('reads a scalar `issue` and defaults slug from the directory', () => {
    writeProvenance('feat-a', JSON.stringify({ issue: 1274, branch: 'build/a' }));
    const [entry] = readProvenance(root);
    expect(entry).toMatchObject({ slug: 'feat-a', issues: [1274], branch: 'build/a' });
  });

  it('reads an `issues` array and an explicit slug', () => {
    writeProvenance('dir-b', JSON.stringify({ issues: [1297, 1298], slug: 'real-slug' }));
    const [entry] = readProvenance(root);
    expect(entry!.slug).toBe('real-slug');
    expect(entry!.issues).toEqual([1297, 1298]);
  });

  it('captures the optional laneId when present', () => {
    writeProvenance('feat-c', JSON.stringify({ issues: [5], laneId: 'lane-42' }));
    expect(readProvenance(root)[0]!.laneId).toBe('lane-42');
  });

  it('drops a file with no readable issue but keeps a valid sibling', () => {
    writeProvenance('no-issue', JSON.stringify({ stages: ['x'] }));
    writeProvenance('has-issue', JSON.stringify({ issue: 9 }));
    const entries = readProvenance(root);
    const slugs = entries.map((e) => e.slug).sort();
    expect(slugs).toEqual(['has-issue', 'no-issue']);
    expect(entries.find((e) => e.slug === 'no-issue')!.issues).toEqual([]);
  });

  it('skips a malformed JSON file without throwing', () => {
    writeProvenance('bad', '{ not json');
    writeProvenance('good', JSON.stringify({ issue: 3 }));
    const entries = readProvenance(root);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.slug).toBe('good');
  });

  it('de-dups and coerces string issue numbers', () => {
    writeProvenance('feat-d', JSON.stringify({ issue: '10', issues: [10, '11'] }));
    expect(readProvenance(root)[0]!.issues.sort((a, b) => a - b)).toEqual([10, 11]);
  });
});
