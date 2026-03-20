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
} from './types';

// Mechanical checks
export { runMechanicalChecks } from './mechanical-checks';

// Exclusion set
export { ExclusionSet, buildExclusionSet } from './exclusion-set';
