import type {
  TelemetryAdapter,
  AgentExecutor,
  ActionSink,
} from './types';
// Direct imports - these are small NoOp classes, no circular dependency issue
import { NoOpTelemetryAdapter } from './telemetry/noop';
import { NoOpExecutor } from './executor/noop';
import { ConsoleSink } from './logging/console-sink';

export interface FeedbackConfig {
  telemetry?: TelemetryAdapter;
  executor?: AgentExecutor;
  sinks?: ActionSink[];
  emitEvents?: boolean;
  defaultTimeout?: number;
  rootDir?: string;
}

function getDefaults(): Required<FeedbackConfig> {
  return {
    telemetry: new NoOpTelemetryAdapter(),
    executor: new NoOpExecutor(),
    sinks: [new ConsoleSink()],
    emitEvents: true,
    defaultTimeout: 300000,
    rootDir: process.cwd(),
  };
}

let feedbackConfig: FeedbackConfig | null = null;

function ensureConfig(): FeedbackConfig {
  if (!feedbackConfig) {
    feedbackConfig = getDefaults();
  }
  return feedbackConfig;
}

export function configureFeedback(config: Partial<FeedbackConfig>): void {
  feedbackConfig = { ...ensureConfig(), ...config };
}

export function getFeedbackConfig(): Readonly<FeedbackConfig> {
  return Object.freeze({ ...ensureConfig() });
}

export function resetFeedbackConfig(): void {
  feedbackConfig = null;
}
