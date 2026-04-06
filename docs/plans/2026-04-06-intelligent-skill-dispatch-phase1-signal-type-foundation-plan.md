# Plan: Intelligent Skill Dispatch -- Phase 1: Signal & Type Foundation

**Date:** 2026-04-06
**Spec:** docs/changes/intelligent-skill-dispatch/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Extend the existing health signal type system with change-type and domain signals, add dispatch-specific types (`DispatchContext`, `DispatchResult`, `DispatchedSkill`), extend fallback rules with change/domain addresses for bundled skills, and verify all with unit tests -- establishing the type foundation for intelligent skill dispatch.

## Observable Truths (Acceptance Criteria)

1. When `HEALTH_SIGNALS` is imported from `recommendation-types.ts`, the array contains exactly 28 entries: 12 existing health signals + 4 change-type signals + 12 domain signals.
2. The `HealthSignal` type (derived from the const array) accepts all 28 signal identifiers as valid values.
3. When `DispatchContext`, `DispatchResult`, and `DispatchedSkill` are imported from `dispatch-types.ts`, they compile without errors and match the spec interfaces.
4. When `FALLBACK_RULES` is imported from `recommendation-rules.ts`, it contains change-type and domain signal addresses for bundled skills (at minimum: `tdd` addresses `change-bugfix`, `refactoring` addresses `change-refactor`, `detect-doc-drift` addresses `change-docs`, `enforce-architecture` addresses `change-feature`, `supply-chain-audit` addresses `domain-secrets`, `security-scan` addresses `domain-secrets`).
5. `npx vitest run tests/skill/recommendation-types.test.ts` passes (from `packages/cli`) with tests covering all 28 signals.
6. `npx vitest run tests/skill/recommendation-rules.test.ts` passes (from `packages/cli`) with tests covering change/domain fallback rules.
7. `npx vitest run tests/skill/dispatch-types.test.ts` passes (from `packages/cli`) with structural type tests for all three dispatch interfaces.
8. The existing recommendation engine tests (`tests/skill/recommendation-engine.test.ts`) still pass unchanged -- backward compatible.
9. `harness validate` passes after all changes.

## File Map

- MODIFY `packages/cli/src/skill/recommendation-types.ts` (extend HEALTH_SIGNALS array with 16 new entries)
- CREATE `packages/cli/src/skill/dispatch-types.ts` (DispatchContext, DispatchResult, DispatchedSkill interfaces)
- MODIFY `packages/cli/src/skill/recommendation-rules.ts` (add change/domain fallback rule entries)
- MODIFY `packages/cli/tests/skill/recommendation-types.test.ts` (update signal count assertions, add new signal group tests)
- MODIFY `packages/cli/tests/skill/recommendation-rules.test.ts` (add change/domain rule coverage tests)
- CREATE `packages/cli/tests/skill/dispatch-types.test.ts` (structural type validation tests)

## Tasks

### Task 1: Extend HEALTH_SIGNALS with change-type and domain signals

**Depends on:** none
**Files:** `packages/cli/src/skill/recommendation-types.ts`

1. Open `packages/cli/src/skill/recommendation-types.ts`
2. Add change-type signals after the existing 12 entries in the `HEALTH_SIGNALS` array:
   ```typescript
   // Change-type signals (exactly one active per dispatch)
   'change-feature',
   'change-bugfix',
   'change-refactor',
   'change-docs',
   ```
3. Add domain signals after the change-type signals:
   ```typescript
   // Domain signals (zero or more active per dispatch)
   'domain-database',
   'domain-containerization',
   'domain-deployment',
   'domain-infrastructure-as-code',
   'domain-api-design',
   'domain-secrets',
   'domain-e2e',
   'domain-mutation-test',
   'domain-load-testing',
   'domain-data-pipeline',
   'domain-mobile-patterns',
   'domain-incident-response',
   ```
4. The full `HEALTH_SIGNALS` array should now have 28 entries. The `HealthSignal` type is automatically derived from the const array, so no additional type change is needed.
5. Run: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
6. Observe: all 30 existing engine tests pass (backward compatible -- the engine reads signals from the snapshot, not from the const array directly)
7. Run: `harness validate`
8. Commit: `feat(skill): extend HealthSignal with change-type and domain signals`

### Task 2: Update recommendation-types tests for new signals

**Depends on:** Task 1
**Files:** `packages/cli/tests/skill/recommendation-types.test.ts`

1. Open `packages/cli/tests/skill/recommendation-types.test.ts`
2. Update the `'contains exactly 12 signals'` test to expect 28:
   ```typescript
   it('contains exactly 28 signals', () => {
     expect(HEALTH_SIGNALS).toHaveLength(28);
   });
   ```
