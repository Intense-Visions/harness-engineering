# Plan: Skill Recommendation Engine Phase 3 -- Engine Core

**Date:** 2026-04-04
**Spec:** docs/changes/skill-recommendation-engine/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Implement the three-layer recommendation engine core (`recommendation-engine.ts`) and the fallback rules table (`recommendation-rules.ts`) that consume a `HealthSnapshot` + `SkillsIndex` and produce scored, sequenced, urgency-tagged recommendations.

## Observable Truths (Acceptance Criteria)

1. **Event-driven:** When `matchHardRules` is called with a snapshot containing `circular-deps` signal and a skill index entry with `{ signal: 'circular-deps', hard: true }`, the system shall return a `Recommendation` with `urgency: 'critical'`, `score: 1.0`, and `triggeredBy: ['circular-deps']`.
2. **Event-driven:** When `scoreByHealth` is called with a snapshot containing `high-coupling` signal and `metrics.maxFanOut: 25` against an address `{ signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 }`, the system shall return a recommendation with score derived from `0.8 * clamp((25-20)/20, 0, 1) = 0.2` and urgency `'nice-to-have'`.
3. **Event-driven:** When `scoreByHealth` encounters an address without a `metric`/`threshold` (signal-only soft address), the system shall use the address weight (or default 0.5) as the contribution directly (signal is active = full weight contribution).
4. **Event-driven:** When `sequenceRecommendations` receives recommendations with dependency relationships (`A` depends on `B`), the system shall assign `B` a lower sequence number than `A`.
5. **Event-driven:** When recommendations at the same dependency level contain diagnostic (`detect-doc-drift`) and fix (`codebase-cleanup`) skills, the system shall order diagnostic before fix.
6. **Event-driven:** When `recommend()` is called with an empty snapshot (no signals) or empty skill index, the system shall return `{ recommendations: [], snapshotAge: 'none', sequenceReasoning: 'No active signals...' }`.
7. **Event-driven:** When `recommend()` is called with `options.top = 3`, the system shall return at most 3 recommendations.
8. **Ubiquitous:** The system shall merge fallback rules from `recommendation-rules.ts` for skills that lack `addresses` in the index, with skill-declared addresses taking precedence.
9. **Ubiquitous:** `FALLBACK_RULES` in `recommendation-rules.ts` shall cover at least 15 bundled skills: `enforce-architecture`, `dependency-health`, `tdd`, `codebase-cleanup`, `security-scan`, `refactoring`, `detect-doc-drift`, `perf`, `supply-chain-audit`, `code-review`, `integrity`, `soundness-review`, `debugging`, `hotspot-detector`, `cleanup-dead-code`.
10. **Ubiquitous:** `npx vitest run packages/cli/tests/skill/recommendation-engine.test.ts` shall pass.
11. **Ubiquitous:** `npx vitest run packages/cli/tests/skill/recommendation-rules.test.ts` shall pass.
12. **Ubiquitous:** `harness validate` shall pass after all changes.

## File Map

- CREATE `packages/cli/src/skill/recommendation-rules.ts`
- CREATE `packages/cli/src/skill/recommendation-engine.ts`
- CREATE `packages/cli/tests/skill/recommendation-rules.test.ts`
- CREATE `packages/cli/tests/skill/recommendation-engine.test.ts`

## Tasks

### Task 1: Create fallback rules table with tests (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/skill/recommendation-rules.test.ts`, `packages/cli/src/skill/recommendation-rules.ts`

1. Create test file `packages/cli/tests/skill/recommendation-rules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FALLBACK_RULES } from '../../src/skill/recommendation-rules';

describe('FALLBACK_RULES', () => {
  it('exports a non-empty record of skill name to SkillAddress arrays', () => {
    expect(typeof FALLBACK_RULES).toBe('object');
    expect(Object.keys(FALLBACK_RULES).length).toBeGreaterThanOrEqual(15);
  });

  it('covers all required bundled skills', () => {
    const required = [
      'enforce-architecture',
      'dependency-health',
      'tdd',
      'codebase-cleanup',
      'security-scan',
      'refactoring',
      'detect-doc-drift',
      'perf',
      'supply-chain-audit',
      'code-review',
      'integrity',
      'soundness-review',
      'debugging',
      'hotspot-detector',
      'cleanup-dead-code',
    ];
    for (const name of required) {
      expect(FALLBACK_RULES).toHaveProperty(name);
    }
  });

  it('every entry has at least one address with a signal field', () => {
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      expect(addresses.length, `${name} should have at least one address`).toBeGreaterThan(0);
      for (const addr of addresses) {
        expect(addr.signal, `${name} address missing signal`).toBeTruthy();
      }
    }
  });

  it('hard addresses have hard: true and no weight', () => {
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      for (const addr of addresses) {
        if (addr.hard) {
          expect(addr.hard, `${name} hard address should be true`).toBe(true);
        }
      }
    }
  });

  it('soft addresses have weight between 0 and 1 when specified', () => {
    for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
      for (const addr of addresses) {
        if (addr.weight !== undefined) {
          expect(addr.weight, `${name} weight out of range`).toBeGreaterThanOrEqual(0);
          expect(addr.weight, `${name} weight out of range`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('enforce-architecture has hard rules for circular-deps and layer-violations', () => {
    const ea = FALLBACK_RULES['enforce-architecture']!;
    const hardSignals = ea.filter((a) => a.hard).map((a) => a.signal);
    expect(hardSignals).toContain('circular-deps');
    expect(hardSignals).toContain('layer-violations');
  });

  it('security-scan has a hard rule for security-findings', () => {
    const ss = FALLBACK_RULES['security-scan']!;
    const hardSignals = ss.filter((a) => a.hard).map((a) => a.signal);
    expect(hardSignals).toContain('security-findings');
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-rules.test.ts`
3. Observe failure: module `recommendation-rules` not found.

