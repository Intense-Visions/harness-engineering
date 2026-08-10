---
topic: Feature-level comparison of external sources against harness capability
generated_at: 2026-08-10
supersedes: nothing
companion_to: docs/ideation/external-source-adoption-tria-2026-08-09.md
method: feature inventories enumerated from repository file trees (not README summaries), each feature mapped to a named harness skill/tool/package and verified in this repo
---

# Feature Matrix — External Sources vs Harness

## Why this document exists

The companion triage judged **sources**. For 13 of 28 it ruled at README level on "overlaps something harness ships." That is sound for a verdict on the whole repo and unsound for its parts: a repo whose aggregate is a competitor can still contain two or three features harness lacks. This pass enumerates the actual feature inventories and compares them one at a time.

Verdict vocabulary:

- **harness-better** — harness's equivalent is more rigorous, more enforced, or better integrated
- **parity** — same capability, no meaningful delta
- **source-better** — the source's version is genuinely stronger
- **uncovered** — harness has no equivalent

## The four features that changed the picture

These were invisible at source level and are the real return on this pass.

### 1. Runtime-trace ingestion to validate graph edges — **uncovered**

`codebase-memory-mcp` ships `ingest_traces`: "Ingest runtime traces to validate `HTTP_CALLS` edges." That closes the loop between a statically-derived graph and observed runtime behaviour — a static edge is a hypothesis until traffic confirms it.

Harness has a rich ingestor set — `CodeIngestor`, `GitIngestor`, `DecisionIngestor`, `KnowledgeIngestor`, `RequirementIngestor`, `DesignIngestor`, `CanaryResultsIngestor`, `BusinessKnowledgeIngestor`, `StructuralDriftDetector`, `ContradictionDetector` — and **no runtime-trace ingestor**. Grep for `ingest_traces|ingestTrace|HTTP_CALLS|runtime trace` across `packages` returns zero non-dist hits.

This is the strongest single find of the feature pass, and it is squarely on-thesis: the project bets that constraints-as-code beats conventions, and a graph edge validated against production traffic is a stronger constraint than one inferred from an AST. It also connects to an existing seam — `CanaryResultsIngestor` already proves the pattern of folding execution results back into the graph.

### 2. Graph schema introspection — **uncovered**

`get_graph_schema` returns node/edge counts, relationship patterns and per-label property definitions, and its own description says **"Run this first."** Harness exposes `query_graph`, `ask_graph`, `get_relationships`, `search_similar` and more, but nothing that tells an agent what node types and edge types exist. Agents must already know the schema to query it, or guess. `ls packages/cli/src/mcp/tools/ | grep -i schema` returns only `interaction-schemas.ts`, which is unrelated.

Cheap to add, and it makes every other graph tool more usable by an agent that did not write them.

### 3. Multi-language code-graph depth — **source-better**

|                                    | Harness                                                                                                   | codebase-memory-mcp                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Languages with semantic resolution | **6** — `typescript, javascript, python, go, rust, java` (`packages/core/src/code-nav/types.ts:4`)        | **13** with Hybrid LSP semantic type resolution                                                    |
| Languages parsed                   | TS-centric; `packages/graph/src/ingest/parsers/` holds only `d2`, `mermaid`, `plantuml` (diagram parsers) | **158** via vendored tree-sitter grammars                                                          |
| Resolution quality                 | not published                                                                                             | benchmarked against 64 repos, tiered Excellent/Good/Functional, ~95% target on idiomatic Python/C# |

This matters specifically for the **External adoption flywheel** track: an adopter on a Kotlin, C#, PHP or Ruby codebase gets a materially thinner graph than a TypeScript adopter, and nothing currently tells them that. It is not a small piece of work, which is exactly why it belongs on the roadmap rather than in a footnote.

### 4. ADR management as a programmatic tool — **uncovered (narrow)**

`manage_adr` gives CRUD over Architecture Decision Records through MCP. Harness has `harness:adr-fleet` and `harness:architecture-advisor` (skills) and a `DecisionIngestor` (graph), but no ADR CRUD tool — so ADR authoring is skill-mediated prose, never a structured call. Narrower than the three above, and adjacent to work `adr-fleet` already owns.

## Where harness is clearly ahead

Worth recording, because it is the other half of the question and it is where most of the list lands.

