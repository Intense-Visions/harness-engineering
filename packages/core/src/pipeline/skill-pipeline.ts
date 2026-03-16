import type {
  SkillContext,
  TurnContext,
  SkillLifecycleHooks,
  SkillResult,
} from '@harness-engineering/types';

export interface PipelineOptions {
  hooks?: SkillLifecycleHooks;
  maxTurns?: number;
}

export interface PipelineResult {
  success: boolean;
  context: SkillContext;
  result?: SkillResult;
  error?: string;
  turnsExecuted: number;
  durationMs: number;
}

export type SkillExecutor = (context: SkillContext) => Promise<SkillResult>;
export type TurnExecutor = (context: TurnContext) => Promise<{ result: unknown; done: boolean }>;

export async function runPipeline(
  initialContext: SkillContext,
  executor: SkillExecutor,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const hooks = options?.hooks;
  let context = { ...initialContext };

  // Pre-execution hook
  if (hooks?.preExecution) {
    const updated = hooks.preExecution(context);
    if (updated === null) {
      return {
        success: false,
        context,
        error: 'Pre-execution hook rejected the context',
        turnsExecuted: 0,
        durationMs: Date.now() - startTime,
      };
    }
    context = updated;
  }

  // Execute the skill
  let result: SkillResult;
  try {
    result = await executor(context);
  } catch (e) {
    return {
      success: false,
      context,
      error: e instanceof Error ? e.message : String(e),
      turnsExecuted: 1,
      durationMs: Date.now() - startTime,
    };
  }

  // Post-execution hook
  if (hooks?.postExecution) {
    try {
      hooks.postExecution(context, result);
    } catch {
      // Post-execution hooks are advisory — failures don't fail the pipeline
    }
  }

  return {
    success: result.success,
    context,
    result,
    turnsExecuted: 1,
    durationMs: Date.now() - startTime,
  };
}

export async function runMultiTurnPipeline(
  initialContext: SkillContext,
  turnExecutor: TurnExecutor,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const hooks = options?.hooks;
  const maxTurns = options?.maxTurns ?? 10;
  let context = { ...initialContext };

  // Pre-execution hook
  if (hooks?.preExecution) {
    const updated = hooks.preExecution(context);
    if (updated === null) {
      return {
        success: false,
        context,
        error: 'Pre-execution hook rejected the context',
        turnsExecuted: 0,
        durationMs: Date.now() - startTime,
      };
    }
    context = updated;
  }

  const previousResults: unknown[] = [];
  let turnsExecuted = 0;
  let lastError: string | undefined;

  for (let turn = 0; turn < maxTurns; turn++) {
    const turnContext: TurnContext = {
      ...context,
      turnNumber: turn + 1,
      previousResults: [...previousResults],
    };

    // Per-turn hook
    let filteredTurnContext = turnContext;
    if (hooks?.perTurn) {
      const updated = hooks.perTurn(turnContext);
      if (updated === null) {
        break; // Per-turn hook says stop
      }
      filteredTurnContext = updated;
    }

    try {
      const turnResult = await turnExecutor(filteredTurnContext);
      previousResults.push(turnResult.result);
      turnsExecuted++;

      if (turnResult.done) {
        break;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      turnsExecuted++;
      break;
    }
  }

  const skillResult: SkillResult = {
    success: !lastError,
    artifacts: [],
    summary: lastError ?? `Completed in ${turnsExecuted} turns`,
  };

  // Post-execution hook
  if (hooks?.postExecution) {
    try {
      hooks.postExecution(context, skillResult);
    } catch {
      // Advisory
    }
  }

  return {
    success: !lastError,
    context,
    result: skillResult,
    error: lastError,
    turnsExecuted,
    durationMs: Date.now() - startTime,
  };
}
