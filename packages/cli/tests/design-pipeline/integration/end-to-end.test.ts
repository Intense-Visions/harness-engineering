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
    // One source file, so this is a default run over a real design surface
    // rather than the degenerate no-surface case (#2070).
    writeFile('src/Card.tsx', `export const Card = () => <div>ok</div>;\n`);

    const out = await runDesignPipeline({ path: tmpDir });
    expect(out.verifiersRun).toContain('detect-drift');
    expect(out.verifiersRun).toContain('audit-anatomy');
    expect(out.verifiersRun).toContain('audit-brand');
    expect(out.verifiersRun).toContain('design-craft-critique');
  });

  it('exclusions carries the exclude globs DETECT applied, and the excluded file is absent', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({ color: { brand: { primary: { $type: 'color', $value: '#0066cc' } } } })
    );
    writeFile('harness.config.json', JSON.stringify({ design: { exclude: ['src/legacy/**'] } }));
    writeFile('src/Card.ts', `const c = { color: "#0066cc" };\n`);
    writeFile('src/legacy/Old.ts', `const d = { color: "#0066cc" };\n`);

    const out = await runDesignPipeline({ path: tmpDir, noFill: true });
    expect([...out.exclusions]).toEqual(['src/legacy/**']);
    expect(out.exclusionsMeasured).toBe(true);
    // Positive control: drift is detected, just not in the excluded file.
    expect(out.driftFindings.some((f) => f.file.endsWith('Card.ts'))).toBe(true);
    expect(out.driftFindings.some((f) => f.file.endsWith('Old.ts'))).toBe(false);
  });

  it('ci: true is a deprecated no-op that is reported on warnings, not silently accepted', async () => {
    writeFile('src/Card.tsx', `export const Card = () => <div>ok</div>;\n`);
    const withCi = await runDesignPipeline({ path: tmpDir, noFill: true, ci: true });
    expect(withCi.warnings).toHaveLength(1);
    expect(withCi.warnings[0]).toMatch(/deprecated and has no effect/);

    const without = await runDesignPipeline({ path: tmpDir, noFill: true });
    expect(without.warnings).toEqual([]);
    // Same verdict either way: the option changes nothing but the notice.
    expect(withCi.verdict).toBe(without.verdict);
  });

  it('graphAvailable is probed even under --no-freshen (it used to read false with a graph on disk)', async () => {
    writeFile('.harness/graph/graph.json', '{"kind":"schema"}\n');
    const withGraph = await runDesignPipeline({ path: tmpDir, noFreshen: true, noFill: true });
    expect(withGraph.graphAvailable).toBe(true);

    fs.rmSync(path.join(tmpDir, '.harness', 'graph'), { recursive: true, force: true });
    const withoutGraph = await runDesignPipeline({ path: tmpDir, noFreshen: true, noFill: true });
    expect(withoutGraph.graphAvailable).toBe(false);
  });

  it('a run whose DETECT abstained reports unmeasured, not empty: exclusionsMeasured false, fixStopReason detect-unavailable', async () => {
    writeFile(
      'design-system/tokens.json',
      JSON.stringify({ color: { brand: { primary: { $type: 'color', $value: '#0066cc' } } } })
    );
    // An exclude that matches everything: detect-drift abstains rather than
    // reporting a clean scan over nothing.
    writeFile('harness.config.json', JSON.stringify({ design: { exclude: ['**/*'] } }));
    writeFile('src/Card.ts', `const c = { color: "#0066cc" };\n`);

    const out = await runDesignPipeline({ path: tmpDir, fix: true, noFill: true });
    // Positive control: the abstention really happened.
    expect(out.verifiersFailed.map((f) => f.name)).toContain('detect-drift');
    expect(out.verifiersRun).not.toContain('detect-drift');
    expect(out.exclusions).toEqual(new Set());
    expect(out.exclusionsMeasured).toBe(false);
    expect(out.summary.fixStopReason).toBe('detect-unavailable');
  });

  it('a measured DETECT with no globs configured reports an empty set with exclusionsMeasured true', async () => {
    writeFile('src/Card.tsx', `export const Card = () => <div>ok</div>;\n`);
    const out = await runDesignPipeline({ path: tmpDir, fix: true, noFill: true });
    expect(out.verifiersRun).toContain('detect-drift');
    expect(out.exclusions).toEqual(new Set());
    expect(out.exclusionsMeasured).toBe(true);
    expect(out.summary.fixStopReason).toBe('no-drift');
  });

  it('summary.fixStopReason is not-run when --fix is absent', async () => {
    const out = await runDesignPipeline({ path: tmpDir, noFill: true });
    expect(out.summary.fixStopReason).toBe('not-run');
  });

  it('summary.durationMs is recorded', async () => {
    const out = await runDesignPipeline({ path: tmpDir });
    expect(out.summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});
