---
number: 0018
title: LLM-judgment-based skill pattern (vs rule-based skills)
date: 2026-05-23
status: accepted
tier: large
source: docs/changes/design-pipeline/design-craft-elevator/proposal.md
---

## Context

The harness skill ecosystem has, until now, been uniformly **rule-based**:
every skill produces findings via deterministic checks — AST queries, grep
patterns, schema validation, graph queries, structural assertions. The
mental model is shared across `harness-design` (grep-based declared-anti-
pattern enforcement), `detect-design-drift` (AST + token table joins),
`audit-component-anatomy` (schema-driven required-part checks),
`audit-brand-compliance` (forbidden-phrase + asset-class enforcement),
`harness check-design` (multi-skill orchestration over deterministic
outputs), and the entire `harness validate` / scan / verify family.

The design-pipeline initiative's ceiling-raising sub-project — `harness-
design-craft` (sub-project #6) — cannot be built this way. Its job is to
**elevate design from consistent to stunning**: spotting hierarchy
confusion, weak typographic rhythm, cubic-bezier-rather-than-spring
motion, no-primary-action competition, restraint failures, polish gaps.
None of these are reducible to rules. They are judgment calls, and the
only feasible judge at sufficient quality is an LLM (text-mode for fast
code-only critique, vision-mode for deep visual critique).

This is the first skill in harness that takes LLM output as the **primary
finding stream** rather than as a generation/rewrite assistant atop
deterministic checks. That introduces problems the rule-based skill
infrastructure does not face:

1. **Outputs are non-deterministic.** Two runs against the same input
   may produce overlapping-but-not-identical finding sets. Severity
   thresholds based on exact equality (`error` / `warn` / `info`) do not
   carry meaning when the underlying judgment varies.
2. **Confidence is real and must be surfaced.** A rule either fires or
   it does not. A judgment can be 95%-confident or 40%-confident, and
   collapsing both to "warn" destroys the signal that low-confidence
   findings are candidates for human review, not automatic enforcement.
3. **Cost and latency are first-class.** A grep is free. A
   text-model call is cents and seconds. A vision-model call is dimes
   and tens-of-seconds. The skill must offer cheap-default + deep-opt-in
   so CI/autopilot/routine use does not pay for what they cannot
   consume, while designers and reviewers can pay for the deep mode
   when ceiling-raising warrants it.
4. **Determinism is required somewhere in the stack.** Findings need
   to be addressable (`CRAFT-C001`), citeable (rubric/pattern/exemplar
   ids), and reproducible enough that the convergence verifier
   (sub-project #4) can detect fixpoint. The deterministic skeleton
   (codes, schemas, citations, derived priority) wraps the
   non-deterministic LLM judgment so downstream consumers see a stable
   contract.

The team considered four shapes:

- **A. Build harness-design-craft as a one-off — no codified pattern.**
  Treat the LLM-judgment infrastructure as bespoke to one skill.
  Rejected — at least one future skill in the pipeline (audit-brand-
  compliance #3 may benefit from LLM-judgment voice/tone checks; future
  copy-craft skills are obvious follow-ups) will need the same
  infrastructure. Re-deriving it each time costs months and produces
  divergent vocabularies.
- **B. Mix rule-based and LLM-judgment in `harness-design`.** Add
  judgment phases to the existing skill. Rejected — different mental
  models in one skill; reviewers can no longer tell whether a finding
  is mechanically true or LLM-asserted; harness-design balloons; new
  skill identity gets lost.
- **C. Build a generic "llm-judgment-runner" core package.** Centralize
  the call-site, vocabulary, mode-selection, cost-tracking. Rejected
  for v1 — premature abstraction with one consumer. Revisit after the
  third LLM-judgment skill ships and the shared seams are clear.
- **D. Codify the pattern as an ADR + first instance.** Build the
  infrastructure inside `harness-design-craft` for v1, but document
  the _shape_ (confidence-as-first-class, deterministic/judgment
  separation, vision/text mode selection, fast/deep) as a reusable
  pattern so future skills follow it without re-debating.

## Decision

We adopt **Option D**: codify the LLM-judgment skill pattern as a
first-class pattern in the harness skill vocabulary, with `harness-
design-craft` as the first instance. Future skills whose primary
finding stream is LLM judgment MUST follow this pattern unless they
file an ADR that explicitly supersedes it for their domain.

The pattern has four required properties:

### 1. Confidence is a first-class output

Every LLM-asserted finding carries an explicit `confidence` field with
at minimum three values (`high` / `medium` / `low`). Confidence is
emitted by the LLM as part of its structured response, not derived
post-hoc by the runner. Findings with `confidence: low` are NOT silently
dropped, upgraded, or filtered — they are surfaced with visual
distinction in markdown output (italic, prefix `(low confidence:)`, or
equivalent) and are excluded from any enforcement gates by default.

Rationale: LLMs are demonstrably more honest when asked to self-report
confidence than when their outputs are post-filtered. Dropping
low-confidence findings hides cases where the model genuinely doesn't
know, which is exactly the signal a human reviewer needs.

### 2. Deterministic skeleton wraps judgment payload

Every LLM finding sits inside a deterministic shell that carries:

- **A stable `code`** (e.g. `CRAFT-C001`) registered in a finding-codes
  reference page, parseable by graph adapters and verifier fixpoint
  comparison.
- **A `cite` block** pointing back to the rubric / pattern / exemplar
  (or other corpus element) that drove the judgment. Citations are
  catalog ids, not LLM hallucinations — the runner injects the id
  before/after the LLM call.
- **A `target` block** with `file`, optional `line`, optional
  `component` — addressable in the same shape as deterministic
  findings.
- **A `derived` block** with fields computed deterministically from the
  LLM payload (e.g. `priority` from `tier × impact × confidence` — see
  ADR-0019). Downstream consumers depend on derived fields for sorting,
  gating, and fixpoint detection.
- **A `summary.runId`** so the convergence verifier (sub-project #4)
  can detect fixpoint by comparing finding sets across iterations.

Rationale: the verifier, the graph adapters, the dashboard, the
markdown formatter, and the orchestrator all need a stable contract.
Non-determinism in the payload is acceptable; non-determinism in the
shape is not.

### 3. Vision-vs-text mode selection is explicit and opt-in

LLM-judgment skills that have both text-mode and vision-mode
capabilities MUST expose mode selection as a top-level input (`mode:
'fast' | 'deep'` for harness-design-craft; analogous flags elsewhere).
The default is the cheaper mode (`fast` / text). The deeper mode is
opt-in via flag or config. Mode selection is not auto-escalated based
on heuristics — the caller chooses.

The skill MUST surface cost tracking per audit:
`summary.llmCalls.{provider, model, count, costUsd}`. Operators
without cost visibility cannot make informed mode-selection
decisions.

Rationale: vision calls cost an order of magnitude more than text
calls. Routine CI runs cannot afford visual every time; designers
elevating a release deliverable need visual sometimes. Explicit opt-in
keeps both audiences honest.

### 4. Soft dependency and progressive upgrade (the B' pattern)

LLM-judgment skills that benefit from upstream declared-intent
(`AestheticIntent`, brand voice, anatomy contracts) MUST work
standalone with generic-prompt fallbacks, AND MUST detect the
upstream-intent precondition and offer an inline upgrade chain via
`emit_interaction` + skill-transition machinery when the precondition
is missing. The user opts in to the upgrade or proceeds with the
generic mode; the skill does not silently degrade and does not hard-
fail.

This requirement is codified in detail by ADR-0021 (detect-and-offer
B' pattern). LLM-judgment skills are the primary venue for B' because
their output quality is most sensitive to upstream intent.

### 5. Cost-tracking and provider integration

LLM-judgment skills MUST wrap the existing intelligence provider
infrastructure (`packages/intelligence/`) rather than calling provider
SDKs directly. This centralizes:

- Vision-vs-text model variant selection
- Cost accounting per call
- Provider-fallback (text-only when vision unavailable)
- Future caching / rate limiting / mock-injection for deterministic
  CI tests

Rationale: every LLM-judgment skill that calls SDKs directly is a
future migration cost when intelligence-provider seams change.

### What the pattern does NOT mandate

- A specific output vocabulary — but see ADR-0019 (3-axis tier × impact
  × confidence) for the recommended craft-domain default.
- A specific catalog shape — but see ADR-0020 (living catalog H pattern)
  for the recommended catalog-backed default.
- A specific render pipeline — vision-mode implementations are free to
  use playwright, storybook test-runner, browser-use, etc.

## Consequences

**Positive:**

- Future LLM-judgment skills (audit-brand-compliance LLM-mode, copy-
  craft, accessibility-narrative, etc.) inherit a vetted pattern
  instead of re-debating confidence semantics, mode selection, and
  cost tracking from scratch.
- Reviewers learn the LLM-judgment vocabulary once. A finding with
  `confidence: low` means the same thing in every skill that follows
  the pattern.
- The deterministic skeleton lets the convergence verifier, the
  dashboard, and the graph adapters depend on a stable contract while
  the underlying judgment evolves with LLM capability.
- Cost-tracking standardization makes operator budgeting tractable —
  an org can cap "design-related LLM spend" without per-skill
  bespoke accounting.

**Negative:**

- Skills that adopt the pattern inherit complexity (mode selection,
  cost tracking, intelligence-provider integration, confidence
  rendering) even when their domain might tolerate a simpler shape.
  The pattern is opinionated; lighter alternatives exist for skills
  that only need a single LLM call without findings infrastructure.
- The pattern locks future skills to the harness intelligence provider.
  Skills that need a niche model not exposed via `packages/
