import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runSecurityCraft, critiqueSecurityInFile } from '../../src/security-craft';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

describe('runSecurityCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'security-craft-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('empty project: zero findings, zero LLM calls', async () => {
    const out = await runSecurityCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.llmCalls.count).toBe(0);
    expect(out.summary.catalog.rubricsApplied).toHaveLength(8);
  });

  it('pure utility files are skipped (AST scan returns no signals)', async () => {
    writeFile(
      'packages/util/src/math.ts',
      'export function add(a: number, b: number): number { return a + b; }\n'
    );
    const out = await runSecurityCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.counts.filesSkippedNoSignal).toBe(1);
    expect(out.findings).toHaveLength(0);
  });

  it('emits findings for a file with a privileged-op signal', async () => {
    writeFile(
      'packages/api/src/run.ts',
      `import * as child_process from 'child_process';
       export function run(req, res) {
         child_process.exec(req.body.cmd, () => res.json({}));
       }`
    );
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'SEC-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"command injection"}\n```',
      },
    ]);
    const out = await runSecurityCraft({ path: tmpDir, __testProvider: provider });
    expect(out.summary.counts.filesScanned).toBe(1);
    expect(out.summary.counts.signalsDetected).toBeGreaterThan(0);
    // R001 fires on both http-handler AND privileged-op signals; find the
    // privileged-op variant specifically since that's the marker we care about
    // for this test (the bash injection).
    const r001Priv = out.findings.find(
      (f) => f.code === 'SEC-R001' && f.target.signal === 'child_process.exec'
    );
    expect(r001Priv).toBeDefined();
  });

  it('per-signal rubric pre-filter: a secret-handling signal only fires SEC-R007', async () => {
    writeFile(
      'packages/api/src/log.ts',
      `const token = getToken();
       console.log(token);`
    );
    const out = await runSecurityCraft({ path: tmpDir });
    // SEC-R007 is the only rubric that appliesToSignals includes 'secret-handling'.
    // Other rubrics should NOT have been called for this file (no other signals).
    const codes = new Set(out.findings.map((f) => f.code));
    for (const code of codes) {
      expect(code).toBe('SEC-R007');
    }
  });

  it('honors maxFiles cap', async () => {
    for (let i = 0; i < 5; i++) {
      writeFile(`packages/p${i}/src/h.ts`, `function handler(req, res) { res.json({}); }`);
    }
    const out = await runSecurityCraft({ path: tmpDir, maxFiles: 2 });
    // At most 2 files were scanned (max-files clamps the candidate list)
    expect(
      out.summary.counts.filesScanned + out.summary.counts.filesSkippedNoSignal
    ).toBeLessThanOrEqual(2);
  });

  it('honors packages filter', async () => {
    writeFile('packages/api/src/h.ts', `function h(req, res) { res.json({}); }`);
    writeFile('packages/web/src/h.ts', `function h(req, res) { res.json({}); }`);
    const out = await runSecurityCraft({ path: tmpDir, packages: ['api'] });
    // Only api/ was walked; web/ files don't appear in either count
    expect(out.summary.counts.filesScanned + out.summary.counts.filesSkippedNoSignal).toBe(1);
  });

  it('emits SecurityFinding with all 3 axes present (ADR 0019)', async () => {
    writeFile('packages/api/src/h.ts', `function handler(req, res) { eval(req.body.code); }`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'SEC-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"medium","message":"x"}\n```',
      },
    ]);
    const out = await runSecurityCraft({ path: tmpDir, __testProvider: provider });
    const f = out.findings.find((finding) => finding.code === 'SEC-R001');
    expect(f).toBeDefined();
    expect(f!.tier).toBe('foundational');
    expect(f!.impact).toBe('large');
    expect(f!.confidence).toBe('medium');
    expect(f!.cite.rubricId).toMatch(/^SEC-R/);
  });

  it('mock provider default response is medium-or-lower confidence (FP-management contract)', async () => {
    // The default MockLlmProvider response uses confidence: 'low'. This test
    // documents the contract: never higher than medium by default. If a future
    // refactor inflates the mock default to 'high', this test fails — which is
    // the desired safeguard for the conservative-confidence Decision #3.
    writeFile('packages/api/src/h.ts', `function handler(req, res) { eval(req.body.code); }`);
    const out = await runSecurityCraft({ path: tmpDir });
    for (const f of out.findings) {
      expect(['low', 'medium']).toContain(f.confidence);
    }
  });

  it('reports cost telemetry from the provider', async () => {
    writeFile('packages/api/src/h.ts', `function handler(req, res) { res.json({}); }`);
    const out = await runSecurityCraft({ path: tmpDir });
    // http-handler signal fires R001/R002/R003/R004/R005/R006/R008 = 7 rubrics
    expect(out.summary.llmCalls.count).toBe(7);
    expect(out.summary.llmCalls.provider).toBe('mock');
  });

  it('cross-cutting critiqueSecurityInFile returns [] for files with no signals', async () => {
    writeFile(
      'packages/util/src/math.ts',
      'export function add(a: number, b: number): number { return a + b; }\n'
    );
    const findings = await critiqueSecurityInFile(path.join(tmpDir, 'packages/util/src/math.ts'));
    expect(findings).toEqual([]);
  });

  it('cross-cutting critiqueSecurityInFile works on a single file with signals', async () => {
    writeFile('packages/api/src/h.ts', `function handler(req, res) { eval(req.body.code); }`);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'SEC-R001',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"hi"}\n```',
      },
    ]);
    const findings = await critiqueSecurityInFile(path.join(tmpDir, 'packages/api/src/h.ts'), {
      provider,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('files override scopes critique to caller-supplied list', async () => {
    writeFile('packages/api/src/a.ts', `function h(req, res) { res.json({}); }`);
    writeFile('packages/api/src/b.ts', `function h(req, res) { res.json({}); }`);
    writeFile('packages/api/src/c.ts', `function h(req, res) { res.json({}); }`);
    const out = await runSecurityCraft({
      path: tmpDir,
      files: [path.join(tmpDir, 'packages/api/src/a.ts')],
    });
    expect(out.summary.counts.filesScanned + out.summary.counts.filesSkippedNoSignal).toBe(1);
  });
});
