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
  /**
   * The mechanical SecurityScanner rule this heuristic finding mirrors, e.g.
   * "SEC-INJ-002" (security domain only). Set by the security agent so the
   * VALIDATE chokepoint can honor a `// harness-ignore SEC-XXX-NNN` annotation
   * on the finding's line exactly as the SecurityScanner path does (#1302).
   * Absent on findings that have no corresponding scanner rule.
   */
  securityRuleId?: string;
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
  /**
   * Emission-invariant annotations recorded by the finding-integrity layer
   * (Phase 5.75, issue #984). Absent on findings that satisfied every invariant,
   * so a clean review is byte-identical to before the layer existed. Present
   * entries are the audit trail for a severity downgrade or a confidence
   * reconciliation — they exist so a reviewer can see *why* a finding was
   * altered without reading the pipeline source.
   */
  integrityViolations?: FindingIntegrityViolation[];
}

/**
 * The emission invariants enforced on every finding before it is published.
 *
 * - `evidence-class-consistency` — a finding claiming a vulnerability class
 *   (a `cweId`, an `owaspCategory`, or `domain: 'security'` at `critical`) must
 *   carry evidence that could plausibly substantiate that class. A CWE-89
 *   finding whose evidence is "File has 442 lines (threshold: 300)" fails.
 * - `confidence-reconciliation` — a finding's `confidence` label may not exceed
 *   what its `validatedBy` method and `trustScore` can support.
 */
export type FindingInvariant = 'evidence-class-consistency' | 'confidence-reconciliation';

/** What the integrity layer did to a finding that failed an invariant. */
export type FindingIntegrityAction = 'dropped' | 'downgraded' | 'confidence-reconciled';

/** A single recorded invariant failure. */
export interface FindingIntegrityViolation {
  /** `id` of the offending finding (kept so report entries stand alone). */
  findingId: string;
  /** Which invariant the finding failed. */
  invariant: FindingInvariant;
  /** What the layer did about it. */
  action: FindingIntegrityAction;
  /** Human-readable explanation, safe to print in a review comment. */
  reason: string;
  /** Severity before a `downgraded` action. */
  originalSeverity?: FindingSeverity;
  /** Confidence before a `confidence-reconciled` (or `downgraded`) action. */
  originalConfidence?: 'high' | 'medium' | 'low' | ReviewConfidence;
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
