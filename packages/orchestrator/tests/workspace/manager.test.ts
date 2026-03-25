import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { WorkspaceManager } from '../../src/workspace/manager';

vi.mock('node:fs/promises');

describe('WorkspaceManager', () => {
  const config = { root: '/tmp/workspaces' };
  const manager = new WorkspaceManager(config);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('sanitizes identifier correctly', () => {
    expect(manager.sanitizeIdentifier('Issue-123')).toBe('issue-123');
    expect(manager.sanitizeIdentifier('feat/some-feature')).toBe('feat-some-feature');
    expect(manager.sanitizeIdentifier('../../etc/passwd')).toBe('etc-passwd');
  });

  it('resolves path within root', () => {
    const resolved = manager.resolvePath('issue-123');
    expect(resolved).toBe(path.join('/tmp/workspaces', 'issue-123'));
  });

  it('ensures workspace directory exists', async () => {
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);
    expect(fs.mkdir).toHaveBeenCalledWith(path.join('/tmp/workspaces', 'test-issue'), {
      recursive: true,
    });
  });

  it('checks if workspace exists', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    const exists = await manager.exists('test-issue');
    expect(exists).toBe(true);
  });

  it('removes workspace directory', async () => {
    vi.mocked(fs.rm).mockResolvedValue(undefined);
    const result = await manager.removeWorkspace('test-issue');
    expect(result.ok).toBe(true);
    expect(fs.rm).toHaveBeenCalledWith(path.join('/tmp/workspaces', 'test-issue'), {
      recursive: true,
      force: true,
    });
  });
});