| Feature area                 | Best external version                                                                                                         | Harness equivalent                                                                                                                                                           | Verdict                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Post-implementation review   | Google Conductor (5 categories, severity-ranked); `oh-my-claudecode` `code-reviewer` + `critic`; `gstack` `review`            | `harness:code-review` + `run_ci_review` + 7 specialist review agents + `check_traceability` + adversarial reviewer                                                           | **harness-better** — multi-persona, gated, traceability-linked                                              |
| Architecture enforcement     | `mattpocock` `improve-codebase-architecture`, `codebase-design`; `gstack` `cso`                                               | `enforce-architecture`, ESLint layer rules, `.harness/arch/baselines.json`, `ArchBaselineManager`, boundary validators                                                       | **harness-better** — the only one with mechanical enforcement + baselines                                   |
| Design quality               | `impeccable` (59 detectors, 23 commands); `emilkowalski` (animation judgment)                                                 | `design-craft` (CRITIQUE/POLISH/BENCHMARK, machine-computed `awardBar`), `detect-design-drift`, `audit-brand-compliance`, `audit-component-anatomy`, `harness-accessibility` | **harness-better** on enforcement + scoring rigor; see below for the one gap                                |
| Test authoring/health        | `gstack` `canary`, `qa`, `qa-only`; `oh-my-claudecode` `ultraqa`, `test-engineer`                                             | Canary plugin (framework registry, flake-hunter, healer, reviewer, ci-ready, pr-guardian), `test-craft`, `test-advisor`, `tdd`                                               | **harness-better** — substantially deeper                                                                   |
| Autonomous multi-agent loops | `oh-my-claudecode` `autopilot`/`ralph`/`ralplan`/`ultrawork`/`ultragoal`; `symphony`; `gstack` `autoplan`                     | `harness:autopilot`, the 7-member `-fleet` family, `fleet-command`, worktree isolation, never-auto-merge discipline                                                          | **harness-better** — verification-gated rather than persistence-gated                                       |
| Skill self-improvement       | `OpenSpace` (outcome telemetry, lineage); `oh-my-claudecode` `self-improve`/`learner`/`skillify`; `gstack` `learn`/`skillify` | `emit_skill_proposal`, `create_skill`, `catalog-retrospective`, `advise_skills`, adoption telemetry, trust scoring                                                           | **parity** — harness measures more, closes the retrieval loop less (already filed)                          |
| Spec/ticket generation       | `mattpocock` `to-spec`, `to-tickets`, `wayfinder`                                                                             | `brainstorming`, `product-requirements`, `product-advisor`, `roadmap`, `issue-fleet`                                                                                         | **harness-better** — full BRD→PRD→spec→roadmap chain                                                        |
| Usage/cost HUD               | `oh-my-claudecode` `hud`; `caveman` `/caveman-stats`                                                                          | `packages/burn` + `harness:burn-hud` (requestId dedup, weighted units, trailing-baseline pace)                                                                               | **harness-better** — refuses to fabricate a quota number                                                    |
| Session context persistence  | `gstack` `context-save`/`context-restore`; `mattpocock` `handoff`/`claude-handoff`                                            | `summarize_session`, `search_sessions`, session-scoped state, event-sourced `manage_state`                                                                                   | **parity** — harness richer but has no explicit save/restore verb                                           |
| Merge readiness              | `oh-my-claudecode` `merge-readiness`                                                                                          | `pre-merge-brief`, `release-readiness`, `integrity`, `holiday-confidence` KPI                                                                                                | **harness-better**                                                                                          |
| Visual verification          | `oh-my-claudecode` `visual-verdict`; `gstack` `design-review`, `ios-design-review`                                            | `harness-visual-regression`, `design-craft` BENCHMARK deep mode (vision-LLM)                                                                                                 | **parity**                                                                                                  |
| Browser automation           | `gstack` `browse` (full CDP driver, terminal-agent, 14 test files), `scrape`, `setup-browser-cookies`                         | Playwright MCP available; no harness-owned browser skill                                                                                                                     | **source-better**, but out of scope — harness is not a browser-automation tool                              |
| Diagram generation           | `fireworks-tech-graph` (7 styles, UML); `gstack` `diagram`                                                                    | `generate_blueprint`, graph diagram parsers (`d2`/`mermaid`/`plantuml`), `docs-craft`                                                                                        | **parity**                                                                                                  |
| Literate/narrative docs      | `litprog-skill` weave/tangle + PostToolUse reverse-sync                                                                       | `docs-pipeline`, `detect-doc-drift`, `check_docs`, `documentation-maintainer`                                                                                                | **harness-better** on drift detection; `litprog`'s reverse-sync _prevention_ is a different bet, unlicensed |

