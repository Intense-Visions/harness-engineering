---
number: 0110
title: skill run execution versus a separate dispatcher entrypoint
date: 2026-08-30
status: accepted
tier: large
source: 'decision-blocked issue #1308'
---

## Context

ADR 0097 fixed the near-term _credibility_ defect surfaced by #1308 — a fleet
governor that read as mechanically enforced but was pure prose — by making the
prose honest: drop the unconsumed `cli.args`, and state plainly that the global
concurrency budget is a prompt-level contract honored by the dispatching agent's
own subagent-spawn discipline. It **explicitly deferred** the deeper question to
"its own proposal": _should `harness skill run` ever dispatch?_ This ADR is that
deferred decision.

The situation on the ground:

- **`harness skill run` is print-only by contract.** `runSkill`
  (`packages/cli/src/commands/skill/run.ts`) reads `SKILL.md`, prepends a context
  preamble, writes it to stdout, and `process.exit`s. Its `.description()` is
  literally "Run a skill (outputs SKILL.md content with context preamble)". It
  parses `--path`, `--complexity`, `--phase`, `--party`, `--autonomous`, and
  `--backend` — all of which shape the _emitted text_, none of which fan out work.
  This is the path agents rely on to obtain a skill's instructions.
- **The governor flags have no parser.** `skill run` never reads
  `--concurrency` / `--report-only` / `--dry-run` / `--slots`, and the MCP twin
  `run_skill` takes only `{ skill, path }`. After ADR 0097 the fleet `skill.yaml`
  `cli.args` no longer advertise them, so there is currently no CLI or MCP surface
  that actually consumes a governor flag.
