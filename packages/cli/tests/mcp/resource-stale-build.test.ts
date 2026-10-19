import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileURLToPath } from 'node:url';

/**
 * The resource seam is the second request entry point into the long-lived MCP
 * server, and it fails the same way as the tool seam: `harness://state` and the
 * three graph resources reach `@harness-engineering/core` /
 * `@harness-engineering/graph` through a lazy `import()`, so a CLI upgraded
 * under a running server leaves them resolving against chunks the upgrade
 * deleted. The first pass of this change translated only the tool seam.
 */

/** Where `stale-build.ts` lives, which is the directory it checks "own dist" against. */
const STALE_BUILD_DIR = fileURLToPath(new URL('../../src/mcp/', import.meta.url));

/** Node's real shape for a dynamic import that hit a deleted hashed chunk. */
function staleChunkError(): Error {
  const missing = `${STALE_BUILD_DIR}dist-QI44KYEI.js`;
  const error = new Error(`Cannot find module '${missing}'`) as Error & {
    code?: string;
    url?: string;
  };
  error.code = 'ERR_MODULE_NOT_FOUND';
  error.url = new URL(`file://${missing}`).href;
  return error;
}

// `server.ts` imports the graph resources statically, so the stub has to exist
// before that module is evaluated — hence `vi.hoisted` rather than a plain const.
const { mockGetGraphResource } = vi.hoisted(() => ({ mockGetGraphResource: vi.fn() }));
vi.mock('../../src/mcp/resources/graph.js', () => ({
  getGraphResource: mockGetGraphResource,
  getEntitiesResource: vi.fn().mockResolvedValue('{}'),
  getRelationshipsResource: vi.fn().mockResolvedValue('{}'),
}));

import { handleReadResource } from '../../src/mcp/server';

describe('handleReadResource — build skew at the resource seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the stale server instead of the deleted chunk', async () => {
    mockGetGraphResource.mockRejectedValue(staleChunkError());

    await expect(handleReadResource('harness://graph', process.cwd())).rejects.toThrow(
      /Restart the MCP server/
    );
  });

  it('keeps an unrelated failure\u2019s own message', async () => {
    // Mislabelling a real failure as build skew would send someone to restart a
    // server that was never the problem — the same rule the tool seam follows.
    mockGetGraphResource.mockRejectedValue(new Error('graph.json is corrupt'));

    await expect(handleReadResource('harness://graph', process.cwd())).rejects.toThrow(
      'graph.json is corrupt'
    );
  });

  it('passes a successful read straight through', async () => {
    mockGetGraphResource.mockResolvedValue('{"status":"ok"}');

    const result = await handleReadResource('harness://graph', process.cwd());
    expect(result.contents[0]!.text).toBe('{"status":"ok"}');
  });
});