3. Add a new test for change-type signals:
   ```typescript
   it('contains change-type signals', () => {
     expect(HEALTH_SIGNALS).toContain('change-feature');
     expect(HEALTH_SIGNALS).toContain('change-bugfix');
     expect(HEALTH_SIGNALS).toContain('change-refactor');
     expect(HEALTH_SIGNALS).toContain('change-docs');
   });
   ```
4. Add a new test for domain signals:
   ```typescript
   it('contains domain signals', () => {
     const domainSignals = [
       'domain-database',
       'domain-containerization',
       'domain-deployment',
       'domain-infrastructure-as-code',
       'domain-api-design',
       'domain-secrets',
       'domain-e2e',
       'domain-mutation-test',
       'domain-load-testing',
       'domain-data-pipeline',
       'domain-mobile-patterns',
       'domain-incident-response',
     ];
     for (const signal of domainSignals) {
       expect(HEALTH_SIGNALS).toContain(signal);
     }
   });
   ```
5. Add a type-level test verifying the `HealthSignal` type accepts the new values:
   ```typescript
   it('HealthSignal type accepts change-type and domain values', () => {
     const changeSignal: HealthSignal = 'change-feature';
     const domainSignal: HealthSignal = 'domain-database';
     expect(changeSignal).toBe('change-feature');
     expect(domainSignal).toBe('domain-database');
   });
   ```
6. Run: `cd packages/cli && npx vitest run tests/skill/recommendation-types.test.ts`
7. Observe: all tests pass (including updated count and new signal group tests)
8. Run: `harness validate`
9. Commit: `test(skill): update recommendation-types tests for 28 signals`

### Task 3: Create dispatch-types.ts with DispatchContext, DispatchResult, DispatchedSkill

**Depends on:** Task 1
**Files:** `packages/cli/src/skill/dispatch-types.ts`

1. Create `packages/cli/src/skill/dispatch-types.ts`:

   ```typescript
   /**
    * Types for the intelligent skill dispatch system.
    * Used by the dispatch engine (Phase 2) and MCP tool (Phase 3).
    */

   import type { ChangeType } from '@harness-engineering/core';
   import type { HealthSnapshot } from './health-snapshot.js';
   import type { RecommendationUrgency } from './recommendation-types.js';

   /**
    * Enriched context that combines a health snapshot with change-type and
    * domain signals derived from a git diff.
    */
   export interface DispatchContext {
     /** Existing cached or fresh health snapshot. */
     snapshot: HealthSnapshot;
     /** Change type derived from detectChangeType(). */
     changeType: ChangeType;
     /** File paths from git diff (project-relative). */
     changedFiles: string[];
     /** Domain identifiers derived from diff-scoped stack profile detection. */
     domains: string[];
     /** Merged signal set: snapshot.signals + change-type signal + domain signals. */
     allSignals: string[];
   }

   /**
    * A single skill in the dispatched sequence, annotated with execution metadata.
    */
   export interface DispatchedSkill {
     /** Skill name (matches skill.yaml name field). */
     name: string;
     /** Composite score from the recommendation engine (0 to 1). */
     score: number;
     /** Urgency classification from the recommendation engine. */
     urgency: RecommendationUrgency;
     /** Human-readable explanation of why this skill was dispatched. */
     reason: string;
     /** True if this skill targets non-overlapping signal categories with adjacent skills. */
     parallelSafe: boolean;
     /** Impact estimate: hard address match -> high, score >= 0.7 -> medium, else low. */
     estimatedImpact: 'high' | 'medium' | 'low';
     /** Skills that should run before this one (from skill index dependsOn field). */
     dependsOn?: string[];
   }

   /**
    * Complete result of a skill dispatch invocation.
    */
   export interface DispatchResult {
     /** Summary context about the dispatch inputs. */
     context: {
       changeType: ChangeType;
       domains: string[];
       signalCount: number;
       snapshotFreshness: 'fresh' | 'cached';
     };
     /** Ordered list of dispatched skills with execution annotations. */
     skills: DispatchedSkill[];
     /** ISO 8601 timestamp when the dispatch result was generated. */
     generatedAt: string;
   }
   ```

2. Run: `cd packages/cli && npx tsc --noEmit`
3. Observe: no type errors (imports resolve correctly)
4. Run: `harness validate`
5. Commit: `feat(skill): add DispatchContext, DispatchResult, DispatchedSkill types`

### Task 4: Create dispatch-types tests

