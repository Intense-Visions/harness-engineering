import { Ok, Err } from '../../shared/result';
import type {
  AgentExecutor,
  ExecutorHealth,
  FeedbackAgentConfig,
  AgentProcess,
  PeerReview,
  FeedbackError,
} from '../types';
import type { Result } from '../../shared/result';
import { generateId } from '../../shared/uuid';

export class NoOpExecutor implements AgentExecutor {
  readonly name = 'noop';
  private processes = new Map<string, AgentProcess>();

  async health(): Promise<Result<ExecutorHealth, FeedbackError>> {
    return Ok({ available: true, message: 'NoOp executor - no real agent spawning' });
  }

  async spawn(config: FeedbackAgentConfig): Promise<Result<AgentProcess, FeedbackError>> {
    const id = generateId();
    const process: AgentProcess = {
      id,
      status: 'completed',
      startedAt: new Date().toISOString(),
      config,
    };
    this.processes.set(id, process);
    return Ok(process);
  }

  async status(processId: string): Promise<Result<AgentProcess, FeedbackError>> {
    const process = this.processes.get(processId);
    if (!process) {
      return Err({
        code: 'AGENT_SPAWN_ERROR',
        message: 'Process not found',
        details: { agentId: processId },
        suggestions: ['Check if the process ID is correct'],
      });
    }
    return Ok(process);
  }

  async wait(processId: string): Promise<Result<PeerReview, FeedbackError>> {
    const process = this.processes.get(processId);
    if (!process) {
      return Err({
        code: 'AGENT_SPAWN_ERROR',
        message: 'Process not found',
        details: { agentId: processId },
        suggestions: ['Check if the process ID is correct'],
      });
    }
    return Ok({
      agentId: processId,
      agentType: process.config.type,
      approved: true,
      comments: [],
      suggestions: [],
      duration: 0,
      completedAt: new Date().toISOString(),
    });
  }

  async kill(processId: string): Promise<Result<void, FeedbackError>> {
    this.processes.delete(processId);
    return Ok(undefined);
  }
}
