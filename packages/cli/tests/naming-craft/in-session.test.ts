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

  it('finalize skips responses whose promptId is unknown (explicit partial)', async () => {
    writeFile('src/x.ts', `export const foo = 1;\n`);
    const collected = await collectNamingCraftPrompts({ path: tmpDir });
    const out = await finalizeNamingCraft({
      path: tmpDir,
      runId: collected.runId,
      allowPartial: true,
      responses: [
        {
          promptId: 'nonexistent',
          raw: '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"x"}\n```',
        },
      ],
    });
    // Unmatched IDs never count toward coverage, so this reads as 0-answered.
    expect(out.findings).toHaveLength(0);
    expect(out.summary.coverage!.promptsAnswered).toBe(0);
    expect(out.summary.coverage!.promptsTotal).toBe(collected.pendingPrompts.length);
  });

  it('finalize REFUSES a materially short response set instead of a full-looking success', async () => {
    // A file rich enough to collect several prompts.
    writeFile(
      'src/orders.ts',
      `export function processData(orders) { return orders; }\n` +
        `export const tmp = 1;\n` +
        `export type Data = { a: number };\n`
    );
    const collected = await collectNamingCraftPrompts({ path: tmpDir });
    expect(collected.pendingPrompts.length).toBeGreaterThan(1);

    // Answer only the first of N collected prompts.
    const responses = [
      {
        promptId: collected.pendingPrompts[0]!.promptId,
        raw: '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"vague"}\n```',
      },
    ];

    // Default (no allowPartial): must NOT emit a normal-looking output that
    // overstates coverage — it must throw loudly. (Red at base: the old code
    // returned a full-looking success with no coverage field.)
    await expect(
      finalizeNamingCraft({ path: tmpDir, runId: collected.runId, responses })
    ).rejects.toThrow(/of \d+ collected|partial|allowPartial/);

    // The run-state must survive the refusal so the caller can retry in full.
    expect(fs.existsSync(collected.runFile!)).toBe(true);
  });

  it('finalize with allowPartial surfaces honest coverage and narrowed filesScanned', async () => {
    writeFile(
      'src/a.ts',
      `export function processData(orders) { return orders; }\nexport const tmp = 1;\n`
    );
    writeFile('src/b.ts', `export function handleThing(x) { return x; }\n`);
    const collected = await collectNamingCraftPrompts({ path: tmpDir });
    expect(collected.pendingPrompts.length).toBeGreaterThan(1);

    // Answer only the first prompt.
    const responses = [
      {
        promptId: collected.pendingPrompts[0]!.promptId,
        raw: '```json\n{"tier":"polish","impact":"medium","confidence":"high","message":"vague"}\n```',
      },
    ];

    const out = await finalizeNamingCraft({
      path: tmpDir,
      runId: collected.runId,
      allowPartial: true,
      responses,
    });

    expect(out.summary.coverage).toBeDefined();
    expect(out.summary.coverage!.promptsAnswered).toBe(1);
    expect(out.summary.coverage!.promptsTotal).toBe(collected.pendingPrompts.length);
    expect(out.summary.coverage!.promptsAnswered).toBeLessThan(out.summary.coverage!.promptsTotal);
    // Only one file was actually critiqued — filesScanned must not imply both.
    expect(out.summary.filesScanned).toBe(1);
    expect(fs.existsSync(collected.runFile!)).toBe(false);
  });

  it('finalize reports full coverage when every collected prompt is answered', async () => {
    writeFile('src/orders.ts', `export function processData(orders) { return orders; }\n`);
    const collected = await collectNamingCraftPrompts({ path: tmpDir });
    const responses = collected.pendingPrompts.map((p) => ({
      promptId: p.promptId,
      raw: '```json\nnull\n```',
    }));
    const out = await finalizeNamingCraft({
      path: tmpDir,
      runId: collected.runId,
      responses,
    });
    expect(out.summary.coverage!.promptsAnswered).toBe(collected.pendingPrompts.length);
    expect(out.summary.coverage!.promptsAnswered).toBe(out.summary.coverage!.promptsTotal);
  });
});
