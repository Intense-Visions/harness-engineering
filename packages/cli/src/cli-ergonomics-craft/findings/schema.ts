/**
 * CliErgonomicsFinding schema — 3-axis (ADR 0019) finding emitted by
 * cli-ergonomics-craft. Imports the shared craft axes from
 * packages/cli/src/shared/craft/.
 *
 * Structural twin of docs-craft's DocsFinding and a direct sibling of the rest
 * of the craft family's per-skill finding types.
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
import type { CommandKind } from '../catalog/rubrics/types.js';

export type { Tier, Impact, Confidence };

export interface CliErgonomicsFinding {
  /** Stable code in the CLI-R\d{3} namespace. */
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
    kind: CommandKind;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface CliErgonomicsCraftSummary {
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

export interface CliErgonomicsCraftOutput {
  findings: CliErgonomicsFinding[];
  summary: CliErgonomicsCraftSummary;
}
