# Plan: outcome-eval Phase 5 — Skill Wrapper & Orchestrator Wiring (FINAL)

**Date:** 2026-06-22 | **Spec:** docs/changes/outcome-eval/proposal.md | **Tasks:** 12 | **Time:** ~48 min | **Integration Tier:** large

## Goal

Make the already-built `OutcomeEvaluator` invokable as the `harness:outcome-eval` skill, discoverable as a slash command, and wired into the orchestrator as step 6.5 (between Code Review and Ship) so a high-confidence `NOT_SATISFIED` verdict halts before Ship — satisfying Success Criteria 8 and 9.

## Context (Phases 1-4 already complete)

- `packages/intelligence/src/outcome-eval/` is fully implemented and unit/integration tested (282 passing).
- `OutcomeEvaluator`, `deriveAuthority`, `verdictSchema` (`.strict()`), `OutcomeEvalInput`, `OutcomeVerdict` are all **already exported** from `packages/intelligence/src/index.ts` (lines 61-75). **No intelligence-barrel regeneration task is needed.**
- `evaluate()` is degrade-safe: missing spec/empty diff/provider failure -> INCONCLUSIVE/low/advisory; never throws; never blocks.
- Persistence: one `execution_outcome` node per `evaluate()` via `ExecutionOutcomeConnector`, with `agentPersona` OMITTED and `affectedSystemNodeIds: []`.

## Observable Truths (Acceptance Criteria)

1. **(SC8)** `agents/skills/claude-code/outcome-eval/SKILL.md` and `skill.yaml` exist; `skill.yaml` declares `tier: 2`, `type: rigid`, `cognitive_mode: constructive-architect`.
2. **(SC8)** SKILL.md instructs the agent to: gather the diff (`git diff`), capture test output, resolve the spec path, invoke the evaluator, render the verdict, and — when `authority === 'blocking'` (NOT_SATISFIED + high confidence) — halt before the Ship step.
3. **(SC8)** Both `harness.orchestrator.md` and `templates/orchestrator/harness.orchestrator.md` contain a step **6.5** between Code Review (step 6) and Ship (step 7), with a one-line verdict-authority note: high-confidence NOT_SATISFIED blocks; every other verdict is advisory.
4. Running `harness generate-slash-commands` produces an `outcome-eval` slash-command artifact under `.claude-plugin/commands/` (and `.cursor-plugin/commands/`), committed.
5. Standalone ADRs exist at `docs/knowledge/decisions/0011-*.md` (Decision 1: tiered confidence->authority) and `docs/knowledge/decisions/0012-*.md` (Decision 4: execution_outcome provenance), matching the repo ADR front-matter format.
6. `docs/changes/outcome-eval/SKILLS.md` exists (skill-advisor output) and is committed.
7. The INCONCLUSIVE->'failure' persistence modeling is explicitly documented as a known, currently-harmless limitation (node is scorer-non-counting because persona/affected-system attribution is absent) — recorded in SKILL.md and the spec's known-limitations note.
8. **(SC9)** `harness validate` passes.

## Provider-path determination (deferred concern resolved)

**Finding:** `zodToJsonSchema` (`packages/intelligence/src/analysis-provider/schema.ts`) does NOT emit `additionalProperties: false`. The `openai-compatible` provider sends `json_schema: { strict: true, schema }` (`openai-compatible.ts:80-81`); OpenAI strict mode requires `additionalProperties: false` on every object, so the openai-compatible strict path _could_ reject `verdictSchema`. The `claude-cli` provider (`claude-cli.ts:35,59`) uses the same converter but does a local `responseSchema.parse(...)` and does not require the flag.

**Decision: documented follow-up, NOT an in-scope schema.ts change.**

