/**
 * DocsFinding schema — 3-axis (ADR 0019) finding emitted by docs-craft.
 * Imports the shared craft axes from packages/cli/src/shared/craft/.
 *
 * Structural twin of harness-design-craft's CraftFinding and a direct sibling
 * of knowledge-craft's KnowledgeFinding.
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
import type { DocKind } from '../catalog/rubrics/types.js';

export type { Tier, Impact, Confidence };

export interface DocsFinding {
  /** Stable code in DOCS-R\d{3} namespace. */
  code: string;
  /** Always 'critique' in v1 (POLISH / BENCHMARK phases are deferred). */
  phase: 'critique';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: {
    file: string;
    /** Relative path from the project root for display. */
    relative: string;
    kind: DocKind;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface DocsCraftSummary {
  phaseRun: ['critique'];
  mode: 'fast';
  durationMs: number;
  llmCalls: { provider: string; model: string; count: number; costUsd: number };
  catalog: { rubricsApplied: string[]; exemplarsAvailable: number };
  counts: {
    filesScanned: number;
    filesSkipped: number;
  };
  runId: string;
}

export interface DocsCraftOutput {
  findings: DocsFinding[];
  summary: DocsCraftSummary;
}
