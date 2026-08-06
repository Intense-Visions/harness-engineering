/**
 * ApiFinding schema — 3-axis (ADR 0019) finding emitted by api-craft. Imports
 * the shared craft axes from packages/cli/src/shared/craft/.
 *
 * Structural twin of cli-ergonomics-craft's CliErgonomicsFinding (per-surface
 * critique of a discovered artifact) and a direct sibling of the rest of the
 * craft family's per-skill finding types.
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
import type { ApiSurfaceKind } from '../catalog/rubrics/types.js';

export type { Tier, Impact, Confidence };

export interface ApiFinding {
  /** Stable code in the API-R\d{3} namespace. */
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
    kind: ApiSurfaceKind;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface ApiCraftSummary {
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

export interface ApiCraftOutput {
  findings: ApiFinding[];
  summary: ApiCraftSummary;
}
