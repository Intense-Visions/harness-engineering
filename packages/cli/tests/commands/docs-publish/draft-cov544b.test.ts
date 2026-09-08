import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// -----------------------------------------------------------------------------
// draft-cov544b — branch-coverage lift for src/commands/docs-publish/draft.ts.
// The existing commands.test.ts exercises the degradation paths of
// runDocsPublishDraft; this file covers the connector-SUCCESS path (body-file /
// adf-file reads, pageId/parentId threading, connector.draft failure) and the
// entire createDraftCommand action (JSON / human / quiet output, tinyLink,
// and the error → process.exit branch). Config + connector are mocked so no
// network is touched.
// -----------------------------------------------------------------------------

const { resolveConfigMock, resolveConnectorMock } = vi.hoisted(() => ({
  resolveConfigMock: vi.fn(),
  resolveConnectorMock: vi.fn(),
}));

vi.mock('../../../src/config/loader', () => ({ resolveConfig: resolveConfigMock }));
vi.mock('../../../src/docs-publish', () => ({
  resolveDocsPublishConnector: resolveConnectorMock,
}));

import { runDocsPublishDraft, createDraftCommand } from '../../../src/commands/docs-publish/draft';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** A fake connector whose draft() returns a canned DocsPublishResult. */
function fakeConnector(draftResult: unknown) {
  return { draft: vi.fn().mockResolvedValue(draftResult) };
}

