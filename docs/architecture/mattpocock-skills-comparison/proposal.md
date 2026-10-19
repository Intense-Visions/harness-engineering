# Proposal: Adopting mattpocock/skills Techniques into Harness

**Date:** 2026-10-13
**Skill:** harness-architecture-advisor (Phase 3 PROPOSE)
**Inputs:** `discovery.md`, `analysis.md` (this directory)

> **Every claim about mattpocock/skills below is [UNVERIFIED]** and inherits the caveat stated at the top of `analysis.md`: this environment has no network access, so the external snapshot cannot be re-checked. Harness-side figures were re-measured at `91f09fd17` and carry the methods published in `analysis.md`.
>
> **This proposal recommends; it does not decide.** ADR-0133 records the recommendation at `status: proposed`, awaiting human sign-off.

## Verdict: which is stronger?

**Harness is stronger as a system; mattpocock/skills is stronger as a _skill-authoring practice_.**

Harness wins every dimension that needs a runtime: enforcement, state, verification, graph, orchestration, review depth, telemetry. mattpocock/skills has no runtime by design, so it can't compete there.

mattpocock/skills wins on how the skill text itself is written and governed:

- **Context load:** its always-loaded description text is about 11x smaller (24.6k harness chars measured, against a reported 2,299 — one unverified term).
- **Triggers:** its descriptions say when to reach for a skill. Harness's descriptions summarize what the skill can do.
- **Body length and tone:** its bodies are about 3-5x shorter and about 1.5x less negation-dense (harness 4.2% measured, mattpocock a reported 2.8%).
- **Composition:** there is one canonical phrasing for calling another skill.
- **Admission:** a new skill is admitted only for an observed failure that existing skills can't compose.
- **Rejected ideas:** they are written down, so they don't get re-proposed. (Harness already has this gap filed as #1620, the rejection ledger — it is unbuilt, not unrecognised.)

There's an irony here. mattpocock/skills enforces all of this through prose and maintainer discipline. Harness's mission is to turn that kind of discipline into constraints-as-code. **The biggest win is to adopt these techniques mechanically. A harness version should be stricter than the original, not a copy of its prose.**

One finding cuts against harness's own past decisions. ADR-001 from the agent-skills comparison (2026-04) made `Rationalizations to Reject` and the Red Flags framing mandatory. mattpocock argues that prohibitions make the forbidden behavior _more_ available. Neither side has evidence. That's an argument for building a way to measure it, not for flipping the rule on intuition.

## Options

### Option A: Mechanize the authoring discipline (catalog-level)

**Summary:** Turn mattpocock's authoring principles into harness constraints that apply across the whole catalog. This covers invocation policy, description budgets, body-content lint, governance records, and a skill-behavior eval harness.

**How it works:**

