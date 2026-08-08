import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runDocsPublishDraft } from '../../src/commands/docs-publish/draft';
import { runDocsPublishAttachMedia } from '../../src/commands/docs-publish/attach-media';
import { runDocsPublishVerifyRender } from '../../src/commands/docs-publish/verify-render';
import { runDocsPublishPageTree } from '../../src/commands/docs-publish/page-tree';

/** Write a temp harness.config.json with the given docsPublish block (or none). */
function writeConfig(dir: string, docsPublish?: unknown): string {
  const cfg: Record<string, unknown> = { version: 1, name: 'test-project' };
  if (docsPublish !== undefined) cfg.docsPublish = docsPublish;
  const p = join(dir, 'harness.config.json');
  writeFileSync(p, JSON.stringify(cfg), 'utf-8');
  return p;
}

describe('docs-publish CLI command core functions', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'docs-publish-cmd-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('graceful degradation — no docsPublish block', () => {
    it('draft returns an actionable not-configured error', async () => {
      const result = await runDocsPublishDraft({ configPath: writeConfig(dir) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/docsPublish/i);
    });

    it('attach-media / verify-render / page-tree all degrade, never throw', async () => {
      const configPath = writeConfig(dir);
      const draft = await runDocsPublishDraft({ configPath });
      const attach = await runDocsPublishAttachMedia({ configPath });
      const verify = await runDocsPublishVerifyRender({ configPath });
      const tree = await runDocsPublishPageTree({ configPath });
      for (const r of [draft, attach, verify, tree]) {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error.message).toMatch(/docsPublish/i);
      }
    });
  });

  describe('unknown connector', () => {
    it('names the valid connectors', async () => {
      const configPath = writeConfig(dir, { connector: 'notaconnector', config: {} });
      const result = await runDocsPublishDraft({ configPath });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/confluence/);
    });
  });

  describe('validation (connector resolved, required options missing)', () => {
    const confluence = {
      connector: 'confluence',
      config: { baseUrl: 'https://example.atlassian.net' },
    };

    it('draft requires space-id and title', async () => {
      const configPath = writeConfig(dir, confluence);
      const result = await runDocsPublishDraft({ configPath });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/space-id/);
    });

    it('attach-media requires page-id and media-file', async () => {
      const configPath = writeConfig(dir, confluence);
      const result = await runDocsPublishAttachMedia({ configPath });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/page-id/);
    });

    it('verify-render requires url', async () => {
      const configPath = writeConfig(dir, confluence);
      const result = await runDocsPublishVerifyRender({ configPath });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/url/);
    });

    it('page-tree requires space-id and parent-id', async () => {
      const configPath = writeConfig(dir, confluence);
      const result = await runDocsPublishPageTree({ configPath });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/space-id|parent-id/);
    });
  });

  describe('attach-media happy path (no network — surfaces a manual step)', () => {
    it('returns Ok with a manual-step-required result carrying the recipe', async () => {
      const configPath = writeConfig(dir, {
        connector: 'confluence',
        config: { baseUrl: 'https://example.atlassian.net' },
      });
      const result = await runDocsPublishAttachMedia({
        configPath,
        pageId: 'PAGE123',
        mediaFile: '/tmp/figure.png',
        origin: 'https://example.atlassian.net',
      });
      expect(result.ok).toBe(true);
      if (result.ok && result.value.status === 'manual-step-required') {
        expect(result.value.instructions).toContain('X-Atlassian-Token');
        expect(result.value.instructions).toContain('osascript');
        expect(result.value.instructions).toContain('127.0.0.1');
        // pageId is interpolated into the actionable recipe.
        expect(result.value.instructions).toContain('PAGE123');
        expect(result.value.verifyWith).toContain('PAGE123');
      } else {
        throw new Error('expected manual-step-required');
      }
    });
  });

  describe('page-tree file-read guard', () => {
    it('returns a clean error for a missing children file', async () => {
      const configPath = writeConfig(dir, {
        connector: 'confluence',
        config: { baseUrl: 'https://example.atlassian.net' },
      });
      const result = await runDocsPublishPageTree({
        configPath,
        spaceId: 'SP',
        parentId: 'P1',
        childrenFile: join(dir, 'does-not-exist.json'),
      });
      expect(result.ok).toBe(false);
    });
  });
});
