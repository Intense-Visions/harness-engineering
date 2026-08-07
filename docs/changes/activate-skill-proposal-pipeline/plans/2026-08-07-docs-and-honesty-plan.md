# Plan: Skill-Proposal Pipeline — Phase 2 (Documentation & Honesty)

**Date:** 2026-08-07 | **Spec:** docs/changes/activate-skill-proposal-pipeline/proposal.md | **Tasks:** 5 | **Time:** ~22 min | **Integration Tier:** medium

## Goal

Make the skill-proposal loop's real posture honest and discoverable: ship an operator guide, correct the README's implied always-on claim (and its stale ADR link), register the guide, and record a changeset — without adding any internal roadmap/PR/issue identifiers to shipped surfaces.

## Scope note

Phase 1 (the `harness proposals status` CLI subcommand) is **already built, tested, reviewed, and committed** (see prior session handoff: commits `b3e405dcb`..`6cbb80abe`). This plan is docs-only. No source code, no tests-of-code, no CLI changes. TDD does not apply to prose; each task's "verification" is a concrete check (grep / link resolution / `harness validate`).

## Observable Truths (Acceptance Criteria)

1. `docs/guides/skill-proposal-loop.md` exists and contains all required sections: what the loop is; the two emission surfaces (manual `emit_skill_proposal` + auto session-terminus retrospection); the exact retrospection gating (`HARNESS_SESSION_RETROSPECTION` truthy `1|true|yes|on` **AND** an analysis provider resolvable via `ANTHROPIC_API_KEY` or `HARNESS_ANALYSIS_BASE_URL`); how to activate retrospection locally; how agents emit via `emit_skill_proposal`; the review → soundness-gate → promotion flow (`harness proposals list|show|status|approve|reject`, dashboard `/s/proposals`); and an explicit "current default state: dormant / opt-in" note. _(observable: file exists, section grep)_
2. The guide references `harness proposals status` for observability and cites ADR 0016 at the correct path `docs/knowledge/decisions/0016-skill-proposal-workflow.md`. _(observable: grep + link resolves)_
3. The README "Skill Proposals" bullet (currently line 49) no longer implies an always-on loop: it frames the loop as an opt-in capture surface plus opt-in session-terminus retrospection, links the new guide, mentions `harness proposals status`, and its ADR link points to `0016-skill-proposal-workflow.md` (not the stale `0016-hermes-phase-4-skill-proposal-workflow.md`). _(observable: README diff + link resolves)_
4. The new guide is registered in `docs/guides/index.md`. _(observable: grep for `skill-proposal-loop` in index)_
5. A changeset under `.changeset/` gives a patch bump to `@harness-engineering/cli`, describing the new `harness proposals status` command plus the docs honesty correction (may reference #551). _(observable: file exists, frontmatter parse)_
6. No shipped surface — the guide body or the README bullet — contains any internal roadmap/PR/issue number (e.g. `#551`, `#688`, `hermes-phase-4`). _(observable: grep clean)_
7. `harness validate` passes and the docs link/build check is green. _(observable: command exit 0)_

## Change Specifications (deltas to existing behavior)

- **[ADDED]** `docs/guides/skill-proposal-loop.md` operator guide.
- **[ADDED]** `docs/guides/index.md` entry linking the new guide.
- **[ADDED]** `.changeset/*.md` describing the `harness proposals status` command + docs honesty correction (patch, `@harness-engineering/cli`).
- **[MODIFIED]** README "Skill Proposals" bullet — reframed opt-in, links guide, mentions `proposals status`, ADR link corrected.

## File Map

- CREATE `docs/guides/skill-proposal-loop.md`
- MODIFY `docs/guides/index.md` (add guide entry near the other operator guides)
- MODIFY `README.md` (rewrite the Skill Proposals bullet, line 49)
- CREATE `.changeset/proposals-status-and-docs-honesty.md`

## Constraints & Risks

- **[CONSTRAINT — spec D5 / repo policy]** The guide body and README bullet carry NO internal roadmap/PR/issue identifiers. Only the spec and the changeset may reference `#551`.
- **[CONSTRAINT — spec D4]** README stays a short honest one-liner-ish bullet pointing at the guide; the full walkthrough lives in the guide.
- **[RISK]** Regurgitating the stale ADR filename or the old `hermes-phase-4` slug into shipped surfaces. Mitigation: Task 5 greps for `hermes-phase-4` and internal identifiers across guide + README.
- **[RISK]** Guide/README drifting from the runtime gate semantics. Mitigation: the guide quotes the exact env-var names and truthy set (`1|true|yes|on`) that the runtime `envEnabled` predicate uses (`packages/cli/src/utils/env-flag.ts`), and the provider precedence from `resolveAnalysisProvider` (`ANTHROPIC_API_KEY` else `HARNESS_ANALYSIS_BASE_URL`).

## Uncertainties

- [ASSUMPTION] The docs build/link checker runs as part of `harness validate` (or an adjacent `pnpm` docs check). If `harness validate` does not lint links, Task 5 additionally greps for the two ADR paths to confirm resolution. (Non-blocking.)
- [DEFERRABLE] Exact placement/wording of the guide entry within `docs/guides/index.md` section ordering. (Cosmetic; does not affect any observable truth.)

## Tasks

### Task 1: Write the operator guide `docs/guides/skill-proposal-loop.md`

**Depends on:** none | **Files:** `docs/guides/skill-proposal-loop.md` | **Category:** documentation
**Skills:** `harness-planning` (reference)

1. Create `docs/guides/skill-proposal-loop.md` with exactly this content (no internal identifiers):

```markdown
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
```

2. Verify no internal identifiers leaked: `grep -nE '#[0-9]{2,}|hermes-phase-4' docs/guides/skill-proposal-loop.md` → expect **no matches**.
3. Verify the ADR link target resolves: `test -f docs/knowledge/decisions/0016-skill-proposal-workflow.md && echo OK`.
4. Verify required section anchors present: `grep -nE '^(#|##) ' docs/guides/skill-proposal-loop.md` → confirm Overview, current default state, two emission surfaces, Gating, Activating, How agents emit, Review flow.
5. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness validate`
6. Commit (do NOT run in this planning phase — execution only): `docs(proposals): add skill-proposal loop operator guide`

### Task 2: Register the guide in `docs/guides/index.md`

**Depends on:** Task 1 | **Files:** `docs/guides/index.md` | **Category:** integration

1. In `docs/guides/index.md`, add a new entry adjacent to the other operator/lifecycle guides (near the `Local Model Lifecycle Manager` block around line 176). Insert:

```markdown
### [Skill-Proposal Loop](./skill-proposal-loop.md)

Operate the opt-in skill-proposal loop: the two emission surfaces
(`emit_skill_proposal` capture + session-terminus retrospection), the exact
retrospection gating (env flag + analysis provider), how to activate it locally,
and the review → soundness-gate → promotion flow. Inspect live posture with
`harness proposals status`.

**Best for:** Operators enabling and triaging agent-proposed skills
```

2. Verify: `grep -n 'skill-proposal-loop' docs/guides/index.md` → expect one match.
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness validate`
4. Commit (execution phase only): `docs(guides): register skill-proposal loop guide in index`

### Task 3: Correct the README "Skill Proposals" bullet

**Depends on:** Task 1 | **Files:** `README.md` | **Category:** documentation

1. Replace the exact current bullet at `README.md` line 49:

**OLD (exact):**
```
- **Skill Proposals** — Agents emit skill candidates (new or refinement) via the `emit_skill_proposal` MCP tool; proposals queue in `.harness/proposals/` and route through a mechanical soundness gate before reviewer approval. Every skill carries `provenance: community | agent-proposed | user-authored`. CLI: `harness proposals list|show|approve|reject`. Dashboard review queue at `/s/proposals`. See [ADR 0016](docs/knowledge/decisions/0016-hermes-phase-4-skill-proposal-workflow.md).
```

**NEW (exact):**
```
- **Skill Proposals** — An **opt-in** loop for growing the skill catalog. Agents can capture skill candidates (new or refinement) via the `emit_skill_proposal` MCP tool, and — only when explicitly enabled — session-terminus retrospection can emit candidates automatically. Neither surface runs by default (retrospection needs `HARNESS_SESSION_RETROSPECTION` plus an analysis provider). Captured proposals queue in `.harness/proposals/`, pass a mechanical soundness gate at approval time, and carry `provenance: community | agent-proposed | user-authored`. Inspect loop state with `harness proposals status`; triage with `harness proposals list|show|approve|reject` or the dashboard queue at `/s/proposals`. See the [skill-proposal loop guide](docs/guides/skill-proposal-loop.md) and [ADR 0016](docs/knowledge/decisions/0016-skill-proposal-workflow.md).
```

2. Verify the always-on implication is gone and the fixes landed:
   - `grep -n 'opt-in' README.md` (line ~49 present)
   - `grep -n '0016-skill-proposal-workflow.md' README.md` → present
   - `grep -n '0016-hermes-phase-4-skill-proposal-workflow.md' README.md` → **no match** (stale link gone)
   - `grep -n 'skill-proposal-loop.md' README.md` → present (guide linked)
   - `grep -n 'proposals status' README.md` → present
3. Verify no internal identifiers in the bullet: `sed -n '49p' README.md | grep -nE '#[0-9]{2,}|hermes-phase-4'` → **no match**.
4. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness validate`
5. Commit (execution phase only): `docs(readme): make Skill Proposals bullet honest (opt-in) + fix ADR link`

### Task 4: Add the changeset

**Depends on:** none | **Files:** `.changeset/proposals-status-and-docs-honesty.md` | **Category:** integration

1. Create `.changeset/proposals-status-and-docs-honesty.md`:

```markdown
---
'@harness-engineering/cli': patch
---

Add `harness proposals status` and correct the skill-proposal docs (#551).

`harness proposals status` is a provider-independent, read-only report of the
skill-proposal loop: queue counts by status plus, per emission surface, whether it
is live or dormant and why. It reuses the same env predicates the runtime uses
(`HARNESS_SESSION_RETROSPECTION` truthy test; `ANTHROPIC_API_KEY` /
`HARNESS_ANALYSIS_BASE_URL` provider resolvability) so the report cannot drift from
behavior, and it never constructs a provider or mutates the queue. Supports the
global `--json` flag; always exits 0.

Docs honesty pass: the README "Skill Proposals" bullet no longer implies an
always-on loop — it now describes an opt-in capture surface plus opt-in
session-terminus retrospection, links the new operator guide, and fixes the stale
ADR link. New guide `docs/guides/skill-proposal-loop.md` documents both emission
surfaces, the exact retrospection gating, local activation, and the
review → soundness-gate → promotion flow.
```

2. Verify frontmatter is a valid single patch bump for the CLI: `grep -n "'@harness-engineering/cli': patch" .changeset/proposals-status-and-docs-honesty.md` → present.
3. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness validate`
4. Commit (execution phase only): `chore(changeset): proposals status + skill-proposal docs honesty`

### Task 5: Final verification — honesty, links, and validate [checkpoint:human-verify]

**Depends on:** Task 1, Task 2, Task 3, Task 4 | **Files:** (verification only) | **Category:** integration

1. No internal identifiers in any shipped surface:
   - `grep -nE '#[0-9]{2,}|hermes-phase-4' docs/guides/skill-proposal-loop.md` → **no match**
   - `sed -n '49p' README.md | grep -nE '#[0-9]{2,}|hermes-phase-4'` → **no match**
2. ADR links resolve from both shipped surfaces:
   - `test -f docs/knowledge/decisions/0016-skill-proposal-workflow.md && echo OK`
   - `grep -c '0016-hermes-phase-4' README.md` → `0`
3. Guide is registered: `grep -c 'skill-proposal-loop' docs/guides/index.md` → `1`.
4. No proposal side effects: `git status --porcelain .harness/proposals/ 2>/dev/null` → empty (no new proposal files).
5. Run: `source ~/.nvm/nvm.sh && nvm use 22 && harness validate` → exit 0. If a docs link/build check is separate, run it too.
6. **[checkpoint:human-verify]** Present the README diff and the guide's section headings; confirm (a) the always-on implication is gone, (b) the opt-in framing + gating is accurate to the runtime, and (c) no internal identifiers leaked. Wait for confirmation before closing Phase 2.

## Sequencing

- Task 1 (guide) and Task 4 (changeset) have no dependencies and may run in parallel.
- Task 2 (index) and Task 3 (README) depend on Task 1 (the guide must exist for their links to resolve). They touch different files and may run in parallel with each other.
- Task 5 depends on all prior tasks (final gate + human-verify).

## Integration Points (from spec)

- **Documentation Updates:** new `docs/guides/skill-proposal-loop.md` (Task 1); README Skill Proposals bullet corrected — claim + ADR link (Task 3); guide registered in `docs/guides/index.md` (Task 2). _(CLI reference regeneration was handled in Phase 1.)_
- **Architectural Decisions:** None standalone — the guide cites ADR 0016 as canonical rationale; no ADR change.
- **Knowledge Impact:** the guide clarifies that the skill-proposal loop (a STRATEGY.md "Compounding feedback loops" mechanism) is opt-in and how it is activated.
- **Registrations Required (this phase):** guide entry in `docs/guides/index.md`; changeset for `@harness-engineering/cli` (Task 4).
