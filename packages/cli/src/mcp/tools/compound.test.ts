import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  acquireCompoundLockDefinition,
  handleAcquireCompoundLock,
  releaseCompoundLockDefinition,
  handleReleaseCompoundLock,
  _resetCompoundLockHandlesForTests,
} from './compound';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-mcp-compound-'));
});

afterEach(() => {
  _resetCompoundLockHandlesForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('acquire_compound_lock / release_compound_lock MCP tools', () => {
  it('definitions have expected names', () => {
    expect(acquireCompoundLockDefinition.name).toBe('acquire_compound_lock');
    expect(releaseCompoundLockDefinition.name).toBe('release_compound_lock');
  });

  it('acquires a lock, writes the lock file, and releases it', async () => {
    const acquired = await handleAcquireCompoundLock({
      path: tmpDir,
      category: 'build-errors',
    });
    const acquiredPayload = JSON.parse(acquired.content[0]!.text);
    expect(acquiredPayload.acquired).toBe(true);
    expect(typeof acquiredPayload.token).toBe('string');
    expect(fs.existsSync(acquiredPayload.lockPath)).toBe(true);

    const released = await handleReleaseCompoundLock({ token: acquiredPayload.token });
    const releasedPayload = JSON.parse(released.content[0]!.text);
    expect(releasedPayload.released).toBe(true);
    expect(fs.existsSync(acquiredPayload.lockPath)).toBe(false);
  });

  it('serializes same-category acquires (second fails with CompoundLockHeldError)', async () => {
    const first = await handleAcquireCompoundLock({
      path: tmpDir,
      category: 'build-errors',
    });
    expect(JSON.parse(first.content[0]!.text).acquired).toBe(true);

    const second = await handleAcquireCompoundLock({
      path: tmpDir,
      category: 'build-errors',
    });
    const secondPayload = JSON.parse(second.content[0]!.text);
    expect(secondPayload.acquired).toBe(false);
    expect(secondPayload.error).toBe('CompoundLockHeldError');
    expect(typeof secondPayload.holderPid).toBe('number');
  });

  it('different categories never contend', async () => {
    const first = await handleAcquireCompoundLock({
      path: tmpDir,
      category: 'build-errors',
    });
    const second = await handleAcquireCompoundLock({
      path: tmpDir,
      category: 'test-failures',
    });
    expect(JSON.parse(first.content[0]!.text).acquired).toBe(true);
    expect(JSON.parse(second.content[0]!.text).acquired).toBe(true);
  });

  it('rejects unknown categories', async () => {
    const result = await handleAcquireCompoundLock({
      path: tmpDir,
      category: 'not-a-real-category',
    });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.acquired).toBe(false);
    expect(result.isError).toBe(true);
  });

  it('release with unknown token returns released:false', async () => {
    const result = await handleReleaseCompoundLock({ token: 'no-such-token' });
    const payload = JSON.parse(result.content[0]!.text);
    expect(payload.released).toBe(false);
    expect(result.isError).toBe(true);
  });
});
