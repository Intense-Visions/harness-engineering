import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runCopyCraft,
  collectCopyCraftPrompts,
  finalizeCopyCraft,
  critiqueCopyInFile,
} from '../../src/copy-craft/index.js';
import { MockLlmProvider, InSessionLlmProvider } from '../../src/shared/craft/llm/provider.js';

/**
 * Branch-coverage tests for the copy-craft orchestrator: inline run over a temp
 * project, the in-session two-step collect/finalize flow (incl. budget guard),
 * the single-file entry, and the in-session-provider refusal guard.
 */

function findingResponse(): string {
  return [
    '```json',
    JSON.stringify({
      tier: 'foundational',
      impact: 'medium',
      confidence: 'high',
      message: 'This error message should say what to do next.',
    }),
    '```',
  ].join('\n');
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-idx-cov544-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeSource(): void {
  fs.writeFileSync(
    path.join(dir, 'handler.ts'),
    'export function h() {\n  throw new Error("bad");\n  console.log("hello there");\n}\n'
  );
}

describe('runCopyCraft (inline)', () => {
  it('produces findings and a summary over source surfaces', async () => {
    writeSource();
    const provider = new MockLlmProvider([
      { promptIncludes: 'Rubric', response: findingResponse() },
    ]);
    const out = await runCopyCraft({
      path: dir,
      surfaces: ['error', 'log'],
      __testProvider: provider,
    });
    expect(out.summary.catalog.surfacesScanned).toEqual(expect.arrayContaining(['error', 'log']));
    expect(out.findings.length).toBeGreaterThan(0);
    expect(out.summary.llmCalls.provider).toBe('mock');
  });

  it('refuses the in-session provider on the inline path', async () => {
    writeSource();
    await expect(
      runCopyCraft({ path: dir, surfaces: ['error'], __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });
});

describe('collect / finalize two-step flow', () => {
  it('collects prompts, persists run-state, and finalizes to findings', async () => {
    writeSource();
    const collected = await collectCopyCraftPrompts({ path: dir, surfaces: ['error'] });
    expect(collected.status).toBe('collected');
    expect(collected.pendingPrompts.length).toBeGreaterThan(0);
    expect(collected.runFile).toBeDefined();

    const responses = collected.pendingPrompts.map((p) => ({
      promptId: p.promptId,
      raw: findingResponse(),
    }));
    const out = await finalizeCopyCraft({ path: dir, runId: collected.runId, responses });
    expect(out.findings.length).toBeGreaterThan(0);
    expect(out.summary.llmCalls.provider).toBe('in-session');
  });

  it('returns budget-exceeded when the projected prompt count passes the budget', async () => {
    writeSource();
    const collected = await collectCopyCraftPrompts({
      path: dir,
      surfaces: ['error', 'log'],
      promptBudget: 0,
    });
    expect(collected.status).toBe('budget-exceeded');
    expect(collected.pendingPrompts).toEqual([]);
    expect(collected.hint).toContain('budget');
  });

  it('ignores unknown promptIds during finalize', async () => {
    writeSource();
    const collected = await collectCopyCraftPrompts({ path: dir, surfaces: ['error'] });
    const out = await finalizeCopyCraft({
      path: dir,
      runId: collected.runId,
      responses: [{ promptId: 'does-not-exist', raw: findingResponse() }],
    });
    expect(out.findings).toEqual([]);
  });
});

describe('critiqueCopyInFile', () => {
  it('critiques a single file with an explicit source + provider', async () => {
    const provider = new MockLlmProvider([
      { promptIncludes: 'Rubric', response: findingResponse() },
    ]);
    const findings = await critiqueCopyInFile('inline.ts', {
      source: 'throw new Error("oops");',
      surfaces: ['error'],
      provider,
    });
    expect(findings.length).toBeGreaterThan(0);
  });

  it('reads the file from disk when no source is supplied, honoring cliOutputPaths', async () => {
    const file = path.join(dir, 'print.ts');
    fs.writeFileSync(file, 'console.log("output line");');
    const provider = new MockLlmProvider([
      { promptIncludes: 'Rubric', response: findingResponse() },
    ]);
    const findings = await critiqueCopyInFile(file, {
      surfaces: ['cli-output'],
      cliOutputPaths: [path.basename(dir)],
      provider,
    });
    expect(Array.isArray(findings)).toBe(true);
  });
});

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

describe('runCopyCraft edge branches', () => {
  it('records git-surface skips and honors commitsSince / prLimit', async () => {
    writeSource();
    const out = await runCopyCraft({
      path: dir,
      surfaces: ['commit', 'pr-description'],
      commitsSince: '1 week ago',
      prLimit: 3,
      __testProvider: new MockLlmProvider(),
    });
    // Temp dir is not a git repo → commit surface is skipped with a reason.
    expect(out.summary.skippedSurfaces.some((s) => s.surface === 'commit')).toBe(true);
  });

  it('scans an explicit file list with a per-file item cap', async () => {
    const f1 = path.join(dir, 'a.ts');
    const f2 = path.join(dir, 'b.ts');
    fs.writeFileSync(f1, 'throw new Error("one"); throw new Error("two");');
    fs.writeFileSync(f2, 'console.log("l1"); console.log("l2");');
    const out = await runCopyCraft({
      path: dir,
      files: ['a.ts', 'b.ts'],
      surfaces: ['error', 'log'],
      maxItemsPerFile: 1,
      __testProvider: new MockLlmProvider([
        { promptIncludes: 'Rubric', response: findingResponse() },
      ]),
    });
    expect(out.summary.counts.error + out.summary.counts.log).toBeGreaterThan(0);
  });

  it('walks a nested project, skipping ignored directories, with default surfaces', async () => {
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'ignored.ts'), 'throw new Error("nope");');
    fs.writeFileSync(path.join(dir, 'sub', 'deep.ts'), 'throw new Error("deep");');
    const out = await runCopyCraft({
      path: dir,
      surfaces: ['error'],
      __testProvider: new MockLlmProvider(),
    });
    expect(out.summary.counts.error).toBeGreaterThan(0);
  });

  it('reports zero cost for a provider that exposes no getCosts()', async () => {
    writeSource();
    const out = await runCopyCraft({
      path: dir,
      surfaces: ['error'],
      __testProvider: new PlainProvider(),
    });
    expect(out.summary.llmCalls.count).toBe(0);
    expect(out.summary.llmCalls.costUsd).toBe(0);
  });
});