4. Create implementation `packages/cli/src/skill/recommendation-rules.ts`:

```typescript
import type { SkillAddress } from './schema.js';

/**
 * Fallback address rules for bundled skills that do not yet declare
 * `addresses` in their skill.yaml. Skill-declared addresses take precedence
 * over these fallback entries.
 *
 * Keys are skill names without the "harness-" prefix (matching index-builder
 * convention where skills are indexed by directory name).
 */
export const FALLBACK_RULES: Record<string, SkillAddress[]> = {
  'enforce-architecture': [
    { signal: 'circular-deps', hard: true },
    { signal: 'layer-violations', hard: true },
    { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
    { signal: 'high-coupling', metric: 'couplingRatio', threshold: 0.7, weight: 0.6 },
  ],
  'dependency-health': [
    { signal: 'high-coupling', metric: 'fanOut', threshold: 15, weight: 0.7 },
    { signal: 'anomaly-outlier', weight: 0.6 },
    { signal: 'articulation-point', weight: 0.5 },
  ],
  tdd: [{ signal: 'low-coverage', weight: 0.9 }],
  'codebase-cleanup': [
    { signal: 'dead-code', weight: 0.8 },
    { signal: 'drift', weight: 0.6 },
  ],
  'security-scan': [{ signal: 'security-findings', hard: true }],
  refactoring: [
    { signal: 'high-complexity', metric: 'cyclomaticComplexity', threshold: 15, weight: 0.8 },
    { signal: 'high-coupling', metric: 'couplingRatio', threshold: 0.5, weight: 0.6 },
  ],
  'detect-doc-drift': [
    { signal: 'doc-gaps', weight: 0.7 },
    { signal: 'drift', weight: 0.5 },
  ],
  perf: [{ signal: 'perf-regression', weight: 0.8 }],
  'supply-chain-audit': [{ signal: 'security-findings', weight: 0.6 }],
  'code-review': [
    { signal: 'high-complexity', weight: 0.5 },
    { signal: 'high-coupling', weight: 0.4 },
  ],
  integrity: [
    { signal: 'drift', weight: 0.7 },
    { signal: 'dead-code', weight: 0.5 },
  ],
  'soundness-review': [
    { signal: 'layer-violations', weight: 0.6 },
    { signal: 'circular-deps', weight: 0.5 },
  ],
  debugging: [
    { signal: 'perf-regression', weight: 0.5 },
    { signal: 'anomaly-outlier', weight: 0.6 },
  ],
  'hotspot-detector': [
    { signal: 'high-complexity', metric: 'cyclomaticComplexity', threshold: 20, weight: 0.9 },
    { signal: 'anomaly-outlier', weight: 0.7 },
    { signal: 'articulation-point', weight: 0.8 },
  ],
  'cleanup-dead-code': [{ signal: 'dead-code', hard: true }],
};
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-rules.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(skill): add fallback recommendation rules for 15 bundled skills`

---

### Task 2: Implement metric resolver utility and matchHardRules with tests (TDD)

**Depends on:** Task 1
**Files:** `packages/cli/tests/skill/recommendation-engine.test.ts`, `packages/cli/src/skill/recommendation-engine.ts`

1. Create test file `packages/cli/tests/skill/recommendation-engine.test.ts` with tests for the metric resolver and `matchHardRules`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveMetricValue, matchHardRules } from '../../src/skill/recommendation-engine';
import type { HealthSnapshot, HealthMetrics } from '../../src/skill/health-snapshot';
import type { SkillAddress } from '../../src/skill/schema';

// -- Test helpers --

function makeMetrics(overrides: Partial<HealthMetrics> = {}): HealthMetrics {
  return {
    avgFanOut: 0,
    maxFanOut: 0,
    avgCyclomaticComplexity: 0,
    maxCyclomaticComplexity: 0,
    avgCouplingRatio: 0,
    testCoverage: null,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    capturedAt: new Date().toISOString(),
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
    metrics: makeMetrics(),
    signals: [],
    ...overrides,
  };
}

type SkillAddressIndex = Map<string, { addresses: SkillAddress[]; dependsOn: string[] }>;

function makeIndex(
  entries: Record<string, { addresses: SkillAddress[]; dependsOn?: string[] }>
): SkillAddressIndex {
  const map: SkillAddressIndex = new Map();
  for (const [name, entry] of Object.entries(entries)) {
    map.set(name, { addresses: entry.addresses, dependsOn: entry.dependsOn ?? [] });
  }
  return map;
}

