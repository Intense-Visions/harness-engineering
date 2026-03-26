// --- Phase 8: Model Tiering Config types ---

import type { MechanicalCheckResult } from './mechanical';
import type { ContextBundle, DiffInfo, GraphAdapter } from './context';
import type { ReviewFinding } from './fan-out';
import type { GitHubInlineComment, PrMetadata, ReviewAssessment, ReviewStrength } from './output';

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
  exclusionSet?: import('../exclusion-set').ExclusionSet;

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
export interface ReviewPipelineResult {
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
