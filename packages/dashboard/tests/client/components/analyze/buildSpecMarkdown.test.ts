import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSpecMarkdown } from '../../../../src/client/components/analyze/buildSpecMarkdown';
import type {
  SELResult,
  CMLResult,
  PESLResult,
} from '../../../../src/client/components/analyze/types';

// Fixed clock so the `**Generated:** ${new Date().toISOString()}` line is deterministic.
const FROZEN_ISO = '2026-07-20T12:00:00.000Z';

function makeSel(overrides: Partial<SELResult> = {}): SELResult {
  return {
    intent: 'Do the thing',
    summary: 'A short summary of the change.',
    affectedSystems: [
      {
        name: 'auth-service',
        graphNodeId: 'node-1',
        confidence: 0.9,
        transitiveDeps: ['db'],
        testCoverage: 0.5,
        owner: 'team-a',
      },
    ],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    ...overrides,
  };
}

function makeCml(overrides: Partial<CMLResult> = {}): CMLResult {
  return {
    overall: 0.732,
    riskLevel: 'medium',
    confidence: 0.8,
    blastRadius: {
      services: 3,
      modules: 7,
      filesEstimated: 12,
      testFilesAffected: 4,
    },
    dimensions: {
      structural: 0.5,
      semantic: 0.256,
      historical: 0.994,
    },
    reasoning: ['because'],
    recommendedRoute: 'human',
    ...overrides,
  };
}

function makePesl(overrides: Partial<PESLResult> = {}): PESLResult {
  return {
    simulatedPlan: [],
    predictedFailures: [],
    riskHotspots: [],
    missingSteps: [],
    testGaps: [],
    executionConfidence: 0.416,
    recommendedChanges: [],
    abort: false,
    tier: 'full-simulation',
    ...overrides,
  };
}

