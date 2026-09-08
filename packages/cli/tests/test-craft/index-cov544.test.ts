import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  runTestCraft,
  collectTestCraftPrompts,
  finalizeTestCraft,
  critiqueTestsInFile,
} from '../../src/test-craft/index.js';
import { MockLlmProvider, InSessionLlmProvider } from '../../src/shared/craft/llm/provider.js';

/**
 * Branch-coverage tests for the test-craft orchestrator: inline run over a temp
 * suite, the in-session collect/finalize flow (incl. budget guard and
 * missing/wrong-run errors), the single-file entry, and the in-session-provider
 * refusal guard.
 */

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-idx-cov544-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const SAMPLE_TEST = [
  "import { describe, it, expect } from 'vitest';",
  "describe('math', () => {",
  "  it('adds', () => { expect(1 + 1).toBe(2); });",
  "  it('multiplies', () => { expect(2 * 3).toBe(6); });",
  '});',
].join('\n');

function writeSuite(): void {
  fs.writeFileSync(path.join(dir, 'sample.test.ts'), SAMPLE_TEST);
}

function mockFinding(): string {
  return [
    '```json',
    JSON.stringify({
      tier: 'foundational',
      impact: 'medium',
      confidence: 'high',
      message: 'Assert on behavior, not the return shape.',
    }),
    '```',
  ].join('\n');
}

describe('runTestCraft (inline)', () => {
  it('scans a suite and returns per-test findings + counts', async () => {
    writeSuite();
    const out = await runTestCraft({
      path: dir,
      sourcePair: false,
      __testProvider: new MockLlmProvider([{ promptIncludes: 'Rubric', response: mockFinding() }]),
    });
    expect(out.summary.counts.filesScanned).toBeGreaterThan(0);
    expect(out.summary.counts.testsExtracted).toBeGreaterThan(0);
    expect(out.findings.length).toBeGreaterThan(0);
  });

  it('refuses the in-session provider on the inline path', async () => {
    writeSuite();
    await expect(
      runTestCraft({ path: dir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/two-step flow/);
  });

  it('applies a frameworks filter that excludes the detected framework', async () => {
    writeSuite();
    const out = await runTestCraft({
      path: dir,
      frameworks: ['pytest'],
      sourcePair: false,
      __testProvider: new MockLlmProvider(),
    });
    expect(out.summary.counts.testsExtracted).toBe(0);
  });
});

describe('collect / finalize two-step flow', () => {
  it('collects and finalizes into an output', async () => {
    writeSuite();
    const collected = await collectTestCraftPrompts({ path: dir, sourcePair: false });
    expect(collected.status).toBe('collected');
    const responses = collected.pendingPrompts.map((p) => ({
      promptId: p.promptId,
      raw: mockFinding(),
    }));
    const out = await finalizeTestCraft({ path: dir, runId: collected.runId, responses });
    expect(out.findings.length).toBeGreaterThan(0);
    expect(out.summary.llmCalls.provider).toBe('in-session');
  });

  it('returns budget-exceeded past the budget', async () => {
    writeSuite();
    const collected = await collectTestCraftPrompts({
      path: dir,
      sourcePair: false,
      promptBudget: 0,
    });
    expect(collected.status).toBe('budget-exceeded');
    expect(collected.hint).toContain('budget');
  });

  it('throws when finalizing an unknown runId', async () => {
    await expect(finalizeTestCraft({ path: dir, runId: 'nope', responses: [] })).rejects.toThrow(
      /no persisted run/
    );
  });
});

describe('critiqueTestsInFile', () => {
  it('critiques tests in one file with an explicit source', async () => {
    const findings = await critiqueTestsInFile('sample.test.ts', {
      source: SAMPLE_TEST,
      provider: new MockLlmProvider([{ promptIncludes: 'Rubric', response: mockFinding() }]),
      sourcePair: false,
    });
    expect(findings.length).toBeGreaterThan(0);
  });

  it('returns [] when the frameworks filter excludes the file', async () => {
    const findings = await critiqueTestsInFile('sample.test.ts', {
      source: SAMPLE_TEST,
      frameworks: ['pytest'],
      provider: new MockLlmProvider(),
      sourcePair: false,
    });
    expect(findings).toEqual([]);
  });
});
