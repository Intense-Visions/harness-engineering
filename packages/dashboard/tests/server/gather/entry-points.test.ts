import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverEntryPoints } from '../../../src/server/gather/entry-points';

describe('discoverEntryPoints', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dash-entry-points-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns only package index files that exist on disk', async () => {
    // A conventional package, a package with no src/index.ts (this repo's own
    // dashboard is one), a package whose index.ts is a directory, and a stray
    // file directly under packages/.
    await mkdir(join(root, 'packages', 'lib', 'src'), { recursive: true });
    await writeFile(join(root, 'packages', 'lib', 'src', 'index.ts'), 'export const x = 1;\n');
    await mkdir(join(root, 'packages', 'app', 'src'), { recursive: true });
    await writeFile(join(root, 'packages', 'app', 'src', 'main.tsx'), 'export {};\n');
    await mkdir(join(root, 'packages', 'odd', 'src', 'index.ts'), { recursive: true });
    await writeFile(join(root, 'packages', 'README.md'), '# packages\n');

    const points = await discoverEntryPoints(root);

    expect(points).toEqual([join('packages', 'lib', 'src', 'index.ts')]);
  });

  it('returns an empty list when there is no packages directory', async () => {
    expect(await discoverEntryPoints(root)).toEqual([]);
  });
});
