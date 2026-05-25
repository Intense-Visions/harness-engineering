/**
 * NamingFinding schema — 3-axis (ADR 0019) finding emitted by naming-craft's
 * critique phase. Reuses design-craft's Tier/Impact/Confidence types so the
 * craft family shares the axes; cross-craft consumers can introspect findings
 * without per-skill type-narrowing.
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Outputs → NamingFinding).
 */

import type { Tier, Impact, Confidence } from '../../design-craft/findings/schema.js';

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
