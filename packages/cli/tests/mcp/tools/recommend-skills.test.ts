import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recommendSkillsDefinition,
  handleRecommendSkills,
} from '../../../src/mcp/tools/recommend-skills.js';

// Mock dependencies
vi.mock('../../../src/skill/health-snapshot', () => ({
  captureHealthSnapshot: vi.fn(),
  loadCachedSnapshot: vi.fn(),
  isSnapshotFresh: vi.fn(),
}));

vi.mock('../../../src/skill/recommendation-engine', () => ({
  recommend: vi.fn(),
}));

vi.mock('../../../src/skill/index-builder', () => ({
  loadOrRebuildIndex: vi.fn(),
}));

vi.mock('../../../src/config/loader', () => ({
  resolveConfig: vi.fn(() => ({ ok: true, value: {} })),
}));

vi.mock('../../../src/skill/dispatcher', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/skill/dispatcher.js')>();
  return {
    ...actual,
    suggest: vi.fn(),
  };
});

import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../../../src/skill/health-snapshot';
import { recommend } from '../../../src/skill/recommendation-engine';
import { loadOrRebuildIndex } from '../../../src/skill/index-builder';
import { suggest } from '../../../src/skill/dispatcher';
import type { HealthSnapshot } from '../../../src/skill/health-snapshot';

const MOCK_SNAPSHOT: HealthSnapshot = {
  capturedAt: '2026-04-04T00:00:00.000Z',
  gitHead: 'abc1234',
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
    avgFanOut: 5,
    maxFanOut: 12,
    avgCyclomaticComplexity: 4,
    maxCyclomaticComplexity: 8,
    avgCouplingRatio: 0.3,
    testCoverage: 72,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
  },
  signals: ['circular-deps'],
};

const MOCK_RESULT = {
  recommendations: [
    {
      skillName: 'harness-enforce-architecture',
      score: 1.0,
      urgency: 'critical',
      reasons: ['Signal active'],
      sequence: 1,
      triggeredBy: ['circular-deps'],
    },
  ],
  snapshotAge: 'fresh',
  sequenceReasoning: 'Test reasoning.',
};

const MOCK_INDEX = {
  version: 1,
  hash: 'test',
  generatedAt: '2026-04-04',
  skills: {
    'harness-enforce-architecture': {
      tier: 1,
      description: 'Enforce',
      keywords: [],
      stackSignals: [],
      cognitiveMode: undefined,
      phases: [],
      source: 'bundled' as const,
      addresses: [],
      dependsOn: [],
    },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_INDEX);
  (recommend as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_RESULT);
  (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);
  (suggest as ReturnType<typeof vi.fn>).mockReturnValue({
    suggestions: [],
    autoInjectKnowledge: [],
  });
});

// ── Definition tests ──────────────────────────────────────────────

describe('recommend_skills definition', () => {
  it('has correct name', () => {
    expect(recommendSkillsDefinition.name).toBe('recommend_skills');
  });

  it('has path, noCache, and top properties', () => {
    const props = recommendSkillsDefinition.inputSchema.properties;
    expect(props).toHaveProperty('path');
    expect(props).toHaveProperty('noCache');
    expect(props).toHaveProperty('top');
  });

  it('has no required parameters', () => {
    expect(recommendSkillsDefinition.inputSchema.required).toEqual([]);
  });
});

// ── Handler tests ─────────────────────────────────────────────────

describe('handleRecommendSkills', () => {
  it('returns MCP content shape with JSON result', async () => {
    const result = await handleRecommendSkills({ path: '/tmp/test', noCache: true });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('recommendations');
    expect(parsed).toHaveProperty('snapshotAge');
    expect(parsed).toHaveProperty('sequenceReasoning');
  });

  it('uses cached snapshot when fresh', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await handleRecommendSkills({ path: '/tmp/test' });

    expect(captureHealthSnapshot).not.toHaveBeenCalled();
    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 5 });
  });

  it('forces fresh snapshot when noCache is true', async () => {
    await handleRecommendSkills({ path: '/tmp/test', noCache: true });

    expect(loadCachedSnapshot).not.toHaveBeenCalled();
    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });

  it('passes top parameter to recommend()', async () => {
    await handleRecommendSkills({ path: '/tmp/test', noCache: true, top: 3 });

    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 3 });
  });

  it('defaults to cwd when path not provided', async () => {
    await handleRecommendSkills({});

    expect(captureHealthSnapshot).toHaveBeenCalledWith(process.cwd());
  });
});

