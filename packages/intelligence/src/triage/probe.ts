// packages/intelligence/src/triage/probe.ts
//
// Roadmap Auto-Triage — Phase 1, Task 3: the pure four-lever scoping probe.
//
// `runScopingProbe` corroborates four cheap, independent signals (scope / semantic-read /
// open-decisions / precedent) into a single dispatch authorization. It is the GATE — the
// AMR classifier is only a vote. The function is PURE and provider-injected: no live model,
// no GraphStore, no IO. It NEVER throws — every lever is wrapped so a failure degrades that
// lever to `'unknown'` (which lowers corroboration, never forces a pass) and the probe still
// returns a legible verdict.
//
// The gate (proposal §"scoping probe"): dispatch ONLY when
//   • scope is BOUNDED (≥1 candidate resolved in the graph AND blastRadius ≤ boundedScopeMax), AND
//   • the semantic read agrees the item is in the ELIGIBLE BAND (trivial|simple), AND
//   • confidence ≥ the configured bar (dispatchConfidence, default medium), AND
//   • there are NO open decisions, AND
//   • precedent does not CONTRADICT (a measured rate below the block bar).
// Any shortfall or lever error ⇒ dispatchable:false with a single legible holdReason.
//
// S3 (the load-bearing scope contract): `extractEntities` OVER-generates candidates (it emits
// `e.g`/`i.e` noise and other non-symbols). A non-empty extraction is therefore NOT "scope
// resolved." Only candidates that RESOLVE against the injected GraphScope count toward the
// estimate. If NO candidate resolves → `unresolved-scope` (→ human), NEVER a length/count proxy.
//
// Layer note: intelligence-only. Imports @harness-engineering/types + the analysis-provider
// interface + local siblings. No core/orchestrator import.

import { z } from 'zod';
import type { ComplexityVerdict } from '@harness-engineering/types';
import type { AnalysisProvider } from '../analysis-provider/interface.js';
import { classify, type ClassifyInput } from '../complexity/classifier.js';
import type { ComplexitySignals } from '../complexity/types.js';
import { CONFIDENCE_RANK } from '../complexity/static-pass.js';
import { shapeKey } from './record.js';
import type { PrecedentLookup, PrecedentRate } from './record.js';
import type {
  GraphScope,
  HoldReason,
  LeverResult,
  OpenDecision,
  ProbeInput,
  ProbeLevers,
  ResolvedEntity,
  ScopeEstimate,
  TriageVerdict,
} from './types.js';

/** Tunable gate seeds (a subset of the Phase-0 `roadmap.autoTriage.thresholds`). */
export interface ProbeConfig {
  /** Blast-radius ceiling for a "bounded" scope (seed). */
  boundedScopeMax: number;
  /** Minimum semantic-read confidence to clear the gate (the S3-001 pre-diff bar). */
  dispatchConfidence: 'low' | 'medium' | 'high';
  /**
   * Precedent block bar: a MEASURED rate at-or-below this contradicts and holds the item.
   * Default 0 — only a shape that has NEVER succeeded autonomously blocks; `unknown`
   * (cold-start) never blocks. Conservative-by-construction (proposal §precedent lever).
   */
  precedentBlockRate?: number;
  /** Minimum recorded sample before a precedent rate is trusted to block (seed). Default 1. */
  precedentMinSample?: number;
}

/** Injected dependencies for the pure probe. All optional — absent ⇒ that lever degrades. */
export interface ProbeDeps {
  /** The SEL analysis provider for the semantic-read + open-decisions levers. Absent ⇒ offline. */
  provider?: AnalysisProvider;
  /** The graph-resolution seam for the scope lever. Absent ⇒ scope degrades to unknown. */
  graph?: GraphScope;
  /** The precedent lever. Absent ⇒ `unknown` (cold-start), which never blocks. */
  precedent?: PrecedentLookup;
  /** Gate seeds. Absent fields fall back to conservative defaults. */
  config?: Partial<ProbeConfig>;
  /** Optional model overrides threaded to the classifier tie-break. */
  models?: { fast?: string; standard?: string };
}

const DEFAULT_CONFIG: ProbeConfig = {
  boundedScopeMax: 40,
  dispatchConfidence: 'medium',
  precedentBlockRate: 0,
  precedentMinSample: 1,
};

/** The structured open-decisions self-assessment schema the semantic pass emits. */
const OpenDecisionsSchema = z.object({
  openDecisions: z
    .array(z.object({ question: z.string() }))
    .describe(
      'Choices requiring human judgment (API shape, product tradeoff, irreversible action)'
    ),
});

const OPEN_DECISIONS_SYSTEM_PROMPT =
  'You are triaging a backlog item for autonomous execution. Identify ONLY choices that ' +
  'genuinely require human judgment before an agent could safely proceed — API/interface ' +
  'shape, product tradeoffs, or irreversible/outward-facing actions. If the item is fully ' +
  'scoped and an agent could proceed without a human decision, return an empty array. ' +
  'Do not invent decisions; be conservative about what truly needs a human.';

