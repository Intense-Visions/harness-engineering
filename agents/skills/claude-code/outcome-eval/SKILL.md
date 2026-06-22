# Outcome Eval

> Post-execution LLM-judgment: did the implementation actually satisfy its spec? Reads the spec's acceptance section, the change diff, and test output, and emits a confidence-rated `OutcomeVerdict` (`SATISFIED | NOT_SATISFIED | INCONCLUSIVE`) with a rationale and unmet criteria. Ship authority is derived in TypeScript, never trusted from the LLM: a high-confidence `NOT_SATISFIED` blocks ship; every other verdict is advisory. The harness's first blocking post-execution spec-satisfaction gate (the roadmap's named #1 gap). Each verdict persists as an `execution_outcome` node, compounding into skill-effectiveness baselines.

## When to Use

- At orchestrator step 6.5 — after Code Review, before Ship — on every change with a spec.
- When you need a durable, structured answer to "did this code do what the spec said?"
- NOT for pre-execution risk simulation (use PESL).
- NOT for rule-based floors (lint/architecture/entropy) or craft ceilings (naming/spec/security) — those run elsewhere.
- NOT for auto-remediation. outcome-eval judges; it does not fix.
- NOT when no judgable spec section exists — the verdict degrades to INCONCLUSIVE/advisory and never blocks.

## Process

### Phase 1: GATHER — Collect inputs

1. Capture the change under judgment as a unified diff: `git diff` (or `git diff <base>...HEAD` for a branch). Record it as `diff`.
2. Capture test-runner output. If a test command is known, run it and capture stdout+stderr as `testOutput`; otherwise pass the most recent captured output. Empty/unparseable test output is tolerated (degrades to advisory).
3. Resolve the spec path. Prefer the spec under `docs/changes/<feature>/proposal.md` for the current change. Record as `specPath`.

### Phase 2: RESOLVE — Find the judgment section

The evaluator resolves the section internally via the fallback chain `## Success Criteria` -> `## User-Visible Behavior` -> `## Overview`, recording the match in `judgedAgainst`. No manual action — pass `specPath` and let `OutcomeEvaluator` resolve. If no section is judgable, the verdict is INCONCLUSIVE/advisory.

### Phase 3: JUDGE — Invoke the evaluator

1. Invoke `OutcomeEvaluator.evaluate({ specPath, diff, testOutput })` (via the generated MCP tool `outcome_eval` / CLI `harness outcome-eval`, supported v1 path: the claude-cli / anthropic analysis provider).
2. The LLM returns ONLY `verdict / confidence / rationale / unmetCriteria`. `authority` is computed in TypeScript from `(verdict, confidence)` and is never read from the LLM — do not attempt to override it.
3. The call is degrade-safe: provider failure, empty diff, or missing section yields INCONCLUSIVE/low/advisory. It never throws and never blocks.

### Phase 4: GATE — Render and (conditionally) halt

1. Render the verdict: `verdict`, `confidence`, `judgedAgainst`, `rationale`, and `unmetCriteria`.
2. Authority rule (must match `deriveAuthority`): authority is `blocking` **iff** `verdict === 'NOT_SATISFIED' && confidence === 'high'`; every other combination — including all `INCONCLUSIVE` and `SATISFIED` cases, and all `medium`/`low` `NOT_SATISFIED` — is `advisory`.
3. **On a blocking verdict: HALT before the Ship step.** Report the unmet criteria and stop; do not proceed to step 7. Resolution requires fixing the implementation (or the spec) and re-running outcome-eval.
4. On an advisory verdict: report it and proceed. Advisory `NOT_SATISFIED` is surfaced for human attention but does not stop the workflow.

## Harness Integration

- **`harness outcome-eval`** — CLI entry. `--spec-path <path>` selects the spec; resolves to the change's `docs/changes/<feature>/proposal.md` by default.
- **`mcp__harness__outcome_eval`** — MCP tool. Input `{ specPath }`; the agent supplies diff/test output from the session.
- **Evaluator surface:** `OutcomeEvaluator`, `deriveAuthority`, `verdictSchema`, `OutcomeVerdict` are exported from `@harness-engineering/intelligence`.
- **Provider path (v1 supported):** the claude-cli / anthropic analysis provider. The openai-compatible _strict_ structured-output path is a known follow-up (see Known Limitations).
- **Orchestrator:** runs as step 6.5 between Code Review and Ship in `harness.orchestrator.md`.
- **Persistence:** each `evaluate()` writes one `execution_outcome` node via `ExecutionOutcomeConnector`, consumable by `effectiveness/scorer.ts`.

## Known Limitations

- **INCONCLUSIVE persistence:** the persisted node maps `INCONCLUSIVE -> result: 'failure'` for type-validity, but it OMITS `agentPersona` and writes `affectedSystemNodeIds: []`. The effectiveness scorer (`gatherOutcomes`) ignores any node missing `agentPersona` or `outcome_of` edges, so outcome-eval nodes are **scorer-non-counting** in v1 — the INCONCLUSIVE-as-failure mapping is therefore harmless and does not punish any persona. If a future change attaches persona/affected-system attribution, it MUST first change INCONCLUSIVE modeling (do not persist INCONCLUSIVE, or use a distinct result value the scorer excludes) before the node becomes scorer-counted.
- **openai-compatible strict mode:** `zodToJsonSchema` does not emit `additionalProperties: false`, which OpenAI strict structured output requires. The v1 supported path is claude-cli / anthropic. Follow-up tracked.
- **CI required-check wiring:** deferred to roadmap #540 (unbuilt CI workflow template).

## Success Criteria

See `docs/changes/outcome-eval/proposal.md` for the full 9 criteria. This skill satisfies SC8 (orchestrator step 6.5 + blocking halt) and SC9 (`harness validate` passes; layer rules respected).

## Examples

### Example: NOT_SATISFIED with high confidence (blocks)

**Input:** spec Success Criteria require `GET /api/users/:id` to return 404 with `{ error: 'User not found' }`; the diff implements the happy path only, no 404 branch; test output shows the 404 test failing.

**Verdict:**

```
verdict:        NOT_SATISFIED
confidence:     high
judgedAgainst:  success-criteria
authority:      blocking
unmetCriteria:
  - "404 path for nonexistent user is unimplemented; the failing test asserts { error: 'User not found' }."
rationale:      "The diff adds the lookup but returns 200 with an empty body when the user is missing."
```

**Action:** HALT before Ship. Report unmet criteria; do not open the PR.

### Example: partial implementation (advisory)

**Input:** the diff meets most criteria; one acceptance item is ambiguous in the diff.

**Verdict:** `NOT_SATISFIED confidence: medium authority: advisory` — surfaced for review, workflow proceeds.
