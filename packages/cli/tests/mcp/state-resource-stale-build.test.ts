import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';

/**
 * `getStateResource` wraps everything in a blanket catch so a project with no
 * readable state answers an empty one. A server running a build that no longer
 * exists on disk is not that: its two lazy `import()`s resolve against deleted
 * chunks, and swallowing THAT reported "no decisions, no blockers, no progress"
 * over a read that never happened — a fabricated clean answer, which is worse
 * than the opaque error it replaced.
 */

const STALE_BUILD_DIR = fileURLToPath(new URL('../../src/mcp/', import.meta.url));

function staleChunkError(): Error {
  const missing = `${STALE_BUILD_DIR}chunk-GF46LTKE.js`;
  const error = new Error(`Cannot find module '${missing}'`) as Error & {
    code?: string;
    url?: string;
  };
  error.code = 'ERR_MODULE_NOT_FOUND';
  error.url = new URL(`file://${missing}`).href;
  return error;
}

const mockMigrateToStreams = vi.fn();
vi.mock('@harness-engineering/core', () => ({
  migrateToStreams: mockMigrateToStreams,
}));

const mockReadHarnessState = vi.fn();
vi.mock('../../src/shared/state-events.js', () => ({
  readHarnessState: mockReadHarnessState,
}));

import { getStateResource } from '../../src/mcp/resources/state';

describe('getStateResource — build skew is not an empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMigrateToStreams.mockResolvedValue(undefined);
    mockReadHarnessState.mockResolvedValue({ ok: true, value: { schemaVersion: 1 } });
  });

  it('rethrows a build-skew failure instead of fabricating an empty state', async () => {
    mockMigrateToStreams.mockRejectedValue(staleChunkError());

    await expect(getStateResource(process.cwd())).rejects.toThrow(/Cannot find module/);
  });

  it('still answers an empty state for an ordinary unreadable-state failure', async () => {
    mockMigrateToStreams.mockRejectedValue(new Error('EACCES: permission denied'));

    const json = JSON.parse(await getStateResource(process.cwd()));
    expect(json).toEqual({
      schemaVersion: 1,
      position: {},
      decisions: [],
      blockers: [],
      progress: {},
    });
  });

  it('passes a real state read through untouched', async () => {
    mockReadHarnessState.mockResolvedValue({
      ok: true,
      value: { schemaVersion: 1, decisions: ['kept'] },
    });

    const json = JSON.parse(await getStateResource(process.cwd()));
    expect(json.decisions).toEqual(['kept']);
  });
});
