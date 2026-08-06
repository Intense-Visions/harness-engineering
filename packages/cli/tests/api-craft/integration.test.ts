import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runApiCraft, critiqueApiSurfaceFile } from '../../src/api-craft';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

const ROUTE = "router.post('/widgets', async (req, res) => { res.json({}); });";
const OPENAPI_YAML = 'openapi: 3.0.0\ninfo:\n  title: Widgets\n  version: 1.0.0\npaths: {}\n';

describe('runApiCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-craft-int-'));
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
    const out = await runApiCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.llmCalls.count).toBe(0);
    expect(out.summary.catalog.exemplarsAvailable).toBe(5);
  });

  it('walks a route and emits findings via mock provider', async () => {
    writeFile('src/routes/widgets.ts', ROUTE);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'API-R003',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"verb dishonest"}\n```',
      },
    ]);
    const out = await runApiCraft({ path: tmpDir, __testProvider: provider });
    expect(out.summary.counts.filesScanned).toBe(1);
    const r003 = out.findings.find((f) => f.code === 'API-R003');
    expect(r003).toBeDefined();
    expect(r003!.target.relative).toBe('src/routes/widgets.ts');
    expect(r003!.target.kind).toBe('route');
  });

  it('applies kind-filtered rubrics: route gets all 9, openapi gets 8 (no idempotency)', async () => {
    writeFile('src/routes/widgets.ts', ROUTE);
    const routeOut = await runApiCraft({ path: tmpDir });
    expect(routeOut.summary.llmCalls.count).toBe(9);
    expect(routeOut.summary.catalog.rubricsApplied).toContain('API-R008');

    fs.rmSync(path.join(tmpDir, 'src/routes/widgets.ts'));
    writeFile('openapi.yaml', OPENAPI_YAML);
    const specOut = await runApiCraft({ path: tmpDir });
    expect(specOut.summary.llmCalls.count).toBe(8);
    expect(specOut.summary.catalog.rubricsApplied).not.toContain('API-R008');
  });

  it('excludes tests and barrels from the walk', async () => {
    writeFile('src/routes/real.ts', ROUTE);
    writeFile('src/routes/real.test.ts', ROUTE);
    writeFile('src/routes/_registry.ts', ROUTE);
    const out = await runApiCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
    for (const f of out.findings) {
      expect(f.target.relative).toBe('src/routes/real.ts');
    }
  });

  it('honors maxFiles cap', async () => {
    for (let i = 0; i < 5; i++) writeFile(`src/routes/r-${i}.ts`, ROUTE);
    const out = await runApiCraft({ path: tmpDir, maxFiles: 2 });
    expect(out.summary.counts.filesScanned).toBe(2);
  });

  it('honors an explicit routesDir', async () => {
    writeFile('src/routes/ignored.ts', ROUTE);
    writeFile('server/http/api.ts', ROUTE);
    const out = await runApiCraft({ path: tmpDir, routesDir: 'server/http' });
    expect(out.summary.counts.filesScanned).toBe(1);
  });

  it('emits an ApiFinding with all 3 axes present (ADR 0019)', async () => {
    writeFile('src/routes/widgets.ts', ROUTE);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'API-R003',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"low","message":"x"}\n```',
      },
    ]);
    const out = await runApiCraft({ path: tmpDir, __testProvider: provider });
    const f = out.findings.find((finding) => finding.code === 'API-R003');
    expect(f).toBeDefined();
    expect(f!.tier).toBe('foundational');
    expect(f!.impact).toBe('large');
    expect(f!.confidence).toBe('low');
    expect(f!.cite.rubricId).toMatch(/^API-R/);
  });

  it('reports cost telemetry from the provider', async () => {
    writeFile('src/routes/widgets.ts', ROUTE);
    const out = await runApiCraft({ path: tmpDir });
    expect(out.summary.llmCalls.provider).toBe('mock');
    expect(out.summary.llmCalls.count).toBeGreaterThan(0);
  });

  it('cross-cutting critiqueApiSurfaceFile works on a single file', async () => {
    writeFile('src/routes/widgets.ts', ROUTE);
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'API-R003',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"hi"}\n```',
      },
    ]);
    const findings = await critiqueApiSurfaceFile(path.join(tmpDir, 'src/routes/widgets.ts'), {
      relative: 'src/routes/widgets.ts',
      provider,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('files override scopes critique to caller-supplied list', async () => {
    writeFile('src/routes/a.ts', ROUTE);
    writeFile('src/routes/b.ts', ROUTE);
    const out = await runApiCraft({
      path: tmpDir,
      files: [path.join(tmpDir, 'src/routes/a.ts')],
    });
    expect(out.summary.counts.filesScanned).toBe(1);
  });
});
