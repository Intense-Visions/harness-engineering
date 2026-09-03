import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { handleDocsPublish, docsPublishDefinition } from './docs-publish';

/**
 * Behavior contract for the `docs_publish` MCP tool. Characterizes the CURRENT
 * behavior of `handleDocsPublish`: config-resolution + connector-resolution error
 * degradation, per-op dispatch and required-arg validation, the ok→value /
 * error→message MCP-response mapping, unknown-op handling, and the handler-throw
 * catch. The connector and config loader are stubbed, so no real config file or
 * connector runs. Behavior characterized as-is.
 */

const hoisted = vi.hoisted(() => ({
  findConfigFileMock: vi.fn(),
  loadConfigMock: vi.fn(),
  resolveConnectorMock: vi.fn(),
}));

vi.mock('../../config/loader.js', () => ({
  findConfigFile: hoisted.findConfigFileMock,
  loadConfig: hoisted.loadConfigMock,
}));
vi.mock('../../docs-publish/index.js', () => ({
  resolveDocsPublishConnector: hoisted.resolveConnectorMock,
}));

const connector = () => ({
  draft: vi.fn().mockResolvedValue({ ok: true, value: { pageId: 'P1', draftStatus: 'draft' } }),
  attachMedia: vi.fn().mockResolvedValue({ status: 'manual-step-required', instructions: 'do it' }),
  verifyRender: vi.fn().mockResolvedValue({ ok: true, imagesLoaded: 3, failures: [] }),
  pageTree: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { parentId: 'P1', childPageIds: ['c1'] } }),
});

let conn: ReturnType<typeof connector>;

beforeEach(() => {
  for (const m of Object.values(hoisted)) m.mockReset();
  conn = connector();
  hoisted.findConfigFileMock.mockReturnValue({ ok: true, value: '/proj/harness.config.json' });
  hoisted.loadConfigMock.mockReturnValue({ ok: true, value: { name: 'proj' } });
  hoisted.resolveConnectorMock.mockReturnValue({ ok: true, value: conn });
});

afterEach(() => vi.restoreAllMocks());

describe('docsPublishDefinition', () => {
  it('declares the tool name and the four ops as the enum, requiring op', () => {
    expect(docsPublishDefinition.name).toBe('docs_publish');
    expect(docsPublishDefinition.inputSchema.properties.op.enum).toEqual([
      'draft',
      'attach-media',
      'verify-render',
      'page-tree',
    ]);
    expect(docsPublishDefinition.inputSchema.required).toEqual(['op']);
  });
});

describe('handleDocsPublish — resolution degradation', () => {
  it('returns an isError response when the config file cannot be found', async () => {
    hoisted.findConfigFileMock.mockReturnValue({ ok: false, error: { message: 'no config' } });
    const res = await handleDocsPublish({ op: 'draft' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('no config');
  });

  it('returns an isError response when the config fails to load', async () => {
    hoisted.loadConfigMock.mockReturnValue({ ok: false, error: { message: 'bad config' } });
    const res = await handleDocsPublish({ op: 'draft' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('bad config');
  });

  it('degrades to an actionable isError when no connector is configured', async () => {
    hoisted.resolveConnectorMock.mockReturnValue({
      ok: false,
      error: { message: 'not configured' },
    });
    const res = await handleDocsPublish({ op: 'draft' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('not configured');
  });

  it('reports an unknown op', async () => {
    const res = await handleDocsPublish({ op: 'bogus' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('Unknown op: bogus');
  });
});

describe('handleDocsPublish — op dispatch', () => {
  it('draft: validates required spaceId + title', async () => {
    const res = await handleDocsPublish({ op: 'draft', spaceId: 'S1' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('draft requires spaceId and title');
  });

  it('draft: maps a connector Ok value to a non-error response', async () => {
    const res = await handleDocsPublish({ op: 'draft', spaceId: 'S1', title: 'T', pageId: 'P1' });
    expect(res.isError).toBeFalsy();
    expect(conn.draft).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'S1', title: 'T', pageId: 'P1' })
    );
    expect(res.content[0]!.text).toContain('P1');
  });

  it('draft: maps a connector error string to an isError response', async () => {
    conn.draft.mockResolvedValue({ ok: false, error: 'space not found' });
    const res = await handleDocsPublish({ op: 'draft', spaceId: 'S1', title: 'T' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('space not found');
  });

  it('attach-media: validates required pageId + mediaFilePath, then returns Ok', async () => {
    const missing = await handleDocsPublish({ op: 'attach-media', pageId: 'P1' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toContain('attach-media requires pageId and mediaFilePath');

    const ok = await handleDocsPublish({
      op: 'attach-media',
      pageId: 'P1',
      mediaFilePath: '/f.png',
      origin: 'https://x',
    });
    expect(ok.isError).toBeFalsy();
    expect(conn.attachMedia).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'P1', mediaFilePath: '/f.png', origin: 'https://x' })
    );
  });

  it('verify-render: validates required targetUrl, then returns Ok', async () => {
    const missing = await handleDocsPublish({ op: 'verify-render' });
    expect(missing.isError).toBe(true);
    const ok = await handleDocsPublish({ op: 'verify-render', targetUrl: 'https://x/1' });
    expect(ok.isError).toBeFalsy();
    expect(conn.verifyRender).toHaveBeenCalledWith({ targetUrl: 'https://x/1' });
  });

  it('page-tree: requires a children array', async () => {
    const res = await handleDocsPublish({ op: 'page-tree', spaceId: 'S1', parentId: 'P1' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain(
      'page-tree requires spaceId, parentId, and a children array'
    );
  });

  it('page-tree: maps a connector Ok value to a non-error response', async () => {
    const res = await handleDocsPublish({
      op: 'page-tree',
      spaceId: 'S1',
      parentId: 'P1',
      children: [{ title: 'c' }] as never,
    });
    expect(res.isError).toBeFalsy();
    expect(res.content[0]!.text).toContain('c1');
  });

  it('catches a handler throw and maps it to an isError response', async () => {
    conn.draft.mockRejectedValue(new Error('kaboom'));
    const res = await handleDocsPublish({ op: 'draft', spaceId: 'S1', title: 'T' });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toContain('kaboom');
  });
});
