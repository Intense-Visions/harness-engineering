/**
 * CodeFinding schema — 3-axis (ADR 0019) finding emitted by code-craft.
 * Imports the shared craft axes from packages/cli/src/shared/craft/.
 *
 * Structural twin of security-craft's SecurityFinding (per-unit critique of
 * TS/JS source) and a direct sibling of docs-craft's DocsFinding.
 *
 * Source: docs/changes/code-craft/proposal.md
 */

import type { ClumpView } from '@harness-engineering/core';
import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
import type { CraftAbstention } from '../../shared/craft/scope.js';

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

/**
 * What became of the run's clone-index build — the sibling-evidence channel's
 * own health, so "this codebase has no duplication" (`built`, zero incidence)
 * and "the clone index never built" (`empty` / `failed`) stop looking
 * identical.
 *
 * Advisory only: no status here ever fails a run or changes its exit code. A
 * non-`built` status means the critique ran exactly as it did before sibling
 * evidence existed, with no `MECHANICAL DUPLICATION EVIDENCE` in any prompt.
 *
 * Source: docs/roadmap.d/code-craft-sibling-evidence-incidence.md
 */
export type SiblingIndexOutcome =
  | {
      status: 'built';
      /** Clone classes the index reported over the full project discovery. */
      classes: number;
      /**
       * Critiqued units in THIS run whose prompts carried sibling evidence —
       * the incidence, scoped to what was critiqued, not to the whole index.
       */
      unitsWithSiblings: number;
    }
  /** Discovery found no source files, so there was nothing to index. */
  | { status: 'empty'; reason: string }
  /** The index build answered `Err` or threw; `reason` is what it said. */
  | { status: 'failed'; reason: string }
  /** The caller passed `siblings: false`. */
  | { status: 'disabled'; reason: string };

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
  /**
   * Present only when the run examined zero candidates: its empty `findings`
   * says nothing about the code (#2625). Absent on every run that looked.
   */
  abstention?: CraftAbstention;
  runId: string;
  /**
   * The clone-index build outcome. Optional so a summary produced before this
   * field existed (an in-flight in-session run-state file) still type-checks.
   */
  siblingIndex?: SiblingIndexOutcome;
}

export interface CodeCraftOutput {
  findings: CodeFinding[];
  summary: CodeCraftSummary;
  /**
   * The work units this run emits (docs/changes/clumping/proposal.md, Phase 3).
   *
   * `findings` stays the authoritative raw output; this is the GROUPED view an
   * agent files from — N like findings over one scope as one work unit rather
   * than N issues. Built by `shared/craft/findings/clumpable.ts` at the single
   * boundary a craft run owns: emission.
   */
  clumps: ClumpView;
}
