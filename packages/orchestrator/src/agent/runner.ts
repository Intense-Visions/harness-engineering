import {
  AgentBackend,
  TurnParams,
  AgentEvent,
  TurnResult,
  Issue,
} from '@harness-engineering/types';

export interface RunnerOptions {
  maxTurns: number;
}

export class AgentRunner {
  private backend: AgentBackend;
  private options: RunnerOptions;

  constructor(backend: AgentBackend, options: RunnerOptions) {
    this.backend = backend;
    this.options = options;
  }

  /**
   * Run a multi-turn agent session for an issue.
   */
  public async *runSession(
    _issue: Issue,
    workspacePath: string,
    prompt: string
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    const startResult = await this.backend.startSession({
      workspacePath,
      permissionMode: 'full', // Default for now
    });

    if (!startResult.ok) {
      throw new Error(`Failed to start agent session: ${startResult.error.message}`);
    }

    const session = startResult.value;
    let currentTurn = 0;
    let lastResult: TurnResult = {
      success: false,
      sessionId: session.sessionId,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };

    try {
      while (currentTurn < this.options.maxTurns) {
        currentTurn++;
        const turnParams: TurnParams = {
          sessionId: session.sessionId,
          prompt: currentTurn === 1 ? prompt : 'Continue your work.',
          isContinuation: currentTurn > 1,
        };

        const turnGen = this.backend.runTurn(session, turnParams);

        // Manual iteration to capture the return value (TurnResult)
        let next = await turnGen.next();
        while (!next.done) {
          yield next.value;
          next = await turnGen.next();
        }

        lastResult = next.value;

        // Early termination if agent reports success
        if (lastResult.success) {
          break;
        }
      }
    } finally {
      await this.backend.stopSession(session);
    }

    return lastResult;
  }
}