- This skill is `platform: claude-code`, tier 2, mirroring PESL; its default/subscription provider path resolves to `claude` -> `ClaudeCliAnalysisProvider` (per ADR 0007). That path works without `additionalProperties:false`.
- The evaluator already has a defensive `.strict()` re-parse seam (`evaluator.ts:90`) that discards any injected key (incl. `authority`) regardless of provider strictness — the false-positive-critical invariant holds either way.
- Changing `schema.ts` touches **all** intelligence providers (SEL, PESL, security paths) — out of this phase's surface (skill + orchestrator + ADRs). Editing it here would exceed scope and risk regressions in unrelated pipelines.
- **Action:** Task 11 documents this as a known limitation/follow-up (openai-compatible strict mode + outcome-eval needs `additionalProperties:false` in `convertObject`) and Task 4's skill text pins the claude-cli/anthropic path as the supported v1 invocation. No `schema.ts` edit in this plan.

## INCONCLUSIVE precondition (PRE-P5-INCONCLUSIVE) resolution

**This phase does NOT add `agentPersona`/`affectedSystemNodeIds` to the persisted node.** The skill invokes `evaluate()` unchanged; no task touches `toExecutionOutcome`. Therefore the `INCONCLUSIVE -> 'failure'` mapping (`evaluator.ts:179`) stays harmless: `effectiveness/scorer.ts gatherOutcomes` (`scorer.ts:61-65`) skips any node missing `agentPersona` OR lacking `outcome_of` edges, and outcome-eval nodes have neither. The node is **scorer-non-counting** and the INCONCLUSIVE-as-failure issue stays deferred.

**Action:** Task 11 documents this explicitly as a known limitation. If a future phase attaches persona/affected-system attribution, it MUST first change INCONCLUSIVE modeling (prefer: do not persist INCONCLUSIVE, or a distinct result value the scorer excludes) BEFORE the node becomes scorer-counted. No code change this phase.

## CI-template wiring

