# harness:outcome-eval

**Keywords:** outcome-eval, llm-judgment, spec-satisfaction, execution-outcome, confidence-calibration, ship-gate, analysis-provider, effectiveness-loop

## Overview

`harness:outcome-eval` is an LLM-judgment skill that produces a structured,
confidence-rated verdict on whether an implementation satisfied its spec. It
reads the spec's acceptance section, the change diff, and the test output, and
emits an `OutcomeVerdict` (`SATISFIED | NOT_SATISFIED | INCONCLUSIVE`) with a
confidence rating, a rationale, and the list of unmet criteria. The verdict is
wired into the orchestrator's ship gate and persisted to the knowledge graph.

The harness has rule-based floors (lint, architecture, entropy) and
craft-pipeline ceilings (naming, spec, security), plus _pre_-execution
simulation (PESL). It has **no post-execution check that asks the binary
question "did the code actually do what the spec said?"** — the roadmap's named
#1 gap. Today that judgment is implicit in human review and evaporates after
each PR. outcome-eval makes it explicit, load-bearing, and durable.

### Goals

1. Given a spec, a diff, and test output, emit a structured `OutcomeVerdict`
   (verdict + confidence + rationale + `judgedAgainst`).
2. Tiered authority: a high-confidence `NOT_SATISFIED` blocks ship; medium/low
   confidence is advisory (reported, non-blocking).
3. Persist every verdict as an `execution_outcome` node so verdicts compound
   into skill-effectiveness baselines over time.
4. Wire into `harness.orchestrator.md` as step 6.5 (between Code Review and
   Ship).

### Non-goals (YAGNI)

