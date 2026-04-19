// Types
export type {
  MechanicalFinding,
  MechanicalCheckResult,
  MechanicalCheckStatus,
  MechanicalCheckOptions,
  ChangeType,
  ReviewDomain,
  ContextFile,
  CommitHistoryEntry,
  ContextBundle,
  DiffInfo,
  GraphAdapter,
  ContextScopeOptions,
  // Phase 4 types
  ModelTier,
  FindingSeverity,
  ReviewFinding,
  ReviewAgentDescriptor,
  AgentReviewResult,
  FanOutOptions,
  // Phase 7 types
  ReviewAssessment,
  ReviewStrength,
  ReviewOutputOptions,
  GitHubInlineComment,
  // Phase 1: Eligibility Gate types
  PriorReview,
  PrMetadata,
  EligibilityResult,
  // Phase 8: Model Tiering Config types
  ModelTierConfig,
  ModelProvider,
  ProviderDefaults,
  // Pipeline orchestrator types
  PipelineFlags,
  PipelineContext,
  ReviewPipelineResult,
  // Evidence gate types
  EvidenceCoverageReport,
} from './types';

// Mechanical checks
export { runMechanicalChecks } from './mechanical-checks';

// Exclusion set
export { ExclusionSet, buildExclusionSet } from './exclusion-set';

// Change-type detection
export { detectChangeType } from './change-type';

// Context scoping
export { scopeContext } from './context-scoper';

// Phase 4: Fan-out agents
export {
  runComplianceAgent,
  COMPLIANCE_DESCRIPTOR,
  runBugDetectionAgent,
  BUG_DETECTION_DESCRIPTOR,
  runSecurityAgent,
  SECURITY_DESCRIPTOR,
  runArchitectureAgent,
  ARCHITECTURE_DESCRIPTOR,
  AGENT_DESCRIPTORS,
} from './agents';

// Fan-out orchestrator
export { fanOutReview } from './fan-out';

// Phase 5: Validation
export { validateFindings } from './validate-findings';
export type { ValidateFindingsOptions } from './validate-findings';

// Phase 6: Deduplication
export { deduplicateFindings } from './deduplicate-findings';
export type { DeduplicateFindingsOptions } from './deduplicate-findings';

// Phase 7: Output
// Phase 1: Eligibility gate
export { checkEligibility } from './eligibility-gate';

// Model tier resolver
export { resolveModelTier, DEFAULT_PROVIDER_TIERS } from './model-tier-resolver';

export {
  determineAssessment,
  getExitCode,
  formatTerminalOutput,
  formatFindingBlock,
  formatGitHubComment,
  formatGitHubSummary,
  isSmallSuggestion,
} from './output';

// Evidence gate
export { checkEvidenceCoverage, tagUncitedFindings } from './evidence-gate';

// Phase 5.5: Trust scoring
export { computeTrustScores, getTrustLevel } from './trust-score';
export type { TrustScoreOptions } from './trust-score';

// Trust scoring constants (tunable)
export {
  VALIDATION_SCORES,
  DOMAIN_BASELINES,
  FACTOR_WEIGHTS,
  EVIDENCE_SATURATION,
  CORROBORATED_AGREEMENT,
  STANDALONE_AGREEMENT,
  AGREEMENT_LINE_GAP,
} from './constants';

// Pipeline orchestrator
export { runReviewPipeline } from './pipeline-orchestrator';
export type { RunPipelineOptions } from './pipeline-orchestrator';

// Parallel-group scheduling (reusable beyond review)
export { findParallelGroups } from './parallel-groups';
export type { GraphNode, ParallelGroups } from './types';

// Meta-judge rubric
export { generateRubric } from './meta-judge';
export type { GenerateRubricOptions } from './meta-judge';
export type { Rubric, RubricItem, ReviewStage } from './types';

// Two-stage isolation
export { splitBundlesByStage, stageDomains } from './two-stage';
