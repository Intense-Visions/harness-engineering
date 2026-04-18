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
export { OpenAICompatibleAnalysisProvider } from './analysis-provider/openai-compatible.js';
export { ClaudeCliAnalysisProvider } from './analysis-provider/claude-cli.js';

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

// Effectiveness — agent introspection and persona routing
export {
  computePersonaEffectiveness,
  detectBlindSpots,
  recommendPersona,
} from './effectiveness/scorer.js';
export type {
  PersonaEffectivenessScore,
  BlindSpot,
  PersonaRecommendation,
} from './effectiveness/types.js';

// Specialization — persistent agent expertise tracking
export {
  computeSpecialization,
  computeExpertiseLevel,
  buildSpecializationProfile,
  weightedRecommendPersona,
} from './specialization/scorer.js';
export { decayWeight, temporalSuccessRate } from './specialization/temporal.js';
export { loadProfiles, saveProfiles, refreshProfiles } from './specialization/persistence.js';
export type {
  SpecializationScore,
  SpecializationEntry,
  SpecializationProfile,
  WeightedRecommendation,
  ExpertiseLevel,
  TaskType,
} from './specialization/types.js';
export type { TemporalConfig } from './specialization/temporal.js';
export type { ProfileStore } from './specialization/persistence.js';
