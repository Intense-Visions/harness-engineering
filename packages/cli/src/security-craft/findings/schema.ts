/**
 * SecurityFinding schema — 3-axis (ADR 0019) finding emitted by
 * security-craft. Imports shared craft axes from
 * packages/cli/src/shared/craft/.
 *
 * Source: docs/changes/craft-pipeline/security-craft/proposal.md
 *   (Outputs → SecurityFinding).
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';

export type { Tier, Impact, Confidence };

/**
 * The AST signal kinds that earn a file critique. Files with zero signals
 * are skipped silently (FP-management strategy — see proposal Decisions #2).
 */
export type SignalKind =
  | 'http-handler'
  | 'middleware'
  | 'auth-api'
  | 'privileged-op'
  | 'data-egress'
  | 'raw-query'
  | 'secret-handling';

export interface SecuritySignal {
  kind: SignalKind;
  /** Specific construct identifier: 'child_process.exec', 'jwt.verify', etc. */
  marker: string;
  /** 1-based line number of the signal site. */
  line: number;
}

export interface SecurityFinding {
  /** Stable code in SEC-R\d{3} namespace. */
  code: string;
  phase: 'critique';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: {
    file: string;
    /** AST signal that triggered this rubric. */
    signal: string;
    /** Line of the signal site for navigation. */
    line: number;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface SecurityCraftSummary {
  phaseRun: ['critique'];
  mode: 'fast';
  durationMs: number;
  llmCalls: { provider: string; model: string; count: number; costUsd: number };
  catalog: { rubricsApplied: string[] };
  counts: {
    filesScanned: number;
    filesSkippedNoSignal: number;
    signalsDetected: number;
  };
  runId: string;
}

export interface SecurityCraftOutput {
  findings: SecurityFinding[];
  summary: SecurityCraftSummary;
}
