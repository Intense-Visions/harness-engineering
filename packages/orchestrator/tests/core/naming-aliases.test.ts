import { describe, it, expect } from 'vitest';
// D2 — import from the PACKAGE ROOT entry, NOT from the module files.
//
//   package.json exports["."] -> dist/index.d.ts  (built from src/index.ts)
//   src/index.ts:12            -> export * from './core/index'
//   src/core/index.ts          -> the three symbol lines
//
// A name reaches consumers of @harness-engineering/orchestrator iff it appears in
// src/core/index.ts. Importing '../../src/core/retry' here would pass even with the
// barrel line missing -- that is the exact defect this test exists to catch. Do not
// "simplify" these imports to the module files.
//
// A namespace import is used deliberately: a missing name surfaces as `undefined`
// and fails the assertion below with a readable message, rather than crashing the
// module linker before any assertion runs.
import * as orch from '../../src/index';

describe('deprecated aliases are reachable from the package entry point', () => {
  it('calculateRetryDelay is the same object as calculateRetryDelayMs', () => {
    expect(typeof orch.calculateRetryDelayMs).toBe('function');
    expect(typeof orch.calculateRetryDelay).toBe('function');
    expect(orch.calculateRetryDelay).toBe(orch.calculateRetryDelayMs);
  });

  it('periodLengthMs is the same object as resolvePeriodLengthMs', () => {
    expect(typeof orch.resolvePeriodLengthMs).toBe('function');
    expect(typeof orch.periodLengthMs).toBe('function');
    expect(orch.periodLengthMs).toBe(orch.resolvePeriodLengthMs);
  });

  it('reconcile is the same object as reconcileRunningIssues', () => {
    expect(typeof orch.reconcileRunningIssues).toBe('function');
    expect(typeof orch.reconcile).toBe('function');
    expect(orch.reconcile).toBe(orch.reconcileRunningIssues);
  });

  it('the renamed symbols still behave', () => {
    expect(orch.calculateRetryDelayMs(1, 'continuation')).toBe(1000);
    expect(orch.calculateRetryDelayMs(2, 'failure', 300000)).toBe(20000);
    expect(orch.resolvePeriodLengthMs('week')).toBe(7 * orch.resolvePeriodLengthMs('day'));
  });
});
