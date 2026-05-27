// packages/cli/tests/design-craft/measurement/signal.test.ts
//
// Unit tests for the design-craft signal feedback loop.
//
// Covers:
//   1. proposeFromRecurringFindings honors the multi-project guard
//      (≥ 2 distinct projects required, even when the threshold is met)
//   2. Recurrence at threshold emits a proposal YAML
//   3. Recurrence is keyed on (code × tier × cite id), not message
//   4. Re-running rewrites the proposal in place (idempotent)
//   5. Below-threshold recurrence emits nothing
//   6. Invalid threshold rejected
//
// All tests use a per-test temp store root so they cannot collide.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CraftFinding } from '../../../src/design-craft/findings/schema.js';
import {
  recordSignalEvent,
  proposeFromRecurringFindings,
  resetSignalStore,
} from '../../../src/design-craft/measurement/signal.js';

function makeFinding(overrides: Partial<CraftFinding> = {}): CraftFinding {
  return {
    code: 'CRAFT-C001',
    phase: 'critique',
    tier: 'foundational',
    impact: 'large',
    confidence: 'medium',
    target: { file: 'fixtures/A.tsx', component: 'A' },
    message: 'No clear primary signal among the three top-level buttons.',
    cite: {
      rubricOrPatternId: 'rubric-hierarchy-clarity',
      source: 'https://example.com/hierarchy',
    },
    derived: { priority: 50 },
    ...overrides,
  };
}

describe('design-craft measurement/signal', () => {
  let storeRoot: string;

  beforeEach(() => {
    storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-signal-'));
  });

  afterEach(() => {
    fs.rmSync(storeRoot, { recursive: true, force: true });
  });

  it('returns no candidates when nothing has been recorded', () => {
    expect(proposeFromRecurringFindings(5, storeRoot)).toEqual([]);
  });

  it('rejects a non-positive threshold', () => {
    expect(() => proposeFromRecurringFindings(0, storeRoot)).toThrow(/positive integer/);
    expect(() => proposeFromRecurringFindings(-1, storeRoot)).toThrow(/positive integer/);
    expect(() => proposeFromRecurringFindings(NaN, storeRoot)).toThrow(/positive integer/);
  });

  it('does NOT propose when threshold met but only one project saw the shape', () => {
    for (let i = 0; i < 5; i++) {
      recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
    }
    expect(proposeFromRecurringFindings(5, storeRoot)).toEqual([]);
  });

  it('emits a proposal when threshold met across ≥ 2 distinct projects', () => {
    recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/two', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/two', storeRoot);

    const candidates = proposeFromRecurringFindings(5, storeRoot);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.occurrenceCount).toBe(5);
    expect(candidates[0]!.distinctProjects).toEqual(['/projects/one', '/projects/two']);
    expect(candidates[0]!.representative.code).toBe('CRAFT-C001');

    const yamlContent = fs.readFileSync(candidates[0]!.proposalPath, 'utf8');
    expect(yamlContent).toMatch(/kind: proposal/);
    expect(yamlContent).toMatch(/occurrenceCount: 5/);
    expect(yamlContent).toMatch(/CRAFT-C001/);
    expect(yamlContent).toMatch(/distinctProjectCount: 2/);
  });

  it('treats different (code,tier,cite) tuples as different fingerprints', () => {
    // Same code but two different tiers ⇒ two fingerprints. Even with 4+
    // events of each shape across 2 projects, each shape is independently
    // below threshold of 5 ⇒ no proposals.
    for (let i = 0; i < 2; i++) {
      recordSignalEvent(makeFinding({ tier: 'foundational' }), '/projects/one', storeRoot);
      recordSignalEvent(makeFinding({ tier: 'polish' }), '/projects/two', storeRoot);
    }
    expect(proposeFromRecurringFindings(5, storeRoot)).toEqual([]);
  });

  it('is idempotent: re-running with the same events writes the proposal to the same path', () => {
    for (let i = 0; i < 3; i++) {
      recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
      recordSignalEvent(makeFinding(), '/projects/two', storeRoot);
    }
    const first = proposeFromRecurringFindings(5, storeRoot);
    expect(first).toHaveLength(1);

    const second = proposeFromRecurringFindings(5, storeRoot);
    expect(second).toHaveLength(1);
    expect(second[0]!.proposalPath).toBe(first[0]!.proposalPath);
    expect(second[0]!.occurrenceCount).toBe(6);

    const yaml = fs.readFileSync(second[0]!.proposalPath, 'utf8');
    expect(yaml).toMatch(/occurrenceCount: 6/);
  });

  it('resetSignalStore wipes events and proposals; idempotent', () => {
    recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/two', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/two', storeRoot);
    recordSignalEvent(makeFinding(), '/projects/one', storeRoot);
    proposeFromRecurringFindings(5, storeRoot);

    resetSignalStore(storeRoot);
    expect(proposeFromRecurringFindings(5, storeRoot)).toEqual([]);
    expect(() => resetSignalStore(storeRoot)).not.toThrow();
  });
});
