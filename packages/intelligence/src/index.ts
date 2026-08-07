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
export { createCanaryAdapter } from './adapters/index.js';
export type {
  CanaryAdapter,
  CanaryProbe,
  CanaryDegradeReason,
  CanaryExec,
  FrameworkRecommendation,
  CanaryFinding,
} from './adapters/index.js';

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

// Outcome-Eval — post-execution spec-satisfaction verdict (Phase 3: evaluator & prompts)
export {
  deriveAuthority,
  verdictSchema,
  resolveSection,
  OutcomeEvaluator,
  OUTCOME_EVAL_SYSTEM_PROMPT,
  buildUserPrompt,
} from './outcome-eval/index.js';
export type {
  Verdict,
  Confidence,
  JudgedAgainst,
  Authority,
  OutcomeEvalInput,
  OutcomeVerdict,
  LlmVerdict,
  ResolvedSection,
  OutcomeEvaluatorOptions,
} from './outcome-eval/index.js';

// Guardian — tolerant, advisory diff-coverage records read from .harness/analyses/ (#914)
export {
  GUARDIAN_ANALYSIS_SCHEMA,
  GUARDIAN_ANALYSIS_VERSION,
  guardianAnalysisSchema,
  readGuardianAnalyses,
  summarizeGuardian,
  guardianFlags,
  guardianFileLines,
} from './guardian/index.js';
export type {
  GuardianAnalysis,
  GuardianFileCoverage,
  GuardianVerdict,
  GuardianSeverity,
} from './guardian/index.js';

// Acceptance-Eval — pre-execution acceptance-criteria measurability judgment (upstream twin)
export {
  deriveAcceptanceAuthority,
  acceptanceVerdictSchema,
  findingSchema,
  AcceptanceEvaluator,
  ACCEPTANCE_EVAL_SYSTEM_PROMPT,
  buildUserPrompt as buildAcceptanceUserPrompt,
} from './acceptance-eval/index.js';
export type {
  Measurability,
  Finding,
  AcceptanceEvalInput,
  AcceptanceVerdict,
  LlmAcceptanceVerdict,
  AcceptanceEvaluatorOptions,
} from './acceptance-eval/index.js';

// Skill-Regression — golden-fixture evaluation framework that detects skill regressions.
// Reuses the outcome-eval judge pattern; wired into the `harness skill-regression` CLI gate.
export {
  deriveRegressionAuthority,
  SKILL_REGRESSION_SYSTEM_PROMPT,
  buildUserPrompt as buildSkillRegressionUserPrompt,
  criterionJudgmentSchema,
  judgeResponseSchema,
  weightedScore,
  aggregateAtK,
  regressionFloor,
  deriveRegressionVerdict,
  fixtureSchema,
  parseFixture,
  serializeFixture,
  SkillRegressionEvaluator,
  computeBaselineScore,
} from './skill-regression/index.js';
export type {
  JudgeResponse as SkillRegressionJudgeResponse,
  RegressionVerdictKind,
  RegressionConfidence,
  RegressionAuthority,
  RubricCriterion,
  GoldenBaseline,
  SkillRegressionFixture,
  CriterionJudgment,
  SkillRegressionInput,
  SkillRegressionVerdict,
  SkillRegressionEvaluatorOptions,
} from './skill-regression/index.js';

// UAT Sign-off — human-judged intent(BRD)-vs-shipped-reality acceptance record
// (the far-end mirror of product-advisor's inception edge). Human is the
// authority: no LLM verdict, no derived authority, advisory / record-only.
export {
  toUatExecutionOutcome,
  UatSignoffRecorder,
  UAT_SIGNOFF_SOURCE,
} from './uat-signoff/index.js';
export type {
  UatItemDisposition,
  UatOverallDecision,
  UatSignoffItem,
  UatSignoffInput,
} from './uat-signoff/index.js';

// CML Historical
export { computeHistoricalComplexity } from './cml/historical.js';

// Pipeline
export { IntelligencePipeline } from './pipeline.js';
export type { PreprocessResult } from './pipeline.js';

