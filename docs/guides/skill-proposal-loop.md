# The skill-proposal loop

harness can capture candidate skills that agents discover mid-work, route them
through a mechanical soundness gate, and promote the survivors into the catalog
with provenance intact. This guide explains how that loop works, how it is
gated, and — importantly — its **current default state: opt-in and dormant**.

If `.harness/proposals/` is empty, the loop is not broken. It is waiting for one
of its two emission surfaces to be exercised. This guide shows you which surface
you want and how to turn it on.

## What the loop is

The loop is the self-improvement path for the skill catalog:

1. **Emit** — a candidate skill (new or a refinement of an existing one) is
   written to `.harness/proposals/<id>.json` with `status: open`. Emission is
   cheap and non-blocking; nothing is promoted at this point.
2. **Review** — a human triages the queue (`harness proposals list|show`, or the
   dashboard review queue at `/s/proposals`).
3. **Gate on approve** — approving a proposal runs the soundness-review gate
   synchronously. On pass, the skill is promoted into the catalog; on fail, the
   proposal stays queued with findings surfaced inline.
4. **Provenance** — every promoted skill records `provenance: agent-proposed`
   and an `originatingProposalId` back to the proposal, so operators can always
   answer "who/what authored this skill?"

The gate runs **only at approval time**, never at emit time. An empty queue is
therefore never the gate's doing — it means nothing has been emitted yet. See
[ADR 0016](../knowledge/decisions/0016-skill-proposal-workflow.md) for the full
rationale (Option C: queue on emit, gate on approve).

## The two emission surfaces

There are exactly two ways a proposal enters the queue, and each requires an
input that is absent by default.

### 1. Manual capture — `emit_skill_proposal`

An agent-driven MCP tool. An agent explicitly calls `emit_skill_proposal` (for
example, at the end of a non-trivial task) to capture a skill candidate. Nothing
invokes it automatically — it is a capture surface an agent _chooses_ to use,
not an always-on loop. This surface is always available; it needs no env flag
and no analysis provider.

### 2. Automatic retrospection at session archive

The only automated emitter. When a session is archived, harness can run a
retrospection pass over the session and emit skill candidates it infers. This is
the surface that makes the loop feel "live" without agents opting in per task —
but it is gated (see below) and off by default.

Retrospection runs from the session-archive lifecycle. Autopilot sessions reach
that lifecycle through the `archive_session` step; **manual, interactive
sessions** reach it through the opt-in `session-retrospect` Stop hook (registered
in the standard/strict hook profiles, gated behind the same
`HARNESS_SESSION_RETROSPECTION` flag, once-per-session and fail-soft). Enable the
hooks via `harness hooks init` — see the [hooks guide](hooks-system.md). Either
path composes with the same retrospection engine, so the gating below applies
uniformly.

## The exact gating for retrospection

Session-terminus retrospection fires **only when both** of the following hold:

1. **Env flag** — `HARNESS_SESSION_RETROSPECTION` is truthy. Truthy means the
   trimmed, lower-cased value is one of `1`, `true`, `yes`, or `on`. It is not
   set anywhere by default.
2. **An analysis provider is resolvable** — retrospection needs an LLM to reason
   over the session. A provider is resolvable when either of these env vars is
   set (checked in this precedence):
   - `ANTHROPIC_API_KEY` — cloud (Anthropic); **or**
   - `HARNESS_ANALYSIS_BASE_URL` — a local OpenAI-compatible `/v1` endpoint
     (optionally with `HARNESS_ANALYSIS_MODEL` / `HARNESS_ANALYSIS_API_KEY`).

If either precondition is missing, retrospection is **dormant** and no proposals
are emitted at session archive.

## Current default state: dormant / opt-in

Out of the box — and in the harness dogfood repo — retrospection is dormant:
the env flag is unset and no analysis provider is configured. This is
deliberate. Forcing retrospection on globally would change behavior everywhere
and would fail (or run empty) wherever no provider is available. Activation is
therefore opt-in and explicit.

You can confirm the live/dormant state at any time:

```bash
harness proposals status
harness proposals status --json
```

`status` reports the queue counts by status and, per emission surface, whether
it is live or dormant and — when dormant — exactly which precondition is
missing. It is provider-independent (it only reads env-var presence and counts
queue files), so it is safe to run in CI and offline; it never constructs a
provider and always exits 0.

## How to activate retrospection locally

Set both preconditions in the environment that runs your sessions, then archive
a session as usual.

Cloud provider:

```bash
export HARNESS_SESSION_RETROSPECTION=1
export ANTHROPIC_API_KEY=sk-...
harness proposals status   # retrospection should now report live
```

Local OpenAI-compatible provider (e.g. a local `/v1` endpoint):

```bash
export HARNESS_SESSION_RETROSPECTION=1
export HARNESS_ANALYSIS_BASE_URL=http://127.0.0.1:11434/v1
# optional: export HARNESS_ANALYSIS_MODEL=<model>
harness proposals status   # retrospection should now report live
```

With both set, the next session archive runs retrospection and any inferred
candidates land in `.harness/proposals/` as `open` proposals.

## How agents emit

For the manual surface, an agent calls the `emit_skill_proposal` MCP tool with
the candidate's kind (`new-skill` or `refinement`), the target skill (for
refinements), a justification, and the skill content. The call returns
immediately with `status: open`; the agent does not wait for review. This is the
right surface when a specific agent workflow should capture a recurring pattern
as a candidate skill on demand.

## The review → soundness-gate → promotion flow

Once proposals are in the queue, operate them from the CLI or the dashboard:

```bash
harness proposals status              # queue counts + emitter live/dormant state
harness proposals list                # open proposals (use --status <state>|all)
harness proposals show <id>           # full proposal, including gate findings
harness proposals approve <id>        # run the soundness gate, then promote on pass
harness proposals reject <id> --reason "<why>"
```

- **Review** — inspect candidates with `list` / `show`, or the dashboard review
  queue at `/s/proposals`.
- **Approve** — runs the soundness-review gate synchronously. On pass, the skill
  is promoted into the catalog with `provenance: agent-proposed`. On fail, the
  proposal stays queued with findings inline. `approve` requires the orchestrator
  to be running and an admin token (`HARNESS_ADMIN_TOKEN`, `manage-proposals`
  scope).
- **Reject** — records a decision with your one-line reason and transitions the
  proposal to `rejected`.

## See also

- [ADR 0016 — Skill proposal / refinement workflow](../knowledge/decisions/0016-skill-proposal-workflow.md)
