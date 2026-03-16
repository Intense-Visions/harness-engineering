import { Ok } from '../../shared/result';
import type { ActionSink, AgentAction, FeedbackError } from '../types';
import type { Result } from '../../shared/result';

export interface ConsoleSinkOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  format?: 'pretty' | 'json';
  verbose?: boolean;
}

export class ConsoleSink implements ActionSink {
  readonly name = 'console';
  private options: ConsoleSinkOptions;

  constructor(options: ConsoleSinkOptions = {}) {
    this.options = {
      level: options.level ?? 'info',
      format: options.format ?? 'pretty',
      verbose: options.verbose ?? false,
    };
  }

  async write(action: AgentAction): Promise<Result<void, FeedbackError>> {
    const output =
      this.options.format === 'json' ? JSON.stringify(action) : this.formatPretty(action);

    console.log(output);
    return Ok(undefined);
  }

  private formatPretty(action: AgentAction): string {
    const status = action.status === 'completed' ? '✓' : action.status === 'failed' ? '✗' : '→';
    const duration = action.duration ? ` (${action.duration}ms)` : '';
    return `[${status}] ${action.type}${duration}: ${action.result?.summary ?? action.status}`;
  }
}
