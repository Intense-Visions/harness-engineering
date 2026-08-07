# Skill-Proposal Loop (Operator Guide)

## Overview

The skill-proposal loop is how the skill catalog grows from real usage: agents
(and, optionally, automated retrospection) capture candidate skills — either a
brand-new skill or a refinement of an existing one — which queue in
`.harness/proposals/`, pass a mechanical soundness gate at approval time, and are
promoted by a human reviewer. Every skill records its origin via
`provenance: community | agent-proposed | user-authored`.

The loop is **opt-in and dormant by default**. Nothing emits proposals on your
behalf until you either run agents that call the capture tool or explicitly enable
session-terminus retrospection with an analysis provider. This guide explains both
emission surfaces, the exact gating, how to turn retrospection on locally, and the
review → gate → promotion flow. For the canonical rationale (soundness-gated,
human-gated, provenance-tracked promotion), see
[ADR 0016](../knowledge/decisions/0016-skill-proposal-workflow.md).

## Current default state: dormant / opt-in

Out of the box, both emission surfaces are inert:

- The manual capture tool is always **available** but only fires when an agent
  chooses to call it.
- Automated retrospection is **off** unless you set an env flag *and* provide an
  analysis provider (see [Gating](#gating-for-retrospection)).

This is deliberate — the loop never fabricates proposals or runs an LLM without
your say-so. Check the live posture at any time:

```
harness proposals status
```

`status` is provider-independent and never mutates the queue. It reports queue
counts by status and, per surface, whether that surface is live or dormant and
*why* (which precondition is missing). Add `--json` for machine-readable output.

## The two emission surfaces

### 1. Manual capture — `emit_skill_proposal` (agent-driven)

The `emit_skill_proposal` MCP tool is the always-available capture surface. An
agent calls it explicitly — typically at the end of a non-trivial task — to record
a candidate skill (new or a refinement of an existing one). Nothing calls it
automatically; it is a surface an agent *chooses* to use, not a background loop.
Emitting a proposal writes a record into `.harness/proposals/`; it does **not**
promote anything. Promotion is a separate, human-gated step.

### 2. Automated retrospection (session-terminus)

The only automated emitter runs at session archive. When a session is archived,
retrospection can analyze the session and emit candidate skills automatically. It
is gated behind two preconditions that **both** must hold (see below); if either
is missing, archive proceeds normally and no proposal is emitted.

## Gating for retrospection

Automated retrospection emits only when **both** of these are true:

1. **Env flag `HARNESS_SESSION_RETROSPECTION` is truthy.** The accepted truthy
   values are `1`, `true`, `yes`, or `on` (case-insensitive). Any other value — or
   the flag being unset — leaves retrospection off.
2. **An analysis provider is resolvable.** A provider is resolved from, in order
   of precedence:
   - `ANTHROPIC_API_KEY` (cloud provider), or
   - `HARNESS_ANALYSIS_BASE_URL` (a local OpenAI-compatible `/v1` endpoint).

   If neither is set, no provider resolves and retrospection stays dormant even
   with the flag on.

`harness proposals status` reports each precondition independently
(`envFlagSet`, `providerResolvable`) and names the missing one in `dormantReason`,
so you can tell "off by design" from "misconfigured" at a glance.

## Activating retrospection locally

To turn retrospection on for local runs, set the flag and provide a provider in
your environment before archiving sessions:

```
# Cloud provider
export HARNESS_SESSION_RETROSPECTION=1
export ANTHROPIC_API_KEY=sk-...

# — or — local OpenAI-compatible endpoint
export HARNESS_SESSION_RETROSPECTION=on
export HARNESS_ANALYSIS_BASE_URL=http://localhost:11434/v1
```

Confirm the loop reports live before relying on it:

```
harness proposals status
# retrospection.enabled = true, no dormantReason
```

Leave these unset (the default) to keep retrospection dormant. Activation is a
local/opt-in choice and is not enabled by default in any environment.

## How agents emit via `emit_skill_proposal`

An agent emits a candidate by calling the `emit_skill_proposal` MCP tool at the
end of a task, describing the proposed skill (or the refinement to an existing
one). The call appends a proposal record to `.harness/proposals/`. It performs no
promotion and runs no soundness gate — those happen later, at review time. If your
agents never call it, this surface stays silent no matter what else is configured.

## Review → soundness gate → promotion flow

Captured proposals are triaged and promoted through the CLI (or the dashboard),
never automatically:

1. **List** the queue: `harness proposals list`
2. **Inspect** a proposal: `harness proposals show <id>`
3. **Check loop posture** at any time: `harness proposals status`
4. **Approve** a proposal: `harness proposals approve <id>` — the mechanical
   soundness gate runs **at approval time** (not at emit time). A proposal that
   fails the gate is not promoted.
5. **Reject** a proposal: `harness proposals reject <id>`

A dashboard review queue mirrors the CLI at `/s/proposals` for interactive triage.

## Related reading

- [ADR 0016 — Skill proposal / refinement workflow](../knowledge/decisions/0016-skill-proposal-workflow.md)
