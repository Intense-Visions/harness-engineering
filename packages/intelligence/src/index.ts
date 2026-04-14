// @harness-engineering/intelligence
// Intelligence pipeline: spec enrichment, complexity modeling, pre-execution simulation

// Adapter
export { toRawWorkItem } from './adapter.js';

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

// Pipeline
export { IntelligencePipeline } from './pipeline.js';
export type { PreprocessResult } from './pipeline.js';
