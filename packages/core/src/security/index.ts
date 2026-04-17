/**
 * Security module for secret detection, vulnerability scanning, and security baseline management.
 */

/**
 * Main scanner for security issues (secrets, injection, etc.) in the codebase.
 */
export { SecurityScanner, parseHarnessIgnore } from './scanner';

/**
 * Configuration and resolution for security rules and severity levels.
 */
export { SecurityConfigSchema, parseSecurityConfig, resolveRuleSeverity } from './config';

/**
 * Registry for managing security rules and their metadata.
 */
export { RuleRegistry } from './rules/registry';

/**
 * Utility for detecting the project stack (Node.js, React, Go, etc.) for targeted scanning.
 */
export { detectStack } from './stack-detector';

/**
 * Built-in security rules for common vulnerability categories.
 */
export { secretRules } from './rules/secrets';
export { injectionRules } from './rules/injection';
export { xssRules } from './rules/xss';
export { cryptoRules } from './rules/crypto';
export { pathTraversalRules } from './rules/path-traversal';
export { networkRules } from './rules/network';
export { deserializationRules } from './rules/deserialization';
export { agentConfigRules } from './rules/agent-config';
export { mcpRules } from './rules/mcp';
export { insecureDefaultsRules } from './rules/insecure-defaults';
export { sharpEdgesRules } from './rules/sharp-edges';

/**
 * Sentinel injection pattern engine for runtime prompt injection detection.
 */
export { scanForInjection, getInjectionPatterns, DESTRUCTIVE_BASH } from './injection-patterns';
export type { InjectionFinding, InjectionSeverity, InjectionPattern } from './injection-patterns';

/**
 * Sentinel taint state management — session-scoped taint lifecycle.
 */
export {
  readTaint,
  checkTaint,
  writeTaint,
  clearTaint,
  listTaintedSessions,
  getTaintFilePath,
} from './taint';
export type { TaintState, TaintFinding, TaintCheckResult } from './taint';

/**
 * Stack-specific security rules for specific frameworks and languages.
 */
export { nodeRules } from './rules/stack/node';
export { expressRules } from './rules/stack/express';
export { reactRules } from './rules/stack/react';
export { goRules } from './rules/stack/go';

/**
 * Comprehensive type definitions for security findings, rules, and configuration.
 */
export type {
  SecurityCategory,
  SecuritySeverity,
  SecurityConfidence,
  SecurityRule,
  SecurityFinding,
  ScanResult,
  SecurityConfig,
  RuleOverride,
  SuppressionRecord,
} from './types';

/**
 * Default configuration for security scanning.
 */
export { DEFAULT_SECURITY_CONFIG } from './types';

/**
 * Shared scan-config types and utilities for CLI and orchestrator.
 */
export {
  mapSecuritySeverity,
  computeOverallSeverity,
  computeScanExitCode,
  mapInjectionFindings,
  isDuplicateFinding,
  mapSecurityFindings,
} from './scan-config-shared';
export type {
  ScanConfigFinding,
  ScanConfigFileResult,
  ScanConfigResult,
} from './scan-config-shared';

/**
 * Security posture timeline — historical tracking of security metrics over time.
 */
export {
  SecurityCategorySnapshotSchema,
  SupplyChainSnapshotSchema,
  SecurityTimelineSnapshotSchema,
  FindingLifecycleSchema,
  SecurityTimelineFileSchema,
  DirectionSchema as SecurityDirectionSchema,
  SecurityTrendLineSchema,
  TrendAttributionSchema,
  SecurityTrendResultSchema,
  TimeToFixStatsSchema,
  TimeToFixResultSchema,
  securityFindingId,
  EMPTY_SUPPLY_CHAIN,
} from './security-timeline-types';

export type {
  SecurityCategorySnapshot,
  SupplyChainSnapshot,
  SecurityTimelineSnapshot,
  FindingLifecycle,
  SecurityTimelineFile,
  Direction as SecurityDirection,
  SecurityTrendLine,
  TrendAttribution,
  SecurityTrendResult,
  TimeToFixStats,
  TimeToFixResult,
} from './security-timeline-types';

export { SecurityTimelineManager } from './security-timeline-manager';