intelligence/` must either extend that package or file a superseding
  ADR.
- Codifying the pattern before the second instance ships carries
  generalization risk. The first revision-triggering signal will be
  the second LLM-judgment skill discovering a constraint we did not
  anticipate. We accept the risk because re-deriving the pattern
  per-skill costs more than one revision cycle.

**Reversibility:**

- Superseding this ADR requires (a) at least one shipped LLM-judgment
  skill that demonstrates the pattern is unfit, (b) a replacement ADR
  proposing the new pattern, and (c) a migration plan for the first
  instance (`harness-design-craft`) if the new pattern is incompatible.
- Individual skills MAY file domain-specific superseding ADRs without
  invalidating this one for other skills.

## Alternatives Considered

- **Option A** (no codified pattern, build harness-design-craft as
  one-off): rejected — re-derivation cost when sub-project #3's
  LLM-mode brand-voice checks ship.
- **Option B** (mix rule-based + LLM-judgment in harness-design):
  rejected — different mental models in one skill destroys reviewer
  trust signal.
- **Option C** (generic llm-judgment-runner core package): rejected
  for v1 — premature abstraction with one consumer; revisit after the
  third LLM-judgment skill ships and the shared seams are clear.

## References

- First instance: `docs/changes/design-pipeline/design-craft-elevator/
proposal.md` (sub-project #6, harness-design-craft).
- Companion ADRs:
  - `0019-3-axis-craft-output-model.md` — output vocabulary for
    LLM-judgment craft findings.
  - `0020-living-catalog-h-pattern.md` — catalog shape for
    catalog-backed LLM-judgment skills.
  - `0021-detect-and-offer-b-prime-pattern.md` — soft-dependency
    upgrade path for LLM-judgment skills that benefit from upstream
    intent.
- Prior art: `docs/changes/design-pipeline/REFERENCES.md` items #3
  (emilkowalski/skill — judgment-heavy SKILL.md prose), #4
  (alchaincyf/huashu-design — 5-dim radar from LLM critique).
- Intelligence provider: `packages/intelligence/`.
- Related: `0007-multi-provider-intelligence-pipeline.md` (provider
  abstraction), `0014-cost-ceiling-policy.md` (cost tracking precedent).