// ── Knowledge skill wiring tests ──────────────────────────────────

describe('handleRecommendSkills — knowledge skill wiring', () => {
  it('includes autoInjectKnowledge in formatted output when suggest() returns knowledge skills', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (suggest as ReturnType<typeof vi.fn>).mockReturnValue({
      suggestions: [],
      autoInjectKnowledge: [
        {
          name: 'react-hooks-pattern',
          score: 0.85,
          reason: 'paths match: **/*.tsx',
        },
      ],
    });

    const result = await handleRecommendSkills({
      path: '/tmp/test',
      recentFiles: ['src/App.tsx'],
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('autoInjectKnowledge');
    expect(Array.isArray(parsed.autoInjectKnowledge)).toBe(true);
  });

  it('includes empty autoInjectKnowledge when no recentFiles provided', async () => {
    (suggest as ReturnType<typeof vi.fn>).mockReturnValue({
      suggestions: [],
      autoInjectKnowledge: [],
    });

    const result = await handleRecommendSkills({ path: '/tmp/test', noCache: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('autoInjectKnowledge');
    expect(parsed.autoInjectKnowledge).toEqual([]);
  });
});

// ── E2E scoring tests ─────────────────────────────────────────────

describe('E2E: .tsx file editing surfaces React knowledge skills', () => {
  it('scoreSkill with recentFiles=[*.tsx] scores react-hooks-pattern above 0.40 threshold', async () => {
    const { scoreSkill } = await import('../../../src/skill/dispatcher.js');

    const reactHooksEntry = {
      name: 'react-hooks-pattern',
      type: 'knowledge' as const,
      tier: 3,
      description: 'Reuse stateful logic across components via custom hooks',
      keywords: ['hooks', 'custom-hooks', 'stateful-logic', 'composition'],
      stackSignals: ['react', 'typescript'],
      paths: ['**/*.tsx', '**/*.jsx'],
      relatedSkills: [],
      addresses: [],
      dependsOn: [],
      cognitiveMode: 'advisory-guide',
      phases: [],
      source: 'community' as const,
    };

    const recentFiles = ['src/App.tsx', 'src/components/Button.tsx'];
    // Include 'hooks' to match keyword, plus tsx file triggers paths score of 0.20
    const queryTerms = ['hooks', 'component', 'stateful'];

    const score = scoreSkill(reactHooksEntry, queryTerms, null, recentFiles, 'react-hooks-pattern');

    // paths score: 0.20 (tsx match) + keyword score (hooks/stateful match) + desc score
    // Should exceed recommendation threshold of 0.40
    expect(score).toBeGreaterThan(0.4);
  });

  it('scoreSkill with recentFiles=[*.py] scores react-hooks-pattern below 0.40 threshold', async () => {
    const { scoreSkill } = await import('../../../src/skill/dispatcher.js');

    const reactHooksEntry = {
      name: 'react-hooks-pattern',
      type: 'knowledge' as const,
      tier: 3,
      description: 'Reuse stateful logic across components via custom hooks',
      keywords: ['hooks', 'custom-hooks', 'stateful-logic', 'composition'],
      stackSignals: ['react', 'typescript'],
      paths: ['**/*.tsx', '**/*.jsx'],
      relatedSkills: [],
      addresses: [],
      dependsOn: [],
      cognitiveMode: 'advisory-guide',
      phases: [],
      source: 'community' as const,
    };

    const recentFiles = ['scripts/process.py', 'data/input.csv'];
    const queryTerms = ['data', 'processing', 'script'];

    const score = scoreSkill(reactHooksEntry, queryTerms, null, recentFiles, 'react-hooks-pattern');

    // No paths match, no keyword match, no stack match
    expect(score).toBeLessThan(0.4);
  });
});
