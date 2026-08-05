import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runDocsCraft, critiqueDocFile } from '../../src/docs-craft';
import { MockLlmProvider } from '../../src/shared/craft/llm/provider';

describe('runDocsCraft (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-craft-int-'));
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
    const out = await runDocsCraft({ path: tmpDir });
    expect(out.findings).toEqual([]);
    expect(out.summary.counts.filesScanned).toBe(0);
    expect(out.summary.llmCalls.count).toBe(0);
    expect(out.summary.catalog.exemplarsAvailable).toBe(5);
  });

  it('walks a doc and emits findings via mock provider', async () => {
    writeFile('docs/guides/intro.md', '# Intro\n\nThe system supports X, Y, and Z.\n');
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'DOCS-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"high","message":"describes, does not teach"}\n```',
      },
    ]);
    const out = await runDocsCraft({ path: tmpDir, __testProvider: provider });
    expect(out.summary.counts.filesScanned).toBe(1);
    const r001 = out.findings.find((f) => f.code === 'DOCS-R001');
    expect(r001).toBeDefined();
    expect(r001!.target.relative).toBe('docs/guides/intro.md');
    expect(r001!.target.kind).toBe('guide');
  });

  it('hard-excludes sibling-owned territories', async () => {
    writeFile('docs/knowledge/fact.md', '# Fact\n\nbody\n');
    writeFile('docs/changes/proposal.md', '# Proposal\n\nbody\n');
    writeFile('docs/guides/real.md', '# Real\n\nbody\n');
    const out = await runDocsCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
    for (const f of out.findings) {
      expect(f.target.relative).not.toContain('knowledge');
      expect(f.target.relative).not.toContain('changes');
    }
  });

  it('applies kind-filtered rubrics: reference doc gets api-response rubric, prose does not', async () => {
    writeFile('docs/reference/api.md', '# API\n\nPOST /widgets\n');
    const out = await runDocsCraft({ path: tmpDir });
    // reference kind → all 7 rubrics apply → 7 mock LLM calls
    expect(out.summary.llmCalls.count).toBe(7);
    expect(out.summary.catalog.rubricsApplied).toContain('DOCS-R005');
  });

  it('prose doc does not get the reference-only rubric', async () => {
    writeFile('docs/architecture/overview.md', '# Overview\n\nbody\n');
    const out = await runDocsCraft({ path: tmpDir });
    // prose kind → only the 5 '*' rubrics apply
    expect(out.summary.llmCalls.count).toBe(5);
    expect(out.summary.catalog.rubricsApplied).not.toContain('DOCS-R005');
    expect(out.summary.catalog.rubricsApplied).not.toContain('DOCS-R003');
  });

  it('honors maxFiles cap', async () => {
    for (let i = 0; i < 5; i++) {
      writeFile(`docs/guides/entry-${i}.md`, `# Entry ${i}\n\nbody\n`);
    }
    const out = await runDocsCraft({ path: tmpDir, maxFiles: 2 });
    expect(out.summary.counts.filesScanned).toBe(2);
  });

  it('honors excludeDirs additional argument', async () => {
    writeFile('docs/drafts/wip.md', '# WIP\n');
    writeFile('docs/guides/canonical.md', '# Canonical\n');
    const out = await runDocsCraft({ path: tmpDir, excludeDirs: ['drafts'] });
    expect(out.summary.counts.filesScanned).toBe(1);
  });

  it('emits DocsFinding with all 3 axes present (ADR 0019)', async () => {
    writeFile('docs/guides/entry.md', '# Entry\n\nbody.\n');
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'DOCS-R001',
        response:
          '```json\n{"tier":"foundational","impact":"large","confidence":"low","message":"x"}\n```',
      },
    ]);
    const out = await runDocsCraft({ path: tmpDir, __testProvider: provider });
    const f = out.findings.find((finding) => finding.code === 'DOCS-R001');
    expect(f).toBeDefined();
    expect(f!.tier).toBe('foundational');
    expect(f!.impact).toBe('large');
    expect(f!.confidence).toBe('low');
    expect(f!.cite.rubricId).toMatch(/^DOCS-R/);
  });

  it('reports cost telemetry from the provider', async () => {
    writeFile('docs/architecture/overview.md', '# Overview\n\nbody.\n');
    const out = await runDocsCraft({ path: tmpDir });
    expect(out.summary.llmCalls.provider).toBe('mock');
    expect(out.summary.llmCalls.count).toBeGreaterThan(0);
  });

  it('discovers and critiques the root README', async () => {
    writeFile('README.md', '# Project\n\nA thing.\n');
    const out = await runDocsCraft({ path: tmpDir });
    expect(out.summary.counts.filesScanned).toBe(1);
    // readme kind → 6 rubrics (5 '*' + DOCS-R003), not the reference-only DOCS-R005
    expect(out.summary.catalog.rubricsApplied).toContain('DOCS-R003');
    expect(out.summary.catalog.rubricsApplied).not.toContain('DOCS-R005');
  });

  it('cross-cutting critiqueDocFile works on a single file', async () => {
    writeFile('docs/guides/entry.md', '# Entry\n\nbody.\n');
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'DOCS-R001',
        response:
          '```json\n{"tier":"polish","impact":"small","confidence":"medium","message":"hi"}\n```',
      },
    ]);
    const findings = await critiqueDocFile(path.join(tmpDir, 'docs/guides/entry.md'), {
      relative: 'docs/guides/entry.md',
      provider,
    });
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('files override scopes critique to caller-supplied list', async () => {
    writeFile('docs/guides/a.md', '# A\n');
    writeFile('docs/guides/b.md', '# B\n');
    const out = await runDocsCraft({
      path: tmpDir,
      files: [path.join(tmpDir, 'docs/guides/a.md')],
    });
    expect(out.summary.counts.filesScanned).toBe(1);
  });
});