## Smaller uncovered features found, not worth rows on their own

Recorded so the next pass does not rediscover them.

| Feature                                                                            | Source                | Note                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `freeze` / `unfreeze`                                                              | `gstack`              | Code-freeze gate. No harness equivalent. Plausibly useful near a release, but `release-readiness` covers most of the intent.                         |
| `design-shotgun`                                                                   | `gstack`              | Generates multiple competing design variants at once. `design-craft` POLISH is single-path. Genuinely uncovered; small.                              |
| `plan-ceo-review` / `plan-design-review` / `plan-devex-review` / `plan-eng-review` | `gstack`              | Role-lens review of a _plan_ (not code). Harness reviews code by persona and plans by `soundness-review` — the role-lens-on-plan angle is uncovered. |
| `office-hours`, `retro`                                                            | `gstack`              | `retro` overlaps `harness:compound` and `catalog-retrospective`.                                                                                     |
| `deep-interview`                                                                   | `oh-my-claudecode`    | Reinforces the already-filed frontier-interview row.                                                                                                 |
| `ai-slop-cleaner`                                                                  | `oh-my-claudecode`    | Second independent implementation of the impeccable idea; reinforces the already-filed detector row.                                                 |
| `wait-what`, `teach`, `to-questionnaire`, `writing-for-agents`                     | `mattpocock`          | Communication/pedagogy skills. Out of harness's scope.                                                                                               |
| `resolving-merge-conflicts`                                                        | `mattpocock`          | No core-harness equivalent (a Capwell skill covers it downstream).                                                                                   |
| 43 client surfaces auto-detected                                                   | `codebase-memory-mcp` | vs harness's 5 (Claude Code, Cursor, Codex, Gemini CLI, OpenCode). A portability benchmark, not a feature to copy.                                   |
| `trajectory.ndjson` leak diagnostics                                               | `codebase-memory-mcp` | Operational discipline worth imitating in harness's own daemon, not a product feature.                                                               |

## Corrections this pass makes to the source-level triage

1. **`codebase-memory-mcp` was under-analyzed.** The triage judged it on its benchmark and recommended "benchmark against, don't adopt." Its **15 MCP tools** contain three capabilities harness lacks outright (`ingest_traces`, `get_graph_schema`, `manage_adr`) plus a large language-coverage advantage. The verdict should have been "benchmark against **and** harvest three tools."
2. **`gstack` was dismissed too fast.** "Same loop harness already runs" is true of its spine and false of its edges — `browse`, `design-shotgun`, `freeze`, and the four `plan-*-review` role lenses are all outside harness.
3. **`oh-my-claudecode` yielded more than model routing.** 40 skills, of which `deep-interview` and `ai-slop-cleaner` independently corroborate two rows already filed.
4. **`impeccable`'s detectors are now read** — see the section below. The count is **59**, not the advertised 58, and the corpus splits cleanly in a way that reverses my original objection to adopting it.

## impeccable's detector corpus, read in full

Source: `.agents/skills/impeccable/scripts/detector/registry/antipatterns.mjs` (617 lines, Apache-2.0). Each entry is structured — `id`, `category`, optional `scopes`, optional `severity`, `name`, `description`, and a `skillSection` / `skillGuideline` back-reference into the prose skill. That is a real rule registry, directly comparable in shape to harness's `DRIFT-*` / `BRAND-*` codes.

**59 detectors, split 32 `slop` / 27 `quality`. The split is the finding.**

