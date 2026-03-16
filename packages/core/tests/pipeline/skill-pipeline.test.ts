import { describe, it, expect, vi } from 'vitest';
import { runPipeline, runMultiTurnPipeline } from '../../src/pipeline/skill-pipeline';
import type { SkillContext, SkillResult, SkillLifecycleHooks } from '@harness-engineering/types';

const makeContext = (overrides: Partial<SkillContext> = {}): SkillContext => ({
  skillName: 'test-skill',
  phase: 'execute',
  files: [],
  metadata: {},
  ...overrides,
});

const successResult: SkillResult = {
  success: true,
  artifacts: ['output.ts'],
  summary: 'Done',
};

describe('runPipeline', () => {
  it('executes skill and returns success', async () => {
    const executor = vi.fn().mockResolvedValue(successResult);
    const result = await runPipeline(makeContext(), executor);

    expect(result.success).toBe(true);
    expect(result.result).toEqual(successResult);
    expect(result.turnsExecuted).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs pre-execution hook', async () => {
    const hooks: SkillLifecycleHooks = {
      preExecution: (ctx) => ({ ...ctx, metadata: { enriched: true } }),
    };
    const executor = vi.fn().mockResolvedValue(successResult);

    await runPipeline(makeContext(), executor, { hooks });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { enriched: true },
      })
    );
  });

  it('rejects when pre-execution hook returns null', async () => {
    const hooks: SkillLifecycleHooks = {
      preExecution: () => null,
    };
    const executor = vi.fn();

    const result = await runPipeline(makeContext(), executor, { hooks });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Pre-execution hook rejected');
    expect(executor).not.toHaveBeenCalled();
  });

  it('runs post-execution hook', async () => {
    const postHook = vi.fn();
    const hooks: SkillLifecycleHooks = { postExecution: postHook };
    const executor = vi.fn().mockResolvedValue(successResult);

    await runPipeline(makeContext(), executor, { hooks });

    expect(postHook).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'test-skill' }),
      successResult
    );
  });

  it('handles executor errors gracefully', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('Boom'));
    const result = await runPipeline(makeContext(), executor);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Boom');
  });
});

describe('runMultiTurnPipeline', () => {
  it('executes multiple turns until done', async () => {
    let callCount = 0;
    const turnExecutor = async () => {
      callCount++;
      return { result: `turn-${callCount}`, done: callCount >= 3 };
    };

    const result = await runMultiTurnPipeline(makeContext(), turnExecutor);

    expect(result.success).toBe(true);
    expect(result.turnsExecuted).toBe(3);
  });

  it('respects maxTurns limit', async () => {
    const turnExecutor = async () => ({ result: 'ongoing', done: false });

    const result = await runMultiTurnPipeline(makeContext(), turnExecutor, {
      maxTurns: 5,
    });

    expect(result.turnsExecuted).toBe(5);
  });

  it('runs per-turn hook', async () => {
    const perTurn = vi.fn().mockImplementation((ctx) => ctx);
    const hooks: SkillLifecycleHooks = { perTurn };
    const turnExecutor = async () => ({ result: 'done', done: true });

    await runMultiTurnPipeline(makeContext(), turnExecutor, { hooks });

    expect(perTurn).toHaveBeenCalledWith(expect.objectContaining({ turnNumber: 1 }));
  });
});
