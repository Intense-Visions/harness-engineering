// guardian — harness-owned, tolerant, advisory diff-coverage contract read from
// the `.harness/analyses/` archive (issue #914).
export { GUARDIAN_ANALYSIS_SCHEMA, GUARDIAN_ANALYSIS_VERSION } from './types.js';
export type {
  GuardianAnalysis,
  GuardianFileCoverage,
  GuardianVerdict,
  GuardianSeverity,
} from './types.js';
export { guardianAnalysisSchema } from './schema.js';
export { readGuardianAnalyses } from './reader.js';
export { summarizeGuardian, guardianFlags, guardianFileLines } from './summary.js';
