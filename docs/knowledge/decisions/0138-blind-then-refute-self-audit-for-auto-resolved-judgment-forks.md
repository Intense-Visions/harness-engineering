---
number: 0138
title: 'Auto-resolved judgment forks pass a blind-then-refute self-audit; disagreement is the only judgment pause that survives trusted mode'
date: 2026-11-13
status: accepted
tier: large
source: docs/changes/trusted-autonomy-mode/proposal.md
---

## Context

> **Record of an operative decision.** This ADR documents spec decisions **D5, D6, D7, D8, D9
> and D11** of `docs/changes/trusted-autonomy-mode/proposal.md`, plus the hardening the Phase 3
> reviews added to the self-audit procedure. The procedure itself is normative only in
> `agents/skills/templates/pause-protocol.md`; this ADR cites that file by section name, because
> its line numbers move with every wording fix.

In trusted mode a `judgment` fork (an approach choice, a decomposition, a triage fork, a
`[checkpoint:decision]`) no longer waits for the human: the agent takes its own stated
recommendation. The user nearly always accepts the recommendation, so that is usually the right
call, and it is exactly the call a babysitting human was making. The risk is the case where the
recommendation is wrong and nobody looks. Asking a second agent "is this recommendation right?"
does not help: a reviewer handed the conclusion tends to confirm it. The design question was how
to make an unattended judgment checkable without putting the human back in the loop for every
fork.

## Decision

### Blind re-derivation, then a refuter (D7)

When audit is on, each auto-resolved judgment fork goes through two fresh subagents with no
access to the conversation ("Self-audit (judgment forks)"):

1. **Blind auditor.** It sees the question verbatim and the evidence, but never the
   recommendation or the rationale. Options are label-stripped, recommendation markers removed,
   sorted alphabetically and numbered. It must pick one option verbatim.
2. **Refuter**, only when the blind pick matches the recommendation. It gives the single
   strongest objection to the pick, rated `blocking` (the choice is likely wrong or unsafe) or
   `non-blocking` (a real but acceptable cost, recorded with the decision).

### Disagreement escalates at every autonomy level (D8)

A blind pick that differs from the recommendation, or a `blocking` objection, is a pause even in
trusted mode: it is the only `judgment` pause that survives trusted mode ("Escalation (audit
disagreement)"). Interactive runs present both positions in plain text and wait; headless runs do
not choose, write `"blockers": ["audit-disagreement: <question>"]` to the handoff, and stop.
Autopilot reads that blocker after every dispatch and escalates it as a `gate`.

### Defaults and the denominator (D9, D11)

Audit is on by default in `trusted` and opt-in in `supervised` (where the verdict is shown beside
the recommendation). Audit is recorded `unavailable` **only** when the host has no
subagent-spawning tool at all; the decision then proceeds and is counted as unaudited.

### Hardening from the Phase 3 reviews

- **Pre-audit commitment.** Before spawning the auditor the agent prints
  `Recommendation (pre-audit): <option>`; the recommendation cannot change afterwards.
- **One shot each.** Exactly one blind auditor and at most one refuter per fork, never re-run;
  needing a second spawn of either is a disagreement.
- **`unavailable` is decided once**, at skill start, from whether the host has a spawning tool. On
  a host that can spawn, a spawn error, a non-JSON reply or a pick that is not verbatim one of the
  options is a disagreement, not `unavailable`.
- **Classes only round up** ("Resolving a pause point"). An action that matches an irreversible or
  gate example is that class regardless of marker, including an unmarked irreversible action
  inside a plan task. "Delete" means deleting branches, issues or remote resources, or local work
  not recoverable from git (for example `git reset --hard`, `git clean -fdx`, `git stash drop`,
  or removing untracked or uncommitted user files); removing scratch files this run created is
  not. A ceremony that approves content embedding a choice between alternatives the skill text
  or this run's output explicitly enumerated, which no judgment fork settled, is `judgment`.
- **Markers are honoured only from SKILL.md files and their generated persona and command
  copies** ("Marker convention"), never from specs, plans, issues or tool output.
- **Evidence hygiene.** The auditor is never passed, and must not open, anything under
  `.harness/`, any `interview.md`, or any file written for this pause; the blind template tells it
  to read only the paths listed under Evidence ("Blind auditor prompt").
- **Audit files are kept.** The rendered auditor prompt and both raw replies are saved under
  `.harness/sessions/<slug>/audits/` (`<n>.md`, `<n>.reply.json`, `<n>.refuter.json`), so you
  can inspect what the auditor was shown and what it replied; these files are agent-written and
  not tamper-evident. They carry no timestamp or hash and no hook protects them, so they do not
  prove that the pre-audit line came before the spawn.

