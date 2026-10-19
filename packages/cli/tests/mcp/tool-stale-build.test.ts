import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * #2151 added stale-build translation at BOTH request entry points into the
 * long-lived MCP server — `handleReadResource` (covered by
 * `resource-stale-build.test.ts`) and `dispatchTool`. Only the resource seam was
 * pinned. Measured on `origin/main`: replacing `dispatchTool`'s whole try/catch
 * with the bare `const result = await handler(args ?? {})` left `packages/cli`
 * fully green (754 files / 8929 tests, 2 skipped, vitest exit 0), while the
 * equivalent mutation at the resource seam failed its test — so the green was a
 * real collection, not an empty one.
 *
 * The tool seam is the one the originally-reported `manage_roadmap` failure came
 * through, i.e. the seam that motivated the fix.
 *
 * `dispatchTool` is module-private, so this drives it the way a client does:
 * through `createHarnessServer` over an in-memory transport, which is the
 * existing pattern in `update-check-hook.test.ts`. That also exercises the four
 * middleware wrappers the real request passes through on the way in.
 */

/** Where `stale-build.ts` lives — the directory it checks "own dist" against. */
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

// `server.ts` imports the tool handlers statically, so the stub must exist
// before that module is evaluated — hence `vi.hoisted`. `validate_project` is
// used because its module has exactly two exports, which keeps the stub from
// having to mirror a large surface; the seam under test is shared by every tool.
const { mockHandleValidateProject } = vi.hoisted(() => ({
  mockHandleValidateProject: vi.fn(),
}));
vi.mock('../../src/mcp/tools/validate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/mcp/tools/validate.js')>();
  return { ...actual, handleValidateProject: mockHandleValidateProject };
});

const { createHarnessServer } = await import('../../src/mcp/server');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

describe('dispatchTool — build skew at the tool seam (#2151)', () => {
  let root: string;

  async function callValidateProject() {
    // Filtered to the one stubbed tool so no other handler can run.
    const server = createHarnessServer(root, ['validate_project']);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client.callTool({ name: 'validate_project', arguments: { path: root } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-tool-stale-')));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('names the stale server instead of the deleted chunk', async () => {
    mockHandleValidateProject.mockRejectedValue(staleChunkError());

    const result = await callValidateProject();

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('\n');
    expect(text).toMatch(/Restart the MCP server/);
    expect(text).toContain('dist-QI44KYEI.js');
  });

  it('keeps an unrelated failure from being relabelled as build skew', async () => {
    // The `staleBuild === null` rethrow. Mislabelling a real failure would send
    // someone to restart a server that was never the problem — and a swallowed
    // rethrow would quietly turn every tool crash into a stale-build report.
    mockHandleValidateProject.mockRejectedValue(new Error('harness.config.json is corrupt'));

    await expect(callValidateProject()).rejects.toThrow(/harness\.config\.json is corrupt/);
  });

  it('passes a successful call straight through', async () => {
    mockHandleValidateProject.mockResolvedValue({
      content: [{ type: 'text', text: '{"status":"ok"}' }],
    });

    const result = await callValidateProject();

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)
      .map((c) => c.text)
      .join('\n');
    expect(text).toContain('{"status":"ok"}');
  });
});
