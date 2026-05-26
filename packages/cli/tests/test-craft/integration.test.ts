import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTestCraft, critiqueTestsInFile } from '../../src/test-craft';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

describe('runTestCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-craft-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('empty project: zero findings, no files scanned', async () => {
    const out = await runTestCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.counts.testsExtracted).toBe(0);
  });

  it('walks test files and extracts tests', async () => {
    writeFile(
      'src/foo.test.ts',
      `import { describe, it } from 'vitest';\n\nit('returns null', () => {});\n`
    );
    const out = await runTestCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
    expect(out.summary.counts.testsExtracted).toBe(1);
    expect(out.summary.frameworksDetected.vitest).toBe(1);
  });

  it('detects multiple frameworks correctly', async () => {
    writeFile('src/v.test.ts', `import { describe } from 'vitest';\nit('a', () => {});`);
    writeFile('src/p.test.ts', `import { test } from '@playwright/test';\ntest('b', () => {});`);
    const out = await runTestCraft({ path: tmpDir });
    expect(out.summary.frameworksDetected.vitest).toBe(1);
    expect(out.summary.frameworksDetected.playwright).toBe(1);
  });

  it('honors frameworks filter (vitest only)', async () => {
    writeFile('src/v.test.ts', `import { describe } from 'vitest';\nit('a', () => {});`);
    writeFile('src/p.test.ts', `import { test } from '@playwright/test';\ntest('b', () => {});`);
    const out = await runTestCraft({ path: tmpDir, frameworks: ['vitest'] });
    expect(out.summary.frameworksDetected.vitest).toBe(1);
    expect(out.summary.frameworksDetected.playwright).toBe(0);
  });

  it('honors maxFiles cap', async () => {
    for (let i = 0; i < 5; i++) {
      writeFile(`src/f${i}.test.ts`, `it('a', () => {});`);
    }
    const out = await runTestCraft({ path: tmpDir, maxFiles: 2 });
    expect(out.summary.counts.filesScanned).toBe(2);
  });

  it('excludes .todo tests from critique (but counts them)', async () => {
    writeFile('src/foo.test.ts', `it.todo('not implemented');\nit('runs', () => {});`);
    const out = await runTestCraft({ path: tmpDir });
    expect(out.summary.counts.testsExtracted).toBe(1);
    expect(out.summary.counts.testsSkippedOrTodo).toBe(1);
  });

  it('source-pairing counts sourcePaired correctly', async () => {
    writeFile('src/foo.ts', 'export const x = 1;');
    writeFile('src/foo.test.ts', `it('x', () => {});`);
    const out = await runTestCraft({ path: tmpDir });
    expect(out.summary.counts.sourcePaired).toBe(1);
  });

  it('--no-source-pair disables pairing entirely', async () => {
    writeFile('src/foo.ts', 'export const x = 1;');
    writeFile('src/foo.test.ts', `it('x', () => {});`);
    const out = await runTestCraft({ path: tmpDir, sourcePair: false });
    expect(out.summary.counts.sourcePaired).toBe(0);
  });

  it('emits TestFinding with all 3 axes (ADR 0019)', async () => {
    writeFile('src/foo.test.ts', `it('works', () => {});`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'works',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"low","message":"x"}\n```',
      },
    ]);
    const out = await runTestCraft({ path: tmpDir, __testProvider: provider });
    const f = out.findings[0];
    expect(f.tier).toBe('foundational');
    expect(f.impact).toBe('large');
    expect(f.confidence).toBe('low');
    expect(f.cite.rubricId).toMatch(/^TEST-R/);
  });

  it('cross-cutting critiqueTestsInFile works on single file', async () => {
    writeFile('src/foo.test.ts', `it('returns null', () => {});`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'returns null',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"ok"}\n```',
      },
    ]);
    const findings = await critiqueTestsInFile(path.join(tmpDir, 'src', 'foo.test.ts'), {
      provider,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });
});
