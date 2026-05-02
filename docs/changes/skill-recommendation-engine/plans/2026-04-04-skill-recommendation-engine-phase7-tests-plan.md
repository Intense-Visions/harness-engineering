# Plan: Skill Recommendation Engine -- Phase 7: Tests

**Date:** 2026-04-04
**Spec:** docs/changes/skill-recommendation-engine/proposal.md
**Estimated tasks:** 4
**Estimated time:** 15 minutes

## Goal

Fill remaining test coverage gaps for the skill recommendation engine: an integration test exercising the full pipeline end-to-end, snapshot staleness edge cases, and a realistic multi-signal recommendation scenario.

## Observable Truths (Acceptance Criteria)

1. When `recommend()` is called with a snapshot containing multiple active signals (circular-deps, high-coupling, low-coverage, dead-code, security-findings), the system shall return sequenced recommendations where critical items (hard rules) appear before soft-scored items, with correct urgency classifications and valid sequence numbers.
2. When git HEAD differs from the snapshot but the snapshot age is less than 1 hour, `isSnapshotFresh()` shall return `true` (time-based fallback).
3. When git HEAD differs from the snapshot and the snapshot age is exactly at the 1-hour boundary, `isSnapshotFresh()` shall return `false`.
4. An integration test file at `packages/cli/tests/integration/recommendation-pipeline.test.ts` shall exercise the pipeline from `captureHealthSnapshot` through `recommend` to structured output, verifying the full data flow with mocked tool handlers.
5. `npx vitest run` for all recommendation-related test files passes with the new tests added.
6. `harness validate` passes after all changes.

## File Map

- CREATE `packages/cli/tests/integration/recommendation-pipeline.test.ts`
- MODIFY `packages/cli/tests/skill/health-snapshot.test.ts` (add staleness edge cases)
- MODIFY `packages/cli/tests/skill/recommendation-engine.test.ts` (add realistic multi-signal scenario)

## Tasks

### Task 1: Add snapshot staleness edge cases

**Depends on:** none
**Files:** `packages/cli/tests/skill/health-snapshot.test.ts`

1. Open `packages/cli/tests/skill/health-snapshot.test.ts`.

2. Add the following tests inside the existing `describe('isSnapshotFresh', ...)` block, after the last existing test (line 69):

```typescript
it('returns true when git HEAD differs but age < 1 hour (time fallback)', () => {
  vi.spyOn(require('child_process'), 'execSync').mockReturnValue(Buffer.from('different-sha\n'));
  const recentTime = new Date(Date.now() - 1_800_000).toISOString(); // 30 min ago
  const snapshot = makeSnapshot({ gitHead: 'abc123', capturedAt: recentTime });
  expect(isSnapshotFresh(snapshot, '/tmp/test-project')).toBe(true);
});

it('returns false when git HEAD differs and age is exactly 1 hour', () => {
  vi.spyOn(require('child_process'), 'execSync').mockReturnValue(Buffer.from('different-sha\n'));
  const exactlyOneHour = new Date(Date.now() - 3_600_000).toISOString();
  const snapshot = makeSnapshot({ gitHead: 'abc123', capturedAt: exactlyOneHour });
  expect(isSnapshotFresh(snapshot, '/tmp/test-project')).toBe(false);
});

it('returns true when git HEAD matches regardless of age', () => {
  vi.spyOn(require('child_process'), 'execSync').mockReturnValue(Buffer.from('abc123\n'));
  const veryOld = new Date(Date.now() - 86_400_000).toISOString(); // 24 hours ago
  const snapshot = makeSnapshot({ gitHead: 'abc123', capturedAt: veryOld });
  expect(isSnapshotFresh(snapshot, '/tmp/test-project')).toBe(true);
});
```

3. Run test:

```bash
cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts
```

4. Observe: all tests pass (including the 3 new ones). Expected total: 35 tests in this file.

5. Run: `harness validate`

6. Commit: `test(recommendation): add snapshot staleness edge cases for time fallback and HEAD-match-regardless-of-age`

---

### Task 2: Add realistic multi-signal recommendation scenario

**Depends on:** none
**Files:** `packages/cli/tests/skill/recommendation-engine.test.ts`

1. Open `packages/cli/tests/skill/recommendation-engine.test.ts`.

2. Add the following test at the end of the `describe('recommend', ...)` block (after line 599):

