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

export interface DesignPipelineContext {
  // Pipeline state
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
  craftSuggestions: number;
  exclusions: Set<string>;

  // Verifier failures (graceful degradation)
  verifiersRun: string[];
  verifiersFailed: Array<{ name: string; error: string }>;

  // Verdict + summary
  verdict: Verdict;
  summary: {
    totalFindings: number;
    bySeverity: Record<'error' | 'warn' | 'info', number>;
    byCode: Record<string, number>;
    fixesApplied: number;
    iterationsRun: number;
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
    verifiersRun: [],
    verifiersFailed: [],
    verdict: 'pass',
    summary: {
      totalFindings: 0,
      bySeverity: { error: 0, warn: 0, info: 0 },
      byCode: {},
      fixesApplied: 0,
      iterationsRun: 0,
      durationMs: 0,
    },
  };
}
