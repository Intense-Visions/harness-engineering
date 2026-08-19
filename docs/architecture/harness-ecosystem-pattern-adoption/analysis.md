# Harness-Engineering Ecosystem — Comparative Pattern Analysis

**Date:** 2026-08-19
**Mode:** architecture-advisor (advisory; no implementation)
**Question:** Do the community harness-engineering projects encode patterns we should adopt? Where are we better, worse, or equal?

## Scope

Five community projects, plus the field's canonical references, assessed against our
current harness platform. All five repositories were verified to exist (WebFetch, 2026-08-19).

| Project                                     | What it is                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `QoderAI/better-harness`                    | Platform that evaluates the _agent work loop_ (not just diffs) across 5 dimensions; evidence-bounded reporting; multi-host       |
| `walkinglabs/awesome-harness-engineering`   | Curated ecosystem catalog (foundations, context, guardrails, specs, evals, benchmarks, runtimes)                                 |
| `walkinglabs/learn-harness-engineering`     | Project-based tutorial curriculum                                                                                                |
| `10xChengTu/harness-engineering`            | Agent skill scaffolding "the OS for AI agents" — 9 reference modules; installable across 40+ agents                              |
| `jrenaldi79/harness-engineering`            | Claude Code plugin: two-tier CLAUDE.md, path-scoped `.claude/rules/`, git-hook enforcement, `/readiness` 8-pillar maturity score |
| `lipingtababa/harness-engineering-playbook` | Team playbook: closed-loop engineering, autonomous scaling, org redesign                                                         |

**Field standard** (calibration): OpenAI coined "harness engineering"; Addy Osmani's
_Agent Harness Engineering_ and the AGENTS.md open standard (Aug 2025) anchor the
consensus. Core tenets: **Agent = Model + Harness**; "a decent model with a great harness
beats a great model with a bad harness"; the single most important habit is **treating
every agent mistake as a permanent signal and ratcheting a constraint so it never repeats**.

## Headline finding

On the **mechanical-enforcement floor we lead the ecosystem, often by a wide margin.**
The genuinely adoptable patterns are all about the **on-ramp** and the **feedback loop**,
not the enforcement mechanism itself. The field is almost entirely floor-focused
(guardrails, don't-break); our craft-skill layer (ceiling-raising) is an axis the field
does not have at all.

## Scorecard

| Dimension                          | Field's pattern                                                    | Our state (evidence)                                                                                                                                                              | Verdict                               |
| ---------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| AGENTS.md instruction file         | Hand-author a short repo guide (Osmani: ≤60 lines)                 | We **validate + auto-generate + link-check** it (`validateAgentsMap`/`generateAgentsMap`, `packages/core/README.md:125`) and meter it in the token budget                         | **Better**                            |
| Mechanical enforcement             | git pre-commit lint, secret scan, file-size, block force-push      | Fail-closed arch gate, security ledger baselines, coverage ratchet, link-based doc coverage, reference-docs freshness, `block-no-verify`                                          | **Better**                            |
| Context governance                 | "Context as budget," tool masking                                  | Live `contextBudget()` allocator + exact token counts (`count_tokens`) + `always-loaded / path-scoped / invoked-only` attribution (`packages/core/src/context/attribution.ts:30`) | **Better**                            |
| Blocking quality gates             | Trajectory critics, internal checks                                | `acceptance_eval` + `outcome_eval` with **authority derived in TypeScript, not the LLM**                                                                                          | **Better**                            |
| Ceiling-raising                    | _Absent from the field_                                            | 11 craft skills (`code-craft`, `spec-craft`, `craft-fleet`, …)                                                                                                                    | **Better**                            |
| Multi-agent orchestration          | Orkas, Squadron, approval gates                                    | Fleet family: worktree isolation, independent artifact verification, global leaf-slot budget, one human confirm                                                                   | **Better**                            |
| Maturity scoring                   | `/readiness`, 8 pillars, 1–5                                       | `audit-strength` (0–100 + tier + 7 STRENGTH patterns)                                                                                                                             | **Equal/Better**                      |
| Evidence-bounded reporting         | "Unobserved stays explicit"                                        | `[UNVERIFIED]` convention + black-box flight recorder                                                                                                                             | **Equal**                             |
| Tool-surface discipline            | "10 tools beat 50"                                                 | **183 tool files**, mitigated by `--tier core\|standard\|full` + ToolSearch deferral                                                                                              | **At-risk, mitigated**                |
| **Rule→failure provenance**        | THE core habit: each rule traceable to the failure that birthed it | `compound` writes `docs/solutions/**`, but **no machine link** from an enforced gate/linter to its originating incident (grep: 0 hits)                                            | **Worse — real gap**                  |
| **Minimum-viable-harness on-ramp** | 5-item MVH; "start simple"                                         | `init-project` has an adoption ladder but front-loads a 10–20 min STRATEGY interview + framework + design-system before value lands; no formal minimal floor                      | **Worse — real gap**                  |
| Host breadth                       | 40+ agents                                                         | 4 platforms (deep, not broad)                                                                                                                                                     | **Worse on breadth, better on depth** |

## The three adoptable patterns

### A — Rule→failure provenance (close the compounding loop)

The field's #1 habit and our clearest miss. `compound` captures solutions; gates/linters
enforce rules; the two are not linked. Adopt a machine-readable back-link so each mechanical
rule cites the incident/solution that motivated it, and dead rules (no live failure class)
become detectable. → **ADR 0100**. Effort: Medium. Risk: Low. **Highest leverage.**

### B — Minimum-Viable-Harness init tier

The whole field preaches "start simple"; our `init-project` is heavy. Formalize a `minimal`
floor of the existing adoption ladder that lays exactly the 5-item MVH (repo guide, one
runnable check, one hard arch rule, one verification loop, one permission boundary) with
STRATEGY/design/framework deferred and a documented upgrade path. → **ADR 0101**.
Effort: Small–Medium. Risk: Low. **Best adoption ROI.**

### C — Trajectory→eval harvesting

The field turns agent traces into repeatable evals. We already _produce_ the raw material —
`FlightRecorder` writes per-run records to `.harness/black-box/run-*/` — but do not _harvest_
them into a growing regression eval suite feeding `acceptance_eval`/`outcome_eval`. → **ADR
0102**. Effort: Medium–Large. Risk: Medium. Strategically strong; recommended **deferred**
until the recorder trace format is stabilized.

### Explicitly NOT worth adopting

More hosts (depth is our moat), tool-count slashing (progressive disclosure already solves
the underlying problem), their maturity-scoring or evidence conventions (ours are richer).

## Recommendation

Pursue **A and B now** (both Low risk; A is the field's central practice we lack). Defer **C**.

## Sources

- Osmani, _Agent Harness Engineering_ — https://addyosmani.com/blog/agent-harness-engineering/
- Augment Code, _Harness Engineering for AI Coding Agents_ — https://www.augmentcode.com/guides/harness-engineering-ai-coding-agents
- `github.com/QoderAI/better-harness`, `walkinglabs/awesome-harness-engineering`,
  `10xChengTu/harness-engineering`, `jrenaldi79/harness-engineering`,
  `lipingtababa/harness-engineering-playbook` (verified 2026-08-19)