```typescript
it('produces correct workflow for realistic unhealthy codebase', () => {
  const snapshot = makeSnapshot({
    signals: ['circular-deps', 'high-coupling', 'low-coverage', 'dead-code', 'security-findings'],
    metrics: makeMetrics({
      maxFanOut: 30,
      avgCouplingRatio: 0.75,
      testCoverage: 40,
    }),
  });

  // Use a mix of skill-declared addresses and rely on fallback rules
  const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
    'enforce-architecture': {
      addresses: [
        { signal: 'circular-deps', hard: true },
        { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
      ],
      dependsOn: [],
    },
    tdd: {
      addresses: [{ signal: 'low-coverage', weight: 0.9 }],
      dependsOn: ['enforce-architecture'],
    },
    'codebase-cleanup': {
      addresses: [{ signal: 'dead-code', weight: 0.8 }],
      dependsOn: [],
    },
    'security-scan': {
      addresses: [{ signal: 'security-findings', hard: true }],
      dependsOn: [],
    },
  };

  const result = recommend(snapshot, skills, { top: 10 });

  // Verify critical items are present
  const critical = result.recommendations.filter((r) => r.urgency === 'critical');
  expect(critical.length).toBeGreaterThanOrEqual(2);
  expect(critical.map((r) => r.skillName)).toContain('enforce-architecture');
  expect(critical.map((r) => r.skillName)).toContain('security-scan');

  // Verify all 4 declared skills appear
  expect(result.recommendations.length).toBe(4);
  const names = result.recommendations.map((r) => r.skillName);
  expect(names).toContain('enforce-architecture');
  expect(names).toContain('tdd');
  expect(names).toContain('codebase-cleanup');
  expect(names).toContain('security-scan');

  // Verify dependency ordering: enforce-architecture before tdd
  const seqEA = result.recommendations.find(
    (r) => r.skillName === 'enforce-architecture'
  )!.sequence;
  const seqTDD = result.recommendations.find((r) => r.skillName === 'tdd')!.sequence;
  expect(seqEA).toBeLessThan(seqTDD);

  // Verify sequence numbers are sequential starting at 1
  const sequences = result.recommendations.map((r) => r.sequence).sort((a, b) => a - b);
  expect(sequences).toEqual([1, 2, 3, 4]);

  // Verify sequenceReasoning mentions critical count
  expect(result.sequenceReasoning).toContain('critical');

  // Verify snapshotAge is set
  expect(result.snapshotAge).toBe('fresh');
});
```

3. Run test:

```bash
cd packages/cli && npx vitest run tests/skill/recommendation-engine.test.ts
```

4. Observe: all tests pass (including the new one). Expected total: 44 tests in this file.

5. Run: `harness validate`

6. Commit: `test(recommendation): add realistic multi-signal pipeline scenario covering all three engine layers`

---

### Task 3: Create integration test for full recommendation pipeline

**Depends on:** none
**Files:** `packages/cli/tests/integration/recommendation-pipeline.test.ts`

1. Create `packages/cli/tests/integration/recommendation-pipeline.test.ts`:

