// packages/cli/src/design-craft/findings/schema.ts
//
// Types for the harness-design-craft skill's findings + benchmark output.
//
// Authoritative source: docs/changes/design-pipeline/design-craft-elevator/proposal.md
//   section "Data structures" (spec lines ~148–203).
//
// Honors:
//   - ADR 0018 (LLM-judgment skill pattern): confidence is a first-class field
//     on every LLM-emitted output. Never silently upgraded or dropped.
//   - ADR 0019 (3-axis craft output model): tier × impact × confidence are all
//     emitted as independent, first-class fields. A derived numeric priority
//     is computed downstream (see ./derived.ts) — the raw axes are NEVER
//     collapsed at the schema layer.
//   - ADR 0020 (living catalog H pattern): rubric/pattern/exemplar citations
//     are recorded on every finding so usage signal can drive catalog growth.
//
// Phase 1 MVP scope: types only. Vision-mode fields and POLISH-only fields
// remain present on the discriminated finding type so downstream phases can
// populate them when implemented in later vertical slices.

// Tier / Impact / Confidence axes (ADR 0019) live in shared/craft.
// design-craft re-exports them for backward compatibility — every
// historical import path keeps working. The interfaces below ALSO
// reference these types directly, so we both import and re-export.
import type { Tier, Impact, Confidence } from '../../shared/craft/findings/axes.js';
export type { Tier, Impact, Confidence };

/**
 * Which phase emitted the finding.
 *
 * BENCHMARK produces `BenchmarkScore` records, not `CraftFinding`s — it does
 * not appear here.
 */
export type FindingPhase = 'critique' | 'polish';

/**
 * A single craft finding emitted by CRITIQUE (rubric-driven) or POLISH
 * (pattern-driven). One per (target, rubric|pattern) pair when the LLM
 * judges the target falls short of (or could be elevated by) the
 * rubric/pattern.
 *
 * The 3-axis trio (tier, impact, confidence) is preserved as raw fields
 * rather than being collapsed into a single severity, per ADR 0019. The
 * numeric `derived.priority` is the only derived sortable surface and is
 * computed deterministically by `./derived.ts`.
 */
export interface CraftFinding {
  /** Stable code in the `CRAFT-(C|P)\d{3}` namespace (e.g. `CRAFT-C001`). */
  code: string;

  /** Which phase produced this finding. */
  phase: FindingPhase;

  /** The "tier" axis (ADR 0019). First-class. */
  tier: Tier;

  /** The "impact" axis (ADR 0019). First-class. */
  impact: Impact;

  /** The "confidence" axis (ADR 0019). First-class. Honesty required. */
  confidence: Confidence;

  /** Where the finding applies. Component/line are optional for page-level findings. */
  target: {
    file: string;
    line?: number;
    component?: string;
  };

  /** Human-readable critique. Should reference what's seen, not just the rule. */
  message: string;

  /** Provenance — which rubric or pattern produced this finding (ADR 0020). */
  cite: {
    /** Rubric or pattern id, e.g. `rubric-hierarchy-clarity`, `pattern-spring-physics`. */
    rubricOrPatternId: string;
    /** Source citation (URL or in-source reference) of the rule. */
    source: string;
  };

  /** POLISH-phase before sketch. Empty for CRITIQUE findings. */
  before?: string;

  /** POLISH-phase after sketch. Empty for CRITIQUE findings. */
  after?: string;

  /**
   * Derived sortable surface. Computed from `tier × impact × confidence` by
   * `./derived.ts:derivePriority`. The raw axes remain authoritative; this
   * is for stable sort/display only.
   */
  derived: { priority: number };
}

/**
 * One axis of the 5-dim radar (BENCHMARK output).
 *
 * Per the spec section "Data structures", each radar dimension carries a
 * numeric score (0–100), a per-dimension confidence (so weak dimensions are
 * legible), and a narrative note (so the score is explainable to humans).
 */
export interface RadarDimension {
  /** 0–100 score against the cited exemplars. */
  score: number;
  /** Per-dimension confidence (ADR 0019). */
  confidence: Confidence;
  /** Narrative explanation — what the LLM observed to land on this score. */
  notes: string;
}

/** The five radar dimension keys (BENCHMARK). */
export type RadarDimensionName =
  | 'philosophicalCoherence'
  | 'hierarchy'
  | 'craftExecution'
  | 'function'
  | 'innovation';

/**
 * Machine award-tier verdict. Authority lives in TypeScript — this is
 * NEVER emitted by the LLM. The LLM produces the radar it always has;
 * `computeAwardBar` (phases/award-bar.ts) derives the verdict from that
 * radar + the cited exemplars' reference scores. Mirrors the authority-in-TS
 * pattern used by outcome-eval / acceptance-eval.
 */
export type AwardVerdict = 'cleared' | 'not-cleared' | 'indeterminate';

/** Per-dimension award-bar detail — the derived floor and whether it was cleared. */
export interface AwardBarDimension {
  /** Target's radar score for this dimension (echoed for legibility). */
  score: number;
  /** Derived award-tier floor the target had to clear. */
  floor: number;
  /** Whether the target's score met or exceeded the floor. */
  cleared: boolean;
}