describe('runDocsPublishDraft — connector-success + file-read branches', () => {
  let tmp: string;
  beforeEach(() => {
    vi.clearAllMocks();
    resolveConfigMock.mockReturnValue({ ok: true, value: { version: 1 } });
    tmp = mkdtempSync(join(tmpdir(), 'draft-cov544b-'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns a config-resolution failure verbatim', async () => {
    resolveConfigMock.mockReturnValue({ ok: false, error: { message: 'bad config' } });
    const res = await runDocsPublishDraft({ spaceId: 'S', title: 'T' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('bad config');
  });

  it('returns a connector-resolution failure verbatim', async () => {
    resolveConnectorMock.mockReturnValue({ ok: false, error: { message: 'no connector' } });
    const res = await runDocsPublishDraft({ spaceId: 'S', title: 'T' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe('no connector');
  });

  it('requires --space-id', async () => {
    resolveConnectorMock.mockReturnValue({ ok: true, value: fakeConnector({ ok: true }) });
    const res = await runDocsPublishDraft({ title: 'T' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('--space-id is required');
  });

  it('requires --title', async () => {
    resolveConnectorMock.mockReturnValue({ ok: true, value: fakeConnector({ ok: true }) });
    const res = await runDocsPublishDraft({ spaceId: 'S' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('--title is required');
  });

  it('threads pageId/parentId, reads body/adf files, and returns the draft handle', async () => {
    const connector = fakeConnector({
      ok: true,
      value: { pageId: 'P9', draftStatus: 'draft', tinyLink: 'https://x/y' },
    });
    resolveConnectorMock.mockReturnValue({ ok: true, value: connector });
    const bodyFile = join(tmp, 'body.html');
    const adfFile = join(tmp, 'body.adf.json');
    writeFileSync(bodyFile, '<p>body</p>', 'utf-8');
    writeFileSync(adfFile, '{"type":"doc"}', 'utf-8');

    const res = await runDocsPublishDraft({
      spaceId: 'S',
      title: 'T',
      pageId: 'P9',
      parentId: 'PARENT',
      bodyFile,
      adfFile,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.pageId).toBe('P9');
    const passed = connector.draft.mock.calls[0][0];
    expect(passed).toMatchObject({
      spaceId: 'S',
      title: 'T',
      pageId: 'P9',
      parentId: 'PARENT',
      body: '<p>body</p>',
      adf: { type: 'doc' },
    });
  });

  it('maps a malformed --adf-file into a clean CLIError (read guard)', async () => {
    resolveConnectorMock.mockReturnValue({ ok: true, value: fakeConnector({ ok: true }) });
    const badAdf = join(tmp, 'bad.json');
    writeFileSync(badAdf, '{ not json', 'utf-8');
    const res = await runDocsPublishDraft({
      spaceId: 'S',
      title: 'T',
      adfFile: badAdf,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('failed to read draft body file(s)');
  });

  it('maps a connector.draft failure into a draft-failed CLIError', async () => {
    resolveConnectorMock.mockReturnValue({
      ok: true,
      value: fakeConnector({ ok: false, error: 'upstream 500' }),
    });
    const res = await runDocsPublishDraft({ spaceId: 'S', title: 'T' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('draft failed: upstream 500');
  });
});

describe('createDraftCommand — action output + exit branches', () => {
  let exitCode: number | null;
  let out: string[];
  let err: string[];
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resolveConfigMock.mockReturnValue({ ok: true, value: { version: 1 } });
    exitCode = null;
    out = [];
    err = [];
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      exitCode = c ?? 0;
      throw new Error(`__exit__:${exitCode}`);
    }) as never);
    logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation((...a: unknown[]) => out.push(a.map(String).join(' ')));
    errSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...a: unknown[]) => err.push(a.map(String).join(' ')));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    vi.restoreAllMocks();
  });

  async function run(args: string[], globalFlags: string[] = []): Promise<void> {
    const program = new Command();
    program.option('--json');
    program.option('--quiet');
    program.option('-c, --config <path>');
    program.addCommand(createDraftCommand());
    try {
      await program.parseAsync([...globalFlags, 'draft', ...args], { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  it('prints the human summary with the tiny link and exits SUCCESS', async () => {
    resolveConnectorMock.mockReturnValue({
      ok: true,
      value: fakeConnector({
        ok: true,
        value: { pageId: 'P1', draftStatus: 'draft', tinyLink: 'https://t/iny' },
      }),
    });
    await run(['--space-id', 'S', '--title', 'T']);
    expect(exitCode).toBe(0);
    const joined = out.join('\n');
    expect(joined).toContain('Draft ready: page P1 (draft)');
    expect(joined).toContain('tiny link: https://t/iny');
  });

  it('omits the tiny-link line when the handle has none', async () => {
    resolveConnectorMock.mockReturnValue({
      ok: true,
      value: fakeConnector({ ok: true, value: { pageId: 'P2', draftStatus: 'draft' } }),
    });
    await run(['--space-id', 'S', '--title', 'T']);
    expect(exitCode).toBe(0);
    expect(out.join('\n')).toContain('Draft ready: page P2');
    expect(out.join('\n')).not.toContain('tiny link');
  });

  it('emits the handle as JSON under global --json', async () => {
    resolveConnectorMock.mockReturnValue({
      ok: true,
      value: fakeConnector({ ok: true, value: { pageId: 'PJ', draftStatus: 'draft' } }),
    });
    await run(['--space-id', 'S', '--title', 'T'], ['--json']);
    expect(exitCode).toBe(0);
    expect(JSON.parse(out.join('\n')).pageId).toBe('PJ');
  });

  it('suppresses the summary under global --quiet (still exits SUCCESS)', async () => {
    resolveConnectorMock.mockReturnValue({
      ok: true,
      value: fakeConnector({ ok: true, value: { pageId: 'PQ', draftStatus: 'draft' } }),
    });
    await run(['--space-id', 'S', '--title', 'T'], ['--quiet']);
    expect(exitCode).toBe(0);
    expect(out.join('\n')).not.toContain('Draft ready');
  });

  it('logs the error and exits with the CLIError exit code on failure (human mode)', async () => {
    resolveConnectorMock.mockReturnValue({
      ok: false,
      error: { message: 'no connector', exitCode: 2 },
    });
    // resolveConfig ok but connector missing → runDocsPublishDraft Err.
    await run(['--space-id', 'S', '--title', 'T']);
    expect(exitCode).toBe(2);
  });

  it('emits the error as JSON under --json on failure', async () => {
    resolveConfigMock.mockReturnValue({ ok: false, error: { message: 'bad config', exitCode: 2 } });
    await run(['--space-id', 'S', '--title', 'T'], ['--json']);
    expect(exitCode).not.toBe(0);
    expect(out.join('\n')).toContain('"error"');
    expect(out.join('\n')).toContain('bad config');
  });
});