```typescript
/**
 * Integration test: full recommendation pipeline.
 *
 * Exercises captureHealthSnapshot -> recommend -> structured output
 * with mocked tool handlers but real engine logic. Validates that
 * data flows correctly through all layers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock external tool handlers (I/O boundary) but keep engine logic real
vi.mock('../../src/mcp/tools/assess-project', () => ({
  handleAssessProject: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          healthy: false,
          checks: [
            { name: 'deps', passed: false, issueCount: 5 },
            { name: 'entropy', passed: false, issueCount: 3 },
            { name: 'security', passed: false, issueCount: 2 },
            { name: 'perf', passed: true, issueCount: 0 },
            { name: 'docs', passed: false, issueCount: 8 },
            { name: 'lint', passed: true, issueCount: 0 },
          ],
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/tools/architecture', () => ({
  handleCheckDependencies: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          valid: false,
          violations: [
            {
              reason: 'CIRCULAR_DEP',
              file: 'a.ts',
              imports: 'b.ts',
              fromLayer: 'services',
              toLayer: 'controllers',
              line: 10,
              suggestion: '',
            },
            {
              reason: 'CIRCULAR_DEP',
              file: 'b.ts',
              imports: 'a.ts',
              fromLayer: 'controllers',
              toLayer: 'services',
              line: 5,
              suggestion: '',
            },
            {
              reason: 'WRONG_LAYER',
              file: 'c.ts',
              imports: 'd.ts',
              fromLayer: 'ui',
              toLayer: 'data',
              line: 3,
              suggestion: '',
            },
          ],
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/tools/entropy', () => ({
  handleDetectEntropy: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          deadCode: { unusedExports: ['fn1', 'fn2'], unusedImports: [], deadFiles: ['old.ts'] },
          drift: { staleReferences: ['ref1'], missingTargets: [] },
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/tools/security', () => ({
  handleRunSecurityScan: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          findings: [{ severity: 'error', rule: 'no-eval', message: 'eval detected' }],
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/utils/graph-loader', () => ({
  loadGraphStore: vi.fn().mockResolvedValue(null),
}));

// Mock child_process for git HEAD
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...(actual as object),
    execSync: vi.fn().mockReturnValue('integration-test-sha\n'),
  };
});

import { captureHealthSnapshot, isSnapshotFresh } from '../../src/skill/health-snapshot';
import { recommend } from '../../src/skill/recommendation-engine';
import type { RecommendationResult } from '../../src/skill/recommendation-types';

describe('Recommendation Pipeline Integration', { timeout: 10000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'rec-pipeline-'));
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full pipeline: capture -> recommend -> structured result', async () => {
    // Step 1: Capture health snapshot (uses mocked tool handlers)
    const snapshot = await captureHealthSnapshot(tmpDir);

    // Verify snapshot was captured with expected signals
    expect(snapshot.gitHead).toBe('integration-test-sha');
    expect(snapshot.projectPath).toBe(tmpDir);
    expect(snapshot.checks.deps.circularDeps).toBe(2);
    expect(snapshot.checks.deps.layerViolations).toBe(1);
    expect(snapshot.checks.entropy.deadExports).toBe(2);
    expect(snapshot.checks.entropy.deadFiles).toBe(1);
    expect(snapshot.checks.entropy.driftCount).toBe(1);
    expect(snapshot.signals).toContain('circular-deps');
    expect(snapshot.signals).toContain('layer-violations');
    expect(snapshot.signals).toContain('dead-code');
    expect(snapshot.signals).toContain('drift');
    expect(snapshot.signals).toContain('doc-gaps');

    // Step 2: Feed snapshot into recommendation engine with fallback rules
    const skills: Record<string, { addresses: any[]; dependsOn: string[] }> = {};
    const result: RecommendationResult = recommend(snapshot, skills, { top: 10 });

    // Step 3: Verify structured result
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.sequenceReasoning).toBeTruthy();

    // Critical recommendations should exist for circular-deps and layer-violations
    const critical = result.recommendations.filter((r) => r.urgency === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(1);
    // enforce-architecture fallback has hard rules for circular-deps + layer-violations
    expect(critical.some((r) => r.skillName === 'enforce-architecture')).toBe(true);

    // Verify all recommendations have valid structure
    for (const rec of result.recommendations) {
      expect(rec.skillName).toBeTruthy();
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(1);
      expect(['critical', 'recommended', 'nice-to-have']).toContain(rec.urgency);
      expect(rec.sequence).toBeGreaterThanOrEqual(1);
      expect(rec.reasons.length).toBeGreaterThan(0);
      expect(rec.triggeredBy.length).toBeGreaterThan(0);
    }

    // Verify sequence numbers are monotonically increasing
    for (let i = 1; i < result.recommendations.length; i++) {
      expect(result.recommendations[i]!.sequence).toBeGreaterThan(
        result.recommendations[i - 1]!.sequence
      );
    }
  });

  it('snapshot cache round-trip works within pipeline', async () => {
    // Capture writes to cache
    const snapshot = await captureHealthSnapshot(tmpDir);

    // Verify cache file was written
    const cachePath = path.join(tmpDir, '.harness', 'health-snapshot.json');
    expect(fs.existsSync(cachePath)).toBe(true);

    // Read back and verify it matches
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(cached.gitHead).toBe(snapshot.gitHead);
    expect(cached.signals).toEqual(snapshot.signals);

    // Verify freshness check works with the cached snapshot
    expect(isSnapshotFresh(cached, tmpDir)).toBe(true);
  });

  it('empty signals produce empty recommendations', async () => {
    // Override assess-project mock to return all-clean
    const assessMock = await import('../../src/mcp/tools/assess-project');
    vi.mocked(assessMock.handleAssessProject).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            healthy: true,
            checks: [
              { name: 'deps', passed: true, issueCount: 0 },
              { name: 'entropy', passed: true, issueCount: 0 },
              { name: 'security', passed: true, issueCount: 0 },
              { name: 'perf', passed: true, issueCount: 0 },
              { name: 'docs', passed: true, issueCount: 0 },
              { name: 'lint', passed: true, issueCount: 0 },
            ],
          }),
        },
      ],
    });
    const archMock = await import('../../src/mcp/tools/architecture');
    vi.mocked(archMock.handleCheckDependencies).mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ valid: true, violations: [] }) }],
    });
    const entropyMock = await import('../../src/mcp/tools/entropy');
    vi.mocked(entropyMock.handleDetectEntropy).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            deadCode: { unusedExports: [], unusedImports: [], deadFiles: [] },
            drift: { staleReferences: [], missingTargets: [] },
          }),
        },
      ],
    });
    const secMock = await import('../../src/mcp/tools/security');
    vi.mocked(secMock.handleRunSecurityScan).mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ findings: [] }) }],
    });

    const snapshot = await captureHealthSnapshot(tmpDir);
    expect(snapshot.signals).toEqual([]);

    const result = recommend(snapshot, {});
    expect(result.recommendations).toHaveLength(0);
    expect(result.sequenceReasoning).toContain('No active signals');
  });
});
```