/**
 * Run the pure four-lever scoping probe for one roadmap item. Never throws.
 */
export async function runScopingProbe(
  input: ProbeInput,
  deps: ProbeDeps = {}
): Promise<TriageVerdict> {
  const config: ProbeConfig = { ...DEFAULT_CONFIG, ...deps.config };

  // --- Lever 1: scope (graph-grounded). ------------------------------------
  const scope = await runScopeLever(input, deps.graph);

  // --- Lever 2: semantic read (classifier, fed the REAL scope signals). -----
  const semanticRead = await runSemanticReadLever(input, scope.value, deps);

  // --- Lever 3: open decisions (structured self-assessment). ----------------
  const openDecisions = await runOpenDecisionsLever(input, deps.provider);

  // --- Lever 4: precedent (injected base-rate; unknown at cold-start). -------
  const precedent = runPrecedentLever(input, semanticRead.value, deps.precedent);

  const levers: ProbeLevers = { scope, semanticRead, openDecisions, precedent };

  // The corroborated verdict carried on the output: the semantic read when available,
  // else a conservative degrade that does NOT clear the gate.
  const verdict: ComplexityVerdict =
    semanticRead.value === 'unknown'
      ? { level: 'moderate', confidence: 'low', signals: {}, source: 'static' }
      : semanticRead.value;

  const { dispatchable, holdReason } = gate(levers, config);
  const rationale = buildRationale(levers, dispatchable, holdReason);

  return {
    externalId: input.externalId,
    verdict,
    dispatchable,
    ...(holdReason !== undefined ? { holdReason } : {}),
    levers,
    rationale,
  };
}

// ---------------------------------------------------------------------------
// Lever 1: scope
// ---------------------------------------------------------------------------

