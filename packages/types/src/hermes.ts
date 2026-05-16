/**
 * @harness-engineering/types — Hermes Phase 1 (Session Search + Insights)
 *
 * Types and Zod schemas for the session search index, LLM-generated session
 * summary, and the insights aggregator. Shared across orchestrator (concrete
 * impl) and CLI (consumer).
 *
 * Spec: docs/changes/hermes-phase-1-session-search/proposal.md
 */
import { z } from 'zod';

/** File kinds participating in the FTS5 index. */
export const INDEXED_FILE_KINDS = [
  'summary',
  'learnings',
  'failures',
  'sections',
  'llm_summary',
] as const;
export type IndexedFileKind = (typeof INDEXED_FILE_KINDS)[number];

/** Structured payload the LLM returns when summarising an archived session. */
export const SessionSummarySchema = z.object({
  headline: z.string().min(1).max(120),
  keyOutcomes: z.array(z.string()).max(20),
  openQuestions: z.array(z.string()).max(20),
  relatedSessions: z.array(z.string()).default([]),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** Metadata persisted alongside the LLM summary in `llm-summary.md` frontmatter. */
export interface SessionSummaryMeta {
  generatedAt: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  schemaVersion: 1;
}

/** A single ranked session-search match. */
export interface SessionSearchMatch {
  sessionId: string;
  archived: boolean;
  fileKind: IndexedFileKind;
  path: string;
  bm25: number;
  snippet: string;
}

/** Wire-shape returned by both `searchSessions` and the `search_sessions` MCP tool. */
export interface SessionSearchResult {
  matches: SessionSearchMatch[];
  durationMs: number;
  totalIndexed: number;
}

/** Wire-shape returned by `reindexFromArchive`. */
export interface ReindexStats {
  sessionsIndexed: number;
  docsWritten: number;
  durationMs: number;
}

/** Top-level keys the insights aggregator composes. */
export const INSIGHTS_KEYS = ['health', 'entropy', 'decay', 'attention', 'impact'] as const;
export type InsightsKey = (typeof INSIGHTS_KEYS)[number];

/** Health sub-report — mirrors `HealthSnapshot` aggregates from packages/cli/src/skill/health-snapshot.ts. */
export interface InsightsHealthBlock {
  passed: boolean;
  signals: string[];
  summary: string;
}

export interface InsightsEntropyBlock {
  driftCount: number;
  deadFiles: number;
  deadExports: number;
}

export interface InsightsDecayBlock {
  recentBumps: number;
  topAffected: string[];
}

export interface InsightsAttentionBlock {
  activeThreadCount: number;
  staleThreadCount: number;
}

export interface InsightsImpactBlock {
  recentBlastRadius: Array<{ node: string; affected: number }>;
}

/** Composite insights report — top-level surface returned by `harness insights` + MCP `insights_summary`. */
export interface InsightsReport {
  generatedAt: string;
  project: { name?: string; root: string };
  health: InsightsHealthBlock | null;
  entropy: InsightsEntropyBlock | null;
  decay: InsightsDecayBlock | null;
  attention: InsightsAttentionBlock | null;
  impact: InsightsImpactBlock | null;
  /** Per-component warning entries when a sub-aggregator failed. */
  warnings: string[];
}

/** Per-summary configuration. Defaults: see proposal §"Config schema additions". */
export interface HermesSummaryConfig {
  enabled?: boolean;
  inputBudgetTokens?: number;
  timeoutMs?: number;
  model?: string;
}

/** Per-search configuration. */
export interface HermesSearchConfig {
  indexedFileKinds?: IndexedFileKind[];
  maxIndexBytesPerFile?: number;
}

/** Root Hermes config block (optional field on WorkflowConfig). */
export interface HermesConfig {
  enabled?: boolean;
  summary?: HermesSummaryConfig;
  search?: HermesSearchConfig;
}

/** Defaults applied when reading config — exported for use by both consumers. */
export const HERMES_DEFAULTS = {
  enabled: true,
  summary: {
    enabled: undefined as boolean | undefined,
    inputBudgetTokens: 16_000,
    timeoutMs: 60_000,
  },
  search: {
    indexedFileKinds: [...INDEXED_FILE_KINDS] as IndexedFileKind[],
    maxIndexBytesPerFile: 256 * 1024,
  },
} as const;
