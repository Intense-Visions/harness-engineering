---
title: Activate the skill-proposal pipeline in dogfood
status: draft
tier: medium
roadmap: activate-the-skill-proposal-pipeline-in-dogfood
external-id: github:Intense-Visions/harness-engineering#551
keywords: skill-proposals, retrospection, emit_skill_proposal, observability, dogfood, provenance, soundness-gate
---

## Overview

Roadmap item #551 observes that the skill-proposal infrastructure exists in full
(`packages/core/src/proposals/`, `packages/orchestrator/src/proposals/`,
`packages/cli/src/commands/proposals.ts`, ADR 0016) and the README markets it —
"agents emit skill candidates that route through a soundness gate" — yet
`.harness/proposals/` is empty in this dogfood repo, so the advertised loop is not
observably running.

This spec is grounded in a root-cause investigation (below), not speculation. The
investigation shows the loop is **opt-in and dormant by design**, not broken. The
converged approach is therefore **honesty + observability, not fabricated
activation**: make the loop's real state observable in dogfood, make its
activation path discoverable, and correct the README so its claim matches
reality. We explicitly do **not** fake proposals to make the queue look active.

### Root-cause investigation (findings)

The queue has exactly **two** emission surfaces, and both require an input that is
absent in this repo:

1. **`emit_skill_proposal` MCP tool** — agent-driven and **manual**. An agent must
   explicitly call it at the end of a task (`packages/cli/src/mcp/tools/skill-proposal.ts`
   → `createProposal`). Nothing invokes it automatically, and no dogfood agent has.
   The README bullet ("agents emit skill candidates") describes a capture surface an
   agent must choose to use, not an always-on loop.

2. **Auto-triggered retrospection at session archive** — the only _automated_
   emitter (`packages/orchestrator/src/sessions/retrospection.ts`, wired at
   `packages/cli/src/mcp/tools/state.ts` `handleArchiveSession`). It is gated behind
   **three** conditions, all of which must hold:
   - env flag `HARNESS_SESSION_RETROSPECTION` is truthy — **not set anywhere in this
     repo** (only referenced in a changeset doc);
   - `resolveAnalysisProvider()` returns a provider — requires either
     `ANTHROPIC_API_KEY` (cloud) or `HARNESS_ANALYSIS_BASE_URL` (local `/v1`), **neither
     configured** in dogfood CI or hooks (`packages/cli/src/mcp/utils/analysis-provider.ts`);
   - the retrospection config is enabled (auto-set once the flag + provider are present).

Two hypotheses from the roadmap item are **ruled out**:

- _"soundness gate rejecting all"_ — the gate runs only at **approval** time, never at
  emit time (ADR 0016 Option C). An empty queue cannot be the gate's doing.
- _"proposals pruned/deleted"_ — there is **no pruning code** for `.harness/proposals/`
  anywhere in the tree.

**Conclusion:** the loop is safe-by-default dormant. It cannot run observably in
dogfood without either (a) live agent traffic that calls `emit_skill_proposal`, or
(b) enabling retrospection with an LLM provider. That is a deliberate design
posture — the defect is that the posture is **undocumented, unobservable, and
contradicted by the README**, so an operator cannot tell "dormant by design" from
"broken."

## Goals

1. Make the loop's real state **observable** in dogfood with a provider-independent,
   zero-dependency surface — an operator can see, at a glance, whether each emission
   surface is live or dormant and _why_.
2. Make the activation path **discoverable** — a single operator guide covering the
   two emission surfaces, the exact gating, how to turn retrospection on, and the
   review/approve/promote flow.
3. Make the README **honest** — reframe the Skill Proposals claim from an implied
   always-on loop to an accurate description of an opt-in capture surface plus opt-in
   retrospection.

### Non-goals (YAGNI)

- **Not** flipping retrospection on by default (globally or in dogfood). It needs an
  LLM provider that CI does not have; forcing it on would change global behavior and
  risk empty/failed runs. Activation stays opt-in and documented.
- **Not** fabricating proposals or committing seed proposals into `.harness/proposals/`.
- **Not** building a new auto-emitter or altering the soundness gate / promotion path.
- **Not** a dashboard change — the observability surface is the CLI, matching how the
  rest of `harness proposals` is operated.

