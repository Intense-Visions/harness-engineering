/**
 * NamingFinding schema — 3-axis (ADR 0019) finding emitted by naming-craft's
 * critique phase. Reuses design-craft's Tier/Impact/Confidence types so the
 * craft family shares the axes; cross-craft consumers can introspect findings
 * without per-skill type-narrowing.
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Outputs → NamingFinding).
 */

import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';

export type { Tier, Impact, Confidence };

export type IdentifierKind = 'variable' | 'function' | 'type' | 'file';

export type NamingConvention = 'camelCase' | 'snake_case' | 'PascalCase' | 'kebab-case';

export interface NamingFinding {
  /** Stable code in the NAME-R\d{3} namespace. */
  code: string;
  /** Always 'critique' in v1 (no POLISH phase yet). */
  phase: 'critique';
  tier: Tier;
  impact: Impact;
  confidence: Confidence;
  target: {
    file: string;
    line?: number;
    identifier: string;
    kind: IdentifierKind;
  };
  message: string;
  cite: { rubricId: string; source: string };
  derived: { priority: number };
}

export interface NamingCraftSummary {
  phaseRun: ['critique'];
  mode: 'fast';
  durationMs: number;
  llmCalls: { provider: string; model: string; count: number; costUsd: number };
  catalog: { rubricsApplied: string[] };
  convention: ProjectConvention;
  /**
   * Count of source files walked/read. Zero means nothing analyzable was
   * found — e.g. a non-TS/JS (Python, Go, …) project — which the diagnostic
   * surfaces so an empty result isn't mistaken for a clean bill of health.
   * On a partial in-session finalize this narrows to the files actually
   * critiqued, so it never implies reach over files that went unjudged.
   */
  filesScanned: number;
  /**
   * Prompt-level reach of a two-step in-session finalize:
   * `promptsAnswered` of `promptsTotal` collected prompts were judged.
   * Absent on the inline path (which judges everything in one pass); when
   * present and `promptsAnswered < promptsTotal` the critique is explicitly
   * partial and the summary must not be read as full coverage.
   */
  coverage?: { promptsAnswered: number; promptsTotal: number };
  runId: string;
}

export interface ProjectConvention {
  variables: NamingConvention | null;
  functions: NamingConvention | null;
  types: NamingConvention | null;
  files: NamingConvention | null;
}

export interface NamingCraftOutput {
  findings: NamingFinding[];
  summary: NamingCraftSummary;
}
