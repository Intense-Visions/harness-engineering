import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Disable the MCP update-check notification (and its background spawn) so the
// WIRED integration assertions see only the context-budget notice. Everything
// else in core — estimateTokens, evaluateSessionContextBudget — stays REAL.
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    isUpdateCheckEnabled: vi.fn(() => false),
    getUpdateNotification: vi.fn(() => null),
    shouldRunCheck: vi.fn(() => false),
    readCheckState: vi.fn(() => null),
    spawnBackgroundCheck: vi.fn(() => undefined),
  };
});

import {
  wrapWithContextBudget,
  applyContextBudget,
} from '../../../src/mcp/middleware/context-budget';
import { createHarnessServer } from '../../../src/mcp/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

const BUDGET_MARKER = '[harness context-budget]';

/** Handler returning a large payload — well over any small token budget. */
const largeHandler = async (): Promise<ToolResult> => ({
  content: [{ type: 'text', text: 'x'.repeat(40_000) }],
});

/** Handler returning tiny text — under any reasonable budget. */
const smallHandler = async (): Promise<ToolResult> => ({
  content: [{ type: 'text', text: 'ok' }],
});

describe('wrapWithContextBudget (unit)', () => {
  it('is a byte-identical no-op when unconfigured (returns the SAME handler ref)', () => {
    expect(wrapWithContextBudget('code_search', largeHandler)).toBe(largeHandler);
    expect(wrapWithContextBudget('code_search', largeHandler, {})).toBe(largeHandler);
    expect(wrapWithContextBudget('code_search', largeHandler, { maxTokens: 0 })).toBe(largeHandler);
    expect(wrapWithContextBudget('code_search', largeHandler, { maxTokens: -5 })).toBe(
      largeHandler
    );
  });

  it('appends a loud steer notice when a response is over budget', async () => {
    const wrapped = wrapWithContextBudget('code_search', largeHandler, { maxTokens: 100 });
    const result = await wrapped({});
    const last = result.content[result.content.length - 1].text;
    expect(last).toContain(BUDGET_MARKER);
    expect(last).toContain('code_search');
    expect(last).toContain('code_outline');
  });

  it('leaves an under-budget response untouched (byte-identical content)', async () => {
    const raw = await smallHandler({});
    const wrapped = wrapWithContextBudget('code_search', smallHandler, { maxTokens: 100_000 });
    const result = await wrapped({});
    expect(result).toEqual(raw);
  });

  it('fails open: a handler error propagates unchanged', async () => {
    const boom = async (): Promise<ToolResult> => {
      throw new Error('handler failed');
    };
    const wrapped = wrapWithContextBudget('code_search', boom, { maxTokens: 1 });
    await expect(wrapped({})).rejects.toThrow('handler failed');
  });
});

describe('applyContextBudget (unit)', () => {
  it('returns the SAME handlers map object when unconfigured', () => {
    const handlers = { code_search: largeHandler };
    expect(applyContextBudget(handlers)).toBe(handlers);
    expect(applyContextBudget(handlers, { maxTokens: 0 })).toBe(handlers);
  });

  it('wraps every handler when configured', async () => {
    const wrapped = applyContextBudget({ code_search: largeHandler }, { maxTokens: 100 });
    expect(wrapped.code_search).not.toBe(largeHandler);
    const result = await wrapped.code_search({});
    expect(result.content[result.content.length - 1].text).toContain(BUDGET_MARKER);
  });
});

describe('WIRED: live MCP request → context-budget check', () => {
  const dirs: string[] = [];

  function projectWithConfig(config: Record<string, unknown> | null): string {
    const root = mkdtempSync(join(tmpdir(), 'harness-mcp-budget-'));
    dirs.push(root);
    if (config) {
      writeFileSync(join(root, 'harness.config.json'), JSON.stringify(config), 'utf-8');
    }
    return root;
  }

  async function connect(root: string) {
    const server = createHarnessServer(root);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(c), server.connect(s)]);
    return client;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('warns on an over-budget tool response when mcp.contextBudget is configured', async () => {
    // maxTokens:1 ⇒ effectively every non-empty response trips the budget.
    const root = projectWithConfig({ version: 1, mcp: { contextBudget: { maxTokens: 1 } } });
    const client = await connect(root);

    const result = await client.callTool({ name: 'validate_project', arguments: { path: root } });
    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);

    expect(texts[texts.length - 1]).toContain(BUDGET_MARKER);
    expect(texts[texts.length - 1]).toContain('validate_project');
  });

  it('is byte-identical (no notice) when mcp.contextBudget is unconfigured', async () => {
    const root = projectWithConfig({ version: 1 });
    const client = await connect(root);

    const result = await client.callTool({ name: 'validate_project', arguments: { path: root } });
    const texts = (result.content as Array<{ type: string; text: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text);

    for (const text of texts) expect(text).not.toContain(BUDGET_MARKER);
  });
});
