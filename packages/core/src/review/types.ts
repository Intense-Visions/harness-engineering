/**
 * A finding produced by a mechanical check (lint, typecheck, security scan, harness validate/deps/docs).
 * Used as input to the exclusion set and reported when the pipeline stops due to mechanical failures.
 */
export interface MechanicalFinding {
  /** Which mechanical tool produced this finding */
  tool: 'validate' | 'check-deps' | 'check-docs' | 'security-scan';
  /** File path (absolute or project-relative) */
  file: string;
  /** Line number, if available */
  line?: number;
  /** Rule ID from the tool (e.g., security rule ID) */
  ruleId?: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Result of running all mechanical checks.
 */
export interface MechanicalCheckResult {
  /** Overall pass/fail — false if any check produced errors */
  pass: boolean;
  /** True if the pipeline should stop (validate or check-deps failed) */
  stopPipeline: boolean;
  /** All findings from all mechanical checks */
  findings: MechanicalFinding[];
  /** Per-check status for reporting */
  checks: {
    validate: MechanicalCheckStatus;
    checkDeps: MechanicalCheckStatus;
    checkDocs: MechanicalCheckStatus;
    securityScan: MechanicalCheckStatus;
  };
}

export type MechanicalCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/**
 * Options for running mechanical checks.
 */
export interface MechanicalCheckOptions {
  /** Project root directory */
  projectRoot: string;
  /** Config object (from resolveConfig or harness.config.json) */
  config: Record<string, unknown>;
  /** Skip specific checks */
  skip?: Array<'validate' | 'check-deps' | 'check-docs' | 'security-scan'>;
  /** Only scan these files for security (e.g., changed files from a PR) */
  changedFiles?: string[];
}

// --- Phase 3: Context Scoping types ---

/**
 * Change type detected from commit message prefix or diff heuristic.
 */
export type ChangeType = 'feature' | 'bugfix' | 'refactor' | 'docs';

/**
 * Review domain — each gets its own scoped context bundle.
 */
export type ReviewDomain = 'compliance' | 'bug' | 'security' | 'architecture';

/**
 * A file included in a context bundle with its content.
 */
export interface ContextFile {
  /** File path (project-relative) */
  path: string;
  /** File content (full or truncated to budget) */
  content: string;
  /** Why this file was included */
  reason:
    | 'changed'
    | 'import'
    | 'test'
    | 'spec'
    | 'type'
    | 'convention'
    | 'graph-dependency'
    | 'graph-impact';
  /** Line count of the content */
  lines: number;
}

/**
 * Commit history entry for a changed file.
 */
export interface CommitHistoryEntry {
  /** Short SHA */
  sha: string;
  /** One-line commit message */
  message: string;
  /** File path this commit touched */
  file: string;
}

/**
 * Context bundle assembled for a single review domain.
 * Each Phase 4 subagent receives one of these.
 */
export interface ContextBundle {
  /** Which review domain this bundle is for */
  domain: ReviewDomain;
  /** Detected change type */
  changeType: ChangeType;
  /** Files that were changed in the diff */
  changedFiles: ContextFile[];
  /** Additional context files (imports, tests, specs, types, conventions) */
  contextFiles: ContextFile[];
  /**
   * Recent commit history for changed files.
   * @remarks Empty by default from `scopeContext()`. Callers should populate this
   * via `git log` commands at the orchestration layer before passing bundles to
   * Phase 4 subagents. Example: `git log --oneline -5 -- <file>` per changed file.
   */
  commitHistory: CommitHistoryEntry[];
  /** Total lines of diff */
  diffLines: number;
  /** Total lines of context gathered */
  contextLines: number;
}

/**
 * Information about a diff, used as input to context scoping.
 */
export interface DiffInfo {
  /** Changed file paths (project-relative) */
  changedFiles: string[];
  /** New files (subset of changedFiles) */
  newFiles: string[];
  /** Deleted files (subset of changedFiles) */
  deletedFiles: string[];
  /** Total lines of diff across all files */
  totalDiffLines: number;
  /** Per-file diff content */
  fileDiffs: Map<string, string>;
}

/**
 * Adapter interface for graph queries.
 * Callers implement this using @harness-engineering/graph when available.
 * The context scoper does NOT depend on the graph package directly.
 */
export interface GraphAdapter {
  /**
   * Find direct dependencies of a file (imports, calls).
   * Returns file paths of dependencies.
   */
  getDependencies(filePath: string): Promise<string[]>;

  /**
   * Find files impacted by changes to a file (reverse dependencies, tests, docs).
   * Returns file paths of impacted nodes grouped by category.
   */
  getImpact(filePath: string): Promise<{
    tests: string[];
    docs: string[];
    code: string[];
  }>;

