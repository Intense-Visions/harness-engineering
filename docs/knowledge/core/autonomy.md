---
type: business_concept
domain: core
tags: [autonomy, trusted-mode, pause-protocol, pause-class, self-audit, auto-decision-log]
---

# Autonomy

Three related concepts introduced by the trusted-autonomy-mode feature, materialized here so the
knowledge pipeline ingests them as graph nodes. Unrelated to the roadmap auto-triage
`ratchetStage` setting, which is also called "autonomy".

## What it is

**`autonomy-level`**: the user-level setting (`supervised` | `trusted`) that decides **who
decides** at a non-mechanical pause point in a harness workflow skill. It is orthogonal to
autopilot's `rigorLevel`, which decides **how much is checked** (ADR 0136). It resolves per field
(`level`, `audit`) from user-sourced tiers only: the more recent of {invocation flag, session
override}, then `HARNESS_AUTONOMY*` env, then `~/.harness/config.json`, then the default
`supervised`. Only `~/.harness/config.json` or a TTY-confirmed `harness autonomy set` can raise
it; every agent- or repo-reachable path may only lower it (ADR 0137).

**`pause-class`**: the class of a pause point, one of `ceremony` (auto-approved in trusted mode),
`judgment` (auto-takes the stated recommendation in trusted mode after the self-audit),
`irreversible` (always pauses) or `gate` (always stops). Each pause point in a workflow skill is
labelled with a `<!-- pause: <class> -->` marker, and classes only round up to the class of the
action behind the pause. The rule table lives in the Pause Protocol template.

**`self-audit-agreement-rate`**: the calibration metric over auto-resolved judgment forks. Each
fork is re-derived by a blind auditor that never sees the recommendation, then attacked by a
refuter when the picks agree; a disagreement escalates to the human at every autonomy level
(ADR 0138). `harness autonomy log` reports `audited N/M` (N = audits that ran, M = every judgment
decision including `unavailable` and `off`) and the agreement rate (agreed ÷ audited).

## Relationships

- Workflow skills (brainstorming, planning, autopilot, execution, soundness-review, code-review,
  integration) **include** the Pause Protocol and **read** autonomy at skill start and at every
  pause through `gather_context({ include: ["autonomy"] })`.
- Skills **lower** autonomy for a session through `manage_state` action `set-autonomy`, which
  **delegates** to the lower-only writer; only the human's `harness autonomy set` **raises** it.
- Every auto-taken decision is **recorded** through the `record_auto_decision` MCP tool, which
  **authorizes** against the resolved autonomy and refuses everything outside trusted mode.
- `harness autonomy log` **summarizes** the decision log at terminal points (SC11).
- The `autonomy-guard` PreToolUse hook **blocks** agent raises and agent writes to the
  user-level autonomy state and the decision log (`docs/guides/hooks-system.md`).
- Persona subagents dispatched by autopilot **cannot reach** the MCP tools above (fixed six-tool
  allow-list), so their ceremony and judgment pauses fail safe; see the guide's "Known
  limitations".

## Source map

- [`packages/types/src/autonomy.ts`](../../../packages/types/src/autonomy.ts): contract types
  (levels, sources, overrides, `AutoDecision`).
- [`packages/core/src/autonomy/index.ts`](../../../packages/core/src/autonomy/index.ts): public
  barrel; deliberately omits the raw append so `recordAutoDecision` is the only write path.
- [`packages/core/src/autonomy/schema.ts`](../../../packages/core/src/autonomy/schema.ts): Zod
  schemas for `~/.harness/config.json` and strictly typed override changes.
- [`packages/core/src/autonomy/paths.ts`](../../../packages/core/src/autonomy/paths.ts):
  home-dir paths, the raise audit log path and `computeRepoKey` (D15).
- [`packages/core/src/autonomy/resolve.ts`](../../../packages/core/src/autonomy/resolve.ts):
  `resolveAutonomy`, the per-field precedence with lower-only flag and env tiers (D3, D13, D17).
- [`packages/core/src/autonomy/session.ts`](../../../packages/core/src/autonomy/session.ts):
  resolves autonomy for a session by reading its home-dir override; never throws.
- [`packages/core/src/autonomy/lower-only.ts`](../../../packages/core/src/autonomy/lower-only.ts):
  `writeLoweringOverride`, the only override writer agent-callable surfaces may use (D12).
- [`packages/core/src/autonomy/override-store.ts`](../../../packages/core/src/autonomy/override-store.ts):
  locked read/merge/write of session overrides, per-field `setAt`, raise expiry (D14).
- [`packages/core/src/autonomy/decision-schema.ts`](../../../packages/core/src/autonomy/decision-schema.ts):
  strict `AutoDecision` entry schema, field caps and character policy.
- [`packages/core/src/autonomy/decision-log.ts`](../../../packages/core/src/autonomy/decision-log.ts):
  `recordAutoDecision`, the authorized append to `auto-decisions.jsonl`, and the reader.
- [`packages/core/src/autonomy/summary.ts`](../../../packages/core/src/autonomy/summary.ts):
  pure end-of-run summary (counts by class, `audited N/M`, agreement rate).
- [`packages/cli/src/commands/autonomy/index.ts`](../../../packages/cli/src/commands/autonomy/index.ts):
  the `harness autonomy` command group.
- [`packages/cli/src/commands/autonomy/show.ts`](../../../packages/cli/src/commands/autonomy/show.ts):
  `harness autonomy show`, the resolved value and its source.
- [`packages/cli/src/commands/autonomy/set.ts`](../../../packages/cli/src/commands/autonomy/set.ts):
  `harness autonomy set`, TTY-and-confirm raises and lowerings (`--session`, `--for`).
- [`packages/cli/src/commands/autonomy/log.ts`](../../../packages/cli/src/commands/autonomy/log.ts):
  `harness autonomy log`, the session summary (falls back to the archived session).
- [`packages/cli/src/commands/autonomy/deps.ts`](../../../packages/cli/src/commands/autonomy/deps.ts):
  injected terminal and process inputs for the command group.
- [`packages/cli/src/mcp/tools/auto-decision.ts`](../../../packages/cli/src/mcp/tools/auto-decision.ts):
  the `record_auto_decision` MCP tool.
- [`packages/cli/src/hooks/autonomy-guard.js`](../../../packages/cli/src/hooks/autonomy-guard.js):
  PreToolUse tripwire against agent raises and writes to autonomy state (D16).
- [`agents/skills/templates/pause-protocol.md`](../../../agents/skills/templates/pause-protocol.md):
  the Pause Protocol, the single rule table every workflow skill follows.

## See also

- [ADR 0136](../decisions/0136-autonomy-is-orthogonal-to-rigor.md): autonomy is orthogonal to
  rigor.
- [ADR 0137](../decisions/0137-autonomy-trust-boundary-is-user-level-and-raise-only-by-the-human.md):
  the user-level, raise-only-by-the-human trust boundary.
- [ADR 0138](../decisions/0138-blind-then-refute-self-audit-for-auto-resolved-judgment-forks.md):
  the blind-then-refute self-audit.
- [Trusted autonomy guide](../../guides/trusted-autonomy.md): enabling, reading the log,
  limitations.
- [Spec](../../changes/trusted-autonomy-mode/proposal.md): Trusted Autonomy Mode (Knowledge
  Impact).