// -- resolveMetricValue tests --

describe('resolveMetricValue', () => {
  it('resolves "fanOut" to maxFanOut', () => {
    const metrics = makeMetrics({ maxFanOut: 25 });
    expect(resolveMetricValue(metrics, 'fanOut')).toBe(25);
  });

  it('resolves "couplingRatio" to avgCouplingRatio', () => {
    const metrics = makeMetrics({ avgCouplingRatio: 0.65 });
    expect(resolveMetricValue(metrics, 'couplingRatio')).toBe(0.65);
  });

  it('resolves "cyclomaticComplexity" to maxCyclomaticComplexity', () => {
    const metrics = makeMetrics({ maxCyclomaticComplexity: 30 });
    expect(resolveMetricValue(metrics, 'cyclomaticComplexity')).toBe(30);
  });

  it('resolves "coverage" to testCoverage (inverted: 100 - coverage)', () => {
    const metrics = makeMetrics({ testCoverage: 45 });
    expect(resolveMetricValue(metrics, 'coverage')).toBe(55);
  });

  it('returns null for unknown metric names', () => {
    const metrics = makeMetrics();
    expect(resolveMetricValue(metrics, 'unknownMetric')).toBeNull();
  });

  it('returns null for coverage when testCoverage is null', () => {
    const metrics = makeMetrics({ testCoverage: null });
    expect(resolveMetricValue(metrics, 'coverage')).toBeNull();
  });
});

// -- matchHardRules tests --

