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
