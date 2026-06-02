// --- Phase 4: Fan-Out types ---

import type { ContextBundle, ReviewDomain } from './context';

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
 * Subagent identifier — finer-grained than `domain`. The 4 original agents
 * use the same value as their domain; conditional subagents use their own.
 */
export type ReviewSubagent =
  | 'compliance'
  | 'bug'
  | 'security'
  | 'architecture'
  | 'learnings'
  | 'adversarial'
  | 'typescript-strict'
  | 'frontend-races';

/**
 * Anchored confidence rubric. Higher = more mechanically constructible.
 * 100 — directly verifiable from the diff
 *  75 — full concrete scenario from the diff
 *  50 — judgment-based
 *  25 — speculative; agents must not emit (suppress)
 */
export type ReviewConfidence = 25 | 50 | 75 | 100;

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
  /**
   * Confidence level of the finding.
   * - String values ('high'|'medium'|'low') — produced by the security agent (legacy).
   * - Numeric anchors (25|50|75|100) — produced by conditional subagents per the
   *   shared confidence rubric (see references/confidence-rubric.md).
   */
  confidence?: 'high' | 'medium' | 'low' | ReviewConfidence;
  /** Specific remediation guidance (security domain only) */
  remediation?: string;
  /** Links to CWE/OWASP reference docs (security domain only) */
  references?: string[];
  /**
   * Trust score (0-100%) computed in Phase 5.5 from validation method,
   * evidence quality, cross-agent agreement, and historical accuracy.
   */
  trustScore?: number;
  /**
   * ID of the RubricItem this finding was produced against (thorough mode only).
   * Lets consumers trace a finding back to the pre-generated criterion.
   */
  rubricItemId?: string;
  /**
   * Subagent that produced this finding. Finer-grained than `domain` — distinguishes
   * the new conditional subagents (adversarial, typescript-strict, frontend-races)
   * from the original bug/security/architecture/compliance agents.
   *
   * The existing 4 agents do not populate this; new agents always do.
   */
  subagent?: ReviewSubagent;
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