- CI-template required-check wiring — deferred; depends on the unbuilt
  "CI workflow template" roadmap item (#540).
- Judging against arbitrary spec sections beyond the defined fallback chain.
- Auto-remediation of failures. outcome-eval judges; it does not fix.

### Known limitations (v1)

- **INCONCLUSIVE persistence (PRE-P5-INCONCLUSIVE):** the persisted
  `execution_outcome` node maps `INCONCLUSIVE -> result: 'failure'` for
  type-validity, but it OMITS `agentPersona` and writes
  `affectedSystemNodeIds: []`. The effectiveness scorer's `gatherOutcomes`
  ignores any node missing `agentPersona` or `outcome_of` edges, so
  outcome-eval nodes are **scorer-non-counting** — the INCONCLUSIVE-as-failure
  mapping is therefore harmless in v1 and punishes no persona. Any future change
  that attaches persona/affected-system attribution MUST first change
  INCONCLUSIVE modeling (do not persist INCONCLUSIVE, or use a distinct result
  value the scorer excludes) before the node becomes scorer-counted.
- **openai-compatible strict mode:** `zodToJsonSchema`
  (`packages/intelligence/src/analysis-provider/schema.ts`) does not emit
  `additionalProperties: false`, which OpenAI strict structured output requires;
  the openai-compatible strict path could therefore reject `verdictSchema`. The
  v1 supported provider path is claude-cli / anthropic (no flag needed; plus the
  evaluator's defensive `.strict()` re-parse seam). Follow-up if outcome-eval is
  wired through the openai-compatible strict path — out of this phase's surface
  because `schema.ts` is shared by all intelligence providers (SEL, PESL,
  security).
- **CI required-check wiring:** deferred to roadmap #540 (unbuilt CI workflow
  template).

## Decisions made

1. **Tiered confidence→authority** (not a hard gate, not advisory-only):
   high-confidence `NOT_SATISFIED` blocks ship/CI; medium/low `NOT_SATISFIED`
   is advisory. _Rationale:_ load-bearing per the v5.0 "Load-Bearing Harness"
   milestone while false-positive-safe per the "confidence calibration similar
   to security-craft" requirement. A hard gate would let one over-cautious
   verdict stall every PR; advisory-only would fail the milestone's
   "required check" intent.
   `[evidence]` `STRATEGY.md#tracks` (compounding feedback loops);
   `agents/skills/claude-code/security-craft/SKILL.md:64` (conservative-confidence precedent).

2. **Judgment input = Success Criteria → user-visible-behavior → Overview**,
   with the matched section recorded in `judgedAgainst`. _Rationale:_ a
   `Success Criteria` section appears in ~154 existing specs (near-universal),
   whereas a literal `User-Visible Behavior` section is rare; judging strictly
   against the latter would make the skill a no-op on most real specs.
   `[evidence]` 154 specs contain `Success Criteria` (grep over `docs/changes/*/proposal.md`).

3. **Approach: evaluator module in `packages/intelligence/src/outcome-eval/`**
   plus a thin skill wrapper, mirroring `PeslSimulator`. _Rationale:_ puts the
   two false-positive-critical pieces — the tiered confidence→authority mapping
   and the graph write — into unit-testable TypeScript, rather than embedding
   blocking-authority logic in skill markdown.
   `[evidence]` `packages/intelligence/src/pesl/simulator.ts`;
   `packages/intelligence/src/analysis-provider/interface.ts:18`.

4. **Persist `execution_outcome` nodes in v1** via the existing
   `ExecutionOutcomeConnector` (`outcome/connector.ts`) so
   `effectiveness/scorer.ts` consumes them unchanged. _Rationale:_ the verdict
   is the highest-value signal for the compounding feedback loop, and dropped
   verdicts cannot be backfilled.
   `[evidence]` `packages/intelligence/src/outcome/connector.ts:18` (`ExecutionOutcomeConnector`).

## Technical design

### New module: `packages/intelligence/src/outcome-eval/`

```
outcome-eval/
  types.ts             OutcomeVerdict, OutcomeEvalInput, authority types
  prompts.ts           OUTCOME_EVAL_SYSTEM_PROMPT (conservative), buildUserPrompt, verdictSchema (zod)
  section-resolver.ts  resolve judgment input from the spec (fallback chain)
  evaluator.ts         OutcomeEvaluator class
  index.ts             barrel
```

### Core types (`types.ts`)

```ts
export type Verdict = 'SATISFIED' | 'NOT_SATISFIED' | 'INCONCLUSIVE';
export type Confidence = 'low' | 'medium' | 'high';
export type JudgedAgainst = 'success-criteria' | 'user-visible-behavior' | 'overview';

export interface OutcomeEvalInput {
  specPath: string;
  diff: string; // unified diff of the change
  testOutput: string; // captured test-runner output
  specSection?: string; // pre-resolved; otherwise section-resolver runs
}

export interface OutcomeVerdict {
  verdict: Verdict;
  confidence: Confidence;
  rationale: string; // cites specific met / unmet criteria
  judgedAgainst: JudgedAgainst;
  unmetCriteria: string[]; // empty when SATISFIED
  authority: 'blocking' | 'advisory'; // DERIVED in TS, never from the LLM
}
```

### `OutcomeEvaluator` (`evaluator.ts`)

Mirrors `PeslSimulator`'s constructor shape (`provider`, `store`, `options`):

```ts
class OutcomeEvaluator {
  constructor(provider: AnalysisProvider, store: GraphStore, options?: { model?: string });

  async evaluate(input: OutcomeEvalInput): Promise<OutcomeVerdict> {
    // 1. resolve the judgment section (section-resolver) -> judgedAgainst
    // 2. provider.analyze<LlmVerdict>({ prompt, systemPrompt, responseSchema: verdictSchema })
    // 3. derive authority deterministically (NOT read from the LLM)
    // 4. write an execution_outcome node via ExecutionOutcomeConnector
    // 5. return OutcomeVerdict
  }
}
```

### Key design points

- **Authority is computed in TypeScript, never trusted from the LLM.** The LLM
  returns only `verdict / confidence / rationale / unmetCriteria`. `authority`
  is a pure function of `(verdict, confidence)`. This is the testable,
  false-positive-critical seam.
- **Conservative-confidence prompt** (posture copied from security-craft):
  `high` requires naming a specific met/unmet criterion; default is `medium`.
  Bias is toward advisory, not blocking.
- **`INCONCLUSIVE`** (no judgable section, empty diff, unparseable tests) is
  always advisory — missing inputs never punish the change.
- **Graph write** reuses `ExecutionOutcomeConnector`. Linking a verdict to its
  _spec_ node (rather than only affected-system nodes) is an **additive**
  extension to the connector if not already supported.
- **Section resolver** reads the spec markdown and tries `## Success Criteria`
  → `## User-Visible Behavior` → `## Overview`, returning the body plus which
  heading matched.

### Skill wrapper

`agents/skills/claude-code/outcome-eval/SKILL.md` + `skill.yaml`: gathers the
diff (`git diff`), reads/runs the test output, resolves the spec path, invokes
the evaluator (via MCP `run_skill` or the CLI fallback), renders the verdict,
and — on a blocking verdict — halts before the Ship step.

## Integration points

### Entry points

- New skill `harness:outcome-eval`
  (`agents/skills/claude-code/outcome-eval/SKILL.md` + `skill.yaml`).
- New intelligence module `packages/intelligence/src/outcome-eval/`, exported
  from `packages/intelligence/src/index.ts`.
- New MCP `run_skill` route + CLI command `harness skill run outcome-eval`
  (generated from `skill.yaml`).
- Orchestrator step **6.5** in `harness.orchestrator.md` and
  `templates/orchestrator/harness.orchestrator.md` (between Code Review and Ship).

### Registrations required

- Barrel export regeneration for `packages/intelligence`.
- Skill tier assignment in `skill.yaml` (tier 2, rigid, cognitive_mode
  `constructive-architect`) and slash-command regeneration
  (`harness generate-slash-commands`).
- `execution_outcome` provenance: confirm `ExecutionOutcomeConnector` accepts a
  `source: 'outcome-eval'` discriminator; extend additively if needed.

### Documentation updates

- `harness.orchestrator.md` standard-workflow section (the 6.5 step + a one-line
  verdict-authority note).
- AGENTS.md / skill catalog entry for `outcome-eval`.
- `docs/changes/outcome-eval/SKILLS.md` (skill-advisor output).

### Architectural decisions

- **Decision 1 (Tiered confidence→authority)** warrants a standalone ADR: it
  establishes the project's first _blocking_ LLM-judgment gate and the
  precedent that authority is TS-derived, never LLM-supplied.
- **Decision 4 (verdict→graph persistence)** warrants a short ADR: it defines
  `execution_outcome` provenance from a judgment skill, which the effectiveness
  loop now depends on.
- Decisions 2 and 3 are implementation choices, not ADR-level.

### Knowledge impact

- New concept: **outcome verdict** (post-execution spec-satisfaction judgment)
  and its relationship to `execution_outcome` nodes and effectiveness scoring.
- New relationship: `outcome-eval` verdict → feeds → skill-effectiveness
  baselines (the compounding-feedback-loop edge).

## Success criteria

1. `OutcomeEvaluator.evaluate()` returns a valid `OutcomeVerdict` for a
   spec+diff+test-output input; `verdict`, `confidence`, `judgedAgainst`, and
   `authority` are all populated.
2. `authority === 'blocking'` **iff**
   `verdict === 'NOT_SATISFIED' && confidence === 'high'`; every other
   combination is `'advisory'` (unit-tested across all 9 verdict×confidence pairs).
3. `INCONCLUSIVE`, missing-section, and empty-diff inputs are always
   `'advisory'` (never block).
4. The confidence→authority mapping is computed in TS and is **not** readable
   from the LLM response (verified by a test feeding a payload that attempts to
   set `authority` directly).
5. Section resolution follows Success Criteria → user-visible-behavior →
   Overview and records the matched section in `judgedAgainst`.
6. Each `evaluate()` call writes exactly one `execution_outcome` node via
   `ExecutionOutcomeConnector`, consumable by `effectiveness/scorer.ts`
   (integration-tested).
7. The system prompt is conservative: a fixture where the diff partially meets
   the criteria yields at most `medium` confidence (calibration test).
8. `harness.orchestrator.md` contains step 6.5; on a blocking verdict the skill
   halts before the Ship step.
9. `harness validate` passes; the module respects layer rules (`intelligence`
   may depend only on `types` and `graph`).

## Implementation order

1. **Phase 1 — Types & contract:** `types.ts`, `verdictSchema` (zod), and the
   confidence→authority mapping as a pure function with exhaustive unit tests
   (criteria 2–4). No LLM yet.
2. **Phase 2 — Section resolver:** spec-markdown parsing, fallback chain, and
   `judgedAgainst` (criterion 5).
3. **Phase 3 — Evaluator & prompts:** `OutcomeEvaluator` wired to
   `AnalysisProvider`, conservative-confidence prompt, calibration fixtures
   (criteria 1, 7).
4. **Phase 4 — Graph persistence:** `execution_outcome` write via
   `ExecutionOutcomeConnector`, integration test with `effectiveness/scorer.ts`
   (criterion 6).
5. **Phase 5 — Skill wrapper & orchestrator wiring:** `SKILL.md`, `skill.yaml`,
   slash-command regeneration, step 6.5 in both orchestrator docs, ADRs for
   Decisions 1 and 4 (criteria 8, 9).
6. **Follow-up (out of scope, tracked):** CI-template required-check wiring once
   #540 (CI workflow template) lands.