  /**
   * Check if a path exists in the dependency graph between two files.
   * Used for reachability validation in Phase 5 (exported here for shared use).
   */
  isReachable(fromFile: string, toFile: string, maxDepth?: number): Promise<boolean>;
}

/**
 * Options for context scoping.
 */
export interface ContextScopeOptions {
  /** Project root directory */
  projectRoot: string;
  /** Diff information */
  diff: DiffInfo;
  /** Most recent commit message (for change-type detection) */
  commitMessage: string;
  /** Graph adapter (optional -- falls back to heuristics when absent) */
  graph?: GraphAdapter;
  /** Convention files to include for compliance domain */
  conventionFiles?: string[];
  /** Output from `harness check-deps` (for architecture fallback) */
  checkDepsOutput?: string;
  /** Pre-gathered commit history entries. If provided, included in all bundles. */
  commitHistory?: CommitHistoryEntry[];
}

// --- Phase 4: Fan-Out types ---

/**
 * Model tier — abstract label resolved at runtime from project config.
 * - fast: haiku-class (gate, context phases)
 * - standard: sonnet-class (compliance, architecture agents)
 * - strong: opus-class (bug detection, security agents)
 */
export type ModelTier = 'fast' | 'standard' | 'strong';

/**
 * Severity level for AI-produced review findings.
 */
export type FindingSeverity = 'critical' | 'important' | 'suggestion';

/**
 * A finding produced by a Phase 4 review subagent.
 * Common schema used across all four agents and in Phases 5-7.
 */
export interface ReviewFinding {
  /** Unique identifier for dedup (format: domain-file-line, e.g. "bug-src/auth.ts-42") */
  id: string;
  /** File path (project-relative) */
  file: string;
  /** Start and end line numbers */
  lineRange: [number, number];
  /** Which review domain produced this finding */
  domain: ReviewDomain;
  /** Severity level */
  severity: FindingSeverity;
  /** One-line summary of the issue */
  title: string;
  /** Why this is an issue — the reasoning */
  rationale: string;
  /** Suggested fix, if available */
  suggestion?: string;
  /** Supporting context/evidence from the agent */
  evidence: string[];
  /** How this finding was validated (set in Phase 5; agents set 'heuristic' by default) */
  validatedBy: 'mechanical' | 'graph' | 'heuristic';
  /** CWE identifier, e.g. "CWE-89" (security domain only) */
  cweId?: string;
  /** OWASP Top 10 category, e.g. "A03:2021 Injection" (security domain only) */
  owaspCategory?: string;
  /** Confidence level of the finding (security domain only) */
  confidence?: 'high' | 'medium' | 'low';
  /** Specific remediation guidance (security domain only) */
  remediation?: string;
  /** Links to CWE/OWASP reference docs (security domain only) */
  references?: string[];
}

/**
 * Descriptor for a review subagent — metadata about its purpose and model tier.
 */
export interface ReviewAgentDescriptor {
  /** Review domain this agent covers */
  domain: ReviewDomain;
  /** Model tier annotation (resolved to a concrete model at runtime) */
  tier: ModelTier;
  /** Human-readable name for output */
  displayName: string;
  /** Focus area descriptions for this agent */
  focusAreas: string[];
}

/**
 * Result from a single review agent.
 */
export interface AgentReviewResult {
  /** Which domain produced these findings */
  domain: ReviewDomain;
  /** Findings produced by this agent */
  findings: ReviewFinding[];
  /** Time taken in milliseconds */
  durationMs: number;
}

/**
 * Options for the fan-out orchestrator.
 */
export interface FanOutOptions {
  /** Context bundles from Phase 3 (one per domain) */
  bundles: ContextBundle[];
}

// --- Phase 7: Output types ---

/**
 * Assessment decision — determines exit code and PR review action.
 */
export type ReviewAssessment = 'approve' | 'comment' | 'request-changes';

/**
 * A strength identified during review (positive feedback).
 */
export interface ReviewStrength {
  /** File path (project-relative), or null for project-wide strengths */
  file: string | null;
  /** One-line description of what's done well */
  description: string;
}

/**
 * Options for formatting review output.
 */
export interface ReviewOutputOptions {
  /** Deduplicated findings from Phase 6 */
  findings: ReviewFinding[];
  /** Strengths identified during review */
  strengths: ReviewStrength[];
  /** PR number (required for GitHub comments) */
  prNumber?: number;
  /** Repository in owner/repo format (required for GitHub comments) */
  repo?: string;
}

/**
 * A formatted GitHub inline comment ready for posting.
 */
export interface GitHubInlineComment {
  /** File path (project-relative) */
  path: string;
  /** Line number for the comment */
  line: number;
  /** Side of the diff ('RIGHT' for additions) */
  side: 'RIGHT';
  /** Comment body (markdown) */
  body: string;
}

// --- Phase 1: Eligibility Gate types ---

/**
 * Information about a prior review on this PR.
 */
export interface PriorReview {
  /** The head commit SHA that was reviewed */
  headSha: string;
  /** ISO timestamp of when the review was submitted */
  reviewedAt: string;
}

/**
 * PR metadata used by the eligibility gate.
 * This is a pure data object — the caller is responsible for fetching
 * this data from GitHub (via `gh` CLI, GitHub MCP, or mock).
 */
export interface PrMetadata {
  /** PR state: open, closed, or merged */
  state: 'open' | 'closed' | 'merged';
  /** Whether the PR is marked as draft */
  isDraft: boolean;
  /** List of changed file paths (project-relative) */
  changedFiles: string[];
  /** The HEAD commit SHA of the PR branch */
  headSha: string;
  /** Prior reviews submitted on this PR */
  priorReviews: PriorReview[];
}

/**
 * Result of the eligibility gate check.
 */
export interface EligibilityResult {
  /** Whether the PR is eligible for review */
  eligible: boolean;
  /** Human-readable reason when not eligible */
  reason?: string;
}

// --- Phase 8: Model Tiering Config types ---

/**
 * Configuration mapping abstract model tiers to concrete model identifiers.
 * All tiers are optional — unmapped tiers resolve to undefined (use current model).
 *
 * Example config:
 *   { fast: "haiku", standard: "sonnet", strong: "opus" }
 *   { fast: "gpt-4o-mini", standard: "gpt-4o", strong: "o1" }
 */
export interface ModelTierConfig {
  fast?: string;
  standard?: string;
  strong?: string;
}

/**
 * Known provider identifiers for default tier resolution.
 */
export type ModelProvider = 'claude' | 'openai' | 'gemini';

/**
 * Default model tier mappings per provider.
 * Used as fallback when config does not specify a tier.
 */
export type ProviderDefaults = Record<ModelProvider, ModelTierConfig>;

// --- Pipeline Orchestrator types ---

/**
 * Flags controlling pipeline behavior, derived from CLI/MCP input.
 */
export interface PipelineFlags {
  /** Post inline comments to GitHub PR */
  comment: boolean;
  /** Enable eligibility gate (CI mode) */
  ci: boolean;
  /** Add threat modeling pass to security agent */
  deep: boolean;
  /** Skip mechanical checks */
  noMechanical: boolean;
}

/**
 * Mutable context object threaded through all 7 pipeline phases.
 * Each phase reads from upstream fields and writes to its own fields.
 */
export interface PipelineContext {
  // --- Input (set before pipeline starts) ---
  /** Project root directory */
  projectRoot: string;
  /** Diff information from git */
  diff: DiffInfo;
  /** Most recent commit message */
  commitMessage: string;
  /** Pipeline flags from CLI/MCP */
  flags: PipelineFlags;
  /** Model tier config (from harness.config.json review.model_tiers) */
  modelTierConfig?: ModelTierConfig;
  /** Graph adapter (optional — enhances context and validation) */
  graph?: GraphAdapter;
  /** PR metadata for gate phase and GitHub comments */
  prMetadata?: PrMetadata;
  /** Convention file paths for compliance context */
  conventionFiles?: string[];
  /** Output from `harness check-deps` for architecture fallback */
  checkDepsOutput?: string;
  /** Repository in owner/repo format (for --comment) */
  repo?: string;

