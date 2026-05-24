/**
 * Spec B Phase 0 — typecheck-only fixture.
 *
 * This file is NOT executed at runtime. It is excluded from the
 * package's runtime build (see `tsconfig.build.json` `exclude`) and
 * compiled as part of `pnpm --filter @harness-engineering/types
 * typecheck` only. A failure to compile here is a regression on the
 * Spec B Phase 0 surface contract.
 */
import type {
  RoutingConfig,
  RoutingUseCase,
  RoutingValue,
  RoutingDecision,
  ResolutionStep,
  ResolutionSource,
  IssueRoutingDecision,
} from '../index';

// --- 1. RoutingValue accepts scalar AND non-empty chain ---
const _scalar: RoutingValue = 'claude-opus';
const _chain: RoutingValue = ['local-fast', 'claude-sonnet'] as const;
void _scalar;
void _chain;

// --- 2. RoutingConfig: every scalar field accepts scalar form ---
const _cfgScalar: RoutingConfig = {
  default: 'claude-opus',
  'quick-fix': 'local-fast',
  'guided-change': 'claude-sonnet',
  'full-exploration': 'claude-opus',
  diagnostic: 'claude-sonnet',
  intelligence: { sel: 'local-fast', pesl: 'claude-opus' },
  isolation: { none: 'local-fast', container: 'local-fast', 'remote-sandbox': 'claude-opus' },
};
void _cfgScalar;

// --- 3. RoutingConfig: every scalar field accepts array form ---
const _cfgArray: RoutingConfig = {
  default: ['claude-opus'] as const,
  'quick-fix': ['local-fast', 'claude-sonnet'] as const,
  'guided-change': ['claude-sonnet'] as const,
  'full-exploration': ['claude-opus'] as const,
  diagnostic: ['claude-sonnet'] as const,
  intelligence: {
    sel: ['local-fast', 'claude-sonnet'] as const,
    pesl: ['claude-opus'] as const,
  },
  isolation: {
    none: ['local-fast'] as const,
    container: ['local-fast'] as const,
    'remote-sandbox': ['claude-opus'] as const,
  },
};
void _cfgArray;

// --- 4. RoutingConfig: optional skills + modes maps with mixed scalar/chain ---
const _cfgSpecB: RoutingConfig = {
  default: 'claude-opus',
  skills: {
    'harness-debugging': ['local-fast', 'claude-sonnet'] as const,
    'harness-soundness-review': 'claude-opus',
  },
  modes: {
    'adversarial-reviewer': ['local-fast', 'claude-sonnet'] as const,
    'constructive-architect': 'claude-opus',
  },
};
void _cfgSpecB;

// --- 5. RoutingUseCase: new skill + mode variants are constructible ---
const _ucSkill: RoutingUseCase = {
  kind: 'skill',
  skillName: 'harness-debugging',
  cognitiveMode: 'adversarial-reviewer',
};
const _ucSkillNoMode: RoutingUseCase = {
  kind: 'skill',
  skillName: 'harness-brainstorming',
};
const _ucMode: RoutingUseCase = { kind: 'mode', cognitiveMode: 'meticulous-implementer' };
void _ucSkill;
void _ucSkillNoMode;
void _ucMode;

// --- 6. RoutingDecision (new shape) and its sub-types are constructible ---
const _step: ResolutionStep = {
  source: 'skill' satisfies ResolutionSource,
  candidate: 'local-fast',
  outcome: 'chosen',
};
const _decision: RoutingDecision = {
  timestamp: '2026-05-24T00:00:00.000Z',
  useCase: _ucSkill,
  resolutionPath: [_step],
  backendName: 'local-fast',
  backendType: 'local',
  durationMs: 0.42,
};
void _decision;

// --- 7. IssueRoutingDecision: pre-Spec-B name is still available ---
const _issueDecision: IssueRoutingDecision = { action: 'dispatch-local' };
void _issueDecision;
