import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runNamingCraft,
  collectNamingCraftPrompts,
  finalizeNamingCraft,
  critiqueNamesInFile,
} from '../../src/naming-craft/index.js';
import { MockLlmProvider, InSessionLlmProvider } from '../../src/shared/craft/llm/provider.js';

/**
 * Branch-coverage tests for the naming-craft orchestrator: inline run,
 * in-session collect/finalize (incl. the partial-finalize guard and its
 * allowPartial escape hatch), missing/wrong-skill run-state errors, budget
 * guard, and the single-file entry.
 */

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-idx-cov544-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeSource(): void {
  fs.writeFileSync(
    path.join(dir, 'mod.ts'),
    'export function computeTotalPrice(qty: number, unitPrice: number) {\n' +
      '  const t = qty * unitPrice;\n  return t;\n}\n' +
      'export const taxRate = 0.2;\n'
  );
}

describe('runNamingCraft (inline)', () => {
  it('scans a project and returns a summary with convention + findings', async () => {
    writeSource();
    const out = await runNamingCraft({ path: dir, __testProvider: new MockLlmProvider() });
    expect(out.summary.filesScanned).toBeGreaterThan(0);
    expect(out.summary.convention).toBeDefined();
    expect(out.summary.llmCalls.provider).toBe('mock');
  });

  it('refuses the in-session provider on the inline path', async () => {
    writeSource();
    await expect(
      runNamingCraft({ path: dir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });
});

describe('collect / finalize two-step flow', () => {
  it('collects prompts and finalizes them all into an output', async () => {
    writeSource();
    const collected = await collectNamingCraftPrompts({ path: dir });
    expect(collected.status).toBe('collected');
    const responses = collected.pendingPrompts.map((p) => ({
      promptId: p.promptId,
      raw: mockFinding(),
    }));
    const out = await finalizeNamingCraft({ path: dir, runId: collected.runId, responses });
    expect(out.summary.coverage?.promptsAnswered).toBe(responses.length);
    expect(out.summary.llmCalls.provider).toBe('in-session');
  });

  it('rejects a partial finalize unless allowPartial is set', async () => {
    writeSource();
    const collected = await collectNamingCraftPrompts({ path: dir });
    // Answer only the first prompt.
    const first = collected.pendingPrompts.slice(0, 1).map((p) => ({
      promptId: p.promptId,
      raw: mockFinding(),
    }));
    await expect(
      finalizeNamingCraft({ path: dir, runId: collected.runId, responses: first })
    ).rejects.toThrow(/allowPartial/);
  });

  it('accepts a partial finalize with allowPartial and narrows filesScanned', async () => {
    writeSource();
    const collected = await collectNamingCraftPrompts({ path: dir });
    const first = collected.pendingPrompts.slice(0, 1).map((p) => ({
      promptId: p.promptId,
      raw: mockFinding(),
    }));
    const out = await finalizeNamingCraft({
      path: dir,
      runId: collected.runId,
      responses: first,
      allowPartial: true,
    });
    expect(out.summary.coverage?.promptsAnswered).toBe(1);
    expect(out.summary.filesScanned).toBeGreaterThanOrEqual(1);
  });

  it('returns budget-exceeded when the projection passes the budget', async () => {
    writeSource();
    const collected = await collectNamingCraftPrompts({ path: dir, promptBudget: 0 });
    expect(collected.status).toBe('budget-exceeded');
    expect(collected.hint).toContain('budget');
  });

  it('throws when finalizing a runId that does not exist', async () => {
    await expect(
      finalizeNamingCraft({ path: dir, runId: 'no-such-run', responses: [] })
    ).rejects.toThrow(/no persisted run/);
  });
});

describe('critiqueNamesInFile', () => {
  it('critiques identifiers in a single file', async () => {
    const findings = await critiqueNamesInFile('inline.ts', {
      source: 'export function doStuff(a: number) { const b = a + 1; return b * 2; }',
      provider: new MockLlmProvider(),
    });
    expect(Array.isArray(findings)).toBe(true);
  });
});

function mockFinding(): string {
  return [
    '```json',
    JSON.stringify({
      tier: 'foundational',
      impact: 'medium',
      confidence: 'high',
      message: 'Rename to reflect intent.',
    }),
    '```',
  ].join('\n');
}

/** Minimal non-InSession provider that answers but exposes no getCosts(). */
class PlainProvider {
  readonly providerId = 'plain';
  readonly model = 'plain-1';
  async callText(): Promise<string> {
    return '```json\nnull\n```';
  }
  async callVision(): Promise<string> {
    throw new Error('no vision');
  }
  recordCost(): void {}
}

describe('runNamingCraft edge branches', () => {
  let savedEnv: string | undefined;
  beforeEach(() => {
    savedEnv = process.env.HARNESS_CRAFT_LLM;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedEnv;
  });

  it('resolves the provider via getProvider when none is injected (env=mock)', async () => {
    writeSource();
    process.env.HARNESS_CRAFT_LLM = 'mock';
    const out = await runNamingCraft({ path: dir });
    expect(out.summary.llmCalls.provider).toBe('mock');
  });

  it('scans an explicit file list, capping identifiers per file with a kinds filter', async () => {
    const f = path.join(dir, 'many.ts');
    fs.writeFileSync(
      f,
      'export function alpha(){return 1;}\nexport function beta(){return 2;}\n' +
        'export const gamma = 3;\nexport const delta = 4;\n'
    );
    const out = await runNamingCraft({
      path: dir,
      files: ['many.ts'],
      kinds: ['function'],
      maxIdentifiersPerFile: 1,
      __testProvider: new MockLlmProvider([{ promptIncludes: 'Rubric', response: mockFinding() }]),
    });
    expect(out.summary.filesScanned).toBe(1);
  });

  it('walks a nested project skipping ignored directories', async () => {
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'skip.ts'), 'export function skip(){return 1;}');
    fs.writeFileSync(
      path.join(dir, 'sub', 'deep.ts'),
      'export function deepFn(a: number){ const b = a + 1; return b * 2; }'
    );
    const out = await runNamingCraft({ path: dir, __testProvider: new MockLlmProvider() });
    expect(out.summary.filesScanned).toBeGreaterThan(0);
  });

  it('reports zero cost for a provider that exposes no getCosts()', async () => {
    writeSource();
    const out = await runNamingCraft({ path: dir, __testProvider: new PlainProvider() });
    expect(out.summary.llmCalls.count).toBe(0);
  });
});
