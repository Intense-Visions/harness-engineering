import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createNodeShardIO } from '../../../src/commands/roadmap/shard-io';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-shard-io-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('createNodeShardIO()', () => {
  it('round-trips a string via writeFile/readFile', async () => {
    const io = createNodeShardIO();
    const p = path.join(dir, 'a.md');
    await io.writeFile(p, 'hello world');
    expect(await io.readFile(p)).toBe('hello world');
  });

  it('mkdirp creates nested directories idempotently', async () => {
    const io = createNodeShardIO();
    const nested = path.join(dir, 'x', 'y', 'z');
    await io.mkdirp(nested);
    await io.mkdirp(nested); // idempotent — must not throw
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('listDir returns basenames of entries', async () => {
    const io = createNodeShardIO();
    fs.writeFileSync(path.join(dir, 'one.md'), 'x');
    fs.writeFileSync(path.join(dir, 'two.md'), 'y');
    const names = (await io.listDir(dir)).sort();
    expect(names).toEqual(['one.md', 'two.md']);
  });

  it('exists reports true for present paths and false for absent ones', async () => {
    const io = createNodeShardIO();
    const p = path.join(dir, 'present.md');
    fs.writeFileSync(p, 'x');
    expect(await io.exists(p)).toBe(true);
    expect(await io.exists(path.join(dir, 'absent.md'))).toBe(false);
  });

  it('rmrf removes a populated directory', async () => {
    const io = createNodeShardIO();
    const sub = path.join(dir, 'roadmap.d');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, 'a.md'), 'x');
    await io.rmrf(sub);
    expect(fs.existsSync(sub)).toBe(false);
  });
});
