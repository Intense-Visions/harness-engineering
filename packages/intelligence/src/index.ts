// @harness-engineering/intelligence
// Intelligence pipeline: spec enrichment, complexity modeling, pre-execution simulation

// Adapters
export { toRawWorkItem } from './adapter.js';
export {
  jiraToRawWorkItem,
  githubToRawWorkItem,
  linearToRawWorkItem,
  manualToRawWorkItem,
} from './adapters/index.js';
export type { JiraIssue, GitHubIssue, LinearIssue, ManualInput } from './adapters/index.js';

// Types
export type {
  RawWorkItem,
  AffectedSystem,
  EnrichedSpec,
  BlastRadius,
  ComplexityScore,
  SimulationResult,
} from './types.js';

// Analysis Provider
export type {
  AnalysisRequest,
  AnalysisResponse,
  AnalysisProvider,
} from './analysis-provider/interface.js';
export { AnthropicAnalysisProvider } from './analysis-provider/anthropic.js';

// SEL — Spec Enrichment Layer
export { enrich } from './sel/enricher.js';
export { GraphValidator } from './sel/graph-validator.js';

// CML — Complexity Modeling Layer
export { score as scoreCML } from './cml/scorer.js';
export { computeStructuralComplexity } from './cml/structural.js';
export { computeSemanticComplexity } from './cml/semantic.js';

// Signals
export { scoreToConcernSignals } from './cml/signals.js';

// PESL -- Pre-Execution Simulation Layer
export { runGraphOnlyChecks } from './pesl/graph-checks.js';
export { runLlmSimulation } from './pesl/llm-simulation.js';
export { PeslSimulator } from './pesl/simulator.js';

// Outcome
export { ExecutionOutcomeConnector } from './outcome/connector.js';
export type { ExecutionOutcome } from './outcome/types.js';
export type { OutcomeIngestResult } from './outcome/connector.js';

// CML Historical
export { computeHistoricalComplexity } from './cml/historical.js';

// Pipeline
export { IntelligencePipeline } from './pipeline.js';
export type { PreprocessResult } from './pipeline.js';