## Assumptions

- **Runtime: Node.js** (the CLI already runs on Node; `proposals status` uses only
  `process.env` and the existing filesystem-backed store — no new runtime dependency).
- **Env-var presence is an acceptable proxy for provider-resolvability.** `status`
  reports `providerResolvable` by checking for `ANTHROPIC_API_KEY` /
  `HARNESS_ANALYSIS_BASE_URL` rather than constructing a provider, so it never imports
  `@harness-engineering/intelligence` and is safe to run anywhere. It intentionally does
  not detect a misconfigured-but-present key; that is a report, not a health check.

## Decisions made

- **D1 — Honesty over fake activation.** The honest outcome the roadmap item permits
  ("document the real state") is the correct one, _augmented_ with real observability
  wiring so the state is first-class rather than prose-only. Rationale: the loop is
  dormant by design; the only genuine activation needs live agent traffic or a
  provider, neither of which we can manufacture without faking.
- **D2 — Observability via a `harness proposals status` subcommand.** Extends the
  existing `proposals` command group (list/show/approve/reject). It is
  provider-independent (reads env flags + counts queue files), so it works in CI and
  offline. Rationale: the same operator surface already used for the queue; no new
  runtime dependency; directly answers "is the loop running?".
- **D3 — Report emitter enablement, not just counts.** `status` reports, per surface:
  retrospection enabled/dormant with the specific missing precondition
  (`HARNESS_SESSION_RETROSPECTION` unset / no analysis provider resolvable), and the
  manual-emit surface as always-available. Plus queue counts by status. Rationale:
  "why dormant" is the question an empty queue actually raises.
- **D4 — Guide, not README essay.** The full activation walkthrough lives in
  `docs/guides/skill-proposal-loop.md`; the README bullet shrinks to an accurate
  one-liner pointing at the guide and `proposals status`. Rationale: keeps the README
  claim honest and short; puts the how-to where guides live.
- **D5 — No internal identifiers in shipped surfaces.** The CLI help text and the
  guide carry no roadmap/PR/issue numbers (they render in adopter repos). Only this
  spec and the changeset reference #551.

## Technical design

### `harness proposals status`

New subcommand in `packages/cli/src/commands/proposals.ts`, registered on the
existing `proposals` command group. A pure, testable core function plus a thin
action wrapper (mirroring `runProposalsList` / `actListCommand`):

```
runProposalsStatus(env, projectRoot) -> ProposalsStatusReport
```

`ProposalsStatusReport` shape (JSON-serializable; `--json` prints it verbatim, the
default prints a compact human table):

```
{
  queue: { open, gateRunning, gateFailed, approved, rejected, total },
  emitters: {
    manualEmit: { surface: "emit_skill_proposal", available: true },
    retrospection: {
      enabled: boolean,               // both preconditions satisfied
      envFlagSet: boolean,            // HARNESS_SESSION_RETROSPECTION truthy
      providerResolvable: boolean,    // ANTHROPIC_API_KEY | HARNESS_ANALYSIS_BASE_URL present
      dormantReason?: string          // present when !enabled: which precondition is missing
    }
  }
}
```

- Queue counts reuse `listProposals(projectRoot, { kind: 'skill' })` and tally by
  status — no new store code.
- Emitter enablement is derived from env only, using the **same predicates the
  runtime uses** so the report cannot drift from behavior: the truthy-flag test
  mirrors `envEnabled` (`1|true|yes|on`, case-insensitive) and provider-resolvability
  mirrors `resolveAnalysisProvider`'s precedence (`ANTHROPIC_API_KEY` present, else
  `HARNESS_ANALYSIS_BASE_URL` present). To avoid two copies of the flag predicate, the
  shared `envEnabled` check is exported for reuse; provider-resolvability is checked by
  env-var presence (not by constructing a provider) to keep `status` free of the
  `@harness-engineering/intelligence` import and safe to run anywhere.
- Exit code 0 always (status is a report, never a gate).
- **Error/edge cases:** a missing or unreadable `.harness/proposals/` directory reports
  `queue.total = 0` (following `listProposals`, which returns `[]` on `readdir` failure);
  a malformed proposal JSON is skipped (following `getProposal`, which returns `null`),
  so counts reflect only valid records. `status` never throws on a degraded store.

