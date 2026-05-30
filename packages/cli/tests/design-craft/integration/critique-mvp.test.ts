// packages/cli/tests/design-craft/integration/critique-mvp.test.ts
//
// Phase 1 MVP integration test for the design-craft CRITIQUE phase.
//
// Coverage:
//   1. Happy path — MockLlmProvider returns a clean fenced JSON response;
//      runCritique produces >=1 CraftFinding with non-null tier/impact/
//      confidence and a computed derived.priority.
//   2. Honest confidence (ADR 0019 / Success Criterion 6) — the default
//      mock response emits confidence: 'low' so we can prove the pipeline
//      does NOT silently upgrade or filter it out.
//   3. End-to-end via the MCP handler — verifies the tool-shaped surface
//      returns the same finding through resultToMcpResponse without losing
//      the 3-axis fields.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCritique } from '../../../src/design-craft/phases/critique.js';
import type { CritiqueTarget } from '../../../src/design-craft/phases/critique.js';
import { hierarchyClarityRubric } from '../../../src/design-craft/catalog/rubrics/hierarchy-clarity.js';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js';

const FIXTURE_COMPONENT_SOURCE = `
// Fixture: a CTA cluster with three identically-weighted buttons.
// The hierarchy-clarity rubric should flag this as foundational/medium.
export function HeroCtas() {
  return (
    <div className="flex gap-3">
      <button className="px-4 py-2 bg-blue-500 text-white">Sign up</button>
      <button className="px-4 py-2 bg-blue-500 text-white">Log in</button>
      <button className="px-4 py-2 bg-blue-500 text-white">Learn more</button>
    </div>
  );
}
`;

const FIXTURE_TARGET: CritiqueTarget = {
  file: 'fixtures/HeroCtas.tsx',
  component: 'HeroCtas',
  source: FIXTURE_COMPONENT_SOURCE,
};

describe('design-craft CRITIQUE phase (MVP)', () => {
  it('produces at least one CraftFinding with non-null 3-axis fields and computed priority', async () => {
    const provider = new MockLlmProvider();
    const findings = await runCritique({
      targets: [FIXTURE_TARGET],
      rubrics: [hierarchyClarityRubric],
      provider,
    });

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding.code).toBe('CRAFT-C001');
    expect(finding.phase).toBe('critique');
    expect(finding.tier).toBeTruthy();
    expect(finding.impact).toBeTruthy();
    expect(finding.confidence).toBeTruthy();
    expect(['foundational', 'polish', 'aspirational']).toContain(finding.tier);
    expect(['small', 'medium', 'large']).toContain(finding.impact);
    expect(['high', 'medium', 'low']).toContain(finding.confidence);
    expect(finding.target).toEqual({
      file: 'fixtures/HeroCtas.tsx',
      component: 'HeroCtas',
    });
    expect(finding.cite.rubricOrPatternId).toBe('rubric-hierarchy-clarity');
    expect(typeof finding.derived.priority).toBe('number');
    expect(finding.derived.priority).toBeGreaterThan(0);
  });

  it('emits low confidence honestly when the LLM is uncertain (ADR 0019)', async () => {
    // The default MockLlmProvider response intentionally returns
    // confidence: 'low'. If a refactor ever upgrades or filters this, the
    // assertion below fails — that's the contract we want to lock in.
    const provider = new MockLlmProvider();
    const [finding] = await runCritique({
      targets: [FIXTURE_TARGET],
      rubrics: [hierarchyClarityRubric],
      provider,
    });
    expect(finding.confidence).toBe('low');
    // Priority is still computed (not nulled out) for low-confidence
    // findings — they remain sortable; their confidence just travels
    // alongside.
    expect(finding.derived.priority).toBeGreaterThan(0);
  });

  it('records cost telemetry on the provider after the run', async () => {
    const provider = new MockLlmProvider();
    await runCritique({
      targets: [FIXTURE_TARGET],
      rubrics: [hierarchyClarityRubric],
      provider,
    });
    const costs = provider.getCosts();
    expect(costs).toHaveLength(1);
    expect(costs[0].provider).toBe('mock');
    expect(costs[0].model).toBe('mock-text-deterministic-1');
  });

  it('produces a sentinel finding when the LLM response is unparseable', async () => {
    // Match against the templated component identifier so the override
    // hits for our fixture target.
    const provider = new MockLlmProvider([
      {
        promptIncludes: 'HeroCtas',
        response: 'totally unparseable garbage with no JSON anywhere',
      },
    ]);

    const [finding] = await runCritique({
      targets: [FIXTURE_TARGET],
      rubrics: [hierarchyClarityRubric],
      provider,
    });
    expect(finding.confidence).toBe('low');
    expect(finding.message).toMatch(/parse-failure/i);
  });
});

describe('design-craft MCP handler (MVP)', () => {
  it('returns a JSON-encoded DesignCraftOutput with the critique finding', async () => {
    // Materialize the fixture on disk so the MCP path (which reads from the
    // file system) can hit it end-to-end. The MVP contract is file-path-
    // based — Phase 2 may add an inline-source escape hatch.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-mvp-'));
    const fixturePath = path.join(tmpDir, 'HeroCtas.tsx');
    fs.writeFileSync(fixturePath, FIXTURE_COMPONENT_SOURCE, 'utf8');

    const provider = new MockLlmProvider();
    const result = await handleDesignCraft({
      path: tmpDir,
      mode: 'fast',
      phases: ['critique'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: provider,
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      findings: Array<{
        code: string;
        tier: string;
        impact: string;
        confidence: string;
        derived: { priority: number };
      }>;
      scores: unknown[];
      summary: {
        phaseRun: string[];
        mode: string;
        llmCalls: { provider: string; count: number };
        catalog: { rubricsApplied: string[] };
        runId: string;
      };
    };

    // Phase 2B widen-to-seven: MCP path now runs all 7 seed rubrics
    // (hierarchy-clarity, typography-craft, motion-quality, color-confidence,
    // density-rhythm, restraint, polish-details) → 7 findings × 1 target.
    expect(payload.findings).toHaveLength(7);
    const codes = payload.findings.map((f) => f.code).sort();
    expect(codes).toEqual([
      'CRAFT-C001',
      'CRAFT-C002',
      'CRAFT-C003',
      'CRAFT-C004',
      'CRAFT-C005',
      'CRAFT-C006',
      'CRAFT-C007',
    ]);
    for (const finding of payload.findings) {
      expect(finding.confidence).toBe('low');
      expect(finding.derived.priority).toBeGreaterThan(0);
    }
    expect(payload.scores).toEqual([]);
    expect(payload.summary.phaseRun).toEqual(['critique']);
    expect(payload.summary.mode).toBe('fast');
    expect(payload.summary.llmCalls.provider).toBe('mock');
    expect(payload.summary.llmCalls.count).toBe(7);
    expect(payload.summary.catalog.rubricsApplied).toEqual([
      'rubric-hierarchy-clarity',
      'rubric-typography-craft',
      'rubric-motion-quality',
      'rubric-color-confidence',
      'rubric-density-rhythm',
      'rubric-restraint',
      'rubric-polish-details',
    ]);
    expect(payload.summary.runId).toMatch(/^[0-9a-f-]{36}$/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects deep mode in MVP with a clear error', async () => {
    const result = await handleDesignCraft({
      path: '/tmp/fake-project',
      mode: 'deep',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/deep mode .* not implemented/i);
  });

  it('rejects missing path argument', async () => {
    const result = await handleDesignCraft({} as Parameters<typeof handleDesignCraft>[0]);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/path.*required/i);
  });
});
