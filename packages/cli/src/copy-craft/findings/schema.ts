/**
 * CopyFinding schema — 3-axis (ADR 0019) finding emitted by copy-craft.
 * Imports shared craft axes (Tier / Impact / Confidence) from
 * packages/cli/src/shared/craft/.
 *
 * Source: docs/changes/craft-pipeline/copy-craft/proposal.md
 *   (Outputs → CopyFinding).
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';

export type { Tier, Impact, Confidence };

export type CopySurface = 'error' | 'log' | 'cli-output' | 'commit' | 'pr-description' | 'comment';

export interface CopyFinding {
  /** Stable code in COPY-R\d{3} namespace. */
  code: string;
  /** Always 'critique' in v1 (no POLISH phase yet). */
  phase: 'critique';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: {
    /** File path for source surfaces; ref (commit hash / PR number) for git surfaces. */
    file: string;
    line?: number;
    surface: CopySurface;
    /** The actual copy snippet that was critiqued. */
    snippet: string;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface CopyCraftSummary {
  phaseRun: ['critique'];
  mode: 'fast';
  durationMs: number;
  llmCalls: { provider: string; model: string; count: number; costUsd: number };
  catalog: { rubricsApplied: string[]; surfacesScanned: CopySurface[] };
  counts: Record<CopySurface, number>;
  skippedSurfaces: Array<{ surface: CopySurface; reason: string }>;
  runId: string;
}

export interface CopyCraftOutput {
  findings: CopyFinding[];
  summary: CopyCraftSummary;
}

/**
 * Shared shape returned by every extractor. The critique phase consumes
 * this uniformly regardless of which extractor produced it.
 */
export interface ExtractedCopyItem {
  file: string;
  line?: number;
  surface: CopySurface;
  snippet: string;
  context: {
    /** For errors: "TypeError", "ValidationError", "Error" */
    errorType?: string;
    /** For logs: "info", "warn", "error", "debug" */
    logLevel?: string;
    /** For commits / PRs: hash / number */
    ref?: string;
  };
}