// Effectiveness — agent introspection and persona routing
// Used by orchestrator pipeline-runner via weightedRecommendPersona for persona-aware dispatch
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
// Skill-grain effectiveness — Bayesian scoring over adoption telemetry
// Wired into the `harness adoption retrospective` CLI command (catalog-retrospective skill)
export {
  computeSkillEffectiveness,
  detectFailingSkills,
  detectAbandonedSkills,
} from './effectiveness/skill-scorer.js';
export type {
  SkillEffectivenessScore,
  FailingSkill,
  AbandonedSkill,
} from './effectiveness/types.js';

// Specialization — persistent agent expertise tracking
// Wired into orchestrator pipeline-runner: refreshProfiles called on startup and after each analysis pass
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

// Complexity cascade (AMR Phase 2) — phase-aware classifier + pure deriveRequiredTier
export {
  classify,
  runStaticPass,
  STATIC_WEIGHTS,
  llmTiebreak,
  deriveRequiredTier,
  baseTier,
  applyBudgetClamp,
  blastRadiusVeto,
  SENSITIVE_BLAST_THRESHOLD,
  TIER_RANK,
  RANK_TIER,
  DEFAULT_DEGRADE_AT_PCT,
  serializeSignals,
} from './complexity/index.js';
export type {
  ClassifyInput,
  TiebreakResult,
  Phase,
  ComplexitySignals,
  StaticVerdict,
} from './complexity/index.js';

// Roadmap Auto-Triage — shared contracts (Phase 0 foundations; inert until enabled)
export {
  shapeKey,
  dispatchableShapeKey,
  aggregatePrecedent,
  precedentLookupFromRecords,
  extractEntities,
} from './triage/index.js';
export type {
  TriageRecord,
  TriagePrediction,
  TriageOutcome,
  PrecedentLookup,
  PrecedentRate,
  EscalationCategory,
  RatchetStage,
} from './triage/index.js';
export type {
  LeverResult,
  ResolvedEntity,
  ScopeEstimate,
  GraphScope,
  OpenDecision,
  HoldReason,
  ProbeInput,
  ProbeLevers,
  TriageVerdict,
} from './triage/index.js';
export { runScopingProbe } from './triage/index.js';
export type { ProbeConfig, ProbeDeps } from './triage/index.js';
export { pilotScore, rankTriageCandidates } from './triage/index.js';
export type { RankableCandidate } from './triage/index.js';

// Roadmap Auto-Triage — Phase 2: the autonomous-brainstorm decision core (pure).
export { runAutoBrainstorm, depthForLevel, DEPTH_BY_LEVEL } from './triage/index.js';
export type {
  ForkConfidence,
  Fork,
  ForkDecision,
  ForkGenerator,
  DepthBudget,
  SpecDraft,
  BrainstormInput,
  HaltReason,
  BrainstormOutcome,
} from './triage/index.js';

// Roadmap Auto-Triage — Phase 3: the pure go/no-go gate (autonomy ratchet stage 1).
// Phase 4 adds `resolveGoNoGoStaged` for the per-shape evidence-derived stage (SC6).
export { resolveGoNoGo, resolveGoNoGoStaged, AUTO_EXECUTE_CATEGORIES } from './triage/index.js';
export type {
  GoNoGoCandidate,
  StagedGoNoGoCandidate,
  ApprovedCandidate,
  GoNoGoDecision,
  HeldCandidate,
  GoNoGoHoldReason,
} from './triage/index.js';

// Roadmap Auto-Triage — Phase 4: the pure post-diff retrospective + ratchet.
export {
  compareToPrediction,
  LEVEL_RANK,
  BLAST_TOLERANCE_FACTOR,
  BLAST_TOLERANCE_ABS,
} from './triage/index.js';
export { DEFAULT_RETROSPECTIVE_CONFIG } from './triage/index.js';
export type { RetrospectiveComparison, RetrospectiveConfig } from './triage/index.js';
export { resolveStage, DEFAULT_RATCHET_CONFIG, V1_MAX_STAGE } from './triage/index.js';
export type { V1Stage, RatchetOutcome, RatchetConfig } from './triage/index.js';
