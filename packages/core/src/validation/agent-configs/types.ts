/**
 * Types for the agent-config validation engine (hybrid: agnix binary + fallback rules).
 */

/** Severity of a single agent-config diagnostic. */
export type AgentConfigSeverity = 'error' | 'warning' | 'info';

/** A single diagnostic emitted by either the agnix binary or the fallback rule set. */
export interface AgentConfigFinding {
  /** Path to the offending file, relative to the project root. */
  file: string;
  /** Optional 1-indexed line number. */
  line?: number;
  /** Optional 1-indexed column number. */
  column?: number;
  /** Rule identifier. agnix rules look like `CC-MEM-006`; fallback rules look like `HARNESS-AC-001`. */
  ruleId: string;
  /** Severity of the finding. */
  severity: AgentConfigSeverity;
  /** Human-readable description of the issue. */
  message: string;
  /** Optional suggestion for how to resolve the issue. */
  suggestion?: string;
}

/** Reason the orchestrator fell back to the TypeScript rule set. */
export type AgentConfigFallbackReason =
  | 'binary-not-found'
  | 'tool-timeout'
  | 'tool-failure'
  | 'tool-parse-error'
  | 'env-disabled';

/** Result of running agent-config validation. */
export interface AgentConfigValidation {
  /** Which engine produced the diagnostics. */
  engine: 'agnix' | 'fallback';
  /** `true` when no error-severity findings were emitted (warnings allowed unless strict). */
  valid: boolean;
  /** Populated when `engine === 'fallback'` to explain why. */
  fellBackBecause?: AgentConfigFallbackReason;
  /** Normalized diagnostics. */
  issues: AgentConfigFinding[];
}

/** Options accepted by `validateAgentConfigs`. */
export interface AgentConfigOptions {
  /** Treat warnings as errors (propagated to agnix via `--strict`). */
  strict?: boolean;
  /** Explicit path to the agnix binary; overrides PATH discovery. */
  agnixBin?: string;
  /** Maximum milliseconds to wait for the agnix binary before falling back. Defaults to 30_000. */
  agnixTimeoutMs?: number;
}