1. Add an `invocation: user | model` field to `skill.yaml`. The Claude Code renderer emits `disable-model-invocation: true` for user-invoked skills, and the matching policy fields for the other hosts.
2. Add a validator rule that requires trigger phrasing on model-invoked descriptions and enforces a character budget. It also reports the total always-loaded cost as a ratcheted baseline.
3. Extend `harness skill validate` with ratcheted content lint. It covers body length per tier, negation density, the canonical call phrasing for other skills, and the disclosure ratio (how much of a skill sits in sibling files that load only when needed).
4. Extend the already-filed rejection ledger (#1620) with the concrete record form and the check sites: committed, human-facing rejected-idea records that ideation, triage, `issue-fleet` and `emit_skill_proposal` consult before re-proposing an idea. Add, as the genuinely new piece, a skill-admission rule: a new skill is admitted only for an observed failure that existing skills cannot compose.
5. Build a skill-behavior eval harness covering trigger accuracy (does the right skill fire for a prompt?) and outcome on fixture tasks. It also settles the question of whether prohibitions or positive phrasing work better.

**Pros:**

- **Fits the strategy.** It is the constraints-as-code thesis applied to harness itself, and it directly grows the Harness Coverage KPI.
- **Compounds.** Every future skill inherits the discipline without reviewer attention.
- **Lower cost per turn.** It reduces per-turn context cost for every adopter session. That serves External Adoption and Multi-client portability.

**Cons:**

- **Upfront remediation (Medium).** It means rewriting 89 command descriptions plus tier-1/2 body baselines. Ratcheting means existing violations become a baseline, not a blocker.
- **Lint rules can be gamed or tuned wrong (Medium).** For example, a negation-density threshold with no evidence behind it. Mitigation: ship it as report-only until the eval harness supplies evidence.
- **The eval harness is the largest single item (High effort).** Mitigation: it can follow the cheap items.

**Effort:** Large overall. Items 1-4 are Small-Medium each and item 5 is Large.
**Risk:** Medium. Mis-tuned thresholds are the main risk, and report-only mode mitigates it.
**Best when:** you want the adoption to compound and to show off the harness thesis.

### Option B: Transplant per-skill techniques (skill-level)

**Summary:** Port the five individual techniques that have no harness counterpart into the existing tier-1/2 skills. The catalog shape stays as it is.

**How it works:**

1. **`harness-debugging`:** promote reproduction from a step to a gate. A red-capable, deterministic, agent-runnable command is recorded as an artifact before HYPOTHESIZE, along with a ranked list of loop types and a HITL script template.
2. **`harness-tdd`:** add seam negotiation. List the seams under test, each with "what it catches and what it misses", and confirm them before RED.
3. **`harness-planning`:** add vertical-slice/tracer-bullet slicing, plus expand-contract sequencing for wide refactors.
4. **Project glossary:** add a durable `GLOSSARY.md` or a graph-backed ubiquitous language. Brainstorming and planning read it, and a craft/knowledge skill maintains it.
5. **Deep-module vocabulary:** add module, interface, depth, seam, adapter, locality as a shared reference used by architecture-advisor, refactoring and code-craft.

**Pros:**

- **Direct quality gains** in the most-used workflow skills.
- **Low risk and independent.** Each item ships on its own.
- **No schema or tooling changes.**

**Cons:**

- **Adds content (Medium).** Each item makes already-long skills longer, which is the opposite of the main lesson. Mitigation: put the new material in sibling reference files that load only when needed.
- **Doesn't compound (Medium).** The next skill author gets none of it.

**Effort:** Small-Medium, with each item about a day to a few days through the pipeline.
**Risk:** Low.
**Best when:** you want visible workflow improvements quickly and are content to leave catalog hygiene for later.

### Option C: Sequenced hybrid (A's cheap mechanics + B's top three, eval later)

**Summary:** Ship the cheap, high-leverage mechanical items from A first, pair them with the three strongest transplants from B, and run the eval harness as its own later initiative.

**How it works:**

1. **Wave 1, mechanical and cheap:**
   - the invocation split (A1)
   - description trigger phrasing plus the context-cost budget (A2)
   - canonical call phrasing and the report-only body lint (A3)
   - the skill-admission rule, with the rejected-idea record form folded into #1620 (A4)
2. **Wave 1, transplants:**
   - the reproduction-command gate in debugging (B1)
   - seams in TDD (B2)
   - vertical slices in planning (B3)

   All three are written as sibling reference files, so they don't add body length.

3. **Wave 2:** the project glossary (B4) and deep-module vocabulary (B5).
4. **Wave 3:** the skill-behavior eval harness (A5). Once it has evidence, it decides whether to keep or remove the mandatory Rationalizations/Red-Flags framing and the negation-density threshold.

**Pros:**

- **Early and late payoff.** The cheapest high-leverage items land first, and the expensive measurement work gets its own spec and scope.
- **Pre-mitigated growth.** Transplants come in through the new disclosure discipline, so they don't add to body length.
- **ADR-001 tension handled with evidence.** The question is answered by measurement, not intuition.

**Cons:**

- **Coordination (Low).** Ten roadmap items need sequencing — seven in wave 1, two in wave 2, one in wave 3. Mitigation: wave labels plus `dependsOn` edges.
- **Lint stays advisory (Low-Medium).** The body lint is advisory until wave 3, which postpones the hard enforcement benefit.

**Effort:** Medium for waves 1-2 and Large for wave 3.
**Risk:** Low-Medium.
**Best when:** you want both visible improvements and compounding, without betting on unmeasured thresholds.

## Comparison matrix

| Criterion        | A: Mechanize catalog  | B: Transplant techniques | C: Sequenced hybrid |
| ---------------- | --------------------- | ------------------------ | ------------------- |
| Complexity       | High                  | Low                      | Medium              |
| Per-turn context | Large reduction       | Slight increase          | Large reduction     |
| Maintainability  | High (compounds)      | Medium                   | High                |
| Effort to build  | Large                 | Small-Medium             | Medium → Large      |
| Effort to change | Low (config/baseline) | Low                      | Low                 |
| Risk             | Medium                | Low                      | Low-Medium          |
| Fits strategy    | Strong                | Partial                  | Strong              |

## Recommendation

I'd lean toward **Option C**. Your success criterion is a few adopted techniques, each shipped and measurably better, without sprawl. C reaches that fastest:

- Wave 1 delivers a measurable drop in always-loaded context and three sharper workflow skills within weeks.
- The eval harness gets proper scope instead of blocking everything else.

If the eval harness matters most to you, as the long-term way to settle every future "should we adopt X's technique" question, then **Option A** is stronger. In that case pull A5 forward, because every other adoption decision, this one included, currently runs on judgment.

## Candidate roadmap items (filed only after you choose)

Each will be filed as a detailed roadmap item and built spec-first through brainstorming. The frontier-interview item is already filed, so it's excluded.

| #   | Item                                                                                          | Option | Wave (C) | Track                      |
| --- | --------------------------------------------------------------------------------------------- | ------ | -------- | -------------------------- |
| 1   | User-vs-model invocation split for skills and commands                                        | A1     | 1        | Multi-client portability   |
| 2   | Trigger-phrased descriptions + always-loaded context-cost budget                              | A2     | 1        | Multi-client portability   |
| 3   | Skill-content lint: canonical call phrasing, size/negation/disclosure report                  | A3     | 1        | Compounding feedback loops |
| 4   | Skill-admission rule: observed failure plus non-composability (record form folded into #1620) | A4     | 1        | Compounding feedback loops |
| 5   | Reproduction-command gate in harness-debugging                                                | B1     | 1        | Ceiling-raising            |
| 6   | Seam negotiation in harness-tdd                                                               | B2     | 1        | Ceiling-raising            |
| 7   | Vertical-slice / tracer-bullet slicing in harness-planning                                    | B3     | 1        | Ceiling-raising            |
| 8   | Durable project glossary (ubiquitous language) read by pipeline skills                        | B4     | 2        | Upstream grounding         |
| 9   | Deep-module vocabulary as shared architecture reference                                       | B5     | 2        | Ceiling-raising            |
| 10  | Skill-behavior eval harness (trigger accuracy + outcome); settle negation question            | A5     | 3        | Compounding feedback loops |