Out of scope (deferred to roadmap #540). Confirmed as a follow-up in Task 11; no task plans it.

## File Map

- CREATE `agents/skills/claude-code/outcome-eval/skill.yaml`
- CREATE `agents/skills/claude-code/outcome-eval/SKILL.md`
- MODIFY `harness.orchestrator.md` (insert step 6.5; update Rules note)
- MODIFY `templates/orchestrator/harness.orchestrator.md` (insert step 6.5; update Rules note)
- CREATE `docs/knowledge/decisions/0011-tiered-confidence-to-authority.md`
- CREATE `docs/knowledge/decisions/0012-execution-outcome-provenance-from-judgment.md`
- VERIFY/COMMIT `docs/changes/outcome-eval/SKILLS.md` (already written by advise-skills)
- GENERATED (by `harness generate-slash-commands`): `.claude-plugin/commands/outcome-eval.md`, `.cursor-plugin/commands/outcome-eval.md` (+ any platform variants the generator emits)
- MODIFY spec known-limitations: append a note to `docs/changes/outcome-eval/proposal.md` Non-goals/limitations OR record in SKILL.md (Task 11)

## Skeleton

1. Skill files (skill.yaml + SKILL.md) (~3 tasks, ~14 min)
2. Slash-command regeneration (~1 task, ~4 min)
3. Orchestrator wiring (both docs) (~2 tasks, ~10 min)
4. ADRs (~2 tasks, ~10 min)
5. SKILLS.md + limitations doc + validate/commit (~4 tasks, ~10 min)

**Estimated total:** 12 tasks, ~48 minutes. _Skeleton approved: pending (standard rigor, 12 tasks >= 8 -> approval gate before expansion)._

## Tasks

> Note: This phase produces skill markdown, orchestrator docs, ADRs, and a generated slash command — no new TypeScript. There is no TDD red/green per task because no production code is written; the executable check for each artifact is `harness validate` plus, where applicable, the generator/CLI run. The behavioral seam (authority derivation, degrade-safety) is already unit-tested in Phases 1-4.

---

### Task 1: Create `skill.yaml` for outcome-eval

**Depends on:** none | **Files:** `agents/skills/claude-code/outcome-eval/skill.yaml`

1. Create the directory `agents/skills/claude-code/outcome-eval/`.
2. Write `skill.yaml`, mirroring `agents/skills/claude-code/security-craft/skill.yaml` field set:

   ```yaml
   name: outcome-eval
   version: '0.1.0'
   description: >-
     LLM-judgment skill that produces a structured, confidence-rated verdict on
     whether an implementation satisfied its spec. Reads the spec's acceptance
     section, the change diff, and test output; emits an OutcomeVerdict
     (SATISFIED | NOT_SATISFIED | INCONCLUSIVE) with confidence, rationale, and
     unmet criteria. Authority is derived in TypeScript, never from the LLM: a
     high-confidence NOT_SATISFIED blocks ship; every other verdict is advisory.
     The verdict persists as an execution_outcome node and feeds skill-effectiveness
     baselines. The harness's first blocking post-execution spec-satisfaction gate.
   stability: draft
   cognitive_mode: constructive-architect
   triggers:
     - manual
     - on_pr
   platforms:
     - claude-code
   tools:
     - Bash
     - Read
     - Glob
     - Grep
   cli:
     command: harness outcome-eval
     args:
       - name: spec-path
         description: Path to the spec markdown to judge against
         required: false
       - name: path
         description: Project root path
         required: false
   mcp:
     tool: outcome_eval
     input:
       specPath: string
   type: rigid
   tier: 2
   phases:
     - name: gather
       description: Collect the unified diff (git diff), capture test output, resolve the spec path
       required: true
     - name: resolve
       description: Resolve the judgment section (Success Criteria -> User-Visible Behavior -> Overview)
       required: true
     - name: judge
       description: Invoke OutcomeEvaluator.evaluate(); LLM returns verdict/confidence/rationale/unmetCriteria; authority derived in TS
       required: true
     - name: gate
       description: Render the verdict; on a blocking verdict (NOT_SATISFIED + high confidence) halt before Ship
       required: true
   state:
     persistent: false
   ```

   > The `cli.command`/`mcp.tool` declarations mirror security-craft's pattern. The spec's Integration Points name "New MCP `run_skill` route + CLI command (generated from `skill.yaml`)"; wiring those runtimes is a generator concern, not a hand-coded task here.

3. Run: `harness validate`
4. Commit: `feat(outcome-eval): add skill.yaml (tier 2, rigid, constructive-architect)`

---

### Task 2: Write SKILL.md header, overview, and When-to-Use

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/outcome-eval/SKILL.md`
**Skills:** `ts-zod-integration` (reference) — verdict schema shape

1. Create `SKILL.md`. Mirror the security-craft SKILL.md structure: H1 title, a `>` blockquote summary, `## When to Use`, `## Process` (numbered phases), `## Harness Integration`, `## Success Criteria`, `## Examples`. Write the header through When-to-Use:

   ```markdown
   # Outcome Eval

   > Post-execution LLM-judgment: did the implementation actually satisfy its spec? Reads the spec's acceptance section, the change diff, and test output, and emits a confidence-rated `OutcomeVerdict` (`SATISFIED | NOT_SATISFIED | INCONCLUSIVE`) with a rationale and unmet criteria. Ship authority is derived in TypeScript, never trusted from the LLM: a high-confidence `NOT_SATISFIED` blocks ship; every other verdict is advisory. The harness's first blocking post-execution spec-satisfaction gate (the roadmap's named #1 gap). Each verdict persists as an `execution_outcome` node, compounding into skill-effectiveness baselines.

   ## When to Use

   - At orchestrator step 6.5 — after Code Review, before Ship — on every change with a spec.
   - When you need a durable, structured answer to "did this code do what the spec said?"
   - NOT for pre-execution risk simulation (use PESL).
   - NOT for rule-based floors (lint/architecture/entropy) or craft ceilings (naming/spec/security) — those run elsewhere.
   - NOT for auto-remediation. outcome-eval judges; it does not fix.
   - NOT when no judgable spec section exists — the verdict degrades to INCONCLUSIVE/advisory and never blocks.
   ```

2. Run: `harness validate`
3. Commit: `docs(outcome-eval): SKILL.md header and when-to-use`

---

### Task 3: Write SKILL.md Process phases (gather/resolve/judge/gate) including the blocking-halt rule

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/outcome-eval/SKILL.md`

1. Append the `## Process` section with four phases. The exact gate semantics MUST match `deriveAuthority` (`packages/intelligence/src/outcome-eval/authority.ts:13-14`): blocking iff `NOT_SATISFIED && high`.

   ```markdown
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
   ```

2. Run: `harness validate`
3. Commit: `docs(outcome-eval): SKILL.md process phases and blocking-halt gate`

---

### Task 4: Write SKILL.md Harness-Integration, Success-Criteria, and a worked Example

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/outcome-eval/SKILL.md`

1. Append the remaining sections:

   ```markdown
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

   verdict: NOT_SATISFIED confidence: high judgedAgainst: success-criteria authority: blocking
   unmetCriteria:
   - "404 path for nonexistent user is unimplemented; the failing test asserts { error: 'User not found' }."
     rationale: "The diff adds the lookup but returns 200 with an empty body when the user is missing..."

   ```

   **Action:** HALT before Ship. Report unmet criteria; do not open the PR.

   ### Example: partial implementation (advisory)

   **Input:** the diff meets most criteria; one acceptance item is ambiguous in the diff.

   **Verdict:** `NOT_SATISFIED confidence: medium authority: advisory` — surfaced for review, workflow proceeds.
   ```

2. Run: `harness validate`
3. Commit: `docs(outcome-eval): SKILL.md integration, limitations, examples`

---

### Task 5: Regenerate slash commands

**Depends on:** Task 4 | **Files:** `.claude-plugin/commands/outcome-eval.md`, `.cursor-plugin/commands/outcome-eval.md` (generated) | **Category:** integration

1. Run: `harness generate-slash-commands` (non-interactive; if it prompts, follow the documented `--yes`/non-interactive flag — check `harness generate-slash-commands --help` first).
2. Verify an `outcome-eval` command artifact was emitted under `.claude-plugin/commands/` (and `.cursor-plugin/commands/`), mirroring the existing `security-craft.md` artifacts.
3. Run: `harness validate`
4. Commit: `chore(outcome-eval): regenerate slash commands`

---

### Task 6: Insert orchestrator step 6.5 in `harness.orchestrator.md`

**Depends on:** Task 4 | **Files:** `harness.orchestrator.md` | **Category:** integration

1. In the `## Standard Workflow` numbered list, insert a new step between step 6 (Code Review, ends with the `6b. Compound` sub-item at lines ~114-119) and step 7 (Ship, line ~120). Insert after the `6b` block:

   ```markdown
   6.5. **Outcome Eval:** Use `/harness:outcome-eval` to judge whether the
   implementation satisfied its spec. It gathers the diff and test output,
   resolves the spec's acceptance section, and emits a confidence-rated
   `OutcomeVerdict`. **Verdict authority (derived in TypeScript, never from the
   LLM): a high-confidence `NOT_SATISFIED` BLOCKS ship — halt here and fix the
   implementation or spec before proceeding; every other verdict (all
   `SATISFIED`, all `INCONCLUSIVE`, and medium/low `NOT_SATISFIED`) is advisory
   — report it and continue.**
   ```

2. In the `## Rules` section, add one line after the existing Step 7 rule (line ~142):

   ```markdown
   - Step 6.5 (Outcome Eval) is a gate: a high-confidence `NOT_SATISFIED` verdict blocks Ship. Do not proceed to step 7 until the verdict is non-blocking.
   ```

3. Run: `harness validate`
4. Commit: `feat(orchestrator): add step 6.5 outcome-eval gate before Ship`

---

### Task 7: Insert orchestrator step 6.5 in `templates/orchestrator/harness.orchestrator.md`

**Depends on:** Task 6 | **Files:** `templates/orchestrator/harness.orchestrator.md` | **Category:** integration

1. Apply the identical step-6.5 insertion and Rules note as Task 6, adapted to the template's line layout (Code Review is step 6 at ~line 97, Ship is step 7 at ~line 105, the Step-7 Rules note is at ~line 127). Read the template's exact step-6/step-7 block first so the insertion reads cleanly (the template may lack the `6b. Compound` sub-item — insert 6.5 directly after step 6's body in that case).
2. Run: `harness validate`
3. Commit: `feat(orchestrator-template): add step 6.5 outcome-eval gate before Ship`

---

### Task 8: Write ADR 0011 — Tiered confidence->authority

**Depends on:** none (parallelizable with skill tasks) | **Files:** `docs/knowledge/decisions/0011-tiered-confidence-to-authority.md` | **Category:** integration
**Skills:** `ts-type-guards` (reference)

1. Create the ADR matching the repo front-matter format (see `docs/knowledge/decisions/0007-*.md`):

   ```markdown
   ---
   number: 0011
   title: Tiered confidence-to-authority for outcome-eval
   date: 2026-06-22
   status: accepted
   tier: large
   source: docs/changes/outcome-eval/proposal.md
   ---

   ## Context

   The harness has rule-based floors and craft-pipeline ceilings plus pre-execution
   simulation (PESL), but no post-execution check answering the binary question
   "did the code actually do what the spec said?" — the roadmap's named #1 gap.
   outcome-eval introduces that judgment. The open question: what authority should a
   judgment-based verdict carry? A hard gate would let one over-cautious verdict
   stall every PR; advisory-only would fail the v5.0 "Load-Bearing Harness"
   milestone's "required check" intent.

   ## Decision

   Authority is tiered on confidence and **derived in TypeScript, never supplied by
   the LLM**. `deriveAuthority(verdict, confidence)` returns `blocking` iff
   `verdict === 'NOT_SATISFIED' && confidence === 'high'`; every other combination
   — including all `INCONCLUSIVE` and `SATISFIED` cases and all medium/low
   `NOT_SATISFIED` — is `advisory`. The LLM returns only
   `verdict / confidence / rationale / unmetCriteria`; `verdictSchema` is `.strict()`
   so an injected `authority` key is rejected at parse time
   (`packages/intelligence/src/outcome-eval/authority.ts`,
   `evaluator.ts:90`). This is the harness's **first blocking LLM-judgment gate**
   and establishes the precedent that judgment authority is a pure TS function of a
   structured verdict, not a value the model can assert.

   ## Consequences

   **Positive:** load-bearing (a confident, specific failure stops ship) while
   false-positive-safe (only high-confidence failures block; the conservative
   prompt biases toward medium). The blocking seam is unit-testable in TS, isolated
   from prompt drift.

   **Negative:** a genuinely-broken change held at medium confidence ships with only
   an advisory flag — calibration of the prompt's high-confidence bar is now
   load-bearing.

   **Neutral:** the precedent ("authority is TS-derived") constrains every future
   LLM-judgment gate to the same shape.

   ## Related

   - [`docs/changes/outcome-eval/proposal.md`](../../changes/outcome-eval/proposal.md) Decision 1
   - ADR 0012: execution_outcome provenance from a judgment skill
   - `agents/skills/claude-code/security-craft/SKILL.md` — conservative-confidence precedent
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): 0011 tiered confidence-to-authority for outcome-eval`

---

### Task 9: Write ADR 0012 — execution_outcome provenance from a judgment skill

**Depends on:** Task 8 (sequential ADR numbering) | **Files:** `docs/knowledge/decisions/0012-execution-outcome-provenance-from-judgment.md` | **Category:** integration

1. Create the ADR:

   ```markdown
   ---
   number: 0012
   title: execution_outcome provenance from a judgment skill
   date: 2026-06-22
   status: accepted
   tier: large
   source: docs/changes/outcome-eval/proposal.md
   ---

   ## Context

   `execution_outcome` nodes have historically recorded task-execution results
   (success/failure of an agent completing an issue), consumed by
   `effectiveness/scorer.ts` to compute per-(persona, system) effectiveness.
   outcome-eval is a new producer of `execution_outcome` nodes: it records a
   spec-satisfaction _judgment_, not a task execution. The effectiveness loop now
   depends on verdicts compounding into baselines, and dropped verdicts cannot be
   backfilled.

   ## Decision

   Every `OutcomeEvaluator.evaluate()` persists exactly one `execution_outcome`
   node via the existing `ExecutionOutcomeConnector`, tagged with
   `metadata.source: 'outcome-eval'` plus the full 3-valued verdict
   (`verdict / confidence / judgedAgainst`). The node id carries a `randomUUID()`
   so concurrent evaluations never collide under upsert-by-id. In v1 the node
   OMITS `agentPersona` and writes `affectedSystemNodeIds: []`, which makes it
   **scorer-non-counting** — the scorer's `gatherOutcomes` skips nodes missing
   `agentPersona` or `outcome_of` edges. The verdict is therefore durable for
   future analytics while not yet feeding persona effectiveness.

   The connector strips a reserved-key allowlist from caller metadata before merge
   so caller-supplied keys can never shadow core/scorer-read fields.

   ## Consequences

   **Positive:** the highest-value compounding signal (did the spec get met?) is
   durable from v1; no backfill debt.

   **Negative:** the `INCONCLUSIVE -> result: 'failure'` mapping is a latent hazard.
   It is harmless ONLY because the node is currently scorer-non-counting. Any future
   change that attaches persona/affected-system attribution MUST first change
   INCONCLUSIVE modeling (do not persist INCONCLUSIVE, or use a distinct result
   value the scorer excludes) before turning attribution on.

   **Neutral:** outcome-eval and task-execution share the `execution_outcome` node
   type, disambiguated by `metadata.source`.

   ## Related

   - [`docs/changes/outcome-eval/proposal.md`](../../changes/outcome-eval/proposal.md) Decision 4
   - ADR 0011: tiered confidence-to-authority
   - `packages/intelligence/src/outcome/connector.ts`, `effectiveness/scorer.ts`
   ```

2. Run: `harness validate`
3. Commit: `docs(adr): 0012 execution_outcome provenance from a judgment skill`

---

### Task 10: Verify and commit SKILLS.md

**Depends on:** none | **Files:** `docs/changes/outcome-eval/SKILLS.md` | **Category:** integration

1. Confirm `docs/changes/outcome-eval/SKILLS.md` exists (written by `harness advise-skills --spec-path docs/changes/outcome-eval/proposal.md` during planning). If absent or stale, re-run that command.
2. Run: `harness validate`
3. Commit: `docs(outcome-eval): add skill-advisor SKILLS.md`

---

### Task 11: Document the INCONCLUSIVE / openai-strict / CI-template limitations in the spec

**Depends on:** Task 4 | **Files:** `docs/changes/outcome-eval/proposal.md` | **Category:** integration

1. In `docs/changes/outcome-eval/proposal.md`, append to the `### Non-goals (YAGNI)` block (or add a short `### Known limitations (v1)` subsection under Non-goals) three explicit notes:
   - **INCONCLUSIVE persistence:** persisted node maps `INCONCLUSIVE -> 'failure'`; harmless in v1 because the node omits `agentPersona`/affected-system edges and is scorer-non-counting. Any future persona attribution MUST first change INCONCLUSIVE modeling (no-persist or distinct excluded result value). (PRE-P5-INCONCLUSIVE.)
   - **openai-compatible strict mode:** `zodToJsonSchema` does not emit `additionalProperties: false`; v1 supported provider path is claude-cli/anthropic. Follow-up if outcome-eval is wired through the openai-compatible strict path.
   - **CI required-check wiring:** deferred to roadmap #540.
2. Run: `harness validate`
3. Commit: `docs(outcome-eval): record v1 known limitations (inconclusive, openai-strict, ci-template)`

---

### Task 12: Final validation and soundness sweep

**Depends on:** Tasks 1-11 | **Files:** none (verification)

1. Run: `harness validate` — confirm pass (design-token test-fixture warnings and pre-existing drift/llm circular deps are unrelated; the touched files must introduce no new failures).
2. Verify SC8: grep both orchestrator docs for `6.5` and confirm the step text + Rules note are present and read cleanly between Code Review and Ship.
3. Verify the slash-command artifact for outcome-eval exists under `.claude-plugin/commands/`.
4. Verify ADRs 0011 and 0012 exist with valid front-matter.
5. Run: `harness check-deps` — confirm no NEW circular dependency introduced (the 2 pre-existing cli cycles are unrelated).
6. No commit (verification only); if any gap is found, return to the owning task.
