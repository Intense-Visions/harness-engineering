import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  resolveStreamPath,
  createStream,
  listStreams,
  setActiveStream,
  loadStreamIndex,
  archiveStream,
  getStreamForBranch,
  touchStream,
} from '../../src/state/stream-resolver';

function makeTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-test-'));
  fs.mkdirSync(path.join(dir, '.harness', 'streams'), { recursive: true });
  return dir;
}

describe('createStream', () => {
  it('creates stream directory and updates index', async () => {
    const tmp = makeTmp();
    const result = await createStream(tmp, 'auth-rework', 'feature/auth-rework');
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tmp, '.harness', 'streams', 'auth-rework'))).toBe(true);
    const idx = await loadStreamIndex(tmp);
    expect(idx.ok && idx.value.streams['auth-rework']).toBeTruthy();
    if (idx.ok) {
      expect(idx.value.streams['auth-rework']!.branch).toBe('feature/auth-rework');
    }
    fs.rmSync(tmp, { recursive: true });
  });

  it('rejects duplicate stream names', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'my-stream');
    const result = await createStream(tmp, 'my-stream');
    expect(result.ok).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });

  it('rejects invalid stream names', async () => {
    const tmp = makeTmp();
    const cases = ['My Stream', '../escape', 'has/slash', 'UPPERCASE', ' leading-space'];
    for (const name of cases) {
      const result = await createStream(tmp, name);
      expect(result.ok).toBe(false);
    }
    fs.rmSync(tmp, { recursive: true });
  });

  it('accepts valid stream names', async () => {
    const tmp = makeTmp();
    const cases = ['auth-rework', 'feature.v2', 'bugfix_123', 'default'];
    for (const name of cases) {
      const result = await createStream(tmp, name);
      expect(result.ok).toBe(true);
    }
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('resolveStreamPath', () => {
  it('resolves explicit stream name', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'my-stream');
    const result = await resolveStreamPath(tmp, { stream: 'my-stream' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(path.join(tmp, '.harness', 'streams', 'my-stream'));
    }
    fs.rmSync(tmp, { recursive: true });
  });

  it('returns error for unknown explicit stream', async () => {
    const tmp = makeTmp();
    const result = await resolveStreamPath(tmp, { stream: 'nonexistent' });
    expect(result.ok).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });

  it('resolves active stream when no explicit name', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'default');
    await setActiveStream(tmp, 'default');
    const result = await resolveStreamPath(tmp);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('default');
    }
    fs.rmSync(tmp, { recursive: true });
  });

  it('returns error when no stream can be resolved', async () => {
    const tmp = makeTmp();
    const result = await resolveStreamPath(tmp);
    expect(result.ok).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });

  it('does not write to disk on resolution (no side effects)', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'my-stream');
    const idxBefore = await loadStreamIndex(tmp);
    const timeBefore = idxBefore.ok ? idxBefore.value.streams['my-stream']!.lastActiveAt : '';
    await resolveStreamPath(tmp, { stream: 'my-stream' });
    const idxAfter = await loadStreamIndex(tmp);
    if (idxAfter.ok) {
      expect(idxAfter.value.streams['my-stream']!.lastActiveAt).toBe(timeBefore);
    }
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('listStreams', () => {
  it('returns all known streams', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'stream-a');
    await createStream(tmp, 'stream-b');
    const result = await listStreams(tmp);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(2);
    fs.rmSync(tmp, { recursive: true });
  });

  it('returns empty array when no streams', async () => {
    const tmp = makeTmp();
    const result = await listStreams(tmp);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(0);
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('setActiveStream', () => {
  it('updates activeStream in index', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'my-stream');
    await setActiveStream(tmp, 'my-stream');
    const idx = await loadStreamIndex(tmp);
    expect(idx.ok && idx.value.activeStream).toBe('my-stream');
    fs.rmSync(tmp, { recursive: true });
  });

  it('rejects unknown stream name', async () => {
    const tmp = makeTmp();
    const result = await setActiveStream(tmp, 'nonexistent');
    expect(result.ok).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('archiveStream', () => {
  it('moves stream to archive and removes from index', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'old-stream');
    const result = await archiveStream(tmp, 'old-stream');
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tmp, '.harness', 'streams', 'old-stream'))).toBe(false);
    const idx = await loadStreamIndex(tmp);
    expect(idx.ok && idx.value.streams['old-stream']).toBeFalsy();
    fs.rmSync(tmp, { recursive: true });
  });

  it('clears activeStream if archived stream was active', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'active-stream');
    await setActiveStream(tmp, 'active-stream');
    await archiveStream(tmp, 'active-stream');
    const idx = await loadStreamIndex(tmp);
    expect(idx.ok && idx.value.activeStream).toBeNull();
    fs.rmSync(tmp, { recursive: true });
  });

  it('rejects unknown stream name', async () => {
    const tmp = makeTmp();
    const result = await archiveStream(tmp, 'nonexistent');
    expect(result.ok).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('touchStream', () => {
  it('updates lastActiveAt and activeStream', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'stream-a');
    await createStream(tmp, 'stream-b');
    const before = new Date().toISOString();
    await touchStream(tmp, 'stream-b');
    const idx = await loadStreamIndex(tmp);
    expect(idx.ok).toBe(true);
    if (idx.ok) {
      expect(idx.value.activeStream).toBe('stream-b');
      expect(idx.value.streams['stream-b']!.lastActiveAt >= before).toBe(true);
    }
    fs.rmSync(tmp, { recursive: true });
  });

  it('rejects unknown stream name', async () => {
    const tmp = makeTmp();
    const result = await touchStream(tmp, 'nonexistent');
    expect(result.ok).toBe(false);
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('getStreamForBranch', () => {
  it('finds stream by branch association', async () => {
    const tmp = makeTmp();
    await createStream(tmp, 'auth', 'feature/auth');
    const idx = await loadStreamIndex(tmp);
    if (idx.ok) {
      expect(getStreamForBranch(idx.value, 'feature/auth')).toBe('auth');
      expect(getStreamForBranch(idx.value, 'other-branch')).toBeNull();
    }
    fs.rmSync(tmp, { recursive: true });
  });
});
