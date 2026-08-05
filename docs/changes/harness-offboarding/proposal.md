# harness:offboarding — Structured Departure Handoff

**Keywords:** offboarding, handoff, knowledge-capture, departure, ownership-transfer, ADR-draft, graph-ingestion, succession

## Overview

`harness:onboarding` exists for arrivals — it maps an existing harness-managed project and orients a new developer. There is no symmetric flow for departures. When an engineer leaves, changes teams, or hands off long-term ownership, the social knowledge they enforced informally — decisions never written as ADRs, conventions held in review, "here be dragons" fragility maps — walks out the door with them. Team shrinkage is the load test for a project's captured knowledge, and today the harness has no extraction flow for that transition.

This proposal adds `harness:offboarding`, the symmetric counterpart to onboarding. Where onboarding gets knowledge _in_, offboarding gets knowledge _out_ before it is lost: it conducts a structured debrief, hands off open work and ownership, runs an access/knowledge/secret checklist, and verifies nothing load-bearing is orphaned.

### Goals

- Extract the tacit knowledge a departing person holds before it is unrecoverable
- Transfer every piece of owned work and expertise to a named successor or an explicit "needs owner" flag
- Produce a durable, queryable handoff record rather than a one-off conversation
- Surface access/secret revocation-and-rotation reminders so a departure closes cleanly

### Non-Goals

- Executing access revocation or secret rotation (the skill surfaces reminders; humans/admins act on them — the skill never touches credentials)
- Routine end-of-session agent handoff (that is `summarize_session` / session state, not a person leaving)
- Decommissioning or archiving a whole project (this is about a _person_ leaving, not the repo ending)
- Onboarding a _replacement_ (that remains `harness:onboarding`)

## Decisions

| Decision             | Choice                                              | Rationale                                                                                                      |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Skill vs. tooling    | Instruction-level skill                             | The work is an interview + judgment + reuse of existing harness surfaces; no new machinery is warranted        |
| Structural template  | Mirror `harness-onboarding` exactly                 | Symmetry is the point; same tier, wiring, platform topology, and required sections                             |
| Output medium        | Durable `docs/knowledge/handoff-{person}-{date}.md` | Unlike onboarding's conversational orientation, a departure leaves a permanent record for the team that stays  |
| Knowledge durability | Ingest artifact + ADR drafts into the graph         | A file nobody queries rots; graph ingestion makes "who understood X?" answerable after departure               |
| Secrets handling     | Flag for rotation, not just revocation              | Removing access does not un-know a secret; rotation and revocation are different actions with different owners |
| Credentials access   | Never touch them                                    | The skill has no business reading secrets; it produces an actionable reminder checklist only                   |

## Technical Design

### Phases

The skill runs four phases, composed from existing harness surfaces:

1. **CAPTURE** — Seed from durable surfaces (`search_sessions`, `summarize_session`, `.harness/learnings.md`, `.harness/state.json`, git/PR authorship), then run a structured debrief across five extraction topics: recent decisions, undocumented gotchas, conventions held in head, areas of expertise, known fragile components.
2. **HANDOFF** — Reassign roadmap ownership (`manage_roadmap`, or the shard `- **Assignee:**` line for sharded roadmaps), hand off in-flight branches/PRs/plans (`harness state show`), and transfer expertise ownership to named successors.
3. **CHECKLIST** — Materialize `docs/knowledge/handoff-{person}-{date}.md`, generate `status: draft` ADRs from captured decisions, `ingest_source` the artifact and drafts into the graph, produce an access/secret revocation-and-rotation checklist, and run a knowledge-surface gap review against `AGENTS.md` / `STRATEGY.md` / `.harness/learnings.md`.
4. **VERIFY** — Exit gate: no orphaned ownership, no orphaned in-flight work, capture is durable and queryable (`query_graph` spot check), access checklist is acknowledged, and open risks (expertise with no successor, unwarned fragile components) are listed prominently rather than buried.

### Reused harness surfaces

The skill invents no new machinery. It composes: `search_sessions` / `summarize_session` (debrief seed), `ingest_source` + `query_graph` (durable capture), `manage_roadmap` (ownership), `harness state show` (in-flight work), and the `AGENTS.md` / `STRATEGY.md` / `.harness/learnings.md` surfaces (gap review).

### Wiring

Authored as the claude-code source under `agents/skills/claude-code/harness-offboarding/` (`SKILL.md` + `skill.yaml`), with `gemini-cli` / `codex` / `cursor` directory symlinks into the source — identical to onboarding's topology. Tier 1, `type: flexible`, `cognitive_mode: advisory-guide`, `manual` trigger. Generated slash commands ship for claude (`.claude-plugin`), cursor (`.cursor-plugin`), and gemini (`.gemini-extension`); codex is manifest-only.

## Acceptance Criteria

- A `harness-offboarding` skill exists with `SKILL.md` (When to Use, Process with four phases, Harness Integration, Success Criteria, Examples) and a schema-valid `skill.yaml`.
- The skill is present in all four platform trees (claude-code source + gemini-cli/codex/cursor symlinks) and passes the skills catalog structure, schema, platform-parity, and internal-refs tests.
- Generated slash commands exist for claude, cursor, and gemini, and `generate:plugin:check` passes for all targets.
- The skills catalog (`docs/reference/skills-catalog.md`) lists the skill under Tier 1, and `generate-docs --check` passes.
- The shipped skill text contains no internal roadmap/PR/issue references.
- The skill grounds its process in existing harness surfaces (sessions, graph, roadmap, state, knowledge surfaces) rather than inventing new machinery.
