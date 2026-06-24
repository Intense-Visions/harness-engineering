/**
 * harness-strength: mechanical self-audit of a project's harness configuration.
 * Phase 1 exposes contracts (types), context building, and scoring. The auditor
 * and rule implementations land in later phases.
 */
export * from './types';
export { rollupScore, SEVERITY_WEIGHTS } from './scoring';
export { buildProjectContext, resolveMode } from './context';
export type { ModeOptions } from './context';
export { ALL_RULES } from './rules/index';
export { HarnessStrengthAuditor } from './auditor';
export type { AuditOptions } from './auditor';
