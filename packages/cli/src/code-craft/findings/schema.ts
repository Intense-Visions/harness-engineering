/**
 * CodeFinding schema — 3-axis (ADR 0019) finding emitted by code-craft.
 * Imports the shared craft axes from packages/cli/src/shared/craft/.
 *
 * Structural twin of security-craft's SecurityFinding (per-unit critique of
 * TS/JS source) and a direct sibling of docs-craft's DocsFinding.
 *
 * Source: docs/changes/code-craft/proposal.md
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';

export type { Tier, Impact, Confidence };

/**
 * The AST code-unit kinds that earn a critique. A file with zero substantive
 * units (barrels, pure type declarations, trivial one-liners) is skipped —
 * the FP/cost-management analogue of security-craft's zero-signal skip.
 */
export type UnitKind = 'function' | 'method' | 'class';

export interface CodeUnit {
  kind: UnitKind;
  /** Best-effort declared name ('<anonymous>' when none can be recovered). */
  name: string;
  /** 1-based line of the unit's first token. */
  line: number;
  /** 1-based line of the unit's last token. */
  endLine: number;
}

export interface CodeFinding {
  /** Stable code in CODE-R\d{3} namespace. */
  code: string;
  /** Always 'critique' in v1 (POLISH / BENCHMARK phases are deferred). */
  phase: 'critique';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: {
    file: string;
    /** The code unit that triggered this rubric: 'runCodeCraft', 'CodeUnit', … */
    unit: string;
    kind: UnitKind;
    /** Line of the unit declaration for navigation. */
    line: number;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface CodeCraftSummary {
  phaseRun: ['critique'];
  mode: 'fast';
  durationMs: number;
  llmCalls: { provider: string; model: string; count: number; costUsd: number };
  catalog: { rubricsApplied: string[]; exemplarsAvailable: number };
  counts: {
    filesScanned: number;
    filesSkippedNoUnit: number;
    unitsDetected: number;
  };
  runId: string;
}

export interface CodeCraftOutput {
  findings: CodeFinding[];
  summary: CodeCraftSummary;
}
