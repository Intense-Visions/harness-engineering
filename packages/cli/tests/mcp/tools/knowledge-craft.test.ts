import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  handleKnowledgeCraft,
  handleKnowledgeCraftFinalize,
  knowledgeCraftDefinition,
  knowledgeCraftFinalizeDefinition,
} from '../../../src/mcp/tools/knowledge-craft';

function seed(dir: string): void {
  const full = path.join(dir, 'docs/knowledge/auth/email-validator.md');
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(
    full,
    '# Email Validator\n\nThe user service validates emails via the EmailValidator class.\n'
  );
}

describe('knowledge_craft MCP tool', () => {
  let tmpDir: string;
  let savedEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-craft-mcp-'));
    savedEnv = process.env.HARNESS_CRAFT_LLM;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedEnv === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedEnv;
  });

  it('definition exposes mode and promptBudget on input schema', () => {
    expect(knowledgeCraftDefinition.inputSchema.properties).toHaveProperty('mode');
    expect(knowledgeCraftDefinition.inputSchema.properties).toHaveProperty('promptBudget');
  });

  it('finalize definition declares path, runId, responses as required', () => {
    expect(knowledgeCraftFinalizeDefinition.inputSchema.required).toEqual([
      'path',
      'runId',
      'responses',
    ]);
  });

  it('rejects missing path', async () => {
    // @ts-expect-error testing runtime validation
    const r = await handleKnowledgeCraft({});
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toContain('path');
  });

  it('returns pendingPrompts when mode=in-session (not a silent empty result)', async () => {
    seed(tmpDir);
    const r = await handleKnowledgeCraft({ path: tmpDir, mode: 'in-session' });
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

  it('routes a round-trip through knowledge_craft → knowledge_craft_finalize', async () => {
    seed(tmpDir);
    process.env.HARNESS_CRAFT_LLM = 'in-session';
    const collect = await handleKnowledgeCraft({ path: tmpDir });
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
          ? '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"x"}\n```'
          : '```json\nnull\n```',
    }));
    const finalize = await handleKnowledgeCraftFinalize({
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
    const r = await handleKnowledgeCraftFinalize({
      path: tmpDir,
      runId: 'abc',
      // @ts-expect-error testing runtime validation
      responses: 'oops',
    });
    expect(r.isError).toBe(true);
  });
});
