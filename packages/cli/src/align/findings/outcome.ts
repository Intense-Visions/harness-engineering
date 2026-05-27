/**
 * FixOutcome — emitted by align-design-system for each DRIFT-* finding it
 * processes. Union-typed so each branch carries exactly the data callers
 * need to render or persist that outcome.
 *
 * applied      — codemod was successfully written to disk
 * suggestion   — finding requires human/LLM judgment; rich text emitted instead
 * skipped-unsafe — pre-flight classifier blocked the codemod (with reason)
 * failed       — codemod started but errored mid-flight (never thrown to caller)
 *
 * Source: docs/changes/design-pipeline/align-design-system/proposal.md
 *   (Outputs → Per-fix outcome).
 */

import type { DriftFinding } from '../../drift/findings/finding.js';

export interface FixDiff {
  file: string;
  before: string;
  after: string;
  line: number;
}

export interface FixSuggestion {
  description: string;
  preview: string;
}

export type FixOutcome =
  | { kind: 'applied'; finding: DriftFinding; diff: FixDiff }
  | { kind: 'suggestion'; finding: DriftFinding; suggestion: FixSuggestion }
  | { kind: 'skipped-unsafe'; finding: DriftFinding; reason: string }
  | { kind: 'failed'; finding: DriftFinding; error: string };

export interface AlignSummary {
  totalFindings: number;
  applied: number;
  suggestions: number;
  skipped: number;
  failed: number;
  filesModified: number;
  durationMs: number;
}

export interface AlignCatalog {
  codemodApplied: string[];
  suggestionsEmitted: string[];
}

export type AlignMode = 'standalone' | 'pipeline';

export interface AlignMeta {
  mode: AlignMode;
  dryRun: boolean;
  tokensLoaded: boolean;
  /**
   * True when the run was a --revert pass (inverse-applies the last batch
   * instead of detecting + classifying + applying). FixOutcome shapes are
   * the same: `applied` means an inverse diff was written, `skipped-unsafe`
   * means the file was edited externally since the recorded apply.
   */
  revert?: boolean;
}

export interface AlignDesignSystemOutput {
  outcomes: FixOutcome[];
  summary: AlignSummary;
  catalog: AlignCatalog;
  meta: AlignMeta;
}
