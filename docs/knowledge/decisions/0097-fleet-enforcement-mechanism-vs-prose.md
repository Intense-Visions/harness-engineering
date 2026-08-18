---
number: 0097
title: Fleet enforcement — mechanism versus prose
date: 2026-08-18
status: proposed
tier: medium
source: design routing of bug-backlog issue #1308
---

## Context

`fleet-command`'s global concurrency governor names exactly one enforcement seam:
every lane is dispatched with `--concurrency <allocated>`, and its `SKILL.md` states
this in the strongest terms — "a lane dispatched without an explicit `--concurrency`
is a **gate violation, not an omission**" (SKILL.md L156, L205, L247, L271), the
enforcement backbone of the tier's Iron Law (ADR 0091, decision property 1). The
problem surfaced by #1308 is that this seam does not exist in code.

Verified in source:

- **`harness skill run` does not execute a skill.** `createRunCommand`
  (`packages/cli/src/commands/skill/run.ts`) reads `SKILL.md`, prepends a context
  preamble, writes it to stdout, and exits. Its own `.description()` says so:
  "Run a skill (outputs SKILL.md content with context preamble)". No fan-out, no
  subagents, no governor.
- **Nothing parses the governor flags.** `skill run` declares only `--path`,
  `--complexity`, `--phase`, `--party`, `--autonomous`, and `--backend`. It does
  **not** parse `--slots`, `--concurrency`, `--report-only`, or `--dry-run`, and sets
  no `allowUnknownOption`, so passing any of them makes `skill run <fleet>` **reject
  the invocation** — there is no cheap, gate-free CLI path to probe a member's queue
  either.
- **Every fleet advertises those flags anyway.** Each fleet `skill.yaml` carries a
  `cli.args` block declaring `--concurrency` / `--report-only` / `--dry-run`
  (`fleet-command` adds `--slots`). This block is pure metadata consumed by nothing;
  `harness skill info --json` dumps the parsed schema, so the flags are advertised on
  the machine-readable surface while no code reads them. (Even the `run_skill` MCP
  path takes only `{ skill, path }`.)

So the governor's one seam is a sentence in a prompt. The "default of 2" a member
supposedly falls back to is likewise prose inside each member's `SKILL.md`, not a
parsed flag default. Downstream, VERIFY is already honest about this: ADR 0091
(property 5) and `fleet-command` SKILL.md L203 refuse to claim a verified
within-allocation check, because "no artifact records a lane's peak concurrency" —
they report it as a dispatch-time-enforced _assumption_. DISPATCH's "gate violation"
language contradicts the very VERIFY step that declines to assert the gate held.

## Decision

Adopt a **truthfulness-first, mechanism-later** resolution.

**Near-term (do now): stop advertising enforcement that does not exist, and name what
actually bounds machine load.**

1. Drop the `--concurrency` / `--report-only` / `--dry-run` / `--slots` entries from
   the fleet `cli.args` blocks (or move them under a clearly-labelled
   "prompt-contract, not CLI-parsed" note), so `skill info` stops advertising flags no
   code consumes.
2. Rewrite the governor prose so it stops calling a missing `--concurrency` flag "the
   only enforcement seam" and stops framing its absence as a "gate violation." State
   plainly that the governor is a **prompt-level contract**: what actually bounds
   machine load is the **orchestrating agent's own subagent-spawn concurrency** — the
   dispatching model honoring "cap concurrent subagents at 2" when it fans out — not a
   flag any CLI or MCP entry point reads. This aligns DISPATCH with the honesty VERIFY
   already practices.

**Longer-term (decide separately): whether `skill run` should ever dispatch.** Making
`skill run` actually execute (and therefore parse the declared flags) is a real option,
but it is a large change to the CLI's contract and is not required to make the family
truthful. It is deferred to its own proposal; this ADR does not block on it.

The near-term fix is chosen because the standing harm is a _credibility_ defect: a
governor that reads as enforced but is advisory invites operators (and the conductor's
own lanes) to trust a bound that nothing holds. Honest prose costs nothing and removes
the contradiction immediately; wiring real dispatch can follow on its own timeline.

## Consequences

- **Positive:** `skill info` no longer advertises unconsumed flags; the governor's
  status (prompt contract, enforced by agent behavior) is stated once and honestly;
  DISPATCH and VERIFY stop contradicting each other. Operators reason about the _real_
  bound — subagent-spawn discipline — instead of a phantom flag.
- **Negative / tradeoffs:** the global budget remains a behavioral contract, not a
  mechanically-enforced cap, until (and unless) the longer-term work lands. Naming that
  honestly may read as a downgrade, but it only makes visible what was already true.
- **Reversibility:** high — every change here is prose and metadata. If `skill run`
  later dispatches for real, the `cli.args` blocks and the "seam" language can be
  restored with genuine backing, superseding this ADR.

## Alternatives Considered

- **(1) Make `skill run` actually dispatch, so the declared flags become real.**
  Rejected _for now_ — it is the principled end state and is kept as the deferred
  longer-term option, but it rewrites the CLI's execution contract and touches every
  member's invocation path. Too large to gate the truthfulness fix behind; sequenced
  after it.
- **(2) Drop the `cli.args` blocks so `skill info` stops advertising the flags.**
  Adopted as the _metadata half_ of the near-term fix. On its own it is insufficient:
  it silences the advertisement but leaves the SKILL.md prose still calling a missing
  flag the enforcement seam, so the DISPATCH/VERIFY contradiction survives.
- **(3) State plainly that the governor is a prompt-level contract and name what
  bounds machine load.** Adopted as the _prose half_. On its own it leaves `skill info`
  still advertising unparsed flags. The two halves are complementary, which is why the
  decision is the hybrid of (2) and (3) now, with (1) deferred.

## References

- Issue #1308 — `skill run` does not execute; fleet `cli.args` advertise unparsed
  `--slots` / `--concurrency` / `--report-only` / `--dry-run`; governor seam is prose.
- ADR 0091 — the conductor-tier authority model whose decision property 1 names
  `--concurrency` as the global budget's "only seam."
- The honest VERIFY behavior: ADR 0091 property 5 and `fleet-command` SKILL.md L203 —
  staying within allocation is a dispatch-time-enforced _assumption_, "not a verified
  check," because no artifact records peak concurrency.
- Source of record: `packages/cli/src/commands/skill/run.ts` (prints, does not
  dispatch; parses none of the governor flags); `packages/cli/src/commands/skill/info.ts`
  (`--json` dumps the advertised `cli` block); fleet `skill.yaml` `cli.args` blocks.