### Operator guide

`docs/guides/skill-proposal-loop.md` — sections: what the loop is; the two emission
surfaces; the exact gating for retrospection (env flag + provider precedence, quoting
the real env-var names); how to activate retrospection locally; how agents emit via
`emit_skill_proposal`; the review → soundness-gate → promotion flow
(`harness proposals list|show|status|approve|reject`, `/s/proposals`); and an honest
"current default state: dormant/opt-in" note.

### README correction

Rewrite the Skill Proposals bullet so it (a) states the surface is an opt-in capture
path plus opt-in session-terminus retrospection, (b) drops any implication of an
always-on loop, (c) links the new guide, (d) mentions `harness proposals status`, and
(e) fixes the stale ADR link (the current bullet points at
`0016-hermes-phase-4-skill-proposal-workflow.md`; the file is
`0016-skill-proposal-workflow.md`).

## Integration Points

- **Entry Points:** new CLI subcommand `harness proposals status` on the existing
  `proposals` command group. No new MCP tool, skill, or route.
- **Registrations Required:** subcommand registered in `createProposalsCommand()`;
  `envEnabled` exported from its module for reuse; generated CLI reference
  (`docs/reference/cli-commands.md`) regenerated via `generate-docs`. No plugin/slash-command
  change (`proposals` is a CLI command, not a slash command — plugin command count
  unchanged).
- **Documentation Updates:** new `docs/guides/skill-proposal-loop.md`; README Skill
  Proposals bullet corrected (claim + ADR link); regenerated CLI reference.
- **Architectural Decisions:** None standalone — this refines the operational posture
  of ADR 0016 (soundness-gated, human-gated, opt-in emission) rather than changing a
  decision. The guide cites ADR 0016 as the canonical rationale.
- **Knowledge Impact:** clarifies that the skill-proposal loop (a STRATEGY.md
  "Compounding feedback loops" mechanism) is opt-in and how it is activated — captured
  in the guide.

## Success criteria

1. `harness proposals status` exits 0 and, in this repo with no proposals and no
   retrospection env, reports `queue.total = 0` and
   `emitters.retrospection.enabled = false` with a `dormantReason` naming the missing
   `HARNESS_SESSION_RETROSPECTION` flag. _(observable: run the command)_
2. `harness proposals status --json` emits the `ProposalsStatusReport` shape above and
   is valid JSON. _(observable: pipe through a JSON parser)_
3. With `HARNESS_SESSION_RETROSPECTION=1` and `ANTHROPIC_API_KEY=x` set in the
   environment, `status` reports `retrospection.enabled = true` and no `dormantReason`.
   _(observable: run with env set)_
4. Unit tests cover `runProposalsStatus` across the enablement matrix (flag×provider)
   and queue tallying, and the exported `envEnabled` predicate. _(observable: test run)_
5. `docs/guides/skill-proposal-loop.md` exists and documents both emission surfaces,
   the exact gating, and the review/promotion flow; the README bullet no longer implies
   an always-on loop and links the guide; the ADR link resolves.
   _(observable: file exists, link resolves, README diff)_
6. No new file appears under `.harness/proposals/`; no shipped surface (CLI help,
   guide) cites an internal roadmap/PR/issue number. _(observable: git status + grep)_
7. `harness validate`, typecheck, lint, and the full build stay green; generated CLI
   reference regenerated; `.harness/arch/baselines.json` byte-identical to origin/main.
   _(observable: gauntlet)_

## Implementation order

1. **Phase 1 — Observability command.** Add `runProposalsStatus` + `harness proposals
status` (default table + `--json`); export `envEnabled` for reuse; unit tests across
   the enablement matrix. Regenerate CLI reference.
2. **Phase 2 — Documentation + honesty.** Write `docs/guides/skill-proposal-loop.md`;
   correct the README Skill Proposals bullet (claim + ADR link). Add a changeset.
3. **Phase 3 — Verify + review.** Full build, `harness validate`, tests; confirm
   baseline byte-identical and plugin command count unchanged; open PR.
