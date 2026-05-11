import type { WorkflowConfig } from '@harness-engineering/types';
import type { IssueTrackerClient } from '@harness-engineering/core';
import type { IntelligencePipeline, EnrichedSpec } from '@harness-engineering/intelligence';
import type { GraphStore } from '@harness-engineering/graph';
import type { OrchestratorState } from './internal';
import type { AnalysisArchive } from '../core/analysis-archive';
import type { StreamRecorder } from '../core/stream-recorder';
import type { PRDetector } from '../core/pr-detector';
import type { StructuredLogger } from '../logging/logger';

/**
 * Shared context passed to extracted sub-services (IntelligencePipelineRunner,
 * CompletionHandler). Bundles the orchestrator's dependencies so sub-services
 * can read config, log, and access shared caches without importing the
 * Orchestrator class itself.
 */
export interface OrchestratorContext {
  readonly config: WorkflowConfig;
  readonly projectRoot: string;
  readonly logger: StructuredLogger;
  readonly tracker: IssueTrackerClient;
  readonly recorder: StreamRecorder;
  readonly prDetector: PRDetector;
  readonly orchestratorIdPromise: Promise<string>;
  readonly pipeline: IntelligencePipeline | null;
  readonly graphStore: GraphStore | null;
  readonly analysisArchive: AnalysisArchive;

  /** Mutable cache: enriched specs keyed by issue ID. */
  readonly enrichedSpecsByIssue: Map<string, EnrichedSpec>;
  /** Mutable cache: epoch-ms when intelligence analysis last failed for an issue. */
  readonly analysisFailureCache: Map<string, number>;

  getState(): OrchestratorState;
  setState(state: OrchestratorState): void;
  emit(event: string, ...args: unknown[]): boolean;
}
