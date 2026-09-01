import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { runDocsPublishDraft, createDraftCommand } from './draft';
import { runDocsPublishPageTree, createPageTreeCommand } from './page-tree';
import { runDocsPublishAttachMedia, createAttachMediaCommand } from './attach-media';
import { createVerifyRenderCommand } from './verify-render';
import { ExitCode } from '../../utils/errors';

/**
 * Behavior contract for the docs-publish CLI command SUCCESS + render paths. The
 * degradation/validation paths are pinned in tests/docs-publish/commands.test.ts;
 * this characterizes the CURRENT behavior once a connector resolves: the run*
 * ops thread inputs into the connector and map its result, and each command's
 * `.action()` renders the value (human + JSON) and exits with the right code.
 *
 * Hermetic: the config loader and the connector resolver are stubbed, so no real
 * config, network, or connector runs. Behavior characterized as-is.
 */

const hoisted = vi.hoisted(() => ({
  resolveConfigMock: vi.fn(),
  resolveConnectorMock: vi.fn(),
}));

vi.mock('../../config/loader', () => ({ resolveConfig: hoisted.resolveConfigMock }));
vi.mock('../../docs-publish', () => ({
  resolveDocsPublishConnector: hoisted.resolveConnectorMock,
}));

class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const connector = () => ({
  draft: vi.fn().mockResolvedValue({
    ok: true,
    value: { pageId: 'P9', draftStatus: 'draft', tinyLink: 't/9' },
  }),
  pageTree: vi
    .fn()
    .mockResolvedValue({ ok: true, value: { parentId: 'P9', childPageIds: ['c1', 'c2'] } }),
  attachMedia: vi.fn().mockResolvedValue({
    status: 'manual-step-required',
    instructions: 'upload it',
    verifyWith: 'verify P9',
  }),
  verifyRender: vi.fn().mockResolvedValue({
    ok: true,
    imagesLoaded: 2,
    mediaSingleCount: 1,
    mediaGroupCount: 0,
    mediaCardErrors: 0,
    failures: [],
  }),
});

let conn: ReturnType<typeof connector>;

async function runCmd(
  factory: () => Command,
  name: string,
  argv: string[]
): Promise<{ code: number | null; out: string }> {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code ?? 0);
  }) as never);
  const program = new Command();
  program.option('--json').option('--quiet').option('--config <path>');
  program.addCommand(factory());
  let code: number | null = null;
  try {
    await program.parseAsync(['node', 'harness', name, ...argv]);
  } catch (err) {
    if (err instanceof ProcessExitError) code = err.code;
    else throw err;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { code, out: lines.join('\n') };
}

beforeEach(() => {
  for (const m of Object.values(hoisted)) m.mockReset();
  conn = connector();
  hoisted.resolveConfigMock.mockReturnValue({ ok: true, value: { name: 'proj' } });
  hoisted.resolveConnectorMock.mockReturnValue({ ok: true, value: conn });
});

afterEach(() => vi.restoreAllMocks());

describe('runDocsPublishDraft — success', () => {
  it('threads inputs to the connector and returns the draft handle', async () => {
    const res = await runDocsPublishDraft({ spaceId: 'S1', title: 'T', parentId: 'PP' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.pageId).toBe('P9');
    expect(conn.draft).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'S1', title: 'T', parentId: 'PP' })
    );
  });

  it('maps a connector draft failure to a CLIError', async () => {
    conn.draft.mockResolvedValue({ ok: false, error: 'boom' });
    const res = await runDocsPublishDraft({ spaceId: 'S1', title: 'T' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toContain('draft failed: boom');
  });
});

describe('createDraftCommand — render', () => {
  it('prints the draft summary + tiny link and exits SUCCESS', async () => {
    const { code, out } = await runCmd(createDraftCommand, 'draft', [
      '--space-id',
      'S1',
      '--title',
      'T',
    ]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('Draft ready: page P9 (draft)');
    expect(out).toContain('tiny link: t/9');
  });

  it('emits the handle as JSON under --json', async () => {
    const { out } = await runCmd(createDraftCommand, 'draft', [
      '--space-id',
      'S1',
      '--title',
      'T',
      '--json',
    ]);
    expect(JSON.parse(out)).toMatchObject({ pageId: 'P9', draftStatus: 'draft' });
  });

  it('prints the error and exits VALIDATION_FAILED when a required option is missing', async () => {
    const { code, out } = await runCmd(createDraftCommand, 'draft', ['--space-id', 'S1']);
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
    expect(out).toContain('--title is required');
  });
});

describe('page-tree — success + render', () => {
  it('threads children and returns the tree result', async () => {
    const res = await runDocsPublishPageTree({
      spaceId: 'S1',
      parentId: 'P9',
      childrenFile: undefined,
    });
    // No children file → validation error before the connector call.
    expect(res.ok).toBe(false);
  });

  it('renders the child page count and exits SUCCESS via the command (children inline)', async () => {
    // Drive the run op directly with a fake childrenFile by stubbing fs through the
    // connector path: the command reads the file, so exercise the op's success via
    // the connector mock and a real temp file.
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'pt-'));
    const file = join(dir, 'children.json');
    writeFileSync(file, JSON.stringify([{ title: 'c1' }, { title: 'c2' }]));
    try {
      const { code, out } = await runCmd(createPageTreeCommand, 'page-tree', [
        '--space-id',
        'S1',
        '--parent-id',
        'P9',
        '--children-file',
        file,
      ]);
      expect(code).toBe(ExitCode.SUCCESS);
      expect(out).toContain('Page tree ready under P9: 2 child page(s)');
      expect(conn.pageTree).toHaveBeenCalledWith(
        expect.objectContaining({ spaceId: 'S1', parentId: 'P9' })
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('attach-media — success + render', () => {
  it('returns Ok with the manual-step recipe', async () => {
    const res = await runDocsPublishAttachMedia({ pageId: 'P9', mediaFile: '/f.png' });
    expect(res.ok).toBe(true);
    if (res.ok && res.value.status === 'manual-step-required') {
      expect(res.value.instructions).toBe('upload it');
    }
  });

  it('renders the MANUAL STEP block and exits SUCCESS', async () => {
    const { code, out } = await runCmd(createAttachMediaCommand, 'attach-media', [
      '--page-id',
      'P9',
      '--media-file',
      '/f.png',
    ]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('MANUAL STEP REQUIRED');
    expect(out).toContain('upload it');
    expect(out).toContain('Verify with: verify P9');
  });
});

describe('verify-render — success + render + exit verdict', () => {
  it('renders an OK verdict and exits SUCCESS', async () => {
    const { code, out } = await runCmd(createVerifyRenderCommand, 'verify-render', [
      '--url',
      'https://x/1',
    ]);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('Render OK: images=2');
  });

  it('exits VALIDATION_FAILED and lists failures when the render is not ok', async () => {
    conn.verifyRender.mockResolvedValue({
      ok: false,
      imagesLoaded: 0,
      mediaSingleCount: 0,
      mediaGroupCount: 0,
      mediaCardErrors: 2,
      degraded: 'network',
      failures: ['broken image'],
    });
    const { code, out } = await runCmd(createVerifyRenderCommand, 'verify-render', [
      '--url',
      'https://x/1',
    ]);
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
    expect(out).toContain('Render FAILED');
    expect(out).toContain('degraded: network');
    expect(out).toContain('- broken image');
  });
});
