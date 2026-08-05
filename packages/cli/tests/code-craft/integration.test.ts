import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCodeCraft, critiqueCodeInFile } from '../../src/code-craft';
import { SEED_RUBRICS, rubricApplies } from '../../src/code-craft/catalog/rubrics';
import { SEED_EXEMPLARS } from '../../src/code-craft/catalog/exemplars';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

const RUBRICS_FOR_FUNCTION = SEED_RUBRICS.filter((r) => rubricApplies(r, 'function')).length;

const SUBSTANTIVE_FN = `export function classify(x) {
  if (x > 10) {
    return 'big';
  }
  const doubled = x * 2;
  return doubled > 5 ? 'medium' : 'small';
}
`;

describe('runCodeCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-craft-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('empty project: zero findings, zero LLM calls, exemplar count reported', async () => {
    const out = await runCodeCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.llmCalls.count).toBe(0);
    expect(out.summary.catalog.exemplarsAvailable).toBe(SEED_EXEMPLARS.length);
  });

  it('trivial files are skipped (no substantive unit)', async () => {
    writeFile(
      'packages/util/src/math.ts',
      'export function add(a: number, b: number): number { return a + b; }\n'
    );
    const out = await runCodeCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.counts.filesSkippedNoUnit).toBe(1);
    expect(out.findings).toHaveLength(0);
  });

  it('critiques every rubric applicable to a function unit', async () => {
    writeFile('packages/api/src/classify.ts', SUBSTANTIVE_FN);
    const out = await runCodeCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
    expect(out.summary.counts.unitsDetected).toBe(1);
    expect(out.summary.llmCalls.count).toBe(RUBRICS_FOR_FUNCTION);
  });

  it('emits a finding with all 3 axes and a CODE-R rubric id (ADR 0019 + 0020)', async () => {
    writeFile('packages/api/src/classify.ts', SUBSTANTIVE_FN);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CODE-R002',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"invert the guard"}\n```',
      },
    ]);
    const out = await runCodeCraft({ path: tmpDir, __testProvider: provider });
    const f = out.findings.find((finding) => finding.code === 'CODE-R002');
    expect(f).toBeDefined();
    expect(f!.tier).toBe('foundational');
    expect(f!.impact).toBe('large');
    expect(f!.confidence).toBe('high');
    expect(f!.target.unit).toBe('classify');
    expect(f!.cite.rubricId).toMatch(/^CODE-R/);
  });

  it('class-only rubrics apply to a class but not the function-only ones', async () => {
    writeFile(
      'packages/api/src/store.ts',
      `export class Store {
        private data = new Map();
        put(key, value) {
          if (!key) throw new Error('key required');
          this.data.set(key, value);
          return this;
        }
      }
      `
    );
    const out = await runCodeCraft({ path: tmpDir });
    // class + its method both count as units
    expect(out.summary.counts.unitsDetected).toBe(2);
    expect(out.summary.catalog.rubricsApplied).toContain('CODE-R001');
    // control-flow (R002) applies to the method but never to the class
    expect(out.summary.catalog.rubricsApplied).toContain('CODE-R002');
  });

  it('honors maxFiles cap', async () => {
    for (let i = 0; i < 4; i++) {
      writeFile(`packages/api/src/unit-${i}.ts`, SUBSTANTIVE_FN);
    }
    const out = await runCodeCraft({ path: tmpDir, maxFiles: 2 });
    expect(out.summary.counts.filesScanned).toBe(2);
  });

  it('honors packages filter', async () => {
    writeFile('packages/api/src/a.ts', SUBSTANTIVE_FN);
    writeFile('packages/web/src/b.ts', SUBSTANTIVE_FN);
    const out = await runCodeCraft({ path: tmpDir, packages: ['api'] });
    expect(out.summary.counts.filesScanned).toBe(1);
  });

  it('files override scopes critique to caller-supplied list', async () => {
    writeFile('packages/api/src/a.ts', SUBSTANTIVE_FN);
    writeFile('packages/api/src/b.ts', SUBSTANTIVE_FN);
    const out = await runCodeCraft({
      path: tmpDir,
      files: [path.join(tmpDir, 'packages/api/src/a.ts')],
    });
    expect(out.summary.counts.filesScanned).toBe(1);
  });

  it('reports cost telemetry from the provider', async () => {
    writeFile('packages/api/src/classify.ts', SUBSTANTIVE_FN);
    const out = await runCodeCraft({ path: tmpDir });
    expect(out.summary.llmCalls.provider).toBe('mock');
    expect(out.summary.llmCalls.count).toBeGreaterThan(0);
  });

  it('cross-cutting critiqueCodeInFile works on a single file', async () => {
    writeFile('packages/api/src/classify.ts', SUBSTANTIVE_FN);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'CODE-R001',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"hi"}\n```',
      },
    ]);
    const findings = await critiqueCodeInFile(path.join(tmpDir, 'packages/api/src/classify.ts'), {
      provider,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('critiqueCodeInFile returns [] for a file with no substantive unit', async () => {
    writeFile('packages/api/src/trivial.ts', 'export const x = 1;\n');
    const findings = await critiqueCodeInFile(path.join(tmpDir, 'packages/api/src/trivial.ts'));
    expect(findings).toEqual([]);
  });
});
