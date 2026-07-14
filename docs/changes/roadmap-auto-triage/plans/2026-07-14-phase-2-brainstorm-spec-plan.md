# Plan: Roadmap Auto-Triage — Phase 2 (Autonomous Brainstorm + Spec Generation)

## Goal

For each Phase-1 candidate, run a **depth-scaled autonomous brainstorm** that plays
both roles — generating each fork _and_ selecting its own recommended default — and
either (a) completes cleanly, writing a real spec, or (b) **halts at the first fork
it can't confidently recommend**, handing that fork to a human. Then re-score the
enriched item. Still **no dispatch, no execution** — this produces documents only.

## Scope Guards (do NOT do in this plan)

- No dispatch, no marking for the orchestrator, no execution (Phase 3).
- No post-diff retrospective / precedent recording (Phase 4). The precedent lever stays
  degrade-empty.
- Do not auto-author a _stub_ to bypass a gate — a halt is a real handoff, not a
  rubber stamp. If confidence is short anywhere, halt; never paper over it.
- Default-off; gated behind `roadmap.autoTriage.enabled`.

## Observable Truths (Acceptance Criteria)

- SC1: A candidate yields exactly one `BrainstormOutcome`: `completed{ spec }` or
  `halted{ fork, reason }`.
- SC2: Every fork records `{ options, recommendation, confidence }`; a fork with
  confidence below threshold forces `halted` at that fork (SC = the no-go trigger).
- SC3: Brainstorm depth scales with the Phase-1 complexity estimate — a `trivial`
  item runs a shallow pass, `simple` a fuller one; depth is bounded (never the full
  4-phase treatment for a typo).
- SC4: On `completed`, a proposal-shaped spec is written and the enriched item is
  re-scored via the Phase-1 probe (`runScopingProbe`) using the now-substantive
  content — not the original length proxy.
- SC5: Any brainstorm error/timeout ⇒ `halted{ reason: 'error' }` to a human;
  never a spec, never a dispatch.
- SC6: The fork-drive + halt logic is unit-testable with a stubbed fork generator
  (pure decision core; the LLM is an injected seam).

## Grounding (evidence: file:line)

- Brainstorm methodology + per-fork recommendation:
  `agents/skills/claude-code/harness-brainstorming/SKILL.md`
  (EXPLORE→EVALUATE→PRIORITIZE→VALIDATE; emits a recommended default per fork).
- Skill/pipeline execution seam:
  `packages/orchestrator/src/intelligence/pipeline-runner.ts`; SEL provider via
  `buildAnalysisProviderForLayer('sel', …)`
  (`packages/orchestrator/src/agent/intelligence-factory.ts:103`).
- Re-score reuse: Phase-1 `runScopingProbe`
  (`packages/intelligence/src/triage/probe.ts`).
- Spec shape to emit: `docs/changes/<feature>/proposal.md` convention (this file's
  siblings).

## Architecture (layer-safe)

The **decision core** — drive phases, per-fork confidence, auto-accept-or-halt,
depth-scaling — is pure and lives in `packages/intelligence/src/triage/brainstorm/`
behind an injected `ForkGenerator` seam (the thing that calls the model). The
orchestrator supplies the real generator (SEL provider + skill runner) and does
doc I/O. Mirrors Phase 1's pure-core / orchestrator-wiring split.

## File Map

- `packages/intelligence/src/triage/brainstorm/types.ts` — `Fork`, `ForkDecision`,
  `BrainstormOutcome`, `ForkGenerator` (seam), `DepthBudget`.
- `packages/intelligence/src/triage/brainstorm/runner.ts` — pure
  `runAutoBrainstorm(input, generator, depth)` → `BrainstormOutcome`.
- `packages/intelligence/src/triage/brainstorm/runner.test.ts` — SC1–SC3, SC5–SC6.
- `packages/orchestrator/src/agent/brainstorm-wiring.ts` — real `ForkGenerator`
  over the SEL provider/skill runner; spec write; re-score call.
- CLI: extend the `triage` command with a `--brainstorm` mode that emits specs +
  halt handoffs (still read/write docs only, no dispatch).

## Uncertainties

- **How much the existing brainstorming skill can be driven programmatically vs.
  reimplemented as a compact fork loop.** Likely a purpose-built compact loop that
  reuses the skill's _methodology_ (phases + recommendation) rather than invoking
  the interactive skill. Confirm against `pipeline-runner.ts` before Task 4.
- The confidence-per-fork signal: whether the SEL provider can emit a calibrated
  confidence, or whether we derive it (e.g. option-margin / self-report). Start
  with self-report + a conservative threshold; refine later.
- Depth→budget mapping (how many forks/phases per complexity level).

## Tasks

### Task 0 (confirm-or-abort): Fork-confidence signal — ✅ RESOLVED: GO (spiked early)

**Depends on:** Phase 1 | **Files:** none (spike) | **Category:** spike
**ACCEPTED-RISK GATE — cleared.** Read-only spike (run concurrently with Phase 1),
including a live probe, confirmed the mechanism exists and discriminates clear vs.
ambiguous forks. Directives that now bind Tasks 1–4:

