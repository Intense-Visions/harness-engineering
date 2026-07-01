---
type: business_concept
domain: skills
tags: [sdlc, lifecycle, coverage, gaps, agentic-execution, roadmap, non-technical-access, strategy]
---

# SDLC Coverage & the Agentic Trajectory

A durable map of how the harness toolset covers the software development lifecycle,
where the genuine gaps are, how agentic execution reshapes the lifecycle, and where the
next unit of leverage lies. This is the reference behind the `Full-lifecycle reach` track
in `STRATEGY.md` and the roadmap items derived from it.

## The artifact chain

The harness lifecycle is a chain of artifacts, each of which is **executable grounding for
the next agent** — not paperwork for the next human:

```
strategy → BRD → [PRD — thin] → spec + ADR → plan → code → tests/verdict → review → knowledge → release → ops
```

Two clarifications that correct a common mental model:

- **`brainstorming` produces the proposal spec** and, as part of that, flags which
  decisions rise to an ADR. `architecture-advisor` is **not** an earlier stage — it is a
  specialist consulted mid-design when a tradeoff is genuinely hard.
- **The PRD slot is real but unfilled.** Product-level requirements (user stories,
  acceptance criteria, prioritization) are currently fused into the proposal and split
  across `STRATEGY.md` and the BRD.

## Coverage status by stage

Status reflects **enforcement**, not mere presence: solid = owned and enforced;
partial = present but advisory or fused; gap = no first-class skill.

| Stage                   | Artifact                  | Skill(s)                                                             | Status  |
| ----------------------- | ------------------------- | -------------------------------------------------------------------- | ------- |
| Strategy                | Strategy anchor           | strategy · ideate · pulse                                            | solid   |
| Inception               | BRD, gap list             | product-advisor                                                      | solid   |
| Product requirements    | PRD, user stories         | — (fused into proposal)                                              | partial |
| Design                  | Spec, ADRs                | brainstorming · architecture-advisor · soundness-review · spec-craft | solid   |
| Planning                | Work breakdown            | planning · roadmap-pilot                                             | solid   |
| Implementation          | Code                      | execution · tdd · autopilot · refactoring · debugging                | solid   |
| Testing / QA            | Tests, verdict            | tdd · test-advisor · acceptance-eval · outcome-eval · verification   | solid   |
| Review                  | Code review               | code-review · integrity · soundness-review                           | solid   |
| Integration / knowledge | Wiring, docs, post-mortem | integration · knowledge-pipeline · docs-pipeline · compound          | solid   |
| Deployment / CD         | Release                   | release-readiness · deployment (Tier-3 advisory)                     | partial |
| Operations              | Monitoring, incident      | maintenance-pipeline only                                            | gap     |
| UAT / sign-off          | User acceptance           | —                                                                    | gap     |
| Estimation              | Sizing                    | —                                                                    | gap     |
| Security (cross-cut)    | Threat model, scan        | security-scan · security-craft · supply-chain-audit                  | solid   |

## The gaps that matter

The literal gaps are estimation, UAT / user sign-off, and operations, with deployment and
the PRD middle only partial. Grouped by _why_ they matter:

1. **Human-facing edges (chase).** UAT and the PRD middle both sit where a non-engineer
   meets the pipeline. They coincide with where harness is weakest for non-technical
   users, so closing them does double duty.
2. **Enforcement upgrades (chase selectively).** Deployment only advises; operations has
   routine sweeps but no production-signal loop back into the graph. Harness's thesis is
   enforcement, and today the lifecycle stops enforcing the moment code ships.
3. **The one agents redefine (don't copy the old version).** Story-point estimation is a
   human coordination ritual. When an agent executes in minutes, the useful forecast is
   _confidence and blast radius_ — which the intelligence pipeline (CML complexity, PESL
   simulation) already computes. Build risk forecasting, not sizing.

## How agentic execution moves the board

Three shifts; harness is partway through all three:

1. **Documents become runtime.** A spec an agent executes against — and is graded against
   by `outcome-eval` — is load-bearing context, not documentation.
2. **Phases become a loop.** Constraints fire in real time (layer rules, entropy
   detectors, review agents), so drift is corrected mid-stream. The linear pipeline
   collapses into a tight author → execute → verify loop.
3. **Humans move to the ends.** The scarce human work becomes _authoring intent_
   (strategy, BRD, spec) and _adjudicating outcomes_ (approve, override, sign off);
   the middle is delegated.

The harness edge is not that it automates the SDLC — it is that it makes the substrate
**machine-checkable end to end**, which is what makes autonomy _safe_. Invest where that
compression is still leaky: the intent edge (requirements, for non-engineers) and the
outcome edge (UAT, ops signals feeding back).

### Autonomy already in place

- **L1 — Skill:** each skill runs its own phases end to end.
- **L2 — Autopilot:** chains plan → execute → verify → review, pausing only at human
  decision points.
- **L3 — Orchestrator:** long-running daemon polls trackers, routes issues to agents in
  isolated worktrees, escalates the risky ones (concern-gated).
- **L4 — Intelligence:** scores complexity, simulates before running, records outcomes to
  route better next time.

## Non-technical access

Execution skills (tdd, refactoring, code-review) should stay expert-facing — agents run
them. The barrier that hurts is at the **intent and adjudication edges**, exactly where
non-engineers belong and where harness is thinnest. `product-advisor` is the deliberate
first wedge: a guided interview (`configuration-interviewer` mode), business register, no
diff surface. That interaction pattern — guided interview, plain language, no code
surface — plus role-shaped lanes through the existing dashboard / router / chat is the
lever, not simpler CLIs.

## Recommendations (priority order)

1. **Product-requirements skill** (now) — closes the PRD middle and a non-technical intent
   edge; feeds `acceptance-eval`.
2. **UAT / sign-off loop** (now) — the mirror of `product-advisor` at the far end; closes
   the inception → acceptance circle; client-facing.
3. **Role-shaped dashboard front doors** (next) — PM/BA and client lanes through existing
   surfaces; author intent, watch agents, adjudicate — no terminal.
4. **Extend enforcement past ship** (next) — upgrade `deployment` from advisory to
   enforcing; add an operations skill pulling production signals into the graph.
5. **Risk forecasting, not estimation** (later) — surface CML/PESL scores as a
   confidence + blast-radius forecast.
6. **Make the artifact chain visibly one thing** (later) — trace a single engagement
   BRD → spec → plan → code → outcome in the dashboard so the "documents are runtime"
   thesis is legible to non-technical stakeholders.
