/**
 * Shared context object carried across orchestrator phases.
 *
 * The orchestrator writes this to .harness/handoff.json under the
 * `pipeline` field so sub-skills (detect-design-drift, align-design-system,
 * etc.) can read pre-classified findings when invoked in pipeline mode.
 *
 * Source: docs/changes/design-pipeline/orchestrator/proposal.md
 *   (Outputs → DesignPipelineContext).
 */

import type { DriftFinding } from '../drift/findings/finding.js';
import type { FixOutcome } from '../align/findings/outcome.js';
import type { AnatomyFinding } from '../audit/component-anatomy/findings/finding.js';
import type { BrandFinding } from '../brand/findings/finding.js';
import type { CraftFinding } from '../design-craft/findings/schema.js';

export type Verdict = 'pass' | 'warn' | 'fail';

/**
 * Why the FIX convergence loop stopped. Read this, not `iterationsRun`, to tell
 * a loop that hit its cap from one that converged on its last allowed pass:
 * both report `iterationsRun: 5`.
 *
 * - `not-run`        FIX did not run (no `--fix`).
 * - `no-drift`       FIX ran but DETECT found nothing to fix.
 * - `converged`      align applied 0 fixes on the last pass.
 * - `no-progress`    re-detect found as many findings as before the pass.
 * - `max-iterations` every allowed pass ran and the last one still made
 *                    progress — the loop was cut off, not finished.
 * - `failed`         align or the re-detect threw; see `verifiersFailed`.
 */
export type FixStopReason =
  | 'not-run'
  | 'no-drift'
  | 'converged'
  | 'no-progress'
  | 'max-iterations'
  | 'failed';

export interface DesignPipelineContext {
  // Pipeline state
  /**
   * @deprecated No composed verifier reads the knowledge graph, so nothing
   * consumes this; it will be removed in the next major. Until then it is
   * correct: whether `graph.json` exists under the project's graph directory,
   * probed on every run — including under `--no-freshen`, where it used to
   * report `false` with a graph on disk.
   */
  graphAvailable: boolean;
  inputs: {
    designMdExists: boolean;
    tokensJsonExists: boolean;
    componentRegistryExists: boolean;
    brandRulesExist: boolean;
  };
  bootstrapped: {
    designMd: boolean;
    tokensJson: boolean;
    componentRegistry: boolean;
    brandRules: boolean;
  };

  // Per-phase outputs
  driftFindings: DriftFinding[];
  fixesApplied: FixOutcome[];
  auditFindings: {
    anatomy: AnatomyFinding[];
    brand: BrandFinding[];
  };
  craftFindings: CraftFinding[];
  /**
   * How many ceiling-layer suggestions the craft critique produced. Derived in
   * REPORT from `craftFindings.length` rather than stored next to it by FILL,
   * so the count cannot drift from the list it counts (#2273).
   */
  craftSuggestions: number;
  /**
   * The exclude globs (`design.exclude` ∪ `analysis.exclude`) the DETECT walk
   * actually applied, as reported by detect-design-drift itself rather than
   * re-resolved here, so the report cannot claim a filter the scan did not use.
   * Empty when the walk applied none: no globs configured, an explicit
   * `files` scope (which bypasses the walk), or DETECT abstained.
   */
  exclusions: Set<string>;
  /**
   * Non-fatal notices about how the run was invoked — e.g. a deprecated
   * option that was accepted but changes nothing. They do not affect the
   * verdict; they exist so an accepted-but-inert input is never silent.
   */
  warnings: string[];

  // Verifier failures (graceful degradation)
  verifiersRun: string[];
  verifiersFailed: Array<{ name: string; error: string }>;

  // Verdict + summary
  verdict: Verdict;
  /**
   * The verifiers that abstained — a projection of `verifiersFailed` produced
   * by the same expression in REPORT that resolves `verdict`, so the verdict
   * and its evidence cannot disagree (#2273).
   *
   * A non-empty value means the verdict is `fail` because part of the design
   * surface was never examined, not because an error-severity finding was
   * found. That is the distinction `harness check-design` draws with exit
   * code 2 (`hasErrors ? 1 : degraded ? 2 : 0`); `verdict` is three-valued and
   * carries only the non-zero-ness, so the reason lives here. Names are
   * deliberately **not** de-duplicated: `detect-drift` runs in both DETECT and
   * the FIX loop, and two abstentions are two facts.
   */
  degradedBy: string[];
  summary: {
    totalFindings: number;
    bySeverity: Record<'error' | 'warn' | 'info', number>;
    byCode: Record<string, number>;
    fixesApplied: number;
    /**
     * FIX-loop passes executed: one per align-design-system invocation,
     * including the pass that converged, made no progress, or failed. 0 only
     * when FIX did not run (no `--fix`) or there was no drift to fix.
     */
    iterationsRun: number;
    /** Why the FIX loop stopped; see {@link FixStopReason}. */
    fixStopReason: FixStopReason;
    durationMs: number;
  };
}

export function newContext(): DesignPipelineContext {
  return {
    graphAvailable: false,
    inputs: {
      designMdExists: false,
      tokensJsonExists: false,
      componentRegistryExists: false,
      brandRulesExist: false,
    },
    bootstrapped: {
      designMd: false,
      tokensJson: false,
      componentRegistry: false,
      brandRules: false,
    },
    driftFindings: [],
    fixesApplied: [],
    auditFindings: { anatomy: [], brand: [] },
    craftFindings: [],
    craftSuggestions: 0,
    exclusions: new Set(),
    warnings: [],
    verifiersRun: [],
    verifiersFailed: [],
    // Fail-closed. This is the verdict before any verifier has run, so `pass`
    // here is the same defect as #2273 one step earlier: a green reading over
    // zero evidence. REPORT overwrites it on every run that reaches Phase 6,
    // so the default only ever has to be the safe one.
    verdict: 'fail',
    degradedBy: [],
    summary: {
      totalFindings: 0,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
      fixesApplied: 0,
      iterationsRun: 0,
      fixStopReason: 'not-run',
      durationMs: 0,
    },
  };
}