- **A real dispatch namespace already exists.** `harness fleet`
  (`packages/cli/src/commands/fleet/index.ts`, issue #1600) is described in-code as
  "the concrete, enforceable callables the `-fleet` family / `fleet-command`
  DISPATCH contract invokes." It already carries `fleet budget-check`
  (`budget-check.ts`) — the spend-envelope consult a conductor calls before
  scheduling each lane — precisely so that DISPATCH contract prose in
  `docs/reference/fleet-family.md` is "enforceable code, not just prose."

So the question is not "print-only versus dispatch" in the abstract — it is
whether a real dispatcher, if built, should _overload the print-only `skill run`
contract_ or _extend the already-existing `harness fleet` dispatch namespace_.

### Assumptions made

This ADR was drafted autonomously in an `adr-fleet` DISPATCH lane. The following
default was taken without a live human fork:

- **Default taken:** keep `harness skill run` print-only and introduce the real
  dispatcher as a sibling `harness fleet run <member>` under the existing
  `harness fleet` namespace, rather than teaching `skill run` to execute. Rationale
  below (Decision). The competing option — overloading `skill run` — is preserved
  in Alternatives Considered.
- This ADR is `status: proposed`; it draws the boundary and does not authorize the
  implementation. Wiring `fleet run` to actually fan out is a follow-on build.

## Decision

**Keep `harness skill run` print-only. Grow the real dispatcher as
`harness fleet run <member>` inside the existing `harness fleet` namespace.**

`skill run`'s contract is "emit `SKILL.md` + context preamble." That single
responsibility is depended on by every agent that shells out to read a skill's
instructions, and by the MCP `run_skill` twin. Overloading the same verb to
_sometimes print and sometimes fan out a fleet of subagents_ would make the
command's behavior depend on which flags happen to be present — a mode switch on a
path whose callers assume text-out-and-exit. That is the largest possible blast
radius for the smallest possible naming convenience.

The `harness fleet` namespace is already the designated home for "concrete,
enforceable callables the DISPATCH contract invokes" (#1600), and already proves
the pattern with `fleet budget-check`. Adding `fleet run <member>` there:

- gives the fleet-command governor a **real mechanical seam** — `fleet run` can
  parse and honor `--concurrency` / `--report-only` / `--dry-run`, so "dispatch
  every lane with `--concurrency <allocated>`" becomes code, not a sentence in a
  prompt (the exact gap ADR 0097 left open);
- keeps the print path (`skill run`) **untouched and single-purpose**, so agents
  and `run_skill` are unaffected;
- **co-locates dispatch mechanism** — budget consult and lane fan-out under one
  namespace — instead of scattering it across an emit-text command.

When `fleet run` lands with a genuinely enforced `--concurrency`, the governor
prose ADR 0097 softened to "prompt-level contract" can be re-strengthened for the
lanes that route through it, superseding that half of ADR 0097 with real backing.

## Consequences

- **Positive:** the print/dispatch split stays clean; `skill run`'s contract and
  its many callers are untouched; the governor gains a real seam under a namespace
  purpose-built for enforceable dispatch callables; mechanism stays co-located with
  the already-shipped `fleet budget-check`.
- **Negative / tradeoffs:** two entrypoints now exist where an operator might
  expect one ("run a skill" vs. "run a fleet member"); the naming boundary must be
  taught. Until `fleet run` is actually built and wired, the governor remains the
  behavioral contract ADR 0097 described — this ADR authorizes the shape, not the
  wiring.
- **Neutral:** existing fleet `SKILL.md` invocation lines that say
  `harness skill run <member>` for their _print_ step remain correct; only the
  _dispatch_ step gains the new `fleet run` verb.
- **Reversibility:** medium. The namespace choice is cheap to add and cheap to
  alias later; the expensive, near-irreversible move would be overloading
  `skill run`, which this ADR specifically avoids.

## Alternatives Considered

- **(A) Overload `skill run` to dispatch when governor flags are present.**
  Rejected. It makes one verb mean two things depending on flags, on the exact path
  agents and `run_skill` rely on for text-out. Highest blast radius on the CLI's
  most-depended-on skill command for a marginal saving of one new verb. This is the
  "make the declared flags real by teaching `skill run` to execute" option #1308
  named and ADR 0097 deferred — it is the thing being decided _against_ here.
- **(B) Keep everything a prompt-level contract; build no dispatcher (status quo
  after ADR 0097).** Rejected as the end state, though it remains valid until
  `fleet run` is built. It leaves the governor permanently unenforceable and never
  closes the seam #1308 flagged; the whole point of this deferred proposal is to
  choose the mechanism's shape.
- **(C) A new top-level `harness dispatch`/`harness run-fleet` command outside the
  `fleet` namespace.** Rejected — it fragments dispatch mechanism away from the
  `harness fleet` namespace #1600 already established for exactly this purpose,
  duplicating the home that `fleet budget-check` already anchors.

## References

- Issue #1308 — `skill run` does not execute; fleet `cli.args` advertised unparsed
  `--slots` / `--concurrency` / `--report-only` / `--dry-run`; governor seam is
  prose. Option 1 ("make `skill run` actually dispatch") is the fork this ADR
  resolves.
- ADR 0097 — the near-term truthfulness-first fix that explicitly deferred "whether
  `skill run` should ever dispatch" to "its own proposal" (this ADR).
- ADR 0091 — conductor-tier authority model; names `--concurrency` as the global
  budget's "only seam," the seam this decision proposes to make real.
- `packages/cli/src/commands/skill/run.ts` — the print-only `runSkill`
  contract and its emit-text option set.
- `packages/cli/src/commands/fleet/index.ts` and `fleet/budget-check.ts`
  (issue #1600) — the existing `harness fleet` dispatch-callable namespace this ADR
  extends with `fleet run`.
- `docs/reference/fleet-family.md` — the DISPATCH contract the `fleet` callables
  make enforceable.
- Fleet `skill.yaml` `cli.args` (e.g. `agents/skills/claude-code/roadmap-fleet/skill.yaml`) —
  the flag metadata ADR 0097 reconciled with reality.