**Depends on:** Task 3
**Files:** `packages/cli/tests/skill/dispatch-types.test.ts`

1. Create `packages/cli/tests/skill/dispatch-types.test.ts`:

   ```typescript
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
   ```

2. Run: `cd packages/cli && npx vitest run tests/skill/dispatch-types.test.ts`
3. Observe: all tests pass (structural type validation)
4. Run: `harness validate`
5. Commit: `test(skill): add dispatch-types structural tests`

### Task 5: Extend FALLBACK_RULES with change-type and domain addresses

**Depends on:** Task 1
**Files:** `packages/cli/src/skill/recommendation-rules.ts`

1. Open `packages/cli/src/skill/recommendation-rules.ts`
2. Add change-type signal addresses to existing skill entries. Append new address objects to the existing arrays for these skills:
   - `tdd`: add `{ signal: 'change-bugfix', weight: 0.9 }`
   - `refactoring`: add `{ signal: 'change-refactor', weight: 0.9 }`
   - `detect-doc-drift`: add `{ signal: 'change-docs', weight: 0.8 }`
   - `enforce-architecture`: add `{ signal: 'change-feature', weight: 0.6 }`
   - `code-review`: add `{ signal: 'change-feature', weight: 0.7 }`, `{ signal: 'change-bugfix', weight: 0.6 }`
   - `integrity`: add `{ signal: 'change-refactor', weight: 0.6 }`
   - `soundness-review`: add `{ signal: 'change-feature', weight: 0.5 }`, `{ signal: 'change-refactor', weight: 0.5 }`
