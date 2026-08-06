import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  handleApiCraft,
  handleApiCraftFinalize,
  apiCraftDefinition,
  apiCraftFinalizeDefinition,
} from '../../../src/mcp/tools/api-craft';

const ROUTE = "router.post('/widgets', async (req, res) => { res.json({}); });";

function writeRoute(dir: string): void {
  fs.mkdirSync(path.join(dir, 'src', 'routes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'routes', 'widgets.ts'), ROUTE);
}

describe('api_craft MCP tool', () => {
  let tmpDir: string;
  let savedEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-craft-mcp-'));
    savedEnv = process.env.HARNESS_CRAFT_LLM;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedEnv;
  });

  it('definition exposes mode and promptBudget on input schema', () => {
    expect(apiCraftDefinition.inputSchema.properties).toHaveProperty('mode');
    expect(apiCraftDefinition.inputSchema.properties).toHaveProperty('promptBudget');
  });

  it('finalize definition declares path, runId, responses as required', () => {
    expect(apiCraftFinalizeDefinition.inputSchema.required).toEqual(['path', 'runId', 'responses']);
  });

  it('rejects missing path', async () => {
    // @ts-expect-error testing runtime validation
    const r = await handleApiCraft({});
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('path');
  });

  it('returns pendingPrompts when mode=in-session (not a silent empty result)', async () => {
    writeRoute(tmpDir);
    const r = await handleApiCraft({ path: tmpDir, mode: 'in-session' });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]!.text) as {
      status: string;
      runId: string;
      pendingPrompts: Array<{ promptId: string }>;
    };
    expect(parsed.status).toBe('collected');
    expect(parsed.pendingPrompts.length).toBeGreaterThan(0);
    expect(parsed.runId).toBeTruthy();
  });

  it('default (in-session) mode collects prompts rather than returning findings:[]', async () => {
    writeRoute(tmpDir);
    process.env.HARNESS_CRAFT_LLM = 'in-session';
    const r = await handleApiCraft({ path: tmpDir });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]!.text) as Record<string, unknown>;
    expect(parsed).toHaveProperty('pendingPrompts');
    expect(parsed).not.toHaveProperty('findings');
  });

  it('routes a round-trip through api_craft → api_craft_finalize', async () => {
    writeRoute(tmpDir);
    process.env.HARNESS_CRAFT_LLM = 'in-session';
    const collect = await handleApiCraft({ path: tmpDir });
    const collected = JSON.parse(collect.content[0]!.text) as {
      status: string;
      runId: string;
      pendingPrompts: Array<{ promptId: string }>;
    };
    expect(collected.status).toBe('collected');

    const responses = collected.pendingPrompts.map((p, i) => ({
      promptId: p.promptId,
      raw:
        i === 0
          ? '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"verb dishonest"}\n```'
          : '```json\nnull\n```',
    }));

    const finalize = await handleApiCraftFinalize({
      path: tmpDir,
      runId: collected.runId,
      responses,
    });
    expect(finalize.isError).toBeFalsy();
    const out = JSON.parse(finalize.content[0]!.text) as {
      findings: unknown[];
      summary: { runId: string };
    };
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.summary.runId).toBe(collected.runId);
  });

  it('finalize rejects when responses is not an array', async () => {
    const r = await handleApiCraftFinalize({
      path: tmpDir,
      runId: 'abc',
      // @ts-expect-error testing runtime validation
      responses: 'oops',
    });
    expect(r.isError).toBe(true);
  });

  it('auto-routes to inline when HARNESS_CRAFT_LLM=mock and mode is unspecified', async () => {
    writeRoute(tmpDir);
    process.env.HARNESS_CRAFT_LLM = 'mock';
    const r = await handleApiCraft({ path: tmpDir });
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content[0]!.text) as {
      findings: unknown[];
      summary: { llmCalls: { provider: string } };
    };
    expect(parsed).toHaveProperty('findings');
    expect(parsed.summary.llmCalls.provider).toBe('mock');
  });
});
