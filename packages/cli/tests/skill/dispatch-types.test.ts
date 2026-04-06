import { describe, it, expect } from 'vitest';
import type {
  DispatchContext,
  DispatchResult,
  DispatchedSkill,
} from '../../src/skill/dispatch-types';
import type { HealthSnapshot } from '../../src/skill/health-snapshot';

/** Minimal valid HealthSnapshot for structural tests. */
const STUB_SNAPSHOT: HealthSnapshot = {
  capturedAt: '2026-04-06T00:00:00.000Z',
  gitHead: 'abc123',
  projectPath: '/tmp/test',
  checks: {
    deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
    entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
    security: { passed: true, findingCount: 0, criticalCount: 0 },
    perf: { passed: true, violationCount: 0 },
    docs: { passed: true, undocumentedCount: 0 },
    lint: { passed: true, issueCount: 0 },
  },
  metrics: {
    avgFanOut: 0,
    maxFanOut: 0,
    avgCyclomaticComplexity: 0,
    maxCyclomaticComplexity: 0,
    avgCouplingRatio: 0,
    testCoverage: null,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
  },
  signals: [],
};

describe('DispatchContext', () => {
  it('is structurally valid when all fields are present', () => {
    const ctx: DispatchContext = {
      snapshot: STUB_SNAPSHOT,
      changeType: 'feature',
      changedFiles: ['src/index.ts'],
      domains: ['database'],
      allSignals: ['change-feature', 'domain-database'],
      snapshotFreshness: 'cached',
    };
    expect(ctx.changeType).toBe('feature');
    expect(ctx.changedFiles).toHaveLength(1);
    expect(ctx.domains).toContain('database');
    expect(ctx.allSignals).toHaveLength(2);
  });

  it('accepts all four change types', () => {
    const types = ['feature', 'bugfix', 'refactor', 'docs'] as const;
    for (const changeType of types) {
      const ctx: DispatchContext = {
        snapshot: STUB_SNAPSHOT,
        changeType,
        changedFiles: [],
        domains: [],
        allSignals: [],
        snapshotFreshness: 'cached',
      };
      expect(ctx.changeType).toBe(changeType);
    }
  });

  it('accepts empty changedFiles and domains', () => {
    const ctx: DispatchContext = {
      snapshot: STUB_SNAPSHOT,
      changeType: 'feature',
      changedFiles: [],
      domains: [],
      allSignals: [],
      snapshotFreshness: 'fresh',
    };
    expect(ctx.changedFiles).toHaveLength(0);
    expect(ctx.domains).toHaveLength(0);
  });
});

describe('DispatchedSkill', () => {
  it('is structurally valid with all required fields', () => {
    const skill: DispatchedSkill = {
      name: 'harness-tdd',
      score: 0.85,
      urgency: 'recommended',
      reason: 'bugfix change + low-coverage signal',
      parallelSafe: true,
      estimatedImpact: 'medium',
    };
    expect(skill.name).toBe('harness-tdd');
    expect(skill.score).toBe(0.85);
    expect(skill.parallelSafe).toBe(true);
  });

  it('accepts optional dependsOn field', () => {
    const skill: DispatchedSkill = {
      name: 'harness-refactoring',
      score: 0.9,
      urgency: 'critical',
      reason: 'refactor change detected',
      parallelSafe: false,
      estimatedImpact: 'high',
      dependsOn: ['harness-enforce-architecture'],
    };
    expect(skill.dependsOn).toContain('harness-enforce-architecture');
  });

  it('accepts all three urgency levels', () => {
    const urgencies = ['critical', 'recommended', 'nice-to-have'] as const;
    for (const urgency of urgencies) {
      const skill: DispatchedSkill = {
        name: 'test-skill',
        score: 0.5,
        urgency,
        reason: 'test',
        parallelSafe: false,
        estimatedImpact: 'low',
      };
      expect(skill.urgency).toBe(urgency);
    }
  });

  it('accepts all three impact levels', () => {
    const impacts = ['high', 'medium', 'low'] as const;
    for (const estimatedImpact of impacts) {
      const skill: DispatchedSkill = {
        name: 'test-skill',
        score: 0.5,
        urgency: 'nice-to-have',
        reason: 'test',
        parallelSafe: false,
        estimatedImpact,
      };
      expect(skill.estimatedImpact).toBe(estimatedImpact);
    }
  });
});

describe('DispatchResult', () => {
  it('is structurally valid when all fields are present', () => {
    const result: DispatchResult = {
      context: {
        changeType: 'bugfix',
        domains: ['database'],
        signalCount: 3,
        snapshotFreshness: 'cached',
      },
      skills: [
        {
          name: 'harness-tdd',
          score: 0.85,
          urgency: 'recommended',
          reason: 'bugfix + low coverage',
          parallelSafe: true,
          estimatedImpact: 'medium',
        },
      ],
      generatedAt: '2026-04-06T00:00:00.000Z',
    };
    expect(result.context.changeType).toBe('bugfix');
    expect(result.context.snapshotFreshness).toBe('cached');
    expect(result.skills).toHaveLength(1);
    expect(result.generatedAt).toBeTruthy();
  });

  it('accepts empty skills array', () => {
    const result: DispatchResult = {
      context: {
        changeType: 'feature',
        domains: [],
        signalCount: 0,
        snapshotFreshness: 'fresh',
      },
      skills: [],
      generatedAt: '2026-04-06T00:00:00.000Z',
    };
    expect(result.skills).toHaveLength(0);
  });

  it('accepts both snapshotFreshness values', () => {
    for (const snapshotFreshness of ['fresh', 'cached'] as const) {
      const result: DispatchResult = {
        context: {
          changeType: 'feature',
          domains: [],
          signalCount: 0,
          snapshotFreshness,
        },
        skills: [],
        generatedAt: '2026-04-06T00:00:00.000Z',
      };
      expect(result.context.snapshotFreshness).toBe(snapshotFreshness);
    }
  });
});
