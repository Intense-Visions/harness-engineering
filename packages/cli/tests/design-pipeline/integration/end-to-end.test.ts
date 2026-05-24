import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock design-craft to keep test hermetic (no LLM provider needed).
vi.mock('../../../src/mcp/tools/design-craft', () => ({
  runDesignCraft: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      findings: [],
      scores: [],
      summary: {
        phaseRun: ['critique'],
        mode: 'fast',
        durationMs: 0,
        llmCalls: { provider: 'mock', model: 'mock', count: 0, costUsd: 0 },
        catalog: { rubricsApplied: [], patternsApplied: [], exemplarsCited: [] },
        preconditions: {
          aestheticIntentDeclared: false,
          designMdExists: false,
          tokensExist: false,
        },
        deferralsToHarnessDesign: 0,
        runId: 'mock-run',
      },
    },
  }),
}));

import { runDesignPipeline } from '../../../src/design-pipeline';

describe('runDesignPipeline (integration)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-int-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(rel: string, content: string): void {
    const full = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  it('empty project: verdict=warn after FILL bootstraps inputs', async () => {
    const out = await runDesignPipeline({ path: tmpDir });
    expect(out.verdict).toBe('warn');
    expect(out.bootstrapped.designMd).toBe(true);
    expect(out.bootstrapped.tokensJson).toBe(true);
    expect(out.summary.totalFindings).toBe(0);
  });

  it('clean project: verdict=pass when all inputs present + no findings', async () => {
    writeFile(
      'design-system/DESIGN.md',
      `# Design\n\n## Component Registry\n\n| Type | File |\n|---|---|\n\n## Brand Rules\n\n### Voice\n\nforbidden_phrases: []\n`
    );
    writeFile('design-system/tokens.json', JSON.stringify({ color: {} }));

    const out = await runDesignPipeline({ path: tmpDir });
    expect(out.verdict).toBe('pass');
    expect(out.summary.totalFindings).toBe(0);
    expect(out.bootstrapped.designMd).toBe(false);
  });

  it('drift findings produce verdict=fail', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({
        color: { brand: { primary: { $type: 'color', $value: '#0066cc' } } },
      })
    );
    writeFile(
      'design-system/DESIGN.md',
      `# Design\n\n## Component Registry\n\n| Type | File |\n|---|---|\n\n## Brand Rules\n\n### Voice\n\nforbidden_phrases: []\n`
    );
    writeFile('src/Card.ts', `const c = { color: "#0066cc" };\n`);

    const out = await runDesignPipeline({ path: tmpDir });
    expect(out.driftFindings.length).toBeGreaterThanOrEqual(1);
    expect(out.verdict).toBe('fail');
  });

  it('--no-freshen skips Phase 1 (inputs.* stays default false)', async () => {
    writeFile('design-system/DESIGN.md', '# Design');
    const out = await runDesignPipeline({ path: tmpDir, noFreshen: true });
    expect(out.inputs.designMdExists).toBe(false);
  });

  it('--no-fill skips Phase 5 (no bootstrap, no craft suggestions)', async () => {
    const out = await runDesignPipeline({ path: tmpDir, noFill: true });
    expect(out.bootstrapped.designMd).toBe(false);
    expect(out.bootstrapped.tokensJson).toBe(false);
    expect(out.craftSuggestions).toBe(0);
    // verifier 'design-craft-critique' should NOT appear
    expect(out.verifiersRun).not.toContain('design-craft-critique');
  });

  it('verifiersRun includes detect-drift, audit-anatomy, audit-brand, design-craft-critique on default run', async () => {
    const out = await runDesignPipeline({ path: tmpDir });
    expect(out.verifiersRun).toContain('detect-drift');
    expect(out.verifiersRun).toContain('audit-anatomy');
    expect(out.verifiersRun).toContain('audit-brand');
    expect(out.verifiersRun).toContain('design-craft-critique');
  });

  it('summary.durationMs is recorded', async () => {
    const out = await runDesignPipeline({ path: tmpDir });
    expect(out.summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});
