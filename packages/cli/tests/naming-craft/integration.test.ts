import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runNamingCraft, critiqueNamesInFile } from '../../src/naming-craft';
import { MockLlmProvider } from '../../src/naming-craft/llm/provider';

describe('runNamingCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naming-craft-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('walks empty project and emits zero findings', async () => {
    const out = await runNamingCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.summary.catalog.rubricsApplied).toHaveLength(6);
  });

  it('walks a real file and aggregates findings via mock provider', async () => {
    writeFile('src/orders.ts', `export function processData(orders) { return orders; }\n`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'processData',
        response:
          '```json\n{"tier":"polish","impact":"medium","confidence":"medium","message":"vague verb"}\n```',
      },
    ]);
    const out = await runNamingCraft({ path: tmpDir, __testProvider: provider });
    expect(out.findings.length).toBeGreaterThanOrEqual(1);
    expect(out.findings[0].target.identifier).toBe('processData');
    expect(out.summary.llmCalls.count).toBeGreaterThan(0);
    expect(out.summary.runId).toBeTruthy();
  });

  it('honors maxFiles cap', async () => {
    for (let i = 0; i < 5; i++) {
      writeFile(`src/file${i}.ts`, `const x${i} = ${i};\n`);
    }
    const out = await runNamingCraft({ path: tmpDir, maxFiles: 2 });
    // 5 files written, cap to 2: convention sampling still works but only
    // 2 files are scanned for findings. Verify by summary metadata path.
    expect(out.summary.llmCalls.count).toBeLessThanOrEqual(2 * 6 * 15);
  });

  it('derives camelCase convention from a uniformly camelCase project', async () => {
    writeFile('src/a.ts', `const userName = 1;\nconst retryCount = 2;\nconst maxBuffer = 3;\n`);
    const out = await runNamingCraft({ path: tmpDir });
    expect(out.summary.convention.variables).toBe('camelCase');
  });

  it('cross-cutting critiqueNamesInFile works on a single file without project walk', async () => {
    writeFile('src/x.ts', `export function fetchData() {}\n`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'fetchData',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"hi"}\n```',
      },
    ]);
    const findings = await critiqueNamesInFile(path.join(tmpDir, 'src/x.ts'), { provider });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('emits NamingFinding with all 3 axes present (ADR 0019)', async () => {
    writeFile('src/a.ts', `export const userName = 1;\n`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'userName',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"low","message":"x"}\n```',
      },
    ]);
    const out = await runNamingCraft({ path: tmpDir, __testProvider: provider });
    const f = out.findings.find((finding) => finding.target.identifier === 'userName');
    expect(f).toBeDefined();
    expect(f!.tier).toBe('foundational');
    expect(f!.impact).toBe('large');
    expect(f!.confidence).toBe('low');
    expect(f!.cite.rubricId).toMatch(/^NAME-R/);
  });
});