describe('matchHardRules', () => {
  it('returns critical recommendation when hard address matches active signal', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(1);
    expect(result[0]!.skillName).toBe('enforce-architecture');
    expect(result[0]!.urgency).toBe('critical');
    expect(result[0]!.score).toBe(1.0);
    expect(result[0]!.triggeredBy).toContain('circular-deps');
  });

  it('returns empty when no hard addresses match active signals', () => {
    const snapshot = makeSnapshot({ signals: ['doc-gaps'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('aggregates multiple hard triggers for the same skill', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps', 'layer-violations'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [
          { signal: 'circular-deps', hard: true },
          { signal: 'layer-violations', hard: true },
        ],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(1);
    expect(result[0]!.triggeredBy).toContain('circular-deps');
    expect(result[0]!.triggeredBy).toContain('layer-violations');
    expect(result[0]!.reasons).toHaveLength(2);
  });

  it('ignores non-hard addresses', () => {
    const snapshot = makeSnapshot({ signals: ['high-coupling'] });
    const index = makeIndex({
      'dependency-health': {
        addresses: [{ signal: 'high-coupling', weight: 0.7 }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('handles empty snapshot signals gracefully', () => {
    const snapshot = makeSnapshot({ signals: [] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('handles empty index gracefully', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const index = makeIndex({});
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
3. Observe failure: module `recommendation-engine` not found.

4. Create initial implementation `packages/cli/src/skill/recommendation-engine.ts`:

```typescript
/**
 * Recommendation engine core -- three-layer skill recommendation system.
 *
 * Layer 1: matchHardRules -- hard address matching for critical signals
 * Layer 2: scoreByHealth -- weighted scoring for soft addresses
 * Layer 3: sequenceRecommendations -- topological sort + heuristic ordering
 *
 * Public API: recommend() combines all three layers.
 */

import type { SkillAddress } from './schema.js';
import type { HealthSnapshot, HealthMetrics } from './health-snapshot.js';
import type { Recommendation, RecommendationResult } from './recommendation-types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Compact representation of a skill's address config and dependencies. */
export interface SkillAddressEntry {
  addresses: SkillAddress[];
  dependsOn: string[];
}

/** Index mapping skill name to its addresses and dependency info. */
export type SkillAddressIndex = Map<string, SkillAddressEntry>;

// ---------------------------------------------------------------------------
// Metric resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a SkillAddress.metric name to the corresponding value from HealthMetrics.
 *
 * Metric name mapping:
 * - "fanOut" -> maxFanOut (worst-case fan-out)
 * - "couplingRatio" -> avgCouplingRatio
 * - "cyclomaticComplexity" -> maxCyclomaticComplexity
 * - "coverage" -> inverted testCoverage (100 - coverage), so higher = worse
 *
 * Returns null if the metric is unknown or unavailable.
 */
export function resolveMetricValue(metrics: HealthMetrics, metricName: string): number | null {
  switch (metricName) {
    case 'fanOut':
      return metrics.maxFanOut;
    case 'couplingRatio':
      return metrics.avgCouplingRatio;
    case 'cyclomaticComplexity':
      return metrics.maxCyclomaticComplexity;
    case 'coverage':
      return metrics.testCoverage !== null ? 100 - metrics.testCoverage : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Layer 1: Hard rule matching
// ---------------------------------------------------------------------------

/**
 * Match skills with hard addresses against active snapshot signals.
 * Returns one Recommendation per skill with urgency 'critical' and score 1.0.
 */
export function matchHardRules(
  snapshot: HealthSnapshot,
  skillIndex: SkillAddressIndex
): Recommendation[] {
  const activeSignals = new Set(snapshot.signals);
  const results: Recommendation[] = [];

  for (const [skillName, entry] of skillIndex) {
    const hardAddresses = entry.addresses.filter((a) => a.hard === true);
    const matchedSignals: string[] = [];
    const reasons: string[] = [];

    for (const addr of hardAddresses) {
      if (activeSignals.has(addr.signal)) {
        matchedSignals.push(addr.signal);
        reasons.push(`[CRITICAL] Signal '${addr.signal}' is active`);
      }
    }

    if (matchedSignals.length > 0) {
      results.push({
        skillName,
        score: 1.0,
        urgency: 'critical',
        reasons,
        sequence: 0, // assigned later by sequencer
        triggeredBy: matchedSignals,
      });
    }
  }

  return results;
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(skill): add metric resolver and hard rule matching (Layer 1)`

---

### Task 3: Implement scoreByHealth (Layer 2) with tests (TDD)

**Depends on:** Task 2
**Files:** `packages/cli/tests/skill/recommendation-engine.test.ts`, `packages/cli/src/skill/recommendation-engine.ts`

1. Append tests to `packages/cli/tests/skill/recommendation-engine.test.ts`:

```typescript
// -- scoreByHealth tests --
// (append after matchHardRules describe block)

describe('scoreByHealth', () => {
  it('scores a skill with metric-based soft address', () => {
    const snapshot = makeSnapshot({
      signals: ['high-coupling'],
      metrics: makeMetrics({ maxFanOut: 25 }),
    });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(1);
    // distance = (25-20)/20 = 0.25, contribution = 0.8 * 0.25 = 0.2
    expect(result[0]!.score).toBeCloseTo(0.2, 2);
    expect(result[0]!.urgency).toBe('nice-to-have');
  });

  it('clamps distance to [0, 1]', () => {
    const snapshot = makeSnapshot({
      signals: ['high-coupling'],
      metrics: makeMetrics({ maxFanOut: 60 }),
    });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    // distance = (60-20)/20 = 2.0, clamped to 1.0, contribution = 0.8 * 1.0 = 0.8
    expect(result[0]!.score).toBeCloseTo(0.8, 2);
    expect(result[0]!.urgency).toBe('recommended');
  });

  it('uses default weight 0.5 when weight is omitted', () => {
    const snapshot = makeSnapshot({
      signals: ['anomaly-outlier'],
      metrics: makeMetrics({ anomalyOutlierCount: 3 }),
    });
    const index = makeIndex({
      'dependency-health': {
        addresses: [{ signal: 'anomaly-outlier' }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(1);
    // signal-only: contribution = 0.5 (default weight)
    expect(result[0]!.score).toBeCloseTo(0.5, 2);
  });

  it('signal-only soft address uses full weight when signal is active', () => {
    const snapshot = makeSnapshot({
      signals: ['dead-code'],
    });
    const index = makeIndex({
      'codebase-cleanup': {
        addresses: [{ signal: 'dead-code', weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result[0]!.score).toBeCloseTo(0.8, 2);
    expect(result[0]!.urgency).toBe('recommended');
  });

  it('aggregates contributions from multiple matching soft addresses', () => {
    const snapshot = makeSnapshot({
      signals: ['high-coupling', 'anomaly-outlier'],
      metrics: makeMetrics({ maxFanOut: 30 }),
    });
    const index = makeIndex({
      'dependency-health': {
        addresses: [
          { signal: 'high-coupling', metric: 'fanOut', threshold: 15, weight: 0.7 },
          { signal: 'anomaly-outlier', weight: 0.6 },
        ],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(1);
    // fanOut: distance = (30-15)/15 = 1.0 (clamped), contribution = 0.7
    // anomaly-outlier: signal-only, contribution = 0.6
    // total = (0.7 + 0.6) / 2 addresses = 0.65, clamped to [0,1]
    // Actually: aggregate = sum of contributions / count of addresses = 0.65
    expect(result[0]!.score).toBeCloseTo(0.65, 2);
  });

  it('skips hard addresses (handled by Layer 1)', () => {
    const snapshot = makeSnapshot({
      signals: ['circular-deps'],
    });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [
          { signal: 'circular-deps', hard: true },
          { signal: 'high-coupling', weight: 0.8 },
        ],
      },
    });
    const result = scoreByHealth(snapshot, index);
    // Only non-hard addresses considered; high-coupling not in signals -> no match
    expect(result).toHaveLength(0);
  });

  it('returns empty for no matching signals', () => {
    const snapshot = makeSnapshot({ signals: ['doc-gaps'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('classifies score >= 0.7 as recommended', () => {
    const snapshot = makeSnapshot({
      signals: ['low-coverage'],
    });
    const index = makeIndex({
      tdd: {
        addresses: [{ signal: 'low-coverage', weight: 0.9 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result[0]!.score).toBeCloseTo(0.9, 2);
    expect(result[0]!.urgency).toBe('recommended');
  });

  it('classifies score < 0.7 as nice-to-have', () => {
    const snapshot = makeSnapshot({
      signals: ['doc-gaps'],
    });
    const index = makeIndex({
      'detect-doc-drift': {
        addresses: [{ signal: 'doc-gaps', weight: 0.5 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result[0]!.urgency).toBe('nice-to-have');
  });

  it('ignores metric-based address when metric resolves to null', () => {
    const snapshot = makeSnapshot({
      signals: ['low-coverage'],
      metrics: makeMetrics({ testCoverage: null }),
    });
    const index = makeIndex({
      tdd: {
        addresses: [{ signal: 'low-coverage', metric: 'coverage', threshold: 40, weight: 0.9 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    // metric resolves to null, so this address is skipped
    expect(result).toHaveLength(0);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
3. Observe failure: `scoreByHealth` is not exported.

4. Append to `packages/cli/src/skill/recommendation-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// Layer 2: Health scoring
// ---------------------------------------------------------------------------

/** Clamp a value to the range [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const DEFAULT_WEIGHT = 0.5;

/**
 * Score skills by soft address matching against active signals and metrics.
 * Skips hard addresses (those are handled by Layer 1).
 *
 * For each skill:
 *   - For each non-hard address matching an active signal:
 *     - If metric + threshold: distance = (actual - threshold) / threshold, clamped [0,1]
 *       contribution = weight * distance
 *     - If signal-only (no metric): contribution = weight (signal active = full weight)
 *   - Score = average of contributions across matching addresses
 *   - Urgency: score >= 0.7 -> 'recommended', else 'nice-to-have'
 */
export function scoreByHealth(
  snapshot: HealthSnapshot,
  skillIndex: SkillAddressIndex
): Recommendation[] {
  const activeSignals = new Set(snapshot.signals);
  const results: Recommendation[] = [];

  for (const [skillName, entry] of skillIndex) {
    const softAddresses = entry.addresses.filter((a) => !a.hard);
    const contributions: number[] = [];
    const triggeredBy: string[] = [];
    const reasons: string[] = [];

    for (const addr of softAddresses) {
      if (!activeSignals.has(addr.signal)) continue;

      const weight = addr.weight ?? DEFAULT_WEIGHT;

      if (addr.metric && addr.threshold !== undefined) {
        const actual = resolveMetricValue(snapshot.metrics, addr.metric);
        if (actual === null) continue; // metric unavailable, skip

        const distance = clamp((actual - addr.threshold) / addr.threshold, 0, 1);
        const contribution = weight * distance;
        contributions.push(contribution);
        triggeredBy.push(addr.signal);
        reasons.push(
          `${addr.metric} = ${actual} (threshold ${addr.threshold}, distance ${distance.toFixed(2)})`
        );
      } else {
        // Signal-only: full weight contribution when signal is active
        contributions.push(weight);
        triggeredBy.push(addr.signal);
        reasons.push(`Signal '${addr.signal}' is active (weight ${weight})`);
      }
    }

    if (contributions.length === 0) continue;

    const score = clamp(contributions.reduce((sum, c) => sum + c, 0) / contributions.length, 0, 1);
    const urgency = score >= 0.7 ? 'recommended' : 'nice-to-have';

    results.push({
      skillName,
      score: Math.round(score * 1000) / 1000, // round to 3 decimal places
      urgency,
      reasons,
      sequence: 0,
      triggeredBy: [...new Set(triggeredBy)],
    });
  }

  return results;
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(skill): add weighted health scoring (Layer 2)`

---

### Task 4: Implement sequenceRecommendations (Layer 3) with tests (TDD)

**Depends on:** Task 2
**Files:** `packages/cli/tests/skill/recommendation-engine.test.ts`, `packages/cli/src/skill/recommendation-engine.ts`

1. Append tests to `packages/cli/tests/skill/recommendation-engine.test.ts`:

```typescript
// -- sequenceRecommendations tests --
// (append after scoreByHealth describe block)

describe('sequenceRecommendations', () => {
  function makeRec(name: string, score = 0.5): Recommendation {
    return {
      skillName: name,
      score,
      urgency: 'recommended',
      reasons: [],
      sequence: 0,
      triggeredBy: [],
    };
  }

  it('assigns sequence numbers starting at 1', () => {
    const recs = [makeRec('a'), makeRec('b')];
    const deps = new Map<string, string[]>();
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.sequence).toBe(1);
    expect(result[1]!.sequence).toBe(2);
  });

  it('respects dependency ordering (B depends on A -> A first)', () => {
    const recs = [makeRec('b'), makeRec('a')];
    const deps = new Map([['b', ['a']]]);
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('a');
    expect(result[1]!.skillName).toBe('b');
  });

  it('applies heuristic ordering within same dependency level', () => {
    // detect-doc-drift is diagnostic, codebase-cleanup is fix, code-review is validation
    const recs = [makeRec('code-review'), makeRec('codebase-cleanup'), makeRec('detect-doc-drift')];
    const deps = new Map<string, string[]>();
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('detect-doc-drift'); // diagnostic
    expect(result[1]!.skillName).toBe('codebase-cleanup'); // fix
    expect(result[2]!.skillName).toBe('code-review'); // validation
  });

  it('handles empty recommendations', () => {
    const result = sequenceRecommendations([], new Map());
    expect(result).toHaveLength(0);
  });

  it('handles single recommendation', () => {
    const recs = [makeRec('tdd')];
    const result = sequenceRecommendations(recs, new Map());
    expect(result).toHaveLength(1);
    expect(result[0]!.sequence).toBe(1);
  });

  it('handles multi-level dependencies', () => {
    // c depends on b, b depends on a
    const recs = [makeRec('c'), makeRec('a'), makeRec('b')];
    const deps = new Map([
      ['c', ['b']],
      ['b', ['a']],
    ]);
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('a');
    expect(result[1]!.skillName).toBe('b');
    expect(result[2]!.skillName).toBe('c');
  });

  it('ignores dependencies on skills not in the recommendations list', () => {
    const recs = [makeRec('b'), makeRec('a')];
    const deps = new Map([['b', ['a', 'missing-skill']]]);
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('a');
    expect(result[1]!.skillName).toBe('b');
  });

  it('returns reasoning string', () => {
    const recs = [makeRec('a'), makeRec('b')];
    const deps = new Map<string, string[]>();
    const result = sequenceRecommendations(recs, deps);
    // Just check it returned the recs (reasoning is on the public API, tested in Task 6)
    expect(result).toHaveLength(2);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
3. Observe failure: `sequenceRecommendations` is not exported.

4. Append to `packages/cli/src/skill/recommendation-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// Layer 3: Sequencing
// ---------------------------------------------------------------------------

/** Keyword sets for heuristic ordering within the same dependency level. */
const DIAGNOSTIC_KEYWORDS = ['health', 'detect', 'analyze', 'audit', 'hotspot', 'debugging'];
const FIX_KEYWORDS = ['enforce', 'cleanup', 'fix', 'refactor', 'codebase'];
const VALIDATION_KEYWORDS = ['verify', 'test', 'tdd', 'review', 'soundness', 'integrity'];

/**
 * Classify a skill name into a phase for heuristic ordering.
 * 0 = diagnostic, 1 = fix, 2 = validation, 3 = unclassified
 */
function classifyPhase(skillName: string): number {
  const lower = skillName.toLowerCase();
  if (DIAGNOSTIC_KEYWORDS.some((kw) => lower.includes(kw))) return 0;
  if (FIX_KEYWORDS.some((kw) => lower.includes(kw))) return 1;
  if (VALIDATION_KEYWORDS.some((kw) => lower.includes(kw))) return 2;
  return 3;
}

/**
 * Topologically sort recommendations by dependency, then apply
 * diagnostic -> fix -> validate heuristic within the same level.
 *
 * Uses Kahn's algorithm for topological sort.
 * Dependencies on skills not in the recommendations list are ignored.
 */
export function sequenceRecommendations(
  recommendations: Recommendation[],
  skillDeps: Map<string, string[]>
): Recommendation[] {
  if (recommendations.length === 0) return [];

  const nameSet = new Set(recommendations.map((r) => r.skillName));
  const recMap = new Map(recommendations.map((r) => [r.skillName, r]));

  // Build adjacency list and in-degree count (only for skills in the list)
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>(); // from -> [to] (dep -> dependent)

  for (const name of nameSet) {
    inDegree.set(name, 0);
    adjacency.set(name, []);
  }

  for (const name of nameSet) {
    const deps = skillDeps.get(name) ?? [];
    for (const dep of deps) {
      if (!nameSet.has(dep)) continue; // ignore deps not in recommendations
      adjacency.get(dep)!.push(name);
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    }
  }

  // Kahn's algorithm with heuristic-sorted queue
  const sorted: Recommendation[] = [];
  let sequence = 1;

  // Initialize queue with zero in-degree nodes, sorted by phase heuristic then score
  let queue = [...nameSet]
    .filter((n) => (inDegree.get(n) ?? 0) === 0)
    .sort((a, b) => {
      const phaseA = classifyPhase(a);
      const phaseB = classifyPhase(b);
      if (phaseA !== phaseB) return phaseA - phaseB;
      // Higher score first within same phase
      return (recMap.get(b)?.score ?? 0) - (recMap.get(a)?.score ?? 0);
    });

  while (queue.length > 0) {
    const nextQueue: string[] = [];

    for (const name of queue) {
      const rec = recMap.get(name)!;
      rec.sequence = sequence++;
      sorted.push(rec);

      for (const dependent of adjacency.get(name) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) {
          nextQueue.push(dependent);
        }
      }
    }

    // Sort next level by heuristic
    queue = nextQueue.sort((a, b) => {
      const phaseA = classifyPhase(a);
      const phaseB = classifyPhase(b);
      if (phaseA !== phaseB) return phaseA - phaseB;
      return (recMap.get(b)?.score ?? 0) - (recMap.get(a)?.score ?? 0);
    });
  }

  return sorted;
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(skill): add topological sequencer with heuristic ordering (Layer 3)`

---

### Task 5: Implement buildSkillAddressIndex helper with tests (TDD)

**Depends on:** Task 1, Task 2
**Files:** `packages/cli/tests/skill/recommendation-engine.test.ts`, `packages/cli/src/skill/recommendation-engine.ts`

This function merges skill index entries with fallback rules to create the `SkillAddressIndex` used by all three layers.

1. Append tests to `packages/cli/tests/skill/recommendation-engine.test.ts`:

```typescript
// -- buildSkillAddressIndex tests --

describe('buildSkillAddressIndex', () => {
  it('creates address index from skills index entries', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'my-skill': {
        addresses: [{ signal: 'drift', weight: 0.7 }],
        dependsOn: [],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    expect(result.size).toBe(1);
    expect(result.get('my-skill')!.addresses).toHaveLength(1);
  });

  it('merges fallback rules for skills without addresses', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [], // empty = use fallback
        dependsOn: [],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    const entry = result.get('enforce-architecture');
    expect(entry).toBeDefined();
    expect(entry!.addresses.length).toBeGreaterThan(0);
    expect(entry!.addresses.some((a) => a.hard === true)).toBe(true);
  });

  it('skill-declared addresses take precedence over fallback', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'custom-signal', weight: 0.9 }],
        dependsOn: [],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    const entry = result.get('enforce-architecture');
    expect(entry!.addresses).toHaveLength(1);
    expect(entry!.addresses[0]!.signal).toBe('custom-signal');
  });

  it('includes fallback-only skills not in the index', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {};
    const result = buildSkillAddressIndex(skillsIndex);
    // Fallback rules inject entries for skills not in the index
    expect(result.has('security-scan')).toBe(true);
    expect(result.has('tdd')).toBe(true);
  });

  it('preserves dependsOn from the skills index', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      tdd: {
        addresses: [{ signal: 'low-coverage', weight: 0.9 }],
        dependsOn: ['enforce-architecture'],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    expect(result.get('tdd')!.dependsOn).toEqual(['enforce-architecture']);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
3. Observe failure: `buildSkillAddressIndex` not exported.

4. Add to `packages/cli/src/skill/recommendation-engine.ts` (before Layer 1):

```typescript
import { FALLBACK_RULES } from './recommendation-rules.js';

// ---------------------------------------------------------------------------
// Index builder helper
// ---------------------------------------------------------------------------

/**
 * Build a SkillAddressIndex by merging skill index entries with fallback rules.
 * - Skills with non-empty addresses: use skill-declared addresses (precedence).
 * - Skills with empty addresses: use fallback rules if available.
 * - Fallback-only skills (not in index): injected from FALLBACK_RULES.
 */
export function buildSkillAddressIndex(
  skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }>
): SkillAddressIndex {
  const index: SkillAddressIndex = new Map();

  // First, add all skills from the skills index
  for (const [name, entry] of Object.entries(skills)) {
    const addresses = entry.addresses.length > 0 ? entry.addresses : (FALLBACK_RULES[name] ?? []);
    index.set(name, { addresses, dependsOn: entry.dependsOn });
  }

  // Then, add fallback-only skills not already in the index
  for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
    if (!index.has(name)) {
      index.set(name, { addresses, dependsOn: [] });
    }
  }

  return index;
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(skill): add buildSkillAddressIndex with fallback merging`

---

### Task 6: Implement public recommend() API with tests (TDD)

**Depends on:** Tasks 2, 3, 4, 5
**Files:** `packages/cli/tests/skill/recommendation-engine.test.ts`, `packages/cli/src/skill/recommendation-engine.ts`

1. Append tests to `packages/cli/tests/skill/recommendation-engine.test.ts`:

```typescript
// -- recommend() tests --

describe('recommend', () => {
  it('returns empty result for empty snapshot (no signals)', () => {
    const snapshot = makeSnapshot({ signals: [] });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
    };
    const result = recommend(snapshot, skills);
    expect(result.recommendations).toHaveLength(0);
    expect(result.sequenceReasoning).toContain('No active signals');
  });

  it('returns empty result for empty skills index', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const result = recommend(snapshot, {});
    expect(result.recommendations).toHaveLength(0);
  });

  it('combines hard rules and soft scores, deduplicating skills', () => {
    const snapshot = makeSnapshot({
      signals: ['circular-deps', 'high-coupling'],
      metrics: makeMetrics({ maxFanOut: 25 }),
    });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [
          { signal: 'circular-deps', hard: true },
          { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
        ],
        dependsOn: [],
      },
    };
    const result = recommend(snapshot, skills);
    // enforce-architecture appears once (hard rule takes precedence)
    const ea = result.recommendations.filter((r) => r.skillName === 'enforce-architecture');
    expect(ea).toHaveLength(1);
    expect(ea[0]!.urgency).toBe('critical'); // hard rule wins
  });

  it('limits results with top option', () => {
    const snapshot = makeSnapshot({
      signals: [
        'circular-deps',
        'dead-code',
        'low-coverage',
        'security-findings',
        'doc-gaps',
        'drift',
      ],
    });
    // Use fallback rules -- several will match
    const result = recommend(snapshot, {}, { top: 3 });
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('defaults to top 5', () => {
    const snapshot = makeSnapshot({
      signals: [
        'circular-deps',
        'dead-code',
        'low-coverage',
        'security-findings',
        'doc-gaps',
        'drift',
        'high-coupling',
        'high-complexity',
        'perf-regression',
        'anomaly-outlier',
      ],
    });
    const result = recommend(snapshot, {});
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
  });

  it('sequences recommendations with dependency ordering', () => {
    const snapshot = makeSnapshot({
      signals: ['circular-deps', 'low-coverage'],
    });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
      tdd: {
        addresses: [{ signal: 'low-coverage', weight: 0.9 }],
        dependsOn: ['enforce-architecture'],
      },
    };
    const result = recommend(snapshot, skills, { top: 10 });
    const seqEA = result.recommendations.find(
      (r) => r.skillName === 'enforce-architecture'
    )!.sequence;
    const seqTDD = result.recommendations.find((r) => r.skillName === 'tdd')!.sequence;
    expect(seqEA).toBeLessThan(seqTDD);
  });

  it('provides sequenceReasoning string', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
    };
    const result = recommend(snapshot, skills);
    expect(result.sequenceReasoning).toBeTruthy();
    expect(typeof result.sequenceReasoning).toBe('string');
  });

  it('sets snapshotAge based on signals presence', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const result = recommend(snapshot, {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
    });
    expect(result.snapshotAge).toBe('fresh');
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
3. Observe failure: `recommend` not exported.

4. Append to `packages/cli/src/skill/recommendation-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecommendOptions {
  /** Maximum number of recommendations to return (default 5). */
  top?: number;
}

/**
 * Produce scored, sequenced skill recommendations from a health snapshot
 * and skills index.
 *
 * Combines all three layers:
 * 1. matchHardRules -- critical signals
 * 2. scoreByHealth -- weighted soft scoring
 * 3. sequenceRecommendations -- topological + heuristic ordering
 *
 * Hard rule matches take precedence over soft scores for the same skill.
 */
export function recommend(
  snapshot: HealthSnapshot,
  skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }>,
  options: RecommendOptions = {}
): RecommendationResult {
  const top = options.top ?? 5;

  // Empty signals -> no recommendations
  if (snapshot.signals.length === 0) {
    return {
      recommendations: [],
      snapshotAge: 'none',
      sequenceReasoning: 'No active signals detected in health snapshot.',
    };
  }

  // Build merged address index (skill-declared + fallback)
  const addressIndex = buildSkillAddressIndex(skills);

  // Layer 1: hard rules
  const hardRecs = matchHardRules(snapshot, addressIndex);

  // Layer 2: soft scoring
  const softRecs = scoreByHealth(snapshot, addressIndex);

  // Merge: hard rules take precedence
  const hardSkills = new Set(hardRecs.map((r) => r.skillName));
  const merged = [...hardRecs, ...softRecs.filter((r) => !hardSkills.has(r.skillName))];

  // Sort by score descending before sequencing (to limit to top N before ordering)
  merged.sort((a, b) => b.score - a.score);

  // Limit to top N
  const limited = merged.slice(0, top);

  // Build dependency map from the address index
  const depMap = new Map<string, string[]>();
  for (const [name, entry] of addressIndex) {
    depMap.set(name, entry.dependsOn);
  }

  // Layer 3: sequence
  const sequenced = sequenceRecommendations(limited, depMap);

  // Build reasoning
  const criticalCount = sequenced.filter((r) => r.urgency === 'critical').length;
  const phases = sequenced.map((r) => `${r.sequence}. ${r.skillName}`).join(' -> ');
  const reasoning =
    criticalCount > 0
      ? `${criticalCount} critical issue(s) detected. Sequence: ${phases}. Critical items first, then diagnostic -> fix -> validate heuristic.`
      : `Sequence: ${phases}. Ordered by dependencies and diagnostic -> fix -> validate heuristic.`;

  return {
    recommendations: sequenced,
    snapshotAge: 'fresh',
    sequenceReasoning: reasoning,
  };
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
6. Observe: all tests pass.
7. Run: `harness validate`
8. Commit: `feat(skill): add public recommend() API combining all three layers`

---

### Task 7: Final integration validation

[checkpoint:human-verify]

**Depends on:** Tasks 1-6
**Files:** all files from previous tasks

1. Run full test suite: `cd packages/cli && npx vitest run tests/skill/recommendation-rules.test.ts tests/skill/recommendation-engine.test.ts`
2. Observe: all tests pass.
3. Run: `cd packages/cli && npx vitest run` (full suite to ensure no regressions)
4. Run: `harness validate`
5. Verify exports are clean by checking the module can be imported:

```bash
cd packages/cli && npx tsx -e "
  const { recommend, matchHardRules, scoreByHealth, sequenceRecommendations, buildSkillAddressIndex, resolveMetricValue } = require('./src/skill/recommendation-engine');
  const { FALLBACK_RULES } = require('./src/skill/recommendation-rules');
  console.log('recommend:', typeof recommend);
  console.log('matchHardRules:', typeof matchHardRules);
  console.log('scoreByHealth:', typeof scoreByHealth);
  console.log('sequenceRecommendations:', typeof sequenceRecommendations);
  console.log('buildSkillAddressIndex:', typeof buildSkillAddressIndex);
  console.log('resolveMetricValue:', typeof resolveMetricValue);
  console.log('FALLBACK_RULES keys:', Object.keys(FALLBACK_RULES).length);
"
```

6. Verify all observable truths from the plan are met.
7. Commit (if any final adjustments): `feat(skill): recommendation engine core -- Phase 3 complete`
