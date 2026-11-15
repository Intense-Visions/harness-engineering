export {
  AutonomyLevelSchema,
  UserConfigSchema,
  SessionOverrideFileSchema,
  AutonomySettingSchema,
  validateAutonomySetting,
  parseUserConfig,
  parseSessionOverride,
} from './schema';
export {
  harnessHomeDir,
  userConfigPath,
  computeRepoKey,
  validateOverrideSlug,
  sessionOverridePath,
  sessionDirForRaise,
  autonomyAuditLogPath,
  AutonomySessionNotFoundError,
  AUTONOMY_SESSION_NOT_FOUND,
} from './paths';
export type { AutonomyPathOptions } from './paths';
export { resolveAutonomy, AUTONOMY_ENV, AUTONOMY_AUDIT_ENV } from './resolve';
export type { ResolveAutonomyInput } from './resolve';
export {
  readSessionOverride,
  writeSessionOverride,
  AutonomyOverrideBusyError,
  AUTONOMY_OVERRIDE_BUSY,
  DEFAULT_RAISE_TTL_MS,
} from './override-store';
export type { OverrideStoreOptions, ReadOverrideResult } from './override-store';
export {
  isRaisingChange,
  writeLoweringOverride,
  AutonomyRaiseRejectedError,
  AUTONOMY_RAISE_REJECTED,
  AutonomyInvalidSettingError,
  AUTONOMY_INVALID_SETTING,
} from './lower-only';
export { resolveAutonomyForSession } from './session';
export type { ResolveForSessionInput } from './session';
export {
  AUTO_DECISION_LIMITS,
  AUTO_DECISION_INVALID,
  AutoDecisionInvalidError,
  AutoDecisionAuditSchema,
  AutoDecisionInputSchema,
  AutoDecisionSchema,
  validateAutoDecisionInput,
  parseAutoDecisionLine,
} from './decision-schema';
// appendAutoDecision is deliberately NOT exported: recordAutoDecision is the only write path.
export {
  AUTO_DECISIONS_FILE,
  MAX_AUTO_DECISION_LINE_BYTES,
  AUTO_DECISION_SESSION_NOT_FOUND,
  AUTO_DECISION_WRITE_FAILED,
  AutoDecisionSessionNotFoundError,
  AutoDecisionWriteFailedError,
  autoDecisionLogPath,
  readAutoDecisions,
  recordAutoDecision,
  AUTO_DECISION_NOT_AUTHORIZED,
  AutoDecisionNotAuthorizedError,
} from './decision-log';
export type {
  AutoDecisionLogRead,
  ReadAutoDecisionsOptions,
  RecordAutoDecisionOptions,
} from './decision-log';
export { summarizeAutoDecisions, renderAutoDecisionSummary } from './summary';
export type { RenderAutoDecisionOptions } from './summary';
