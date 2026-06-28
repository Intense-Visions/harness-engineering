import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNodeRoadmapIO } from '../../../src/roadmap/store/node-io';

describe('createNodeRoadmapIO', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'node-io-'));
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('writeFile creates missing parent directories and readFile round-trips', async () => {
    const io = createNodeRoadmapIO();
    const target = path.join(dir, 'nested', 'deep', 'file.md');
    await io.writeFile(target, 'hello shards');
    expect(await io.readFile(target)).toBe('hello shards');
  });

  it('listDir returns the basenames under a directory', async () => {
    const io = createNodeRoadmapIO();
    await io.writeFile(path.join(dir, 'a.md'), 'a');
    await io.writeFile(path.join(dir, 'b.md'), 'b');
    const entries = await io.listDir(dir);
    expect(entries.sort()).toEqual(['a.md', 'b.md']);
  });

  it('deleteFile removes a file so a subsequent readFile rejects', async () => {
    const io = createNodeRoadmapIO();
    const target = path.join(dir, 'gone.md');
    await io.writeFile(target, 'temporary');
    await io.deleteFile(target);
    await expect(io.readFile(target)).rejects.toThrow();
  });
});