describe('buildSpecMarkdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FROZEN_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits only the title and generated timestamp when all analyses are null', () => {
    const md = buildSpecMarkdown('My Feature', null, null, null);

    expect(md).toBe(`# Spec: My Feature\n\n**Generated:** ${FROZEN_ISO}\n`);
  });

  it('omits route/risk lines and all analysis sections when only cml is null', () => {
    const md = buildSpecMarkdown('X', null, null, null);

    expect(md).not.toContain('**Route Recommendation:**');
    expect(md).not.toContain('**Risk Level:**');
    expect(md).not.toContain('## Intent');
    expect(md).not.toContain('## Complexity Score');
    expect(md).not.toContain('## Simulation (PESL)');
  });

  it('adds route recommendation and risk level lines from cml', () => {
    const md = buildSpecMarkdown(
      'X',
      null,
      makeCml({ recommendedRoute: 'local', riskLevel: 'high' }),
      null
    );

    expect(md).toContain('**Route Recommendation:** local');
    expect(md).toContain('**Risk Level:** high');
  });

  it('renders intent and summary sections from sel', () => {
    const md = buildSpecMarkdown('X', makeSel(), null, null);

    expect(md).toContain('## Intent\n\nDo the thing\n');
    expect(md).toContain('## Summary\n\nA short summary of the change.\n');
  });

  it('lists affected systems as bullets when present', () => {
    const sel = makeSel({
      affectedSystems: [
        {
          name: 'svc-a',
          graphNodeId: null,
          confidence: 0.1,
          transitiveDeps: [],
          testCoverage: 0,
          owner: null,
        },
        {
          name: 'svc-b',
          graphNodeId: null,
          confidence: 0.2,
          transitiveDeps: [],
          testCoverage: 0,
          owner: null,
        },
      ],
    });
    const md = buildSpecMarkdown('X', sel, null, null);

    expect(md).toContain('## Affected Systems\n\n- svc-a\n- svc-b\n');
  });

  it('omits the Affected Systems heading when there are no affected systems', () => {
    const md = buildSpecMarkdown('X', makeSel({ affectedSystems: [] }), null, null);

    expect(md).not.toContain('## Affected Systems');
  });

  it('formats complexity dimensions as rounded percentages', () => {
    const cml = makeCml({
      overall: 0.732,
      dimensions: { structural: 0.5, semantic: 0.256, historical: 0.994 },
    });
    const md = buildSpecMarkdown('X', null, cml, null);

    expect(md).toContain('- **Overall:** 73%'); // round(73.2)
    expect(md).toContain('- **Structural:** 50%'); // round(50.0)
    expect(md).toContain('- **Semantic:** 26%'); // round(25.6)
    expect(md).toContain('- **Historical:** 99%'); // round(99.4)
  });

  it('renders the blast radius line with service/module/file counts', () => {
    const cml = makeCml({
      blastRadius: { services: 3, modules: 7, filesEstimated: 12, testFilesAffected: 4 },
    });
    const md = buildSpecMarkdown('X', null, cml, null);

    expect(md).toContain('- **Blast Radius:** 3 services, 7 modules, ~12 files');
  });

  it('emits Unknowns, Ambiguities, and Risk Signals bullet sections when populated', () => {
    const sel = makeSel({
      unknowns: ['u1', 'u2'],
      ambiguities: ['a1'],
      riskSignals: ['r1'],
    });
    const md = buildSpecMarkdown('X', sel, null, null);

    expect(md).toContain('## Unknowns\n\n- u1\n- u2\n');
    expect(md).toContain('## Ambiguities\n\n- a1\n');
    expect(md).toContain('## Risk Signals\n\n- r1\n');
  });

  it('omits empty sel bullet sections', () => {
    const md = buildSpecMarkdown(
      'X',
      makeSel({ unknowns: [], ambiguities: [], riskSignals: [] }),
      null,
      null
    );

    expect(md).not.toContain('## Unknowns');
    expect(md).not.toContain('## Ambiguities');
    expect(md).not.toContain('## Risk Signals');
  });

  it('renders the PESL section with rounded execution confidence', () => {
    const md = buildSpecMarkdown('X', null, null, makePesl({ executionConfidence: 0.416 }));

    expect(md).toContain('## Simulation (PESL)');
    expect(md).toContain('**Execution Confidence:** 42%'); // round(41.6)
  });

  it('renders the simulated plan as a 1-based numbered list', () => {
    const pesl = makePesl({ simulatedPlan: ['step one', 'step two', 'step three'] });
    const md = buildSpecMarkdown('X', null, null, pesl);

    expect(md).toContain('### Simulated Plan\n\n1. step one\n2. step two\n3. step three\n');
  });

  it('omits the Simulated Plan heading when the plan is empty', () => {
    const md = buildSpecMarkdown('X', null, null, makePesl({ simulatedPlan: [] }));

    expect(md).not.toContain('### Simulated Plan');
  });

  it('renders predicted failures and recommended changes as bullet sections', () => {
    const pesl = makePesl({
      predictedFailures: ['boom', 'crash'],
      recommendedChanges: ['add tests'],
    });
    const md = buildSpecMarkdown('X', null, null, pesl);

    expect(md).toContain('### Predicted Failures\n\n- boom\n- crash\n');
    expect(md).toContain('### Recommended Changes\n\n- add tests\n');
  });

  it('omits empty predicted-failure and recommended-change sections', () => {
    const md = buildSpecMarkdown(
      'X',
      null,
      null,
      makePesl({ predictedFailures: [], recommendedChanges: [] })
    );

    expect(md).not.toContain('### Predicted Failures');
    expect(md).not.toContain('### Recommended Changes');
  });

  it('assembles all sections in document order when sel, cml, and pesl are all present', () => {
    const md = buildSpecMarkdown(
      'Full Spec',
      makeSel(),
      makeCml(),
      makePesl({ simulatedPlan: ['do it'] })
    );

    // Header block first.
    expect(md.startsWith(`# Spec: Full Spec\n\n**Generated:** ${FROZEN_ISO}`)).toBe(true);

    // Section ordering: header meta -> Intent -> Complexity Score -> Simulation.
    const intentIdx = md.indexOf('## Intent');
    const complexityIdx = md.indexOf('## Complexity Score');
    const simulationIdx = md.indexOf('## Simulation (PESL)');
    expect(intentIdx).toBeGreaterThan(-1);
    expect(complexityIdx).toBeGreaterThan(intentIdx);
    expect(simulationIdx).toBeGreaterThan(complexityIdx);
  });
});