- **Mechanism:** reuse the AMR tie-break's structured-output confidence. Define a
  per-fork Zod schema `{ recommendation, confidence: enum(high|medium|low),
rationale }` and call `AnalysisProvider.analyze<ForkDecision>({responseSchema})`
  against the SEL provider (`buildAnalysisProviderForLayer('sel', …)`). Pattern:
  `intelligence/src/complexity/tiebreak.ts:5-29`; contract:
  `analysis-provider/interface.ts`.
- **Gate:** halt unless `confidence === 'high'`. Treat the enum as conservative
  input, NEVER authority — mirror `derive-tier.ts:87-90` (uncertainty escalates,
  never green-lights).
- **Overconfidence hardening (REQUIRED, T3):** raw self-report is overconfident on
  unstable choices. Add a **self-consistency check** — sample each fork N=2–3×; if
  the _recommendation_ flips, force `confidence = low` regardless of the reported
  enum. Also pass a rubric in the prompt naming human-only triggers (product/UX
  tradeoffs, unrevealed business priorities, security/irreversibility).
- **Build approach (T3/T4): compact fork-loop, NOT drive-the-skill.**
  `harness-brainstorming` is a human-in-loop prose playbook (waits for human replies,
  hard-STOPs for sign-off) with no callable API — it CANNOT be driven programmatically.
  Extract its methodology (enumerate forks → options+tradeoffs → recommend+confidence)
  into a compact loop over `analyze()`. This resolves the plan's other P2 uncertainty.
- **Caveat to confirm when the backend is live:** the probe used Ollama
  `qwen2.5-coder:7b` (configured PI backend `localhost:1234` was down); confirm the
  actual configured local model honors grammar-constrained decoding + reports
  confidence with equal discrimination (one-line check, not a blocker).
  No abort.

### Task 1: Brainstorm types (`brainstorm/types.ts`)

**Depends on:** Phase 1 | **Files:** `…/triage/brainstorm/types.ts`,
`packages/intelligence/src/index.ts` | **Category:** types
`ForkDecision = { options; recommendation; confidence }`,
`BrainstormOutcome = { kind:'completed'; spec } | { kind:'halted'; fork; reason }`,
`ForkGenerator` seam, `DepthBudget`.

### Task 2 (TDD): Fork-drive + halt spec (`runner.test.ts`)

**Depends on:** Task 1 | **Files:** `…/brainstorm/runner.test.ts` |
**Category:** test
Stubbed `ForkGenerator`: all-confident → `completed`; one low-confidence fork →
`halted` at that fork (SC2); generator throw → `halted{error}` (SC5); depth budget
respected (SC3); determinism (SC6).

### Task 3 (TDD): `runAutoBrainstorm` (`runner.ts`)

**Depends on:** Task 2 | **Files:** `…/brainstorm/runner.ts` | **Category:** impl
Pure loop: for each phase up to `DepthBudget`, generate a fork, auto-accept iff
`confidence ≥ threshold` else halt; accumulate accepted decisions into a spec
draft on clean completion. Never throws.

### Task 4: Spec emission + re-score (`brainstorm-wiring.ts`)

**Depends on:** Task 3 | **Files:**
`packages/orchestrator/src/agent/brainstorm-wiring.ts`,
`…/brainstorm-wiring.test.ts` | **Category:** impl
Real `ForkGenerator` over the SEL provider; on `completed`, write a proposal-shaped
spec and call `runScopingProbe` on the enriched text (SC4). Unit-test with an
injected generator.

### Task 5: CLI `--brainstorm` mode

**Depends on:** Task 4 | **Files:** `triage` command | **Category:** impl
For each Phase-1 candidate, run the brainstorm; emit the generated spec or the halt
handoff (fork + reason). Docs only; no dispatch. Default-off.

### Task 6: `[checkpoint:human-verify]` — Phase 2 verification

**Depends on:** Task 5 | **Files:** none | **Category:** integration
Run over real candidates. Confirm specs are executable-quality and that items
needing judgment halt at a legible fork. Human decides whether to proceed to P3.

## Sequencing

T0 (confirm-or-abort fork-confidence) first — gates T3/T4. T1 → T2 → T3 (pure core)
→ T4 → T5 → T6. Core (T1–T3) lands without the orchestrator.

## Traceability

SC1–SC3,SC5,SC6 → T2/T3; SC4 → T4; default-off → T5; all → T6. Maps to proposal
§"Autonomous brainstorm stage" + D6–D9.

## Concerns

- **This is the riskiest logic in the whole feature** — it decides what "needs a
  human." Bias the confidence threshold high; a false _completed_ (should have
  halted) is the dangerous error, a false _halted_ only costs a human glance.
- Keep the decision core pure so the halt behavior is exhaustively testable without
  a live model.
- Watch spec quality: an autonomously written spec that reads plausible but is
  under-scoped is exactly what Phase 4's post-diff gate must later catch — but P2
  should minimize it, not lean on P4.