async function runScopeLever(
  input: ProbeInput,
  graph: GraphScope | undefined
): Promise<LeverResult<ScopeEstimate>> {
  if (graph === undefined) {
    return { value: 'unknown', reason: 'scope: no graph seam available' };
  }
  try {
    const resolved: ResolvedEntity[] = [];
    for (const candidate of input.entityCandidates) {
      // Guarded per-candidate: one bad candidate cannot sink the whole lever.
      const hit = await graph.resolve(candidate);
      if (hit) resolved.push(hit);
    }
    // Only RESOLVED candidates count (S3): a non-empty extraction is not "scope resolved".
    const blastRadius = resolved.reduce((max, r) => Math.max(max, r.blastRadius), 0);
    const estimate: ScopeEstimate = {
      candidates: input.entityCandidates,
      resolved,
      blastRadius,
      layersTouched: Math.min(resolved.length, 4),
      filesTouched: resolved.length,
    };
    const note =
      resolved.length === 0
        ? 'scope: no entity resolved in graph (unresolved-scope)'
        : `scope: ${resolved.length} entity(ies) resolved, blastRadius ${blastRadius}`;
    return { value: estimate, reason: note };
  } catch (err) {
    return { value: 'unknown', reason: `scope: graph lookup failed — ${errMsg(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Lever 2: semantic read (classifier)
// ---------------------------------------------------------------------------

async function runSemanticReadLever(
  input: ProbeInput,
  scope: ScopeEstimate | 'unknown',
  deps: ProbeDeps
): Promise<LeverResult<ComplexityVerdict>> {
  try {
    // Feed the REAL graph-grounded scope into the signals so the static pass scores
    // substance, not description length (proposal §scope lever "upgrade"). When scope
    // is unknown, fall back to the text-only pre-diff signals (like live-classify.ts).
    const signals: ComplexitySignals = {
      descriptionLength: input.taskText.descriptionLength,
      specExists: input.taskText.specExists,
      acceptanceMeasurable: input.taskText.acceptanceMeasurable,
      ...(scope !== 'unknown' && scope.resolved.length > 0
        ? {
            filesTouched: scope.filesTouched,
            layersTouched: scope.layersTouched,
            blastRadius: scope.blastRadius,
          }
        : {}),
    };
    // Post-diff phase when we HAVE a real scope estimate (so blast-radius signals count);
    // pre-diff (text-only, confidence-capped at medium) when scope is unknown.
    const phase = scope !== 'unknown' && scope.resolved.length > 0 ? 'post-diff' : 'pre-diff';
    const classifyInput: ClassifyInput = {
      signals,
      phase,
      riskHigh: input.riskHigh === true,
      prompt: input.taskText.prompt,
    };
    const verdict = await classify(classifyInput, deps.provider, deps.models);
    return { value: verdict, reason: `semantic-read: ${verdict.level}/${verdict.confidence}` };
  } catch (err) {
    return { value: 'unknown', reason: `semantic-read: classify failed — ${errMsg(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Lever 3: open decisions
// ---------------------------------------------------------------------------

async function runOpenDecisionsLever(
  input: ProbeInput,
  provider: AnalysisProvider | undefined
): Promise<LeverResult<readonly OpenDecision[]>> {
  if (provider === undefined) {
    return { value: 'unknown', reason: 'open-decisions: no provider (offline)' };
  }
  try {
    const { result } = await provider.analyze<{ openDecisions: OpenDecision[] }>({
      prompt: input.taskText.prompt,
      systemPrompt: OPEN_DECISIONS_SYSTEM_PROMPT,
      responseSchema: OpenDecisionsSchema,
      maxTokens: 512,
    });
    const decisions = result.openDecisions ?? [];
    const note =
      decisions.length === 0
        ? 'open-decisions: none surfaced'
        : `open-decisions: ${decisions.length} requiring human judgment`;
    return { value: decisions, reason: note };
  } catch (err) {
    return { value: 'unknown', reason: `open-decisions: assessment failed — ${errMsg(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Lever 4: precedent
// ---------------------------------------------------------------------------

function runPrecedentLever(
  input: ProbeInput,
  verdict: ComplexityVerdict | 'unknown',
  precedent: PrecedentLookup | undefined
): LeverResult<PrecedentRate> {
  if (precedent === undefined) {
    // Cold-start: no lookup wired yet (Phase 4 provides the real one). Never blocks.
    return { value: 'unknown', reason: 'precedent: no store (cold-start)' };
  }
  try {
    const level = verdict === 'unknown' ? 'moderate' : verdict.level;
    // The shape key must agree with the precedent store's bucketing (Phase 0 shapeKey).
    // Use the dispatchable category as the routing bucket for the lookup shape.
    const key = shapeKey(input.labels, 'dispatchable', level);
    const rate = precedent.rateForShape(key);
    const note =
      rate.kind === 'unknown'
        ? 'precedent: unknown for this shape (no graded records)'
        : `precedent: ${rate.matched}/${rate.total} (${(rate.rate * 100).toFixed(0)}%)`;
    return { value: rate, reason: note };
  } catch (err) {
    return { value: 'unknown', reason: `precedent: lookup failed — ${errMsg(err)}` };
  }
}

// ---------------------------------------------------------------------------
// The corroboration gate
// ---------------------------------------------------------------------------

function gate(
  levers: ProbeLevers,
  config: ProbeConfig
): { dispatchable: boolean; holdReason?: HoldReason } {
  // 1. Scope must be bounded: at least one entity resolved AND within the ceiling.
  const scope = levers.scope.value;
  if (scope === 'unknown' || scope.resolved.length === 0) {
    return { dispatchable: false, holdReason: 'unresolved-scope' };
  }
  if (scope.blastRadius > config.boundedScopeMax) {
    return { dispatchable: false, holdReason: 'unresolved-scope' };
  }

  // 2. Semantic read must be in the eligible band AND clear the confidence bar.
  const read = levers.semanticRead.value;
  if (read === 'unknown') {
    return { dispatchable: false, holdReason: 'not-in-band' };
  }
  const inBand = read.level === 'trivial' || read.level === 'simple';
  const confidentEnough =
    CONFIDENCE_RANK[read.confidence] >= CONFIDENCE_RANK[config.dispatchConfidence];
  if (!inBand || !confidentEnough) {
    return { dispatchable: false, holdReason: 'not-in-band' };
  }

  // 3. No open decisions. DEV3: distinguish "the lever couldn't be READ" from "a real open
  // decision was surfaced". An `unknown` lever (no provider wired / assessment errored) holds
  // as `read-incomplete` — we can't CONFIRM there are none, but none was actually surfaced.
  // Only an actually-surfaced decision holds as `open-decision`. Both are fail-safe.
  const decisions = levers.openDecisions.value;
  if (decisions === 'unknown') {
    return { dispatchable: false, holdReason: 'read-incomplete' };
  }
  if (decisions.length > 0) {
    return { dispatchable: false, holdReason: 'open-decision' };
  }

  // 4. Precedent must not contradict. `unknown` never blocks (cold-start).
  const precedent = levers.precedent.value;
  if (
    precedent !== 'unknown' &&
    precedent.kind === 'rate' &&
    precedent.total >= (config.precedentMinSample ?? 1) &&
    precedent.rate <= (config.precedentBlockRate ?? 0)
  ) {
    return { dispatchable: false, holdReason: 'precedent-contradicts' };
  }

  return { dispatchable: true };
}

// ---------------------------------------------------------------------------
// Rationale
// ---------------------------------------------------------------------------

function buildRationale(
  levers: ProbeLevers,
  dispatchable: boolean,
  holdReason: HoldReason | undefined
): string {
  const parts: string[] = [];
  for (const lever of [levers.scope, levers.semanticRead, levers.openDecisions, levers.precedent]) {
    if (lever.reason) parts.push(lever.reason);
  }
  const decision = dispatchable
    ? 'DISPATCHABLE — all levers corroborate.'
    : `HELD (${holdReason}).`;
  return `${decision} ${parts.join('; ')}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
