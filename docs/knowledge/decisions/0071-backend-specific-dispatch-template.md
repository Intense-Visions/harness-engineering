---
number: 0071
title: Backend-specific dispatch template (a separate local template, selected by resolved backend type)
date: 2026-07-15
status: accepted
tier: integration
source: docs/changes/local-backend-full-workflow/proposal.md
---

## Context

The orchestrator renders **one** dispatch prompt (`harness.orchestrator.md`)
that instructs the agent to run the workflow via `/harness:*` **slash commands**.
That template is Claude-Code-shaped: the `primary` backend is the `claude` CLI,
which has those slash commands and the harness MCP tool surface. The `local`
(`pi`) backend is a `pi-coding-agent` with only `read/write/bash/grep/find` — no
slash commands, no harness MCP tools — so the Claude template's slash-command
workflow is **literally unusable** there. This is why the local backend was
historically scoped to `quick-fix`/`diagnostic` only.

D3 of the spec required the local backend to run the _same_ workflow rigor
(brainstorm → plan → execute → verify → outcome-eval → review → ship). The
question this ADR settles is **how** to deliver a workflow prompt that a
tool-limited pi-agent can actually execute, without regressing the primary
Claude path that the single existing template serves.

Two facts about the shipped code shaped the decision:

1. The prompt template is a single string on the orchestrator, loaded once at
   construction and rendered per dispatch (`promptTemplate`, rendered in
   `dispatchIssue`). Any per-backend variation has to be decided at dispatch
   time, from the resolved backend definition.
2. The pi-agent already has a working **bash** capability and the machine
   already ships the **harness CLI**, so the same workflow gates the Claude
   template reaches via `/harness:*` are reachable on the local path as plain
   `harness <gate>` shell invocations — no new runtime is required.

## Decision

**Introduce a separate backend-specific dispatch template**
(`harness.orchestrator.local.md`), selected by the **resolved backend type** at
dispatch, rather than branching the workflow inside the single Claude-shaped
template.

- `resolvePromptTemplate(backendName)` returns the local template when the
  resolved backend `def.type` is `pi`/`local` **and** a local template is
  loaded; otherwise it returns the default template. The function is pure over
  `(backendName, backends, localPromptTemplate, promptTemplate)` and is
  unit-tested in isolation.
- The local template is a thin **indirection shim** — it carries **no workflow
  methodology of its own** (revised in Phase 5, see below). It tells the pi-agent
  it has no slash commands, gives the redirect rule (`/harness:X` →
  `harness skill run harness-X --autonomous`), names the ordered full-workflow
  entry sequence, and points at `harness skill list`. The agent obtains the
  **real** skill instructions over bash via `harness skill run`.
- The default `harness.orchestrator.md` template is left **untouched** in its
  rendered workflow body: the primary Claude path renders byte-for-byte the same
  prompt as before, so there is no regression risk to the primary path from this
  change.

> **Phase 5 revision (D6/D7).** As originally shipped, this template _inlined_
> the workflow methodology (the brainstorm → plan → execute → verify → review
> arc) as prose. Review surfaced that as a **second, drifting source of truth** —
> a paraphrase of the skills. Phase 5 replaced the paraphrase with the real
> skills, delivered through a channel the pi-agent already has:
> `harness skill run <name>` prints the verbatim `SKILL.md` (the same content the
> Claude client injects via a `/harness:*` slash command) as a pure CLI read — no
> MCP server, since every core workflow skill drives the harness CLI and contains
> zero `mcp__harness__` references. The template is now the ~75-line shim
> described above. **This erases the "two templates to keep in methodological
> sync" cost below: methodology lives once, in the skills.**

The local template file carries a full YAML frontmatter block for
self-documenting-scaffold purposes (so `harness init` can drop in a valid file),
but that frontmatter is **intentionally ignored** at dispatch — only the markdown
body is loaded and rendered. The orchestrator's configuration is always read from
the loaded `WorkflowConfig`, never from the template file's frontmatter.

## Rejected alternatives

- **Branch inside the single template.** Rejected: a single template that tries
  to serve both a slash-command runtime and a bash-only runtime becomes a
  conditional thicket (`{% if backend == 'local' %}`), couples the primary
  Claude path to local-only concerns, and puts regression risk on the
  highest-traffic dispatch prompt for a property a separate file gets cleanly.
- **Teach the pi-agent the slash commands.** Rejected as a non-goal: porting the
  `/harness:*` slash-command runtime into pi is far more than the wiring this
  feature needs, when the harness CLI already exposes the same gates over bash.

## Consequences

- **No regression risk to the primary path.** The Claude template's rendered
  workflow body is unchanged, so every existing (non-local) dispatch is
  byte-identical to before this feature.
- **Graceful fallback (SC5).** When the local template file is absent, the
  resolver falls back to the default template — a `pi`/`local` backend with no
  local template loaded still dispatches (with the default prompt) rather than
  failing. The local path is additive, never a hard dependency.
- **No methodological-sync cost (Phase 5).** The original separation carried a
  maintenance tax — the local template paraphrased the same workflow arc the
  Claude template expresses as slash commands, so a methodology change had to be
  reflected in both. The Phase-5 shim **eliminates** that tax: the local template
  carries no methodology, only the `harness skill run` indirection, so the
  workflow methodology lives in exactly one place (the skills) for both backends.
  The two remaining template copies (repo-root + `templates/orchestrator/`) are
  byte-identical scaffolding duplicates, guarded by a lint test, not two
  independent methodology restatements.
- **A shim depends on the skills being CLI-reachable.** The pi-agent obtains its
  instructions by running `harness skill run <name>`, so the local path now
  assumes the harness CLI is on `PATH` and the skills resolve. That is already
  true wherever the local backend runs (the machine ships the CLI), and it is the
  same assumption the enforced gates (`harness validate`) already make.
- **Composes with the enforcement half of the feature (ADR 0070).** This ADR
  gives the local agent a workflow it can _read and follow_ (now the real skills);
  ADR 0070 makes the orchestrator _enforce_ the gates, so quality is protected by
  halting rather than by trusting a small model to self-drive. The two ADRs are
  the two halves of the same spec (D3 = this template; D2 = the enforced gate
  loop). The autonomous-decider behavior on the shim path is settled in ADR 0072.

See `Orchestrator.resolvePromptTemplate` in
`packages/orchestrator/src/orchestrator.ts`; the local template at
`harness.orchestrator.local.md` (with a byte-identical scaffold copy under
`templates/orchestrator/`); tests in
`packages/orchestrator/src/orchestrator.template-resolution.test.ts`; the
shim-contract lint at `packages/orchestrator/src/local-template-lint.test.ts`.
Related: ADR 0070 (harness-enforced local gates), ADR 0072 (autonomous local
decisions via `harness skill run --autonomous`), and the proposal at
`docs/changes/local-backend-full-workflow/proposal.md`.
