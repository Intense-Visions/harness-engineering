---
number: 0072
title: Autonomous local decisions (the headless agent is the decider at full rigor, with a PR-flag safety valve)
date: 2026-07-15
status: accepted
tier: integration
source: docs/changes/local-backend-full-workflow/proposal.md
---

## Context

ADR 0071 (Phase 5) made the local dispatch template a thin **indirection shim**:
the local (`pi`) agent obtains the REAL workflow skills over bash via
`harness skill run <name>`, instead of following a paraphrase. But the real
skills were written for an interactive Claude session with a human present. At
their most rigorous — `harness-brainstorming` above all — they compute a
confidence-rated recommendation at every fork and then **STOP and wait for the
human** to choose (design forks, `emit_interaction`/`AskUserQuestion` prompts,
Phase-4 spec sign-off, the next-skill handoff). Two spots are especially
emphatic about human judgment: **strategy contradictions** ("never auto-resolve")
and **any low-confidence fork**.

A local dispatch is **headless** — there is no human in the session to answer
those prompts. Run verbatim, the skills would deadlock at the first fork. The
question this ADR settles is **how a headless agent runs the full-rigor skills to
completion without a mid-run human**, while still surfacing the decisions a human
would have wanted to see.

Two facts shaped the decision:

1. The value of brainstorming/planning is the **exercise** — the ≥2-approaches
   gate, YAGNI, the persona council, the soundness review. That rigor is
   independent of _who_ makes the final call at each fork.
2. The existing merge gate — the human's **PR review** — is already the
   checkpoint where a human inspects the work. Decisions surfaced there are seen
   by a human at exactly the right moment, without a mid-run pause.

## Decision

**On the local/headless path, the agent is the DECIDER at full rigor (D8), with
one PR-flag safety valve and no mid-run human pause (D9).**

- A new `harness skill run <name> --autonomous` flag prepends an
  **autonomous-decider preamble** (a `buildPreamble` section, so it leads the
  output and re-anchors on _every_ stage's rendering — robust against a small
  local model forgetting a once-read template). The preamble flips exactly one
  instruction: wherever the skill says to present options + a recommendation and
  then STOP for the human, the agent instead does the full analysis exactly as
  written — every gate still runs — then **adopts its own recommendation, records
  the question + chosen answer + rationale in the spec's "Decisions made"
  section, and continues.** It self-approves the Phase-4 sign-off once the
  soundness review converges and proceeds through the handoff. Autonomy narrows
  the _decider_, never the _rigor_.
- **One safety valve, surfaced not buried (D9).** The two spots the skill is most
  emphatic about — **strategy contradictions** and **any low-confidence fork** —
  are still decided by the agent and still proceed, but are additionally recorded
  under an **"## Autonomous decisions requiring review"** heading in the spec
  (question, the agent's call, confidence, why). The orchestrator surfaces those
  flags in the PR body, so the human's PR review sees exactly what was decided and
  where confidence was low.
- **Halt-not-ship still governs _code_; the flags govern _decisions_.** The
  enforced gates (ADR 0070 — verify + outcome-eval) remain the mechanism that
  stops bad _code_ from shipping. The autonomous flags are orthogonal: they make
  the agent's _judgment calls_ auditable at the PR, they do not gate the build.

The shim (ADR 0071) invokes every workflow skill as
`harness skill run <name> --autonomous`, so the whole local workflow runs headless
by construction.

## Rejected alternatives

- **Pause and escalate to a human at every fork.** Rejected: it defeats the point
  of an autonomous local dispatch (unattended execution advancing the
  Agent-Autonomy KPI) and, headless, would simply deadlock. The human checkpoint
  belongs at the PR, not mid-run.
- **Skip the low-value stages (don't brainstorm/plan on the local path).**
  Rejected: the rigor is the value, and a small model benefits _more_ from being
  walked through ≥2 approaches + YAGNI + soundness, not less. Autonomy removes the
  human decider, not the exercise.
- **Auto-resolve silently (decide, but don't record).** Rejected: it would hide
  exactly the low-confidence and strategy-contradiction calls a human most wants
  to review. The safety valve exists to make those calls _visible_ at the PR.
- **A separate autonomous variant of each skill.** Rejected as duplication (the
  ADR-0071 anti-pattern): a single `--autonomous` preamble that overlays the one
  changed instruction keeps one source of truth for the methodology.

## Consequences

- The local workflow runs end-to-end headless while preserving full brainstorm /
  plan / verify rigor — the agent decides, the spec records every decision.
- Low-confidence and strategy-contradiction forks become **auditable at the PR**
  via the "Autonomous decisions requiring review" flags, so a human sees the
  weakest calls without a mid-run interruption.
- Because the preamble is a `buildPreamble` section (not a one-shot header), it
  re-anchors on every `harness skill run` invocation across the workflow — a
  small model cannot "forget" it after the first stage.
- The flag is **opt-in and inert by default**: absent `--autonomous`, skill-run
  output is byte-identical to today, so the interactive Claude path is unchanged
  (SC7).
- Roadmap triage upstream (a separate layer) decides local-eligibility and
  pre-resolves trivial forks; brainstorming here still runs full rigor. The two
  layers compose — triage picks _what_ runs locally, `--autonomous` governs _how_
  the agent decides once it does.

See `buildPreamble` (the autonomous section) in
`packages/cli/src/commands/skill/preamble.ts` and the `--autonomous` flag in
`packages/cli/src/commands/skill/run.ts`; the shim that invokes it at
`harness.orchestrator.local.md`. Related: ADR 0070 (harness-enforced local
gates — halt-not-ship for code), ADR 0071 (the indirection shim that delivers the
real skills), and the proposal at
`docs/changes/local-backend-full-workflow/proposal.md`.
