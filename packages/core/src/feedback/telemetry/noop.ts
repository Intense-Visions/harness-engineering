import { Ok } from '../../shared/result';
import type { TelemetryAdapter, TelemetryHealth, Metric, Trace, LogEntry, FeedbackError } from '../types';
import type { Result } from '../../shared/result';

export class NoOpTelemetryAdapter implements TelemetryAdapter {
  readonly name = 'noop';

  async health(): Promise<Result<TelemetryHealth, FeedbackError>> {
    return Ok({ available: true, message: 'NoOp adapter - no real telemetry' });
  }

  async getMetrics(): Promise<Result<Metric[], FeedbackError>> {
    return Ok([]);
  }

  async getTraces(): Promise<Result<Trace[], FeedbackError>> {
    return Ok([]);
  }

  async getLogs(): Promise<Result<LogEntry[], FeedbackError>> {
    return Ok([]);
  }
}
