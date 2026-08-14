/**
 * Regression tests for the two ways test-craft reported a confident green over
 * work it never did:
 *
 *   #1346 — the DEFAULT (in-session) provider throws PromptDeferredError on
 *           every callText. `critiqueTest` caught every throw in a bare
 *           `catch {}`, so all (test x rubric) pairs failed and the command
 *           printed "No test findings." at exit 0. It was structurally
 *           incapable of producing a finding in any repo.
 *
 *   #1347 — discovery listed only .ts/.tsx/.js/.jsx, so an ESM-first repo's
 *           `*.test.mjs` suite was invisible; and maxTestsPerFile truncated
 *           silently, presenting a capped count as the population.
 *
 * The shape these guard against is the same one #1146 fixed for
 * check-docs/cleanup: a gate that examined nothing reads identically to a gate
 * that examined everything and found nothing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTestCraft, critiqueTestsInFile } from '../../src/test-craft';
import {
  MockLlmProvider,
  InSessionLlmProvider,
  type LlmProvider,
} from '../../src/shared/craft/llm/provider';

/** A provider that fails every call the way a broken backend would. */
class AlwaysFailingProvider implements LlmProvider {
  providerId = 'always-failing';
  model = 'none';
  async callText(): Promise<string> {
    throw new Error('backend unavailable');
  }
  async callVision(): Promise<string> {
    throw new Error('backend unavailable');
  }
  recordCost(): void {}
  getCosts(): readonly { costUsd: number }[] {
    return [];
  }
}

describe('test-craft abstention guards', () => {
  let tmpDir: string;
  let savedMode: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-craft-abstain-'));
    savedMode = process.env.HARNESS_CRAFT_LLM;
    process.env.HARNESS_CRAFT_LLM = 'mock';
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (savedMode === undefined) delete process.env.HARNESS_CRAFT_LLM;
    else process.env.HARNESS_CRAFT_LLM = savedMode;
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  // --- #1346: the in-session provider cannot answer -----------------------

  it('refuses the in-session provider instead of returning an empty result', async () => {
    writeFile('src/foo.test.ts', `it('returns null when empty', () => {});`);
    await expect(
      runTestCraft({ path: tmpDir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/in-session provider/);
  });

  it('names the fix in the refusal, so the message is actionable', async () => {
    await expect(
      runTestCraft({ path: tmpDir, __testProvider: new InSessionLlmProvider() })
    ).rejects.toThrow(/HARNESS_CRAFT_LLM/);
  });

  it('refuses the in-session provider on the single-file entry point too', async () => {
    writeFile('src/foo.test.ts', `it('returns null when empty', () => {});`);
    await expect(
      critiqueTestsInFile(path.join(tmpDir, 'src', 'foo.test.ts'), {
        provider: new InSessionLlmProvider(),
      })
    ).rejects.toThrow(/in-session provider/);
  });

  // --- #1346: a failed critique is counted, not silently discarded --------

  it('counts critique failures rather than reporting them as zero findings', async () => {
    writeFile('src/foo.test.ts', `it('returns null when empty', () => {});`);
    const out = await runTestCraft({
      path: tmpDir,
      __testProvider: new AlwaysFailingProvider(),
    });

    // Still no findings — but the summary now distinguishes "nothing wrong"
    // from "nothing was checked". Before this, both read as `findings: []`.
    expect(out.findings).toEqual([]);
    expect(out.summary.counts.testsExtracted).toBe(1);
    expect(out.summary.counts.critiqueErrors).toBeGreaterThan(0);
    expect(out.summary.llmCalls.count).toBe(0);
  });

  it('reports zero critique errors on a healthy run, so the counter can fall', async () => {
    // The negative control: a counter that is always non-zero proves nothing.
    writeFile('src/foo.test.ts', `it('returns null when empty', () => {});`);
    const out = await runTestCraft({
      path: tmpDir,
      __testProvider: new MockLlmProvider(),
    });
    expect(out.summary.counts.testsExtracted).toBe(1);
    expect(out.summary.counts.critiqueErrors).toBe(0);
  });

  // --- #1347: ESM discovery ----------------------------------------------

  it.each(['mjs', 'cjs', 'mts', 'cts'])('discovers *.test.%s files', async (ext) => {
    writeFile(`src/foo.test.${ext}`, `it('returns null when empty', () => {});`);
    const out = await runTestCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
    expect(out.summary.counts.testsExtracted).toBe(1);
  });

  it('discovers *.spec.mjs as well as *.test.mjs', async () => {
    writeFile('src/a.spec.mjs', `it('one', () => {});`);
    writeFile('src/b.test.mjs', `it('two', () => {});`);
    const out = await runTestCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(2);
    // Assert the tests too, not just the file count: discovery and extraction
    // gate the extension separately, and a file-count-only assertion passes
    // while extraction still returns nothing — which is the exact half of
    // #1347 that survived the first fix attempt.
    expect(out.summary.counts.testsExtracted).toBe(2);
  });

  it('extracts from an .mjs file passed explicitly via --files', async () => {
    // The worse shape of the old bug: an explicit --files bypassed the walker
    // but not the extractor, so filesScanned was 2 while testsExtracted was 0
    // — a healthy file count over an empty denominator.
    writeFile('src/foo.test.mjs', `it('returns null when empty', () => {});`);
    const out = await runTestCraft({ path: tmpDir, files: ['src/foo.test.mjs'] });
    expect(out.summary.counts.filesScanned).toBe(1);
    expect(out.summary.counts.testsExtracted).toBe(1);
  });

  // --- #1347: the per-file cap is visible --------------------------------

  it('reports how many tests the per-file cap discarded', async () => {
    const body = Array.from({ length: 5 }, (_, i) => `it('case ${i}', () => {});`).join('\n');
    writeFile('src/many.test.ts', body);

    const out = await runTestCraft({ path: tmpDir, maxTestsPerFile: 2 });
    expect(out.summary.counts.testsExtracted).toBe(2);
    expect(out.summary.counts.testsTruncated).toBe(3);
  });

  it('reports zero truncation when the cap does not bind', async () => {
    writeFile('src/few.test.ts', `it('only one', () => {});`);
    const out = await runTestCraft({ path: tmpDir, maxTestsPerFile: 20 });
    expect(out.summary.counts.testsTruncated).toBe(0);
  });
});
