import { describe, it, expect, vi } from 'vitest';
import type { RollbackDecision } from '@harness-engineering/core';
import type { HarnessConfig } from '../../src/config/schema';
import { isEvalArmEnabled, runEvalTriggerIfEnabled } from '../../src/rollback/eval-gate';

const baseConfig = (): HarnessConfig => ({ version: 1, name: 'test-project' }) as HarnessConfig;

const stubDecision = (pr: number): RollbackDecision => ({
  targetPr: pr,
  trigger: 'eval',
  revertReady: true,
  reasons: [],
  cleanRevert: true,
  dependentMerges: [],
  migrationWarnings: [],
  action: 'proposed',
});

describe('isEvalArmEnabled', () => {
  it('is false when rollback is undefined', () => {
    expect(isEvalArmEnabled(baseConfig())).toBe(false);
  });

  it('is false when evalTrigger.enabled is false', () => {
    const cfg = {
      ...baseConfig(),
      rollback: { signals: {}, evalTrigger: { enabled: false } },
    } as HarnessConfig;
    expect(isEvalArmEnabled(cfg)).toBe(false);
  });

  it('is true when evalTrigger.enabled is true', () => {
    const cfg = {
      ...baseConfig(),
      rollback: { signals: {}, evalTrigger: { enabled: true } },
    } as HarnessConfig;
    expect(isEvalArmEnabled(cfg)).toBe(true);
  });
});

describe('runEvalTriggerIfEnabled', () => {
  it('AC9 disabled (undefined rollback): does NOT call evaluate, resolves { skipped: true }', async () => {
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    const result = await runEvalTriggerIfEnabled(baseConfig(), 42, { evaluate });
    expect(evaluate).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });

  it('AC9 disabled (enabled=false): does NOT call evaluate, resolves { skipped: true }', async () => {
    const cfg = {
      ...baseConfig(),
      rollback: { signals: {}, evalTrigger: { enabled: false } },
    } as HarnessConfig;
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    const result = await runEvalTriggerIfEnabled(cfg, 42, { evaluate });
    expect(evaluate).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });

  it('AC9 enabled: calls evaluate once with the pr and resolves the decision', async () => {
    const cfg = {
      ...baseConfig(),
      rollback: { signals: {}, evalTrigger: { enabled: true } },
    } as HarnessConfig;
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    const result = await runEvalTriggerIfEnabled(cfg, 77, { evaluate });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate).toHaveBeenCalledWith(77);
    expect(result).toEqual(stubDecision(77));
  });
});