/**
 * Machine-derived award-tier verdict for a BENCHMARK target. Per-dimension
 * (not a single overall threshold): an equal-weight mean hides a weak axis,
 * so each radar dimension must clear its own exemplar-relative floor
 * (ADR 0019). Any dimension whose confidence is below the configured floor
 * forces `indeterminate` — a high score the model is unsure about must never
 * certify award tier.
 *
 * SCOPE — desktop aesthetic clearance, NOT a mobile/responsiveness gate.
 * The five radar dimensions are aesthetic (philosophical coherence, hierarchy,
 * craft execution, function, innovation); none evaluates responsive layout or
 * mobile behavior. A page can clear every dimension while carrying award-tier-
 * fatal mobile defects (e.g. a nav that `display:none`s to nothing with no
 * hamburger, or horizontal overflow). Downstream MUST NOT read
 * `verdict: 'cleared'` as "ship-ready on mobile." A dedicated `responsive`
 * dimension is a named future increment, gated on mobile exemplars existing to
 * calibrate against (ADR 0084 Consequences).
 */
export interface AwardBar {
  verdict: AwardVerdict;
  dimensions: Record<RadarDimensionName, AwardBarDimension>;
  /** Dimensions whose score fell below floor ([] when the verdict is `cleared`). */
  shortfalls: RadarDimensionName[];
  /** Why the verdict is `indeterminate` (e.g. `low-confidence`), when applicable. */
  reason?: string;
}

/**
 * BENCHMARK output for a single target component, scored against one or
 * more cited exemplars.
 *
 * Five dimensions adapted from the huashu-design proven format (per spec
 * Decision #5 / Output model E). The dimensions are intentionally
 * heterogeneous — they capture different aspects of "is this stunning?"
 * (coherent vision, well-organized info, tight execution, fit-for-purpose,
 * fresh perspective).
 */
export interface BenchmarkScore {
  target: {
    file: string;
    component: string;
  };

  /** Exemplar ids cited as the comparison reference. */
  exemplars: string[];

  /** The five radar dimensions. */
  radar: {
    /** Coherence between intent and execution; absence of voice drift. */
    philosophicalCoherence: RadarDimension;
    /** Visual / informational hierarchy. */
    hierarchy: RadarDimension;
    /** Tightness of craft details (motion, type, spacing, restraint). */
    craftExecution: RadarDimension;
    /** Fit between form and the function it serves. */
    function: RadarDimension;
    /** Freshness / signature quality / non-derivative voice. */
    innovation: RadarDimension;
  };

  /**
   * Weighted aggregate of the five dimensions. The weighting rule is a
   * Phase 1 deliverable (see Phase 0 review observation O6). MVP uses
   * equal-weight mean with `min(confidences)` as the overall confidence.
   */
  overall: {
    score: number;
    confidence: Confidence;
  };

  /**
   * Narrative gap analysis — where the target falls short of the cited
   * exemplars. Phase 0 review observation O8 flags a future evolution to
   * `Array<{ summary; impact?; recommendedPatternId? }>`; the string[] shape
   * is forward-compatible.
   */
  gaps: string[];

  /**
   * Machine-derived award-tier verdict (authority in TS, never LLM-emitted).
   * Computed by `computeAwardBar` from this score's radar + the cited
   * exemplars' reference scores. Present on every BenchmarkScore.
   */
  awardBar: AwardBar;
}

/**
 * The MCP tool's top-level return payload. Aggregates findings from CRITIQUE
 * and POLISH and scores from BENCHMARK plus a summary section for cost,
 * provenance, and the B' upgrade offer.
 *
 * Phase 1 MVP: only `findings` is populated by the critique phase. `scores`
 * is an empty array (BENCHMARK stub). `upgradeOffer` is omitted (B' detect-
 * and-offer is a later task).
 */
export interface DesignCraftOutput {
  findings: CraftFinding[];
  scores: BenchmarkScore[];
  summary: {
    phaseRun: Array<'critique' | 'polish' | 'benchmark'>;
    mode: 'fast' | 'deep';
    durationMs: number;
    llmCalls: {
      provider: string;
      model: string;
      count: number;
      costUsd: number;
    };
    catalog: {
      rubricsApplied: string[];
      patternsApplied: string[];
      exemplarsCited: string[];
    };
    preconditions: {
      aestheticIntentDeclared: boolean;
      designMdExists: boolean;
      tokensExist: boolean;
    };
    deferralsToHarnessDesign: number;
    runId: string;
  };
  /**
   * Present only when preconditions for a richer run are missing AND
   * `autoCapture` is `prompt` or `auto`. Phase 1 MVP never populates this
   * (resolvers/* are a later task per the user's TIGHT MVP SCOPE).
   */
  upgradeOffer?: {
    message: string;
    options: Array<{
      id: string;
      label: string;
      chainedSkill?: string;
      chainedPhases?: string[];
    }>;
  };
}
