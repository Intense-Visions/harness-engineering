import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  collectNamingCraftPrompts,
  finalizeNamingCraft,
  runNamingCraft,
} from '../../src/naming-craft';
import { InSessionLlmProvider } from '../../src/naming-craft/llm/provider';

describe('naming-craft in-session flow', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-craft-insession-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('collect returns prompts and persists run state', async () => {
    writeFile('src/orders.ts', `export function processData(orders) { return orders; }\n`);
    const result = await collectNamingCraftPrompts({ path: tmpDir });
    expect(result.status).toBe('collected');
    expect(result.pendingPrompts.length).toBeGreaterThan(0);
    expect(result.pendingPrompts[0]!.promptId).toMatch(/^p/);
    expect(result.pendingPrompts[0]!.userPrompt).toContain('processData');
    expect(result.runFile).toBeDefined();
    expect(fs.existsSync(result.runFile!)).toBe(true);
  });

  it('finalize parses responses into NamingFindings and deletes the run-state file', async () => {
    writeFile('src/orders.ts', `export function processData(orders) { return orders; }\n`);
    const collected = await collectNamingCraftPrompts({ path: tmpDir });

    const responses = collected.pendingPrompts.map((p, i) => ({
      promptId: p.promptId,
      raw:
        i === 0
          ? '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"vague verb"}\n```'
          : '```json\nnull\n```',
    }));

    const out = await finalizeNamingCraft({
      path: tmpDir,
      runId: collected.runId,
      responses,
    });

    expect(out.findings.length).toBe(1);
    expect(out.findings[0]!.target.identifier).toBe('processData');
    expect(out.findings[0]!.tier).toBe('polish');
    expect(out.findings[0]!.confidence).toBe('high');
    expect(out.summary.llmCalls.provider).toBe('in-session');
    expect(out.summary.runId).toBe(collected.runId);
    expect(fs.existsSync(collected.runFile!)).toBe(false);
  });

  it('budget guard bails when projected prompts exceed the cap', async () => {
    // 5 files × ~3 identifiers × 6 rubrics ≈ 90 prompts; a budget of 5 forces bail.
    for (let i = 0; i < 5; i++) {
      writeFile(
        `src/file${i}.ts`,
        `export function foo${i}() {}\nexport const bar${i} = 1;\nexport type Baz${i} = number;\n`
      );
    }
    const result = await collectNamingCraftPrompts({ path: tmpDir, promptBudget: 5 });
    expect(result.status).toBe('budget-exceeded');
    expect(result.pendingPrompts).toHaveLength(0);
    expect(result.hint).toContain('budget');
    expect(result.projection.budget).toBe(5);
  });

  it('runNamingCraft refuses an InSessionLlmProvider with a clear error', async () => {
    writeFile('src/x.ts', `export const foo = 1;\n`);
    const provider = new InSessionLlmProvider();
    await expect(runNamingCraft({ path: tmpDir, __testProvider: provider })).rejects.toThrow(
      /two-step flow|in-session/
    );
  });

  it('finalize errors when runId is unknown', async () => {
    await expect(
      finalizeNamingCraft({
        path: tmpDir,
        runId: '00000000-0000-0000-0000-000000000000',
        responses: [],
      })
    ).rejects.toThrow(/no persisted run/);
  });

  it('finalize silently skips responses whose promptId is unknown', async () => {
    writeFile('src/x.ts', `export const foo = 1;\n`);
    const collected = await collectNamingCraftPrompts({ path: tmpDir });
    const out = await finalizeNamingCraft({
      path: tmpDir,
      runId: collected.runId,
      responses: [
        {
          promptId: 'nonexistent',
          raw: '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"x"}\n```',
        },
      ],
    });
    expect(out.findings).toHaveLength(0);
  });
});