3. Add domain signal addresses to existing skill entries:
   - `security-scan`: add `{ signal: 'domain-secrets', weight: 0.8 }`
   - `supply-chain-audit`: add `{ signal: 'domain-secrets', weight: 0.9 }`
   - `enforce-architecture`: add `{ signal: 'domain-containerization', weight: 0.5 }`, `{ signal: 'domain-infrastructure-as-code', weight: 0.5 }`
   - `perf`: add `{ signal: 'domain-load-testing', weight: 0.7 }`
   - `debugging`: add `{ signal: 'domain-incident-response', weight: 0.7 }`
   - `detect-doc-drift`: add `{ signal: 'domain-api-design', weight: 0.6 }`

   The full updated file should be:

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
   ```

4. Run: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
5. Observe: all 30 existing engine tests still pass (new rules only fire when new signals are in the snapshot; existing test fixtures use only existing signals)
6. Run: `harness validate`
7. Commit: `feat(skill): add change-type and domain fallback rules for bundled skills`

### Task 6: Update recommendation-rules tests for change/domain rules

**Depends on:** Task 5
**Files:** `packages/cli/tests/skill/recommendation-rules.test.ts`

1. Open `packages/cli/tests/skill/recommendation-rules.test.ts`
2. Add tests for change-type signal coverage:

   ```typescript
   describe('change-type signal fallback rules', () => {
     it('tdd addresses change-bugfix', () => {
       const tdd = FALLBACK_RULES['tdd']!;
       const signals = tdd.map((a) => a.signal);
       expect(signals).toContain('change-bugfix');
     });

     it('refactoring addresses change-refactor', () => {
       const refactoring = FALLBACK_RULES['refactoring']!;
       const signals = refactoring.map((a) => a.signal);
       expect(signals).toContain('change-refactor');
     });

     it('detect-doc-drift addresses change-docs', () => {
       const docDrift = FALLBACK_RULES['detect-doc-drift']!;
       const signals = docDrift.map((a) => a.signal);
       expect(signals).toContain('change-docs');
     });

     it('enforce-architecture addresses change-feature', () => {
       const ea = FALLBACK_RULES['enforce-architecture']!;
       const signals = ea.map((a) => a.signal);
       expect(signals).toContain('change-feature');
     });

     it('code-review addresses change-feature and change-bugfix', () => {
       const cr = FALLBACK_RULES['code-review']!;
       const signals = cr.map((a) => a.signal);
       expect(signals).toContain('change-feature');
       expect(signals).toContain('change-bugfix');
     });

     it('change-type addresses use soft weights (no hard flag)', () => {
       const changeSignals = ['change-feature', 'change-bugfix', 'change-refactor', 'change-docs'];
       for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
         for (const addr of addresses) {
           if (changeSignals.includes(addr.signal)) {
             expect(addr.hard, `${name} change-type address should not be hard`).toBeFalsy();
             expect(addr.weight, `${name} ${addr.signal} should have weight`).toBeDefined();
           }
         }
       }
     });
   });

   describe('domain signal fallback rules', () => {
     it('security-scan addresses domain-secrets', () => {
       const ss = FALLBACK_RULES['security-scan']!;
       const signals = ss.map((a) => a.signal);
       expect(signals).toContain('domain-secrets');
     });

     it('supply-chain-audit addresses domain-secrets', () => {
       const sca = FALLBACK_RULES['supply-chain-audit']!;
       const signals = sca.map((a) => a.signal);
       expect(signals).toContain('domain-secrets');
     });

     it('perf addresses domain-load-testing', () => {
       const perf = FALLBACK_RULES['perf']!;
       const signals = perf.map((a) => a.signal);
       expect(signals).toContain('domain-load-testing');
     });

     it('debugging addresses domain-incident-response', () => {
       const debugging = FALLBACK_RULES['debugging']!;
       const signals = debugging.map((a) => a.signal);
       expect(signals).toContain('domain-incident-response');
     });

     it('detect-doc-drift addresses domain-api-design', () => {
       const docDrift = FALLBACK_RULES['detect-doc-drift']!;
       const signals = docDrift.map((a) => a.signal);
       expect(signals).toContain('domain-api-design');
     });

     it('enforce-architecture addresses domain-containerization and domain-infrastructure-as-code', () => {
       const ea = FALLBACK_RULES['enforce-architecture']!;
       const signals = ea.map((a) => a.signal);
       expect(signals).toContain('domain-containerization');
       expect(signals).toContain('domain-infrastructure-as-code');
     });

     it('domain addresses use soft weights (no hard flag)', () => {
       for (const [name, addresses] of Object.entries(FALLBACK_RULES)) {
         for (const addr of addresses) {
           if (addr.signal.startsWith('domain-')) {
             expect(addr.hard, `${name} domain address should not be hard`).toBeFalsy();
             expect(addr.weight, `${name} ${addr.signal} should have weight`).toBeDefined();
           }
         }
       }
     });
   });
   ```

3. Update the minimum rule count check from `>= 15` to `>= 15` (stays the same since we are adding addresses to existing entries, not new keys)
4. Run: `cd packages/cli && npx vitest run tests/skill/recommendation-rules.test.ts`
5. Observe: all tests pass (existing + new change/domain coverage tests)
6. Run: `cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts`
7. Observe: all 30 existing engine tests still pass (final backward compatibility check)
8. Run: `harness validate`
9. Commit: `test(skill): add change-type and domain fallback rule tests`

## Traceability

| Observable Truth                              | Delivered By                                            |
| --------------------------------------------- | ------------------------------------------------------- |
| 1. HEALTH_SIGNALS has 28 entries              | Task 1                                                  |
| 2. HealthSignal type accepts all 28           | Task 1, Task 2                                          |
| 3. Dispatch types compile and match spec      | Task 3                                                  |
| 4. FALLBACK_RULES has change/domain addresses | Task 5                                                  |
| 5. recommendation-types tests pass            | Task 2                                                  |
| 6. recommendation-rules tests pass            | Task 6                                                  |
| 7. dispatch-types tests pass                  | Task 4                                                  |
| 8. Existing engine tests pass                 | Task 1 (verified), Task 5 (verified), Task 6 (verified) |
| 9. harness validate passes                    | Every task                                              |

## Evidence

- `packages/cli/src/skill/recommendation-types.ts:5-18` -- existing HEALTH_SIGNALS array with 12 entries, new entries will be appended
- `packages/cli/src/skill/recommendation-types.ts:21` -- HealthSignal type derived from const array, auto-expands
- `packages/cli/src/skill/recommendation-rules.ts:11-61` -- existing FALLBACK_RULES record with 15 skill entries
- `packages/cli/src/skill/schema.ts:66-71` -- SkillAddressSchema: signal (string), hard (bool?), metric (string?), threshold (number?), weight (number 0-1?)
- `packages/core/src/review/types/context.ts:6` -- ChangeType = 'feature' | 'bugfix' | 'refactor' | 'docs'
- `packages/cli/src/skill/health-snapshot.ts:34-47` -- HealthSnapshot interface with signals: string[]
- `packages/cli/src/skill/stack-profile.ts:14-56` -- SIGNAL_DOMAIN_MAP keys match the 12 domain signal names
- `packages/cli/tests/skill/recommendation-types.test.ts:30` -- existing test asserts exactly 12 signals (will need update)
- `packages/cli/tests/skill/recommendation-rules.test.ts:7` -- existing test asserts >= 15 rule entries
- Existing engine tests: 56 tests across 3 test files pass as of baseline run
