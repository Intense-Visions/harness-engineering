import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config loader + connector resolver so the handler reaches every op
// branch without a real config file or a live provider.
vi.mock('../../../src/config/loader', () => ({
  findConfigFile: vi.fn(),
  loadConfig: vi.fn(),
}));
vi.mock('../../../src/docs-publish/index', () => ({
  resolveDocsPublishConnector: vi.fn(),
}));

import { handleDocsPublish } from '../../../src/mcp/tools/docs-publish';
import { findConfigFile, loadConfig } from '../../../src/config/loader';
import { resolveDocsPublishConnector } from '../../../src/docs-publish/index';

function ok<T>(value: T) {
  return { ok: true as const, value };
}
function err(message: string) {
  return { ok: false as const, error: { message } };
}

function makeConnector(overrides: Record<string, unknown> = {}) {
  return {
    name: 'fake',
    draft: vi.fn(async () => ({
      ok: true,
      value: { pageId: 'p1', draftStatus: 'draft' },
      confirmedByReadBack: true,
    })),
    attachMedia: vi.fn(async () => ({
      status: 'manual-step-required',
      instructions: 'do it',
      verifyWith: 'url',
    })),
    verifyRender: vi.fn(async () => ({
      ok: true,
      imagesLoaded: 1,
      mediaCardErrors: 0,
      mediaSingleCount: 1,
      mediaGroupCount: 0,
      failures: [],
    })),
    pageTree: vi.fn(async () => ({
      ok: true,
      value: { parentId: 'pp', childPageIds: ['c1'] },
      confirmedByReadBack: true,
    })),
    ...overrides,
  };
}

function text(r: { content: Array<{ text: string }> }) {
  return r.content[0].text;
}

const PATH = '/tmp/docs-pub-cov544';

describe('handleDocsPublish branch coverage (cov544)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy resolution chain; individual tests override as needed.
    vi.mocked(findConfigFile).mockReturnValue(ok('/cfg/harness.config.json') as never);
    vi.mocked(loadConfig).mockReturnValue(ok({ version: 1 }) as never);
    vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(makeConnector()) as never);
  });

  it('findConfigFile failure → isError', async () => {
    vi.mocked(findConfigFile).mockReturnValue(err('no config here') as never);
    const r = await handleDocsPublish({ op: 'draft', path: PATH });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('no config here');
  });

  it('loadConfig failure → isError', async () => {
    vi.mocked(loadConfig).mockReturnValue(err('bad config') as never);
    const r = await handleDocsPublish({ op: 'draft', path: PATH });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('bad config');
  });

  it('connector resolution failure → isError', async () => {
    vi.mocked(resolveDocsPublishConnector).mockReturnValue(err('not configured') as never);
    const r = await handleDocsPublish({ op: 'draft', path: PATH });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('not configured');
  });

  it('unknown op → isError', async () => {
    const r = await handleDocsPublish({ op: 'nope', path: PATH });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Unknown op: nope');
  });

  it('defaults path to process.cwd() when omitted', async () => {
    const r = await handleDocsPublish({ op: 'nope' });
    // still resolves the (unknown) op → error, but proves the cwd branch ran
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Unknown op');
  });

  describe('draft op', () => {
    it('missing spaceId/title → validation error', async () => {
      const r = await handleDocsPublish({ op: 'draft', path: PATH, title: 'T' });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('draft requires spaceId and title');
    });
    it('success with all optional fields threaded', async () => {
      const connector = makeConnector();
      vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(connector) as never);
      const r = await handleDocsPublish({
        op: 'draft',
        path: PATH,
        spaceId: 'S',
        title: 'T',
        pageId: 'P',
        parentId: 'PP',
        body: 'B',
        adf: { doc: true },
      });
      expect(r.isError).toBeFalsy();
      expect(connector.draft).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'S',
          title: 'T',
          pageId: 'P',
          parentId: 'PP',
          body: 'B',
          adf: { doc: true },
        })
      );
    });
    it('connector returns error result → respond maps to isError', async () => {
      const connector = makeConnector({
        draft: vi.fn(async () => ({ ok: false, error: 'draft failed' })),
      });
      vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(connector) as never);
      const r = await handleDocsPublish({ op: 'draft', path: PATH, spaceId: 'S', title: 'T' });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('draft failed');
    });
  });

  describe('attach-media op', () => {
    it('missing pageId/mediaFilePath → validation error', async () => {
      const r = await handleDocsPublish({ op: 'attach-media', path: PATH, pageId: 'P' });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('attach-media requires pageId and mediaFilePath');
    });
    it('success threads origin', async () => {
      const connector = makeConnector();
      vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(connector) as never);
      const r = await handleDocsPublish({
        op: 'attach-media',
        path: PATH,
        pageId: 'P',
        mediaFilePath: '/tmp/x.png',
        origin: 'https://example.atlassian.net',
      });
      expect(r.isError).toBeFalsy();
      expect(connector.attachMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          pageId: 'P',
          mediaFilePath: '/tmp/x.png',
          origin: 'https://example.atlassian.net',
        })
      );
    });
  });

  describe('verify-render op', () => {
    it('missing targetUrl → validation error', async () => {
      const r = await handleDocsPublish({ op: 'verify-render', path: PATH });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('verify-render requires targetUrl');
    });
    it('success', async () => {
      const connector = makeConnector();
      vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(connector) as never);
      const r = await handleDocsPublish({
        op: 'verify-render',
        path: PATH,
        targetUrl: 'https://x/y',
      });
      expect(r.isError).toBeFalsy();
      expect(connector.verifyRender).toHaveBeenCalledWith({ targetUrl: 'https://x/y' });
    });
  });

  describe('page-tree op', () => {
    it('missing spaceId/parentId/children → validation error', async () => {
      const r = await handleDocsPublish({
        op: 'page-tree',
        path: PATH,
        spaceId: 'S',
        parentId: 'P',
      });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('page-tree requires spaceId, parentId, and a children array');
    });
    it('success with children array', async () => {
      const connector = makeConnector();
      vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(connector) as never);
      const r = await handleDocsPublish({
        op: 'page-tree',
        path: PATH,
        spaceId: 'S',
        parentId: 'P',
        children: [{ title: 'child' }],
      });
      expect(r.isError).toBeFalsy();
      expect(connector.pageTree).toHaveBeenCalled();
    });
    it('connector error result → isError', async () => {
      const connector = makeConnector({
        pageTree: vi.fn(async () => ({ ok: false, error: 'tree failed' })),
      });
      vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(connector) as never);
      const r = await handleDocsPublish({
        op: 'page-tree',
        path: PATH,
        spaceId: 'S',
        parentId: 'P',
        children: [],
      });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('tree failed');
    });
  });

  it('handler catch: connector op throwing is mapped to isError', async () => {
    const connector = makeConnector({
      draft: vi.fn(async () => {
        throw new Error('connector boom');
      }),
    });
    vi.mocked(resolveDocsPublishConnector).mockReturnValue(ok(connector) as never);
    const r = await handleDocsPublish({ op: 'draft', path: PATH, spaceId: 'S', title: 'T' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('connector boom');
  });
});
