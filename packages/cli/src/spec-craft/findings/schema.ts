/**
 * SpecFinding schema — 3-axis (ADR 0019) finding emitted by spec-craft's
 * critique phase. Imports the shared craft axes (Tier / Impact /
 * Confidence) from packages/cli/src/shared/craft/.
 *
 * Source: docs/changes/craft-pipeline/spec-craft/proposal.md
 *   (Outputs → SpecFinding).
 */

import type { ClumpResult } from '@harness-engineering/core';
import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';

export type { Tier, Impact, Confidence };

export interface SpecFinding {
  /** Stable code in SPEC-R\d{3} namespace. */
  code: string;
  /** Always 'critique' in v1 (no POLISH phase yet). */
  phase: 'critique';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: {
    file: string;
    /** Original H2 heading text (e.g., "Decisions"). */
    section: string;
    /** First line of the section's body (1-indexed). */
    line: number;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface SpecCraftSummary {
  phaseRun: ['critique'];
  mode: 'fast';
  durationMs: number;
  llmCalls: { provider: string; model: string; count: number; costUsd: number };
  catalog: { rubricsApplied: string[] };
  docsScanned: number;
  sectionsScanned: number;
  runId: string;
}

export interface SpecCraftOutput {
  findings: SpecFinding[];
  summary: SpecCraftSummary;
  /**
   * The work units this run emits (docs/changes/clumping/proposal.md, Phase 3).
   *
   * `findings` stays the authoritative raw output; this is the GROUPED view an
   * agent files from — N like findings over one scope as one work unit rather
   * than N issues. Built by `shared/craft/findings/clumpable.ts` at the single
   * boundary a craft run owns: emission.
   */
  clumps: ClumpResult;
}
