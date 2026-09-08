import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';

// -----------------------------------------------------------------------------
// init-cov544b — branch-coverage lift for src/mcp/tools/init.ts. The exported
// surface is only `handleInitProject`, so every private helper (tryDetectFramework,
// checkFrameworkLanguageConflict, inferLanguage, scaffoldMcp) is driven THROUGH it
// by mocking the TemplateEngine seam and the post-write side effects for
// determinism. Targets the detect-framework message path, the framework↔language
// conflict guard, the non-JS level fallthrough, the resolve/render failure
// branches, the skipped-configs message, and the outer catch.
// -----------------------------------------------------------------------------

interface FakeResult {
  ok: boolean;
  value?: unknown;
  error?: { message: string };
}

const engineState = vi.hoisted(() => ({
  throwOnConstruct: false,
  listTemplates: { ok: true, value: [] } as FakeResult,
  detectFramework: { ok: true, value: [] } as FakeResult,
  resolveTemplate: { ok: true, value: { level: 'basic' } } as FakeResult,
  render: { ok: true, value: [{ path: 'a', content: 'x' }] } as FakeResult,
  isExistingProject: false,
  write: {
    ok: true,
    value: { written: ['harness.config.json'], skippedConfigs: [] },
  } as FakeResult,
  lastResolveArgs: undefined as unknown[] | undefined,
}));

vi.mock('../../../src/templates/engine', () => {
  class TemplateEngine {
    constructor() {
      if (engineState.throwOnConstruct) throw new Error('engine boom');
    }
    listTemplates() {
      return engineState.listTemplates;
    }
    detectFramework() {
      return engineState.detectFramework;
    }
    resolveTemplate(...args: unknown[]) {
      engineState.lastResolveArgs = args;
      return engineState.resolveTemplate;
    }
    render() {
      return engineState.render;
    }
    isExistingProject() {
      return engineState.isExistingProject;
    }
    write() {
      return engineState.write;
    }
  }
  return { TemplateEngine };
});

vi.mock('../../../src/templates/post-write', () => ({
  persistToolingConfig: vi.fn(),
  appendFrameworkAgents: vi.fn(),
  ensureHarnessGitignore: vi.fn(),
  ensureComprehensionSearchIgnore: vi.fn(),
}));

import { handleInitProject } from '../../../src/mcp/tools/init';

describe('handleInitProject — helper branches via the public handler', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(join(os.tmpdir(), 'init-cov544b-'));
    // Reset to benign defaults each test.
    engineState.throwOnConstruct = false;
    engineState.listTemplates = { ok: true, value: [] };
    engineState.detectFramework = { ok: true, value: [] };
    engineState.resolveTemplate = { ok: true, value: { level: 'basic' } };
    engineState.render = { ok: true, value: [{ path: 'a', content: 'x' }] };
    engineState.isExistingProject = false;
    engineState.write = {
      ok: true,
      value: { written: ['harness.config.json'], skippedConfigs: [] },
    };
    engineState.lastResolveArgs = undefined;
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('reports detected frameworks (no framework/language, existing dir) without scaffolding', async () => {
    engineState.detectFramework = {
      ok: true,
      value: [{ framework: 'nextjs', language: 'typescript', score: 5 }],
    };
    const res = await handleInitProject({ path: tmp });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('Detected frameworks: nextjs (typescript, score: 5)');
    // Detection short-circuits BEFORE scaffolding — resolveTemplate never runs.
    expect(engineState.lastResolveArgs).toBeUndefined();
  });

  it('proceeds to scaffold when detection finds nothing (empty candidate list)', async () => {
    engineState.detectFramework = { ok: true, value: [] };
    const res = await handleInitProject({ path: tmp });
    expect(res.isError).toBeFalsy();
    expect(engineState.lastResolveArgs).toBeDefined();
  });

  it('errors on a framework↔language conflict, naming the framework language', async () => {
    engineState.listTemplates = {
      ok: true,
      value: [{ framework: 'nextjs', language: 'typescript' }],
    };
    const res = await handleInitProject({
      path: tmp,
      framework: 'nextjs',
      language: 'python',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('is a typescript framework');
    expect(res.content[0].text).toContain('language "python"');
  });

  it('infers the framework language when only a framework is given (no conflict)', async () => {
    engineState.listTemplates = {
      ok: true,
      value: [{ framework: 'nextjs', language: 'typescript' }],
    };
    const res = await handleInitProject({ path: tmp, framework: 'nextjs' });
    expect(res.isError).toBeFalsy();
    // language 'typescript' → JS path keeps a defaulted level.
    expect(engineState.lastResolveArgs?.[0]).toBe('load-bearing-minimum');
    expect(engineState.lastResolveArgs?.[2]).toBe('typescript');
  });

  it('drops the level for a non-JS language (level undefined into resolveTemplate)', async () => {
    const res = await handleInitProject({ path: tmp, language: 'go' });
    expect(res.isError).toBeFalsy();
    expect(engineState.lastResolveArgs?.[0]).toBeUndefined();
    expect(engineState.lastResolveArgs?.[2]).toBe('go');
  });

  it('surfaces a resolveTemplate failure as an MCP error', async () => {
    engineState.resolveTemplate = { ok: false, error: { message: 'no template for that level' } };
    const res = await handleInitProject({ path: tmp, language: 'typescript' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('no template for that level');
  });

  it('surfaces a render failure as an MCP error', async () => {
    engineState.render = { ok: false, error: { message: 'render exploded' } };
    const res = await handleInitProject({ path: tmp, language: 'typescript' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('render exploded');
  });

  it('reports skipped config files when write reports skippedConfigs', async () => {
    engineState.write = {
      ok: true,
      value: { written: ['README.md'], skippedConfigs: ['package.json', 'tsconfig.json'] },
    };
    const res = await handleInitProject({ path: tmp, language: 'typescript' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('Skipped existing config files');
    expect(res.content[0].text).toContain('package.json');
  });

  it('returns the write result verbatim on a clean write (no skips)', async () => {
    const res = await handleInitProject({ path: tmp, language: 'typescript' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('harness.config.json');
  });

  it('catches an engine construction failure into a clean Init-failed message', async () => {
    engineState.throwOnConstruct = true;
    const res = await handleInitProject({ path: tmp });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Init failed: engine boom');
  });

  it('catches a sanitizePath rejection (filesystem root) into Init-failed', async () => {
    const res = await handleInitProject({ path: '/' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Init failed');
  });
});
