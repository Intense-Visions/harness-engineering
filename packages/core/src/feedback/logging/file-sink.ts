import { Ok, Err } from '../../shared/result';
import type { Result } from '../../shared/result';
import type { ActionSink, AgentAction, FeedbackError } from '../types';
import { appendFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface FileSinkOptions {
  mode?: 'append' | 'overwrite';
  bufferSize?: number;
  flushInterval?: number;
}

export class FileSink implements ActionSink {
  readonly name = 'file';
  private filePath: string;
  private options: FileSinkOptions;
  private buffer: string[] = [];
  private flushTimer?: NodeJS.Timeout;
  private initialized = false;

  constructor(filePath: string, options: FileSinkOptions = {}) {
    this.filePath = filePath;
    this.options = {
      mode: options.mode ?? 'append',
      bufferSize: options.bufferSize ?? 1,
    };

    if (options.flushInterval !== undefined) {
      this.options.flushInterval = options.flushInterval;
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.options.flushInterval);
    }
  }

  private ensureDirectory(): void {
    if (!this.initialized) {
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.initialized = true;
    }
  }

  async write(action: AgentAction): Promise<Result<void, FeedbackError>> {
    try {
      const line = JSON.stringify(action) + '\n';
      this.buffer.push(line);

      if (this.buffer.length >= (this.options.bufferSize ?? 1)) {
        return this.flush();
      }

      return Ok(undefined);
    } catch (error) {
      return Err({
        code: 'SINK_ERROR',
        message: 'Failed to write action to file',
        details: { reason: String(error) },
        suggestions: ['Check file permissions', 'Verify disk space'],
      });
    }
  }

  async flush(): Promise<Result<void, FeedbackError>> {
    if (this.buffer.length === 0) {
      return Ok(undefined);
    }

    try {
      this.ensureDirectory();
      const content = this.buffer.join('');
      this.buffer = [];

      if (this.options.mode === 'overwrite' && !existsSync(this.filePath)) {
        writeFileSync(this.filePath, content);
      } else {
        appendFileSync(this.filePath, content);
      }

      return Ok(undefined);
    } catch (error) {
      return Err({
        code: 'SINK_ERROR',
        message: 'Failed to flush actions to file',
        details: { reason: String(error) },
        suggestions: ['Check file permissions', 'Verify disk space'],
      });
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
  }
}