The original ideation row (#1275) carried this objection: _"58 noisy taste rules will land, signal-to-noise collapses, and the check gets disabled."_ That is **only true of half the corpus.**

**The 27 `quality` detectors are mechanical, not taste-based** — objectively checkable, low false-positive risk:

`low-contrast`, `gray-on-color`, `text-occlusion`, `text-overflow`, `clipped-overflow-container`, `content-hidden-at-rest`, `first-viewport-column-overflow`, `body-text-viewport-edge`, `edge-flush-cards`, `cramped-padding`, `line-length`, `tight-leading`, `wide-tracking`, `tiny-text`, `undersized-ui-text`, `all-caps-body`, `justified-text`, `skipped-heading`, `heading-rhythm`, `repeated-container-text`, `broken-image`, `script-error`, `layout-transition`, plus the four `design-system-*` checks.

Several are straight accessibility (`low-contrast`, `skipped-heading`, `tiny-text`, `justified-text`) and overlap `harness-accessibility`. Two are hard errors, correctly marked `severity: 'error'` — `script-error` and `content-hidden-at-rest`.

**Four already duplicate harness exactly.** `design-system-font`, `design-system-color`, `design-system-radius`, `design-system-font-size` are token-bypass detection — the same job as `DRIFT-T001/T002/T003`. Adopting these would be duplication, and their presence confirms harness's existing drift codes target the right thing.

**The 32 `slop` detectors are taste**, and this is where the original objection holds: `cream-palette`, `ai-color-palette`, `italic-serif-display`, `overused-font` (names Inter, Roboto, Geist, Plus Jakarta Sans, Space Grotesk), `em-dash-overuse`, `marketing-buzzword`, `aphoristic-cadence`, `theater-slop-phrase`, `hero-eyebrow-chip`, `kicker-above-heading`.

Two further cautions on this half:

- **Four are model-specific tells that will date fast** — `gpt-thin-border-wide-shadow`, `codex-grid-background`, `blinking-cursor`, `shape-assembled-illustration`. All four are already marked `advisory`, which is honest of them, but a rule keyed to one model's 2026 defaults is a maintenance liability.
- **Three are copy rules, not design rules** — `em-dash-overuse`, `marketing-buzzword`, `aphoristic-cadence`, `theater-slop-phrase` belong with `harness:copy-craft` and `audit-brand-compliance`'s `voice.forbidden_phrases` (BRAND-V001), not with design drift.

**Two mechanisms worth taking regardless of which rules get adopted:**

1. **`scopes`** — detectors tag themselves `type` / `layout`, enabling a scoped run instead of all-or-nothing. Harness's drift checks have no equivalent scoping.
2. **`severity` tiers** — `error` / `default` / `advisory` per rule, letting taste rules ship as advisory while mechanical ones block. This is exactly the confidence discipline `security-craft` already applies, and the mechanism that would have answered the original objection.

**Revised recommendation for #1275:** split it. The 23 non-duplicate `quality` detectors are a safe, mechanical adoption sized like a normal feature. The 32 `slop` detectors should ship advisory-only, if at all, minus the copy rules which belong to `copy-craft`. The `scopes` + `severity` mechanisms are worth more than most of the individual rules.

## Additional roadmap rows filed from this pass

All five were filed 2026-08-10 into the Intake milestone.

| Feature                                                         | Verdict       | I/C/E | Score | Issue |
| --------------------------------------------------------------- | ------------- | ----- | ----- | ----- |
| Graph schema introspection tool                                 | uncovered     | M/H/L | 6.00  | #1280 |
| Role-lens plan review (`plan-*-review` shape)                   | uncovered     | M/M/L | 4.00  | #1281 |
| Runtime-trace ingestion validating graph edges                  | uncovered     | H/M/M | 3.00  | #1282 |
| ADR CRUD as an MCP tool                                         | uncovered     | L/H/L | 3.00  | #1283 |
| Multi-language code-graph coverage + published resolution tiers | source-better | H/M/H | 2.00  | #1284 |

Issue numbers verified against `gh issue list` and each shard's `External-ID` field.

**Third defect, found while verifying the above:** the `#1284` row's shard was written **truncated** — `Assignee`, `Priority` and `External-ID` were all absent, while the GitHub issue itself was created successfully. So the issue existed with nothing linking the row to it, which silently breaks merge-triggered auto-done for that row (the reconciler matches on `External-ID`). Repaired by hand. This is a distinct failure from the two mutation defects below: here the write to the _new_ shard was incomplete rather than a write to the wrong shard.

## Defect found while filing (reproducible)

`manage_roadmap add` mutates rows it was not asked to touch. Observed twice, with an **identical signature both times** — once while filing the 9 rows on 2026-08-09 and again while filing these 5 on 2026-08-10:

- **Assignee wiped** on `craft-fleet`, `fleet-command`, `ideate-fleet` — `Chad Warner` to em-dash
- **Status silently promoted** on `design-fleet`, `docs-fleet`, `knowledge-fleet`, `perf-fleet` — `backlog` to `planned`

Both batches were reverted before commit, so neither PR carries the damage. The defect itself is unfixed. It is a recurrence of the previously-fixed status-corruption behaviour, now in the `add` path rather than `sync`, and it matters more than a normal data bug because `manage_roadmap` runs unattended inside the `-fleet` family — a fleet run that files rows would corrupt assignees and statuses with no human watching the diff.

Reproduction: run `manage_roadmap add` with any new feature against a sharded roadmap and diff `docs/roadmap.d/`.