  // --- Phase 1: GATE output ---
  /** Whether the pipeline was skipped by the gate */
  skipped: boolean;
  /** Reason for skipping (when skipped is true) */
  skipReason?: string;

  // --- Phase 2: MECHANICAL output ---
  /** Mechanical check results */
  mechanicalResult?: MechanicalCheckResult;
  /** Exclusion set built from mechanical findings */
  exclusionSet?: import('./exclusion-set').ExclusionSet;

  // --- Phase 3: CONTEXT output ---
  /** Context bundles per review domain */
  contextBundles?: ContextBundle[];

  // --- Phase 4: FAN-OUT output ---
  /** Raw findings from all agents */
  rawFindings?: ReviewFinding[];

  // --- Phase 5: VALIDATE output ---
  /** Findings after mechanical exclusion and reachability validation */
  validatedFindings?: ReviewFinding[];

  // --- Phase 6: DEDUP+MERGE output ---
  /** Final deduplicated finding list */
  dedupedFindings?: ReviewFinding[];

  // --- Phase 7: OUTPUT ---
  /** Strengths identified during review */
  strengths: ReviewStrength[];
  /** Final assessment */
  assessment?: ReviewAssessment;
  /** Formatted terminal output */
  terminalOutput?: string;
  /** GitHub inline comments (when --comment is set) */
  githubComments?: GitHubInlineComment[];
  /** Process exit code (0 = approve/comment, 1 = request-changes) */
  exitCode: number;
}

/**
 * Immutable result returned from `runPipeline()`.
 */
export interface PipelineResult {
  /** Whether the pipeline was skipped by the eligibility gate */
  skipped: boolean;
  /** Reason for skipping */
  skipReason?: string;
  /** Whether the pipeline stopped due to mechanical failures */
  stoppedByMechanical: boolean;
  /** Final assessment (undefined if skipped or stopped) */
  assessment?: ReviewAssessment;
  /** Deduplicated findings */
  findings: ReviewFinding[];
  /** Strengths identified */
  strengths: ReviewStrength[];
  /** Formatted terminal output */
  terminalOutput: string;
  /** GitHub inline comments (empty if --comment not set) */
  githubComments: GitHubInlineComment[];
  /** Process exit code */
  exitCode: number;
  /** Mechanical check result (for reporting) */
  mechanicalResult?: MechanicalCheckResult;
}