3. Run test:

```bash
cd packages/cli && npx vitest run tests/integration/recommendation-pipeline.test.ts
```

4. Observe: all 3 integration tests pass.

5. Run: `harness validate`

6. Commit: `test(recommendation): add integration test for full capture-recommend-output pipeline`

---

### Task 4: Verify full test suite and final validation

**Depends on:** Task 1, Task 2, Task 3
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run the complete recommendation-related test suite:

```bash
cd packages/cli && npx vitest run tests/skill/health-snapshot.test.ts tests/skill/recommendation-engine.test.ts tests/skill/recommendation-rules.test.ts tests/skill/recommendation-types.test.ts tests/skill/health-snapshot-types.test.ts tests/commands/recommend.test.ts tests/mcp/tools/recommend-skills.test.ts tests/skill/dispatcher.test.ts tests/integration/recommendation-pipeline.test.ts
```

2. Observe: all test files pass. Expected totals:
   - `health-snapshot.test.ts`: 35 tests (was 32, +3 staleness edge cases)
   - `recommendation-engine.test.ts`: 44 tests (was 43, +1 multi-signal scenario)
   - `recommendation-rules.test.ts`: 7 tests (unchanged)
   - `recommendation-types.test.ts`: 5 tests (unchanged)
   - `health-snapshot-types.test.ts`: 3 tests (unchanged)
   - `recommend.test.ts` (CLI): 9 tests (unchanged)
   - `recommend-skills.test.ts` (MCP): 8 tests (unchanged)
   - `dispatcher.test.ts`: 32 tests (unchanged)
   - `recommendation-pipeline.test.ts`: 3 tests (new)
   - **Grand total: ~146 tests** (was ~139 with dispatcher, +7 new)

3. Run: `harness validate`

4. Verify coverage of all success criteria from the spec:
   - [x] SC1: CLI command tested (Phase 5)
   - [x] SC2: MCP tool tested (Phase 5)
   - [x] SC3: Hard rules fire for critical signals (Phase 3 + Task 2 realistic scenario)
   - [x] SC4: Soft scoring ranks by metric distance (Phase 3 + Task 2)
   - [x] SC5: Sequencer topological sort + heuristic (Phase 3 + Task 2)
   - [x] SC6: Snapshot cached with git SHA + staleness (Phase 2 + Task 1 edge cases + Task 3 cache round-trip)
   - [x] SC7: search_skills health boost (Phase 6)
   - [x] SC8: skill.yaml schema extended (Phase 1)
   - [x] SC9: Fallback rules (Phase 3)
   - [x] SC10: --json, --no-cache, --top flags (Phase 5)
   - [x] SC11: harness validate passes (all phases)
   - [x] Full pipeline integration (Task 3)
   - [x] Empty signals -> empty recommendations (Task 3)

5. Commit: no commit needed (verification only)
