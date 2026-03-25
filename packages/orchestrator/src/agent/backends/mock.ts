import {
  AgentBackend,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  Result,
  Ok,
  AgentError,
} from '@harness-engineering/types';

export class MockBackend implements AgentBackend {
  readonly name = 'mock';

  async startSession(params: SessionStartParams): Promise<Result<AgentSession, AgentError>> {
    const session: AgentSession = {
      sessionId: `mock-session-${Date.now()}`,
      workspacePath: params.workspacePath,
      backendName: this.name,
      startedAt: new Date().toISOString(),
    };
    return Ok(session);
  }

  async *runTurn(
    session: AgentSession,
    _params: TurnParams
  ): AsyncGenerator<AgentEvent, TurnResult, void> {
    yield {
      type: 'status',
      timestamp: new Date().toISOString(),
      content: 'Thinking...',
      sessionId: session.sessionId,
    };

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 100));

    yield {
      type: 'thought',
      timestamp: new Date().toISOString(),
      content: 'I will list the directory.',
      sessionId: session.sessionId,
    };

    return {
      success: true,
      sessionId: session.sessionId,
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      },
    };
  }

  async stopSession(_session: AgentSession): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }

  async healthCheck(): Promise<Result<void, AgentError>> {
    return Ok(undefined);
  }
}