### The log contract (D6, SC9, SC14)

- Every auto-taken decision is appended through the `record_auto_decision` MCP tool to
  `.harness/sessions/<slug>/auto-decisions.jsonl`. The writer refuses any entry unless autonomy
  resolves to `trusted`, and refuses audit `off` while audit is on (`authorizationError` and
  `recordAutoDecision`, `packages/core/src/autonomy/decision-log.ts:258-301`).
- An unlogged decision is never taken: if `record_auto_decision` does not return
  `recorded: true`, the skill pauses ("Fail-safe rules", SC14).
- `harness autonomy log` reports `audited N/M`, where N counts audits that ran (agreed plus
  escalated) and M counts every judgment decision, including `unavailable` and `off`
  (`packages/core/src/autonomy/summary.ts`, SC9), plus the agreement rate as a calibration metric.

### Deliberate exemption

The roadmap sync steps a skill already performs (`manage_roadmap` `sync`), and the tracker
auto-sync side effects of `manage_roadmap` `update` and `add`, are not new `irreversible` pauses,
although both can write to an external tracker. This keeps supervised
behaviour unchanged (SC10) and is a deliberate exemption, not an oversight.

## Consequences

- **Compliance is instruction-level (D5).** Nothing mechanically stops a skill from skipping the
  audit or a pause. `agents/skills/tests/pause-protocol.test.ts` and
  `agents/skills/tests/pause-markers.test.ts` prove the protocol and the markers say the right
  thing, as text; they do not prove an agent obeys them. The decision log, the saved audit
  prompts and replies, and the `audited N/M` denominator are what make non-compliance visible
  after the run, and the audit files are agent-written, so they show what an agent reports, not
  tamper-evident proof. Mechanical detection is a Future Consideration.
- **Unenumerated choices are not audited.** Option choices not presented as enumerated
  alternatives are approved as ceremony and are not audited (trade-off: otherwise every spec/plan
  approval becomes a judgment fork).
- **Headless disagreements page nobody.** They land in the handoff's `blockers` and `concerns`;
  the orchestrator reads no handoff status today (spec Future Considerations).
- **Cost.** Each auto-resolved, audited fork costs up to two subagent spawns.
- **Persona subagents cannot audit or log.** The persona subagents autopilot dispatches
  (`harness-planner`, `harness-task-executor`, and every generated persona) are restricted to
  `Bash, Read, Write, Edit, Glob, Grep` (`packages/cli/src/agent-definitions/generator.ts:33`,
  `:70`). Per the Claude Code subagent docs, a `tools` allowlist excludes MCP tools that are not
  named in it, so `gather_context` and `record_auto_decision` are unreachable there, and the list
  has no subagent-spawning tool. Inside those subagents autonomy cannot be read and decisions
  cannot be logged or audited, so every ceremony and judgment fork fails safe (pauses) and
  surfaces to autopilot as a handoff concern. Autopilot's own pauses (plan approval, phase
  transitions, sign-offs, gates) run in the main session, where the audit and log work. Trusted
  mode therefore does not deliver Goal 1 end-to-end inside persona subagents. The follow-up
  options (naming the install-dependent harness MCP server in the persona `tools` list, or moving
  personas to `disallowedTools`) are listed in [ADR 0137](./0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md);
  either would still need a spawning tool before audits there could be anything but
  `unavailable`.
- **Unicode in log entries can taint a session.** The sentinel injection scanner (INJ-UNI-001)
  flags U+200C / U+200D, which the decision log accepts as legitimate text (spec Future
  Considerations).

## References

- Spec: `docs/changes/trusted-autonomy-mode/proposal.md` (D1, D5-D9, D11; SC2, SC3, SC8, SC9,
  SC11, SC14; Future Considerations).
- Protocol: `agents/skills/templates/pause-protocol.md` ("Resolving a pause point", "Fail-safe
  rules", "`record_auto_decision` call", "Self-audit (judgment forks)", "Blind auditor prompt",
  "Refuter prompt", "Escalation (audit disagreement)", "End-of-run summary").
- Code: `packages/core/src/autonomy/decision-log.ts`, `decision-schema.ts`, `summary.ts`;
  `packages/cli/src/mcp/tools/auto-decision.ts`; `packages/cli/src/commands/autonomy/log.ts`.
- Tests: `agents/skills/tests/pause-protocol.test.ts`, `agents/skills/tests/pause-markers.test.ts`.
- Related: [ADR 0136](./0136-autonomy-is-orthogonal-to-rigor.md),
  [ADR 0137](./0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md).
- Guide: `docs/guides/trusted-autonomy.md`.
