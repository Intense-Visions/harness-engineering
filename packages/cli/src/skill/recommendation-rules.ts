import type { SkillAddress } from './schema.js';

/**
 * Fallback address rules for bundled skills that do not yet declare
 * `addresses` in their skill.yaml. Skill-declared addresses take precedence
 * over these fallback entries.
 *
 * Keys use canonical short names (without "harness-" prefix). The lookup in
 * recommendation-engine.ts normalizes skill names by stripping the prefix
 * before consulting this map, so both "harness-tdd" and "tdd" resolve here.
 */
export const FALLBACK_RULES: Record<string, SkillAddress[]> = {
  'enforce-architecture': [
    { signal: 'circular-deps', hard: true },
    { signal: 'layer-violations', hard: true },
    { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
    { signal: 'high-coupling', metric: 'couplingRatio', threshold: 0.7, weight: 0.6 },
    { signal: 'change-feature', weight: 0.6 },
    { signal: 'domain-containerization', weight: 0.5 },
    { signal: 'domain-infrastructure-as-code', weight: 0.5 },
  ],
  'dependency-health': [
    { signal: 'high-coupling', metric: 'fanOut', threshold: 15, weight: 0.7 },
    { signal: 'anomaly-outlier', weight: 0.6 },
    { signal: 'articulation-point', weight: 0.5 },
  ],
  tdd: [
    { signal: 'low-coverage', weight: 0.9 },
    { signal: 'change-bugfix', weight: 0.9 },
  ],
  'codebase-cleanup': [
    { signal: 'dead-code', weight: 0.8 },
    { signal: 'drift', weight: 0.6 },
  ],
  'security-scan': [
    { signal: 'security-findings', hard: true },
    { signal: 'domain-secrets', weight: 0.8 },
  ],
  refactoring: [
    { signal: 'high-complexity', metric: 'cyclomaticComplexity', threshold: 15, weight: 0.8 },
    { signal: 'high-coupling', metric: 'couplingRatio', threshold: 0.5, weight: 0.6 },
    { signal: 'change-refactor', weight: 0.9 },
  ],
  'detect-doc-drift': [
    { signal: 'doc-gaps', weight: 0.7 },
    { signal: 'drift', weight: 0.5 },
    { signal: 'change-docs', weight: 0.8 },
    { signal: 'domain-api-design', weight: 0.6 },
  ],
  perf: [
    { signal: 'perf-regression', weight: 0.8 },
    { signal: 'domain-load-testing', weight: 0.7 },
  ],
  'supply-chain-audit': [
    { signal: 'security-findings', weight: 0.6 },
    { signal: 'domain-secrets', weight: 0.9 },
  ],
  'code-review': [
    { signal: 'high-complexity', weight: 0.5 },
    { signal: 'high-coupling', weight: 0.4 },
    { signal: 'change-feature', weight: 0.7 },
    { signal: 'change-bugfix', weight: 0.6 },
  ],
  integrity: [
    { signal: 'drift', weight: 0.7 },
    { signal: 'dead-code', weight: 0.5 },
    { signal: 'change-refactor', weight: 0.6 },
  ],
  'soundness-review': [
    { signal: 'layer-violations', weight: 0.6 },
    { signal: 'circular-deps', weight: 0.5 },
    { signal: 'change-feature', weight: 0.5 },
    { signal: 'change-refactor', weight: 0.5 },
  ],
  debugging: [
    { signal: 'perf-regression', weight: 0.5 },
    { signal: 'anomaly-outlier', weight: 0.6 },
    { signal: 'domain-incident-response', weight: 0.7 },
  ],
  'hotspot-detector': [
    { signal: 'high-complexity', metric: 'cyclomaticComplexity', threshold: 20, weight: 0.9 },
    { signal: 'anomaly-outlier', weight: 0.7 },
    { signal: 'articulation-point', weight: 0.8 },
  ],
  'cleanup-dead-code': [{ signal: 'dead-code', hard: true }],
};
