# @harness-engineering/cli

## 12.1.0

### Minor Changes

- 9f53c25: Bound detailed-mode output of the graph retrieval MCP tools on hub (high-degree) nodes (issue #1591). The token-savings benchmark (#1271) found `get_impact` / `query_graph` / `compute_blast_radius` detailed-mode payloads on hub nodes were unbounded — serializing to ~293M / ~4.47M tokens and able to overflow an agent's context. Each detailed-mode response array is now capped by a configurable item ceiling (`graph.detailedMode.maxItems`, default `DEFAULT_GRAPH_DETAIL_CEILING = 200`). When output is truncated the response fails soft with `truncated: true` plus a `continuation` signal (naming the ceiling, totals available, and how to page or scope down) instead of silently returning a giant payload. Small nodes below the ceiling are unchanged. Adds the `boundItems` helper to `@harness-engineering/core`.
- 43212b3: Add an invoking-skill attribution cut to burn so its breakdown reconciles with Claude
  Code's `/usage`. burn previously grouped subagent spend only by agent TYPE
  (`attributionAgent`), while `/usage` groups the same spend by the SKILL that spawned it
  (`harness:roadmap-fleet`, `harness:autopilot`, …), so the two views could never
  reconcile — `/usage` showed rows burn had no equivalent for. Each turn now also records
  `invokingSkill` (derived from the transcript's `attributionSkill`, already a
  fully-qualified `plugin:skill` value), the summary carries a `skills` block alongside
  `agents`, and `harness burn report` leads with a `by invoking skill` section that states
  its window (week-to-date vs `/usage`'s last-24h) so a mismatch reads as a different
  question, not a wrong number. Both cuts coexist and partition the same weekly total. A
  turn with no readable skill is grouped honestly as `unattributed-skill` (never dropped,
  never fabricated); legacy rows are `pre-migration`. The `usage.tsv` store widened from
  nine to ten columns with a `STORE_VERSION` bump that forces one re-derivation from
  transcripts on disk. burn's default window is unchanged.
- 427dfb4: Add the compiled comprehension substrate (#1558): a persistent, incrementally
  recompiled per-module comprehension layer (LLM summary + invariants, static
  interface contract + dependency slice) served to agents as primary context.
  - `@harness-engineering/core`: the pure, IO/provider-injected compiler + store —
    `compileModule`, `ComprehensionStore`, `computeSourceHash` (membership-folded
    full SHA-256), markdown+frontmatter (de)serialization, the LLM-free serve-time
    hash gate (`serveGate`), and the `createNodeModuleSourceReader` canonical
    enumeration.
  - `@harness-engineering/cli`: the `harness comprehend` command
    (`--changed`/`--all`/`--check`/`--stats`), the `get_comprehension` MCP tool, the
    default-on `comprehension` constituent in `gather_context`, the static extractor
    and semantic-generation adapter, and a `claude`-CLI fallback appended to the
    analysis-provider resolver (ADR 0106 — strictly additive; also repairs
    `acceptance_eval`/`outcome_eval` for subscription users).
  - `@harness-engineering/orchestrator`: dispatch-time pre-warm of a leaf's
    blast-radius comprehension units and served-unit attribution into the
    per-leaf context budget (#1524).

  Correctness never requires a credential: the serve-time hash gate, `--check`, and
  `--stats` are LLM-free, and semantic generation degrades to static-only when no
  provider resolves.

- 18d3572: Join burn's per-lane/per-skill token attribution to shipped PRs — cost per merged PR (#1522). New `harness burn per-pr` reuses burn's existing transcript scan (per `agentId` lane and `agent` skill from #1270), reads the lane provenance files under `docs/changes/*/provenance.json`, and resolves each issue to its merged PR(s) via `gh`, then emits `{tokens_in, tokens_out, cache_read, prs_merged, cost_per_pr}` per lane and per skill into `.harness/metrics/cost-per-pr.json`. Both denominators — `cost_per_merged_pr` and `cost_per_dispatched_lane` — are carried side by side with a `denominator_note`, so the figure is never a silent success-only number. Raw tokens are the source-of-truth metric; a `$` figure is derived only when an adopter supplies an optional `cost_price_table` (default off, no hardcoded pricing). A `cost_bands` config enables a per-skill cost-regression check, the cost analogue of a performance budget. Missing linkage degrades to `unattributed` (never 0/free), matching #1270's discipline.
- ba9877f: Surface a dollar-cost figure on the budget/burn output (Refs #1525). When an adopter configures a burn `cost_price_table` (the per-model USD-per-token table #1522 already established), `buildSummary` now reconciles the current week's accrued token spend to USD and attaches an optional `cost` block (`usd_wtd`, `models_priced`, `models_total`) to the summary, and `harness fleet budget-check` renders/emits the spend, remaining, and envelope in `$` alongside the existing burn-units verdict (remaining/envelope derived from the week's observed `$`/unit rate). Tokens remain the source of truth; the `$` figure is derived only when a price table is configured — with no table the summary and command output are byte-identical. The token→USD arithmetic is reused via a single exported `priceRecord` helper (no second pricing mechanism), and there is no bundled provider pricing, keeping the primary number portable across model mixes. The cron scheduler (#1405) and dashboard-UI slices of #1525 remain deferred.
- d64e63b: Spend-govern the skill/fleet-command dispatch path, not just the orchestrator engine
  (#1600). #1525's per-period token spend envelope previously enforced only inside the
  orchestrator engine's `state-machine.ts` dispatch loop; skill-driven fleet fan-out
  (`/harness:roadmap-fleet`, `fleet-command`) was bounded by a leaf-SLOT cap only, never a
  spend cap, so a single coordinated run could burn unbounded tokens.

  The spend-vs-envelope comparison is now a shared, pure primitive in
  `@harness-engineering/core` (`fleet/spend-budget`: `isGlobalEnvelopeExhausted`,
  `isFleetAllocationExhausted`, `evaluateSpendEnvelope`), with its shapes in
  `@harness-engineering/types` (`fleet-spend-budget.ts`) — mirroring how the per-leaf
  context budget spans both paths. The orchestrator's `budget-governor` delegates its
  exhaustion predicates to it, and a new concrete callable, `harness fleet budget-check`,
  is the DISPATCH-time consult the fleet-family / `fleet-command` contract invokes before
  scheduling each lane: it reads observed spend from burn's existing per-fleet/per-lane
  attribution (#1270) and reports `within | exhausted | unconfigured` (exit `10` on
  exhausted), stopping clean at a lane boundary when the envelope is spent. No-op and
  byte-identical when unconfigured.

- 2537989: Add the answer-quality axis to `harness graph bench` (deferred slice of #1271). The
  benchmark measured two objective axes — retrieval tokens and tool calls — but the
  comparator's third axis, **answer quality** (whether the retrieved payload actually
  suffices to answer the query), was deferred. It now ships as an opt-in `--judge` flag:
  an LLM judge grades each strategy's payload for retrieval sufficiency, reusing the shared
  harness eval/judge plumbing (`resolveAnalysisProvider` → Anthropic key or a local `/v1`
  endpoint, the same resolver `outcome_eval`/`acceptance_eval` use) rather than a bespoke
  judge.

  The axis is **advisory and degrades honestly**: with no judge provider configured it
  reports `answerQuality.status: "inconclusive"` instead of fabricating a score, and it
  never fails the benchmark — the token/tool-call axes stand regardless. Off by default
  (`status: "skipped"`), so the deterministic headline and CI runs are unchanged. The JSON
  result gains an `answerQuality` block (per-strategy sufficiency counts) and each scenario
  gains a `quality` grade plus the exact `query` the judge was asked; `harness graph bench
--judge --json` lets a reviewer trace bench → judge → score. Also fixes a pre-existing bug
  where the program-global `--json` option shadowed `graph bench --json`. `Refs #1271`.

- 127531a: Add Louvain community detection over the knowledge graph. A new pluggable `CommunityDetector` interface with a self-contained `LouvainDetector` implementation partitions the graph into communities by maximizing modularity (undirected, confidence-weighted), and `detectCommunities` labels each node with its community id via a new optional, back-compatible `GraphNode.community` field. The pass is wired into `graph scan` (after ingest/link, before save) so labels persist through the Serializer and the scan output reports the community count. Detection is deterministic given a seed/tie-break order. Leiden is deferred behind the same interface as a follow-up.
- bcd6047: Add an optional `provenance` enum (`EXTRACTED | INFERRED | AMBIGUOUS`) on `GraphEdge`, set at ingest time so downstream adapters can distinguish relationships read directly from source from resolver/heuristic-derived ones. `CodeIngestor` stamps AST-explicit `contains` edges and the `@req`-annotation `verified_by` edge as `EXTRACTED`, and resolver-derived `imports`/`calls` edges as `INFERRED`; `TopologicalLinker` stamps directory-grouped module `contains` edges as `INFERRED`. The field is optional and back-compatible — existing edges without provenance still validate and round-trip through the store and NDJSON serializer.

  The `get_relationships` MCP tool now consumes the field: it passes per-edge `provenance` through in detailed mode and adds a derived `provenanceBreakdown` (counts of `EXTRACTED`/`INFERRED`/`AMBIGUOUS`) to both summary and detailed responses, omitted gracefully for legacy graphs whose edges carry no provenance.

- b23c933: Add a `shortestPath(a, b)` query primitive to ContextQL. `GraphStore.shortestPath`
  performs an unweighted BFS between two arbitrary nodes and returns the ordered
  node/edge path (or `null` when unreachable); `ContextQL.shortestPath` exposes it
  as a query-primitive surface. The NLQ layer gains a `shortestPath` intent
  (source + target extraction, surfaced through `ask_graph`), and the CLI gains a
  `harness graph path <sourceNodeId> <targetNodeId>` verb with a `--direction`
  option. Traces to ADR 0104 (Option-A capability port).
- af249d0: Add a reproducible graph token-savings benchmark (`harness graph bench` / `pnpm run bench:graph-tokens`, issue #1271). It measures two objective, deterministic axes — retrieval tokens and tool calls — for graph-scoped retrieval (the real shipped `get_impact` / `compute_blast_radius` / `query_graph` / `code_outline` / `find_context_for` / `ask_graph` handlers, in their context-scoping density modes) versus a naive filesystem search + full-file-read baseline, on the project's own graph. On this repo it measures 26.5× fewer tokens and 44.5× fewer tool calls overall (find-context is an honestly-reported 0.72× loss; detailed-mode payloads on hub nodes are a documented worst-case finding). The methodology and recorded number are published under `docs/benchmarks/graph-token-savings/`. Answer quality (the comparator's 83% axis) and a multi-repo corpus are documented as deferred slices.
- 406ef87: Add `harness init --tier minimal` (ADR 0101): a load-bearing floor below the existing adoption ladder mapped one-to-one to the field's 5-item Minimum Viable Harness. It scaffolds exactly five artifacts — a generated `AGENTS.md` repo guide, a `harness.config.json` wiring `harness check-arch` as the runnable local check, a seeded `.harness/arch/baselines.json` making one hard architectural rule (a cyclomatic-complexity cap of 15) fail-closed, a git pre-commit verification loop that runs the check, and the `block-no-verify` permission boundary — then prints an explicit, ordered upgrade path to the fuller tiers. STRATEGY.md, framework selection, design system, and MCP integration are deferred (not skipped); re-running init at a higher tier is additive over a `minimal` install. Degrades gracefully outside a git repo. `--tier` also accepts `basic`/`intermediate`/`load-bearing-minimum`/`advanced`, delegating to the existing level scaffold.
- 33acf07: Extend the context-replay budget (#1524) onto the harness MCP server path so it
  reaches manual AI sessions, not just orchestrator dispatch (#1594). Manual
  sessions (Claude Code / Cursor / Codex / Gemini running against the harness MCP
  server) are where the cache-read replay cost that motivated the budget actually
  lives, and until now the budget missed them entirely.
  - `@harness-engineering/core` (`fleet/context-budget`): `evaluateSessionContextBudget`
    and the `SessionBudgetSignal` shape. It **delegates the over/under decision to the
    existing `enforceLeafContextBudget`** — ONE shared budget implementation for
    orchestrator dispatch and manual sessions — but manual sessions WARN (return a
    non-throwing signal carrying a steer notice) rather than reject-at-dispatch.
  - `@harness-engineering/cli`: new MCP middleware `applyContextBudget` /
    `wrapWithContextBudget`, wired into `createHarnessServer` after compaction. When
    `mcp.contextBudget.maxTokens` is configured, an over-budget tool response gets a
    loud steer notice appended pointing the session at graph-scoped retrieval
    (`code_outline` / `code_unfold` / `find_context_for`). **Absent ⇒ handlers are
    returned unwrapped** — MCP behavior is byte-identical when unconfigured.

- 97c3b03: Rule-to-failure provenance linking (ADR 0100) — link every enforced constraint to the
  incident that motivated it.

  Additive, optional, and advisory by design: nothing gates on it, and every existing
  document and rule stays valid with no provenance (fill-forward).
  - `@harness-engineering/types` + `@harness-engineering/core`: optional `enforces?: string[]`
    on the solution-doc frontmatter (`SolutionDocFrontmatter` / `SolutionDocFrontmatterSchema`)
    — the rule ids a `harness-compound` solution produced or hardened.
  - `@harness-engineering/core`: optional `origin?: string` on the `StrengthRule` type (the
    reciprocal back-pointer to a solution slug or issue ref), plus a new `provenance` module
    (`buildProvenanceReport`, `collectSolutionEnforcements`) that joins the two sides.
  - `@harness-engineering/cli`: `harness rules provenance` — an advisory reporter that flags
    unexplained constraints (enforced rules with no origin) and candidate dead rules (a rule
    whose origin resolves to no known solution, or a solution enforcing a STRENGTH id absent
    from the registry). Never exits non-zero on findings; supports `--json`.
  - Producer wiring (ADR 0100 Action Item #4): the `harness-compound` capture phase (Phase 4
    ASSEMBLE, all platform mirrors) now captures the optional `enforces:` list when a fix
    produced or hardened an enforced rule — advisory, fill-forward, never blocks capture. The
    resolution template and human schema mirror document the field.

- 315fe34: feat(validate): scope `harness validate` to the changed surface (`--changed`/`--affected`/`--since`)

  Adds an opt-in affected-only mode to `harness validate`. The design audits
  (detect-drift, audit-brand) walk the whole source tree on every run, which is the
  dominant cost of the most-invoked CLI command (adoption telemetry: `cli/validate` =
  68% of all harness CLI calls). `--changed` (alias `--affected`) derives the changed
  surface from git — the merge-base with the default branch, or an explicit
  `--since <ref>` — and hands just those files to the walkers. The surface is narrowed
  to the source extensions and exclude globs a full sweep would scan, so a scoped run is
  always a subset of a full run (it never reports a finding a full sweep would not). If
  the surface cannot be derived, the run falls back to a full sweep and reports why.
  Bare `harness validate` is unchanged (full sweep) — non-breaking for adopters and
  pre-merge/scheduled/release gates. Every affected run prints what it scoped and the
  staleness caveat, and the scoped-vs-full split is recorded on the `cli/validate`
  adoption record (`variant` field). The orchestrator package's `validate` dev-loop
  script is rewired to `--changed`.

  The same affected-mode is exposed to skills/agents through the MCP `validate_project`
  tool via an opt-in `scope: "affected" | "full"` / `changed` / `since` param — it
  delegates to the same `runValidate` (validate-scope is shared, not forked), and the
  default path stays byte-identical.

### Patch Changes

- 4eb2da5: feat(fleet): cross-run advisory work-claim lease for the ID-based members

  Adds a GitHub-backed advisory work-claim lease so two people running an ID-based
  fleet (`roadmap-fleet`, `issue-fleet`, `pr-fleet`) on different clones auto-partition
  the backlog instead of duplicating work. New `FleetClaim` type in
  `@harness-engineering/types` and a pure, offline `fleet/claims` module in
  `@harness-engineering/core` (`buildClaimBody` / `parseClaimComment` / `isLeaseLive` /
  `resolveClaimWinner` / `classifyClaim` / `selectUnclaimed` + constants). Soft
  reservation with a TTL+heartbeat lease measured off the GitHub server clock; the open
  PR is the durable claim. The `cli` bump is an incidental command-registry regeneration.

- 1c2fafb: feat(graph): deletion-based staleness flag on learning/execution_outcome nodes, surfaced in NLQ

  Ports the deletion slice of Graphify's reflection loop (ADR 0104). Graph nodes now
  carry an optional `StalenessInfo` marker (back-compat) that trips when a cited source
  file no longer exists, a new NLQ `staleness` intent lists stale learnings, and
  `flagStaleLearningNodes` (core) reuses `detectStaleLearnings` to stamp the marker
  during `harness graph scan`. Move/rename detection is deferred.

- da198b4: Ignore three generated `.harness/` runtime artifacts that were leaking into working trees, for this repo and for adopters: `craft/` (generated craft-run records), `spill/` (generated overflow/spill artifacts), and all `tokens.json*` variants (widened from `tokens.json` so siblings like `tokens.json.disabled` are ignored too). The adopter-facing generator (`packages/cli/src/templates/post-write.ts`) adds these to its canonical `.harness/.gitignore` set, so existing adopter installs get the new lines appended on the next `harness init` / `init_project` run.
- Updated dependencies [9f53c25]
- Updated dependencies [43212b3]
- Updated dependencies [ab1c981]
- Updated dependencies [1a40ca1]
- Updated dependencies [427dfb4]
- Updated dependencies [6ba006f]
- Updated dependencies [18d3572]
- Updated dependencies [ba9877f]
- Updated dependencies [b29d033]
- Updated dependencies [d64e63b]
- Updated dependencies [4eb2da5]
- Updated dependencies [127531a]
- Updated dependencies [bcd6047]
- Updated dependencies [1c2fafb]
- Updated dependencies [eafbd15]
- Updated dependencies [b23c933]
- Updated dependencies [33acf07]
- Updated dependencies [8cf33f6]
- Updated dependencies [32a104c]
- Updated dependencies [97c3b03]
- Updated dependencies [315fe34]
- Updated dependencies [37b1be7]
- Updated dependencies [3646500]
  - @harness-engineering/core@0.45.0
  - @harness-engineering/burn@0.3.0
  - @harness-engineering/intelligence@0.12.1
  - @harness-engineering/orchestrator@0.22.0
  - @harness-engineering/types@0.31.0
  - @harness-engineering/graph@0.14.0
  - @harness-engineering/dashboard@0.16.3
  - @harness-engineering/signals@0.3.6

## 12.0.0

### Minor Changes

- 7a8848d: Enforce capability-seam roles with a structured field + single-role detector (#1425).

  Adds an optional `capabilityRoles` field to `skill.yaml` frontmatter —
  `{ definition: string; providers: string[]; consumers: string[] }` — so a skill can
  promote its Service-Definition / Provider / Consumer roles from prose (shipped in
  #1418) to machine-checkable data. A new detector in `harness skill validate` flags any
  skill whose `capabilityRoles` is _declared_ but fills only ONE of the three roles (or
  none) — accidental single-implementation lock-in dressed up as an extension point.

  The field is optional: skills that omit it abstain (no finding), so the ~789 existing
  skills are unaffected — no forced retrofit. Two or three filled roles pass; the
  mechanical floor fires only on the unambiguous single-role red flag and the empty
  declaration. Field names mirror the `harness-skill-authoring` Phase 1C prose. The core
  detection is a pure exported `capabilityRoleErrors()` colocated with the existing
  capability-envelope checker.

- 936c76b: Give design-craft BENCHMARK a real vision channel so the award bar is reachable.

  BENCHMARK previously scored source **code** (`callText`), and `callVision` threw on
  every provider with no image support in `@harness-engineering/intelligence` — so
  `innovation` / `philosophicalCoherence` / surface could never be honestly judged and the
  award verdict was structurally never `cleared`.
  - `@harness-engineering/intelligence`: `AnalysisRequest.images` + Anthropic image content
    blocks; `claude-cli` image support via the `--input-format stream-json` transport.
  - `@harness-engineering/cli`: real `AnalysisProviderAdapter.callVision` gated by a
    `supportsVision` capability flag (a non-vision backend throws instead of silently
    scoring a blank page); `runVisionBenchmark` scores the rendered screenshot; the
    `design_craft` tool routes deep-mode benchmark to it and requires a capture per
    page-scoped target.

  Validated end-to-end against the real local `claude` CLI: the model reads images,
  discriminates a strong page from a flat one, and a full-page strong capture clears all
  five dimensions.

- 9223f18: Add an advisory SKILL.md instruction-density check to `harness validate`.

  HumanLayer's RPI→CRISPY postmortem identified a ~150-200 instruction-follow budget as the
  ceiling that, once exceeded, forced a full workflow rebuild. `harness validate` now
  estimates the imperative-instruction count (numbered steps + imperative-verb bullets +
  `MUST`/`SHALL`/`REQUIRED` directives) at each context-budget packing level `run_skill`
  loads, and surfaces a non-blocking `SKILL-DENSITY` warning when a loaded level exceeds the
  budget (default 175, configurable via `skills.instructionBudget`). Because progressive
  disclosure is the mitigation being validated, density is measured per cumulative packing
  level rather than over the whole file. The check is advisory only — it never fails the
  gate. `harness-skill-authoring` gains a matching guidance note.

  New core exports: `countImperativeInstructions`, `analyzeSkillInstructionDensity`,
  `DEFAULT_INSTRUCTION_BUDGET`.

- 847cced: Add a general cross-skill lifecycle-hook framework: a new top-level `skillHooks`
  block in `harness.config.json` lets a project attach additional **skills**,
  **commands**, and **prompts** at lifecycle points of any hook-supporting
  orchestrator skill. Hooks are keyed by skill name and an event string
  (`before:/after:<phase>`, `before:run`/`after:run`, or `on:<event>` such as
  `on:failure`). Entries are a bare skill-name string or a discriminated
  `{type: "skill" | "prompt" | "command"}` object, each with an optional `enabled`
  toggle; `command`/`skill` hooks receive an env + stdin (or subagent-brief) input
  context. Resolution/normalization is shared in `@harness-engineering/core`
  (`resolveSkillHooks` + hook-context helpers). An unresolvable skill or
  un-spawnable command is a hard halt (false-green protection), never a silent
  skip. `harness-autopilot` (review + non-review + `on:failure`) and
  `harness-code-review` (`after:mechanical`) are the wired reference consumers.

  This **supersedes** the unreleased `review.additionalSkills` field, which is
  removed — express it as `skillHooks["harness-autopilot"]["after:REVIEW"]` and
  `["after:FINAL_REVIEW"]`. Closes #1481.

### Patch Changes

- 00a4fe4: usage daily: accept `--limit <n>` as the canonical "how many rows" flag (matching `usage sessions --limit`). `--days <n>` keeps working as a hidden, deprecated alias that prints a one-line deprecation notice to stderr. Non-breaking; no subcommands renamed.
- Updated dependencies [c81c872]
- Updated dependencies [9629e01]
- Updated dependencies [44ad077]
- Updated dependencies [483791e]
- Updated dependencies [936c76b]
- Updated dependencies [fed338f]
- Updated dependencies [9223f18]
- Updated dependencies [847cced]
- Updated dependencies [0dda585]
  - @harness-engineering/orchestrator@0.21.4
  - @harness-engineering/core@0.44.0
  - @harness-engineering/dashboard@0.16.2
  - @harness-engineering/intelligence@0.12.0
  - @harness-engineering/graph@0.13.2
  - @harness-engineering/signals@0.3.5

## 11.3.0

### Minor Changes

- af18bfc: feat(mcp): add `manage_adr` tool for programmatic ADR CRUD. Exposes Architecture Decision Records (`docs/knowledge/decisions/NNNN-<slug>.md`) as a structured MCP tool with create / read / update / list actions, symmetric to `manage_roadmap`. `create` allocates the next collision-free ADR number (`max(existing)+1`, zero-padded) — the scheme required by the known number-collision defect (#1323) — and writes a well-formed record with Context/Decision/Consequences sections at `status: proposed` by default. `read` resolves by number, slug, or filename; `update` patches frontmatter and body sections without ever reusing a number. Until now ADRs were only reachable through skill-mediated prose (`adr-fleet`, `architecture-advisor`); the tool is now exposed in the `standard` MCP tool tier (alongside `manage_roadmap`) and adopted as the canonical ADR write path in the `adr-fleet` and `architecture-advisor` skills.
- 2f44277: feat(architecture): honor exclude patterns in the architecture collectors

  `check-arch` measured every `.ts` file the walkers could reach, with no way to
  scope discovery. Projects that contain source whose SHAPE is imposed by an
  external runtime — sandboxed dataflow/edge scripts that cannot import shared
  helpers and must inline everything into a single function — had no way to keep
  those files out of the complexity aggregate. Because the ratchet compares
  aggregates, a handful of such files can hold the entire gate red indefinitely,
  and no amount of good work on the branch can clear it. This is the same defect
  class as #594 (arch scanning built `dist/`), where discovery scope, not the
  threshold, was the problem.

  `architecture.excludePatterns` takes minimatch globs matched against the
  project-relative POSIX path, mirroring `ingest.excludePatterns`. Patterns are
  ADDITIVE: `DEFAULT_FIND_FILES_IGNORE` and `DEFAULT_SKIP_DIRS` still apply, so
  setting one pattern never re-enables scanning of `node_modules` or `dist`. The
  CLI additionally stacks the project-wide `analysis.exclude` list onto the arch
  config, making `check-arch` consistent with the other analysis scanners that
  already honor it.

  Wired into the three glob-based collectors (complexity, circular-deps, coupling)
  and the two directory walkers (module-size, dep-depth). `layer-violations` and
  `forbidden-imports` route through `validateDependencies` and are unchanged.
  Defaults to `[]`, so behavior is identical for every existing config.

- 510bdab: feat(context): add context-surface attribution report with exact token counts. Classifies the always-loaded context surface as always-loaded / path-scoped / invoked-only, ranks the top contributors, and derives over-budget flags from the (now live-wired) `contextBudget()` allocator. New core exports: `buildAttributionReport`, `heuristicTokenCounter`, `createAnthropicTokenCounter`, `resolveTokenCounter`, plus the `ContextClass` / `ContextSurfaceEntry` / `AttributionReport` types. Exact token counts come from Anthropic's `/v1/messages/count_tokens` endpoint, degrading gracefully to the `chars / 4` heuristic when no API key / offline / on request failure (never hard-fails). New CLI command `harness mcp context-report [--tier core|standard|full] [--exact] [--window <n>] [--top <n>] [--no-skills] [--json]` measures the harness's real surface (MCP tool schemas per tier, AGENTS.md, hooks, the four platform skill trees). Wires the previously-dead `contextBudget()` allocator into a live, tested code path.
- b2514d2: feat(cli): make copy/docs/knowledge/security/spec craft skills runnable in an interactive session (#1368)

  The older craft-family inline entries — `runCopyCraft`, `runDocsCraft`,
  `runKnowledgeCraft`, `runSecurityCraft`, and `runSpecCraft` — wrap every
  per-(target, rubric) critique in a bare `catch {}`. Under the default
  in-session provider that swallow ate the `PromptDeferredError` thrown by every
  `callText`, so the run returned `findings: []` with `llmCalls.count: 0` and no
  error: a confident "nothing to critique" for a run in which no LLM call ever
  completed. Each inline entry now refuses the in-session provider up front with a
  loud, actionable error instead of a hollow empty success.

  Rather than only refusing, these five crafts now support the same two-step
  collect → finalize handshake that `code-craft`, `api-craft`, `naming-craft`, and
  `cli-ergonomics-craft` already use, so they run interactively in Claude Code with
  the calling agent as the LLM judge. Each craft gains a `collect<Craft>Prompts`
  step (enumerates the identical (target, rubric) pairs the inline critique loop
  walks, persists run-state to the shared craft runs store, and returns the prompts
  for the calling agent to answer) and a `finalize<Craft>` step (parses the agent's
  fenced-JSON responses back into the craft's finding type). Five new MCP tools —
  `copy_craft_finalize`, `docs_craft_finalize`, `knowledge_craft_finalize`,
  `security_craft_finalize`, and `spec_craft_finalize` — are registered, and the
  `*_craft` collect tools default to in-session mode in Claude Code.

- 8a01138: feat(mcp): route large truncated tool output through spill-to-disk with a recoverable locator (#1398)

  Wire the spill-to-disk primitive into the MCP compaction middleware
  (`wrapWithCompaction`), the single choke point every tool response flows through.
  When a tool's output is large enough to be lossy-truncated by the truncation
  pipeline, the full pre-compaction payload is now offloaded to disk via
  `spillIfNeeded` and a followup-readable `harness-spill:` locator is appended to the
  compacted result, so fleet workers and autopilot sessions can recover or grep the
  complete test log / diff / grep overflow on a later turn (`readSpill` /
  `searchSpill`) instead of losing the truncated tail. Output under the threshold
  passes through unchanged, lossless-only tools are excluded, and spill fails open —
  behavior is unchanged when no project root is available.

- 16d1281: feat(test-craft): make `test_craft` runnable in an interactive session (Claude Code, where the calling agent is the LLM judge). Previously `test-craft` had only the inline `runTestCraft` entry point, which loudly refuses the in-session provider (it defers every prompt, so a run would report zero findings for zero critiques), and had no `test_craft_finalize` tool — so it could only run against a real backend. This adds the same two-step collect → finalize handshake that `code_craft`, `api_craft`, `naming_craft`, and `cli_ergonomics_craft` already have: `test_craft` in `in-session` mode (the default in Claude Code) walks the project, builds one prompt per (test, rubric) pair — the same pairs the inline critique loop uses, including source-pairing — persists run-state to the shared craft runs store under a `runId`, and returns the prompts for the calling agent to answer; the new `test_craft_finalize` tool consumes those responses, parses each fenced-JSON block into a `TestFinding` via the same parser the inline path uses, and returns the standard `TestCraftOutput`. The inline path's in-session guard is retained (its message now points at `collectTestCraftPrompts(...)` / `finalizeTestCraft(...)`), and the `critique` phase's `buildPrompt` / `parseFindingFromRaw` / `CRITIQUE_SYSTEM_PROMPT` are exported so collect and finalize reuse them rather than duplicating logic. `Refs #1368` (the interactive follow-up to the guard bug addressed by #1430).

### Patch Changes

- 2b79436: chore(cleanup): remove dead cli/mcp exports. Un-export six intra-file-only schema constants in `interaction-schemas.ts` (`EffortLevel`, `ConfidenceLevel`, `InteractionQuestionSchema`, `QualityGateCheckSchema`, `QualityGateSchema`, `BatchDecisionSchema`) and delete the unused `__internal__` re-export block in `audit-anatomy.ts`. Pure dead-code removal; no behavior change.
- cdc7f72: fix(adr): add duplicate-`number:` validator for the ADR corpus and grandfather the existing collisions (#1323)

  `harness validate` now scans `docs/knowledge/decisions/*.md` for duplicate
  `number:` frontmatter values — an ambiguous ADR identity silently breaks
  citations and any tooling keyed on the number (the DecisionIngestor, spec
  cross-references). New or changed collisions fail validation; the 10 known
  pre-existing collisions are grandfathered via
  `.harness/decisions/number-baseline.json` and surfaced as a single non-fatal
  warning, so the check adopts without forcing a mass renumber. The corpus is
  left as-is because bare "ADR NNNN" citations across the repo are ambiguous
  between the colliding records; the renumber is tracked as a follow-up.

- 9168a32: fix(knowledge): honor configured docsDir/adrDir and route decision ADRs into the graph
  - #1330: `KnowledgePipelineRunner` no longer hardcodes `docs/knowledge/decisions`,
    `docs/architecture`, and `docs/knowledge`. It now derives those directories from
    new `docsDir`/`adrDir` pipeline options (sourced by the CLI from
    `harness.config.json#docsDir` and `#operationalPolicy.adrDir`), so a project that
    keeps its ADRs at a configured non-default location is no longer silently invisible
    (it reported "0 decisions"). Defaults are preserved when config is unset.
  - #1351: `graph ingest --source knowledge` (and `--all`) now constructs
    `DecisionIngestor` so ADRs under `docs/knowledge/decisions/*.md` and
    architecture-advisor ADRs under `docs/architecture/` become `decision` graph nodes.
    Previously these files entered the graph via no ingestor on this command path, since
    `KnowledgeIngestor.ingestAll` explicitly excludes `docs/knowledge/**`.

- 6f88aff: fix(knowledge): abstain on empty baseline + confidence floor for `--fix`, and report honest extraction counts (#1335, #1340)

  The knowledge pipeline previously reported a healthy-looking `warn` on a
  first run where the graph held no prior `business_*` nodes: every fresh entry
  classified as `new`, the drift score approached 1.0, and the verdict read as
  `WARN` with `0 stale, 0 drifted, 0 contradicting` — indistinguishable from a
  clean incremental run. A zero-denominator baseline is now an explicit
  `abstain` verdict (distinct from `pass`/`warn`/`fail`) threaded from the
  pre-extraction baseline into `computeVerdict`, and the CLI renders an
  unambiguous `ABSTAIN` header with a one-line explanation. The result now
  carries a `baselineEmpty` flag (surfaced in `--json`). (#1335)

  `--fix` materialization into the consumer's tracked `docs/knowledge/` tree is
  now gated on a named confidence floor (`MATERIALIZATION_CONFIDENCE_FLOOR`,
  default `0.5`): low-confidence / comment-derived signals are still reported as
  gaps but no longer written to disk. Human-authored nodes carry no confidence
  and remain trusted, so the floor cannot suppress hand-written knowledge.
  (#1335)

  Extraction now reports the number of signals actually extracted this run
  (`signalsExtracted`) rather than `nodesAdded` (deduped new store insertions),
  which dropped to 0 on a re-scan even while the extractors wrote thousands of
  records — producing a "0 code signals" headline that contradicted a non-empty
  "extracted" gap total. (#1340)

- e981449: fix(naming-craft): reconcile finalize coverage against the collected prompt set (#1339)

  `finalizeNamingCraft` previously accepted a `responses` array covering only a
  fraction of the prompts the paired collect call produced and still emitted a
  normal-looking `NamingCraftOutput` whose summary read as a completed critique
  of the whole scope — a false-green. It now reconciles `responses` against the
  persisted prompt set: a materially short response set is rejected loudly
  (mirroring the two-step-flow guard) unless the caller passes `allowPartial:true`.
  The summary gains an explicit `coverage: { promptsAnswered, promptsTotal }`, and
  on a partial finalize `filesScanned` narrows to only the files actually
  critiqued so it never implies reach over unjudged files.

- e79b0bc: fix(cli): stop truncating piped command output at ~8KB

  Commander writes help/version output with `process.stdout.write` and then exits.
  Writes to a PIPE are asynchronous, so `process.exit()` discarded whatever was
  still buffered: `harness --help` was cut mid-word at 8164 bytes whenever its
  output was piped or captured, losing every command from `knowledge-pipeline`
  onward — including `validate`. Reproducible on macOS, where the pipe drains in
  smaller chunks than on Linux CI, which is why the repo's own
  `tests/integration/cli.test.ts > harness --help > outputs help` assertion fails
  locally while CI stays green.

  Commander's output now goes through a synchronous fd write. The write is looped
  until the buffer drains, because `writeSync` on a non-blocking pipe returns a
  SHORT COUNT rather than throwing — a single call reproduces the same truncation
  it was meant to fix — and retries `EAGAIN` while the reader catches up. Falls
  back to the stream when the fd is unusable (EPIPE from a closed downstream
  reader such as `head`, or a non-fd stdout).

- f833d25: feat(skill-authoring): require Service Definition / Provider / Consumer capability roles

  `harness-skill-authoring` now requires every new MCP tool or skill capability to
  name all three capability-seam roles before it ships: a Service Definition (what it
  DEFINES), at least one Provider (who PROVIDES it), and at least one Consumer (who
  CONSUMES it). A capability with only one role filled is accidental
  single-implementation lock-in dressed up as an extension point.
  - New `Phase 1C: DECLARE CAPABILITY ROLES` section, a "no half-wired capabilities"
    gate, and a matching rationalization in the skill guidance.
  - The `create_skill` scaffold now emits a `## Capability Roles` checklist in the
    generated `SKILL.md`, prompting the author for all three roles.
  - Targeted retrofit: the same `## Capability Roles` block is applied to the existing
    skills that genuinely define a capability seam — the design verifier interface
    (`harness-design-pipeline` over `detect-design-drift` / `audit-component-anatomy` /
    `audit-brand-compliance`), the craft LLM-judgment-critique contract (`craft-fleet`
    over the eleven `*-craft` skills), and the `-fleet` family spine (`fleet-command`
    over the fleet members). Non-seam skills are deliberately left untouched.

- Updated dependencies [2f44277]
- Updated dependencies [4cbb45b]
- Updated dependencies [6c44555]
- Updated dependencies [52e74ac]
- Updated dependencies [727edce]
- Updated dependencies [510bdab]
- Updated dependencies [3af2880]
- Updated dependencies [24b314b]
- Updated dependencies [895cf57]
- Updated dependencies [2b9f987]
- Updated dependencies [cdc7f72]
- Updated dependencies [6ce628c]
- Updated dependencies [9a71452]
- Updated dependencies [9168a32]
- Updated dependencies [523016b]
- Updated dependencies [6f88aff]
- Updated dependencies [9834665]
  - @harness-engineering/core@0.43.0
  - @harness-engineering/types@0.30.0
  - @harness-engineering/dashboard@0.16.1
  - @harness-engineering/orchestrator@0.21.3
  - @harness-engineering/graph@0.13.1
  - @harness-engineering/intelligence@0.11.4
  - @harness-engineering/signals@0.3.4

## 11.2.0

### Minor Changes

- 48cf10e: feat(graph): add `harness graph integrity` and the harness-graph-integrity skill

  `harness graph status` reports how big the graph is, never whether its contents
  can be trusted. Two defect classes live in that gap, and both currently read as
  green:
  - A connector that never authenticated still reports a fresh
    `last synced <timestamp>`, because the status reader narrows each connector's
    `lastResult` to a bare timestamp and discards `errors` and the counts (#1336).
  - The code extractors mint `business_term` nodes out of prose — the canonical
    instance being `enum or { function, const, if, if, if, return }` (#1331). Such
    a node cannot be cleared by re-ingesting; it is re-derived from unchanged
    source on every run.

  Adds `checkGraphIntegrity` to `@harness-engineering/graph` and a
  `harness graph integrity` subcommand that surfaces both, plus the
  `harness-graph-integrity` skill across all four platforms. Following #1146, the
  report carries its denominators and exits `ZERO_DENOMINATOR` when it inspected
  nothing, so an abstention can never be read as a pass.

  Additive only: no existing command, output, or exit code changes.

- d3cf719: feat(graph): add get_graph_schema MCP introspection tool

  New read-only MCP tool `get_graph_schema` returns the knowledge graph's SHAPE so an
  agent can discover it before querying — the missing counterpart to `query_graph`,
  `ask_graph`, `get_relationships`, `search_similar`, `compute_blast_radius`, and
  `find_context_for`, all of which require you to already know the schema.

  It aggregates over the already-persisted node/edge records (no new datastore, no
  scan, no write) and emits a stable JSON shape:
  `{ nodeTypes: [{ label, count, properties }], edgeTypes: [{ type, count }],
patterns: [{ from, edge, to, count }], totals: { nodeCount, edgeCount } }` —
  per-label node counts with their observed property keys, per-type edge counts, and
  the distinct `(fromLabel, edgeType, toLabel)` relationship patterns present. Wired
  into the served tool registry with a `read` capability declaration.

- 23de83f: feat(telemetry): add `harness telemetry synthesize` — a unified local telemetry report

  Ships the in-repo slice of #563: a read-only, local, single-project command that
  COMPOSES the five telemetry surfaces that already accrue — skill adoption
  (`readAdoptionRecords`/`aggregateBySkill`), Bayesian skill effectiveness
  (`computeSkillEffectiveness`/`detectFailingSkills`/`detectAbandonedSkills`), usage/cost
  (the usage aggregator), composite code-health insights (`composeInsights`), and
  `execution_outcome` graph verdicts — into one report. Markdown by default; `--json`
  emits a machine-readable `TelemetrySynthesis` object designed so a future dashboard can
  consume it unchanged.

  It collects nothing new — no hooks, event types, or storage — and is pure composition
  over existing readers, mirroring the `harness adoption retrospective` precedent.
  `--skip <section>` omits a source, `--window <days>` bounds the adoption/usage/outcome
  sources, and `--out <path>` writes to a file (default: stdout). A missing source
  contributes an explicit "no data" note in a "Sources with no data" footer — never a
  fabricated zero and never a crash.

  The cross-adopter public dashboard from the shard stays out of scope (it needs a
  PostHog aggregate + privacy review + hosting decision that do not exist in-repo); this
  is the buildable, testable per-project data layer that dashboard would render.

  `core` gains a `telemetry-synthesis` module (pure composer + Markdown renderer); the CLI
  is the composition root, keeping `core` free of any `intelligence`/`graph` dependency.

- 8c96cc5: fix(test-craft): refuse to report zero findings for zero critiques (#1346, #1347)

  `harness test-craft` could not produce a finding under its own default provider,
  and could not see ESM test suites at all. Both failures printed the same thing:
  `No test findings.` at exit 0.

  **The critique phase never ran (#1346).** `InSessionLlmProvider.callText` throws
  `PromptDeferredError` on every call — it queues the prompt for the calling agent
  rather than answering it — and `critiqueTest` caught every throw in a bare
  `catch {}`. Every `(test × rubric)` pair failed and was discarded. `test-craft`
  now refuses that provider up front, the way `naming-craft` already does, and
  per-rubric failures are counted into `summary.counts.critiqueErrors` instead of
  being dropped.

  **Discovery was blind to `.mjs` / `.cjs` / `.mts` / `.cts` (#1347).** The
  extension list lived in two places — the discovery walk and a second regex gate
  inside `extract/tests.ts` — so the bug had two halves: the walker skipped
  `*.test.mjs`, and passing one through `--files` cleared the walker only to be
  dropped by the extractor, reporting `filesScanned: 1` against
  `testsExtracted: 0`. Both now read from `extract/test-file-exts.ts`.

  Measured on a 53-file ESM repo: `0 findings / 60 tests / 9 files / 0 LLM calls`
  became `8936 findings / 1117 tests / 53 files / 8936 LLM calls`.

  **Behaviour change:** `runTestCraft` and `critiqueTestsInFile` now throw when
  handed the in-session provider rather than returning an empty result. Callers
  relying on the silent-empty return must configure a real backend via
  `agent.backends` + `HARNESS_CRAFT_LLM`, or set `HARNESS_CRAFT_LLM=mock`.

  `TestCraftSummary.counts` gains `critiqueErrors` and `testsTruncated`. Both are
  required fields, so code constructing that type (rather than only reading it)
  needs updating. The CLI now also warns when the per-file cap truncated a file
  and notes when nothing source-paired, which silently disables `TEST-R007`.

### Patch Changes

- c523902: feat(burn): attribute token spend to the subagent that spent it

  `UsageRecord` gains `agent` and `agentId`, `usage.tsv` widens from 7 to 9 columns
  (7-column rows still load, labelled `pre-migration`; the reader also tolerates any
  future extra columns), and `files.tsv` gains a `#version` header that forces one full
  rescan on upgrade — after which every row whose transcript is still on disk is
  relabelled with its real agent.

  `Summary` gains additive `agents` and `attribution` blocks, and `harness burn report`
  gains a "by agent" section in which the `unattributed` row is never elided. Subagent
  spend whose identity cannot be read is reported as `unattributed` units, never as zero;
  when none of the current week's subagent spend carries a readable label, the report
  headlines that attribution is degraded.

  Note for downgrades: a `burn` older than this change reading a 9-column store discards
  every row. The integrity gate then re-reads every transcript, so the loss is bounded to
  rows whose transcripts have already been pruned.

- aeb9054: fix(craft): nesting-aware fenced-JSON parse stops dropping findings

  Every craft family's CRITIQUE phase used a lazy fence regex
  (`/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/`) to extract the JSON finding from the
  LLM response. When a finding's `message` value itself contained a ```fence
(critiques routinely quote code blocks), the lazy match truncated at that inner
fence,`JSON.parse` threw, and the finding was silently dropped.

  Extraction is now nesting-aware via a single shared util,
  `extractFencedJsonPayload` (`shared/craft/fenced-json.ts`): it anchors on the
  opening fence, then runs a string/escape-aware, brace-balanced scan that returns
  the first complete JSON value. Inner fences inside string values no longer
  truncate the object, and two separate fenced blocks are never merged. All ten
  craft families (code / docs / spec / copy / naming / test / security / api /
  cli-ergonomics / knowledge) now share this util; the duplicated regexes,
  `FENCED_JSON` consts, and `stripJsonFence` helper are gone.

- ea2d3c6: feat(design-craft): add CRAFT-P008 editorial-two-column-split polish pattern

  Adds a `layout` POLISH pattern to the design-craft catalog, closing one of the
  documented P008–P015 gaps. `density-rhythm` already detects left-column
  monotony; this pattern prescribes the two-column heading-rail + body remedy.
  Additive-only (new catalog entry + `SEED_PATTERNS` registration).

- 8349f45: fix(knowledge-craft): harden discovery and critique-validation edge cases

  Three latent bugs found by the bug-fleet hunt over `packages/cli/src/knowledge-craft/`:
  - Discovery gated `.md` case-sensitively (`endsWith('.md')`) while the README
    exclusion right below it was case-insensitive, so a `NOTES.MD` entry was
    silently skipped. The extension gate is now case-insensitive to match.
  - `maxFiles` guarded only `null`/`undefined`, so a negative value hit JS
    negative-index `slice` semantics and silently dropped trailing entries
    (`maxFiles: -1` scanned all but the last file). A negative / non-finite cap
    now falls back to the default; `maxFiles: 0` still caps to zero.
  - The critique parser rejected only truly-empty messages, so a whitespace-only
    `message` became a finding with an unusable body. It is now trimmed before the
    non-empty check.

- 56f68f3: Scope `manage_roadmap add` to the row it adds, and link that row to its own
  tracking issue.

  Adding one roadmap row used to trigger a whole-repository bidirectional
  reconcile against the tracker, so a local one-row write rewrote _other_ rows
  with tracker state — and the new row itself was serialized without the
  `Assignee` / `Priority` / `External-ID` triple, so nothing joined it to the
  issue that had just been created for it. The two faults were opposite ends of
  the same seam: added rows only looked healthy because the full sync
  subsequently stamped `externalId` onto them, so excluding `add` from external
  sync outright would have made the second fault fire on every add.

  `add` now performs a row-scoped push instead. New core export
  `syncRowToExternal(projectRoot, adapter, config, featureName, options?)`:
  push-only, single row, dedup-aware, and fail-closed — if `fetchAllTickets`
  fails it performs no create, because degrading to an empty dedup index would
  mint exactly the duplicate issue this fix prevents. It runs no inbound pull
  and does not stamp `last_synced`: a one-row push is not a reconcile.

  It returns the new `RowSyncResult` — a `SyncResult` plus the post-push
  `feature.externalId`. That field, not `created` / `updated`, is what answers
  "is this row linked?": a row that dedup-links to an existing ticket has its id
  stamped and written to disk even when the follow-up patch fails, leaving both
  arrays empty. A writeback failure is reported under the `'*'` envelope, so
  "linked at the tracker but not persisted" stays distinguishable from a
  tracker-side error, and the `add` response can name the orphaned ticket.

  **Types is a minor bump, not a patch:** `SyncResult` gained a required member
  (`suppressedInbound`), which is source-breaking for anyone constructing one.

  Inbound sync is hardened independently, because `sync --apply` and state
  transitions still run the full reconcile:
  - An absent tracker assignee no longer clears a local one. An unassigned issue
    is the default state of every issue, not an authoritative empty value.
  - Consequently, any inbound status change on an _assigned_ row now routes
    through `setStatus`, so the assignee is released through the lifecycle
    authority and `assignee ≠ null ⟺ in-progress` still holds. This also repairs
    an already-invalid row (assigned but not `in-progress`), and the release is
    reported: `assignmentChanges` now describes the assignee that actually landed
    on disk rather than the intermediate value the pull computed.
  - A merely-`OPEN` issue no longer overwrites a local `backlog` status. The
    guard is gated on the absence of the label naming the status the write would
    produce, rather than on the resolved status, because a direct open-to-planned
    mapping resolves a bare issue and an explicitly `planned`-labelled one
    identically. An explicit `planned` label still promotes; a `blocked` label
    does not, since a direct `open` key discards its opinion anyway.
  - Both suppressions are reported in the new `SyncResult.suppressedInbound`,
    which `harness roadmap sync` now surfaces in both its `--json` payload
    (`skipped.inbound`) and its warn output, rather than silently dropping.

  The `add` response gains a `link` key describing the outcome. A missing token
  or a failed link is reported in the response text but does **not** mark the
  response as an error: the row was written and is locally valid, and flagging a
  failure would invite a retry that mints a duplicate issue. The failure message
  names the recovery that works — `sync` with `apply=true`, which links the row
  that already exists — and warns against re-running `add`, which cannot work
  because the row is already persisted and the second add collides on slug.

  The roadmap serializer is unchanged. Stamping `externalId` alone flips the
  extended-field predicate, so all three lines appear because the fields are
  real — not because the serializer pads them.

  Refs #1285, #1286.

- 7d0f917: fix(scan-config): apply `fileGlob` so path-scoped rules stop matching the wrong files

  `scan-config` called `SecurityScanner.scanContent`, which documents that it
  evaluates every active rule "regardless of filePath". Path-scoped rules were
  therefore matched against files their `fileGlob` excludes.

  The visible cost was SEC-AGT-007 ("Shell metacharacters in hook commands"),
  scoped to `**/settings*.json,**/hooks.json`, whose pattern ``/`[^`]+`/``
  matches ordinary Markdown inline code. Measured on a real repository, the scan
  reported **787** findings and exited 2; **758** of them were SEC-AGT-007 (378),
  SEC-MCP-002 (377) and SEC-MCP-004 (3) firing on `CLAUDE.md` and `AGENTS.md`
  prose such as ``If on `main`:``. After the fix the same repository reports 29
  findings — the genuine `INJ-SUS-*` matches — and exits 0.

  The scan now calls `scanFileContent`, which applies the same `fileGlob`
  filtering as `scanFile` while reusing the content already read from disk.
  `packages/orchestrator/src/workspace/config-scanner.ts` had already routed
  around this for its copy of the workflow, naming SEC-AGT-007 and SEC-MCP-002 in
  a comment; the CLI command was never brought across.

  Rules whose `fileGlob` does match are unaffected — a regression test asserts
  SEC-AGT-006 still fires on `CLAUDE.md`, so the fix narrows by path rather than
  switching the security engine off.

- 69903a7: Refuse to run findings-producing commands when the CLI is sharply out of step
  with the workspace it is scanning.

  A stale scanner does not fail — it emits well-formed, confident, wrong output.
  In the run that motivated this change, a Node bin directory was prepended to
  `PATH` to obtain Node 22; that directory also contained a `harness` shim
  symlinked to an install ten major versions old. Every process spawned under that
  `PATH` ran the old CLI, which predates the prior-line `harness-ignore`
  suppression pass and therefore re-reported every already-justified suppression.
  33 of 36 code-side security findings were phantoms, and the single finding
  escalated to a human decision gate pointed at a line that was the XSS detection
  vocabulary registry — annotated as definitional and suppressed.

  A workspace can now declare the CLI line it expects via a new optional
  `toolchain.cliVersion` key in `harness.config.json` (a semver range, e.g.
  `">=11"`). The CLI compares its own version against that range, falling back to a
  `@harness-engineering/cli` range in the project's `package.json`
  `devDependencies`/`dependencies` when no config pin is set. Non-semver
  specifiers (`workspace:*`, `file:`, `link:`, `git+`, `*`, `latest`) are ignored
  rather than coerced, so monorepos do not produce false mismatches.

  The severity ladder is deliberately asymmetric, because staleness is the
  dangerous direction — an older scanner re-reports resolved findings (falsehood),
  while a newer one reports rules the workspace has not adopted yet (noise):
  - range satisfied — silent
  - 2+ majors behind the range minimum — **refuse**, exit code 3 (`ZERO_DENOMINATOR`
    — "abstained, not passed"; deliberately not exit 1, which is what these
    commands already return when they found _real_ findings)
  - exactly 1 major behind, or unsatisfied at a delta of 0 or less — warn, proceed

  Only findings-producing commands are gated: `check-arch`, `check-deployment`,
  `check-deps`, `check-docs`, `check-harness-strength`, `check-perf`,
  `check-security`, `cleanup`, `cross-check`, `review-ci`, and `validate`. `doctor`, `update`, `setup`, and `init` are deliberately never
  gated — those are the commands you need when your toolchain is wrong, and a
  guard that blocks its own remedy is a trap.

  When no expected version can be resolved, the guard is silent. Warning there
  would fire for every project that has not opted in and would train everyone to
  ignore the output, destroying the signal for the case that matters.

  `HARNESS_NO_VERSION_GUARD=1` downgrades a refusal to a warning. It
  deliberately does **not** silence the notice: a variable that suppressed the
  message entirely would be exported once into a shell profile or CI config and
  would restore the original silent failure permanently. The hatch buys a working
  command, not a quiet one.

  The refusal message names both versions, the expectation's source, and the
  resolved path of the binary actually running — that last line is the one that
  makes a shadowed `PATH` visible, which is what nobody could see when this
  happened.

  Note the inherent limitation: this guard cannot fire inside a CLI old enough to
  predate it. It makes the failure class loud going forward; the accompanying
  `-fleet` family reference documents the `PATH`-shadowing trap for as long as
  stale binaries remain in circulation.

- a02846c: fix(validate): a check that could not run no longer reports as passed

  `harness validate` printed `validation passed` and exited `0` when `docs/roadmap.md`
  existed but failed to parse. The `roadmapHealth` check was guarded by `if (parsed.ok)`
  with no `else`, so on a parse failure every roadmap health rule (RMH001-RMH005) was
  skipped at once, the parse error was discarded, and the verdict was never touched — a
  roadmap broken beyond parsing validated clean while a _less_ broken one failed. The
  aggregate-drift doctor carried the same swallow, reporting a freshness comparison as
  passed when the shards could not be regenerated at all.

  `harness validate` now has three outcomes instead of two. A check whose input exists
  but cannot be consumed **abstains**: it is recorded in a new `unavailableChecks`
  ledger, the result carries `complete: false`, and the command exits `3`
  (`ZERO_DENOMINATOR` — "the command ran but examined nothing"), printing a
  `Checks that could not run` section instead of a pass or fail verdict. Abstention
  outranks failure, because exit `1` implies the reported findings are the complete
  list. `--severity` never filters the ledger.

  Existing behavior is unchanged otherwise: advisory findings such as RMH002 remain
  warnings that do not fail validation, error findings still exit `1`, an absent
  roadmap is still a silent no-op, and **human-readable** output for any run with no
  unavailable checks is byte-identical to before.

  The `--json` payload changes additively: every run now carries `complete` and
  `unavailableChecks`. Machine consumers should gate on `complete` (or the exit code)
  rather than `valid` — `valid` reports only on checks that actually ran, so it stays
  `true` when a check abstained. `complete === true && valid === true` is what exit
  code `0` means.

- Updated dependencies [369839e]
- Updated dependencies [162c761]
- Updated dependencies [c523902]
- Updated dependencies [7d3c06d]
- Updated dependencies [797a42b]
- Updated dependencies [7b17174]
- Updated dependencies [06b5a72]
- Updated dependencies [80fcdbe]
- Updated dependencies [48cf10e]
- Updated dependencies [7127e28]
- Updated dependencies [56f68f3]
- Updated dependencies [def9dc6]
- Updated dependencies [8559d5e]
- Updated dependencies [c32632c]
- Updated dependencies [bbd1d37]
- Updated dependencies [23de83f]
- Updated dependencies [59ef17a]
- Updated dependencies [1e91c48]
- Updated dependencies [0876aec]
  - @harness-engineering/graph@0.13.0
  - @harness-engineering/dashboard@0.16.0
  - @harness-engineering/burn@0.2.0
  - @harness-engineering/core@0.42.0
  - @harness-engineering/orchestrator@0.21.2
  - @harness-engineering/types@0.29.0
  - @harness-engineering/intelligence@0.11.3
  - @harness-engineering/signals@0.3.3

## 11.1.1

### Patch Changes

- a05b6de: Fix CI's two paths for landing housekeeping commits on a protected `main`.

  `roadmap-auto-done.yml` declared `permissions: pull-requests: read`, but its branch-protection fallback calls `gh pr create` with the built-in `GITHUB_TOKEN`. That call failed with `Resource not accessible by integration (createPullRequest)` _after_ the branch had already been pushed, so every merge into a protected branch stranded a `chore/auto-done-pr*` branch and silently dropped its roadmap flip. The fallback was added without widening the permission, so it had never once succeeded — 58 stranded branches had accumulated, spanning a long run of merges.

  `release.yml`'s "Promote golden build reference state" step pushed straight to `main` with no fallback at all, so it failed on every publish with `GH013: Changes must be made through a pull request`. The packages had already gone out by that point, so releases went red _after_ shipping and the golden reference manifest never advanced. It now uses the same retry-then-scope-guarded-self-approved-PR path as auto-done, with the diff guard pinned to `.harness/golden/manifest.json`.

  Branch protection is unchanged; both paths land through auditable, scope-checked PRs.

- 6c3854a: Fix the release workflow invoking pnpm's built-in `version` command instead of the `version` script.

  `version` is a built-in pnpm command, so the `version: pnpm version` input passed to `changesets/action` resolved to the built-in — which only prints a version dictionary — and never ran package.json's `version` script. The release bumped nothing, so `changeset-release/main` came out byte-identical to `main` and the action failed creating its PR with `Validation Failed: No commits between main and changeset-release/main`.

  Corrected to `pnpm run version`, which invokes the script (`changeset version && node scripts/sync-plugin-pin.mjs`). The sibling `publish: pnpm release` input was never affected because `release` is not a built-in pnpm command and therefore falls through to `run`.

- Updated dependencies [4830b8f]
- Updated dependencies [a05b6de]
  - @harness-engineering/orchestrator@0.21.1
  - @harness-engineering/graph@0.12.2
  - @harness-engineering/dashboard@0.15.2
  - @harness-engineering/core@0.41.1
  - @harness-engineering/intelligence@0.11.2
  - @harness-engineering/signals@0.3.2

## 11.1.0

### Minor Changes

- 63f6ba0: Add `adr-fleet` — the **decide** stage of the `-fleet` family (issue-fleet → adr-fleet → roadmap-fleet → pr-fleet). It sweeps the backlog of pending architectural decisions (undocumented decision points, decision-blocked work, parked forks), fans out worktree-isolated subagents that each run the real `harness-architecture-advisor` pipeline to draft one ADR under `docs/knowledge/decisions/` at `status: proposed`, independently verifies every draft is a well-formed record (never a subagent self-report) on a CI-green branch, and hands the human one batch sign-off pass. It never auto-accepts — a drafted ADR stays `proposed` until an explicit human sign-off flips it to `accepted`.

  The skill is self-contained `SKILL.md` + `skill.yaml` that cites the shared spine (`docs/reference/fleet-family.md`) and defines only its decide-stage parts: the pending-decision queue, advisor-drafting with orchestrator-pre-allocated ADR numbers, and the terminal human batch sign-off gate. Ships with platform symlinks (codex/cursor/gemini-cli), the decide-stage batch-sign-off-gate ADR (the complement to the fan-out, interaction-model, and land-merge-gate ADRs), a new `proposed` status in the ADR vocabulary, and regenerated plugin/catalog artifacts.

- 6818d63: Emit a PATH-resolvable Codex `notify` command instead of a machine-specific absolute path.

  `harness update` / `harness hooks init` now wire Codex's `.codex/config.toml` `notify` as `["harness", "hooks", "run", "session-retrospect-codex"]` rather than `["node", "<abs path>/.harness/hooks/session-retrospect-codex.js"]`. The generated line no longer contains a machine-specific filesystem path, so it is byte-identical on every machine and safe to commit for the whole team (previously it churned per machine and broke other contributors and CI).

  A new `harness hooks run <name> [payload]` subcommand backs this: it reads the JSON payload Codex delivers on argv, self-locates the project from the payload's `cwd`, and delegates to the shared session-retrospect core. It is fail-soft (unknown name, absent/malformed payload, or any error exits 0). An existing absolute-path Codex `notify` line written by a prior harness version is upgraded in place on the next run; a foreign `notify` is left untouched. Claude, Gemini, and Cursor hook wiring is unchanged.

- d4a763e: Add a `docs-publish` code connector configured via `harness.config.json`. Introduces a `DocsPublishConnector` interface (operations: draft, attach-media, verify-render, page-tree) with a config-driven resolver that degrades gracefully when no connector is configured, a Confluence implementation (page CRUD + sidebar move via Atlassian REST, ADF media-single serialization, Playwright-based render verification), a `harness docs-publish <op>` CLI command, and a `docs_publish` MCP tool. The headless-impossible attachment upload is modeled as a typed manual-step result the pipeline surfaces to the human. Playwright is an optional peer dependency loaded lazily. The former `docs-publish` and `docs-publish-confluence` skills are removed; `proposal-pitch` now invokes the connector surface.
- faa704c: Add `fleet-command` — the **conductor** of the `-fleet` family, one tier above the members and deliberately not named `-fleet`: it coordinates the fleets themselves rather than fanning out over an item-queue. It probes each installed fleet's queue through that member's own **gate-free** report-only path — never through a gated dry-run path that would fire the member's own CONFIRM during selection, so a member offering no gate-free path is reported as **queue depth unknown** and scheduled on the human's call. It derives the run as a hybrid dependency DAG — a CI **trust gate** first, then ideation, then intake with the independent quality sweeps parallel alongside, then decide, build, and the land stage terminal, with no dependency edge inside any wave — and enforces **one global** leaf-slot budget across every fleet in flight instead of the sum of the per-fleet governors, imposed by dispatching every lane with `--concurrency <allocated>` and never allocating one fleet more than 2 of the pool, alongside one pass per fleet, a structurally-shed fleet cap, and a wall-clock budget checked at each wave boundary.

  The CI wave is a **trust gate, not a repair**: the CI member hands back unmerged remediation PRs, so an untrustworthy signal is surfaced at the run-plan gate as a fork with a recommended default, its remediation pays off on the next run rather than this one, and any verdict taken under a red signal is labelled degraded. It owns cross-fleet deconfliction over four collision classes: generated artifacts get a merge-order plan with regeneration sequencing, allocated-sequence writers are serialized into different waves, same-region source editors are serialized as lanes rather than merge-ordered, and duplicate filings are deduped across fleets into one row citing every lane that raised them — degrading to a no-op, not an error, when a class is eliminated upstream. Each ready member's own human CONFIRM is presented **verbatim in one batched round per wave and never answered** by the conductor, every lane is verified from its emitted artifacts with independently spot-checked verdict references rather than from its self-report, and the run hands back one consolidated report whose evidence is graded honestly — nothing-merged is a verified check, while staying within allocation is a dispatch-time-enforced property recorded as an assumption. It **never merges**. Ships as a self-contained `SKILL.md` plus `skill.yaml` with codex, cursor, and gemini-cli platform variants, generated command manifests for every platform, and the conductor-tier authority decision record.

### Patch Changes

- 1ee0b13: `harness init` now scaffolds `hooks.afterCreate` in the orchestrator config from the
  detected ecosystem's install command (e.g. `uv sync` for a `uv.lock` workspace,
  `pnpm install` for a `pnpm-lock.yaml` workspace) instead of hardcoding
  `pnpm install --prefer-offline` for every adopter. When no lockfile or manifest is
  recognized at the workspace root, init now emits a single loud, non-blocking warning
  that neither an install nor a verify command could be resolved (the same condition
  that silently no-ops the runtime verify gate) and still exits successfully.
- e44460c: Supply-chain audit: re-tighten drifted security override floors

  The root `pnpm.overrides` security pins had drifted below their currently
  patched versions again (open-ended `>=x` floors resolve to the floor, not the
  latest patch). Bumped the floors and added two new pins, clearing 25 of 30
  `pnpm audit` advisories — all within the current major, no breaking jumps:
  - `hono` `>=4.12.25` → `>=4.12.34` (ReDoS, SSR cross-user disclosure, DoS)
  - `postcss` `>=8.5.10` → `>=8.5.23` (arbitrary `.map` file read ×3)
  - `ip-address` `>=10.1.1` → `>=10.3.1` (SSRF / trust-boundary bypass ×3)
  - `fast-uri` `>=3.1.4` → `>=3.1.5` (host confusion)
  - `undici` `^7.28.0` → `>=7.29.0` (response desync, cache disclosure, CRLF ×4)
  - `brace-expansion@2` `>=2.1.2` → `>=2.1.4`; `brace-expansion@5` `^5.0.6` → `>=5.0.9` (DoS)
  - `js-yaml@3` `>=3.15.0` → `>=3.15.1`; `js-yaml@4` `>=4.2.0` → `>=4.3.1` (quadratic CPU)
  - new: `nanoid` `>=3.3.17` (infinite loop), `react-router` `>=7.18.2 <8` (RSC CSRF bypass)

  Also bumped the direct `react-router` dep in `@harness-engineering/dashboard`
  to `^7.18.2`. The 5 remaining advisories are all the pre-accepted
  `auditExceptions` (esbuild/vite in the vitepress ^5 chain, dev/docs-only).

- Updated dependencies [65d1831]
- Updated dependencies [f231e90]
- Updated dependencies [e44460c]
- Updated dependencies [5d6436c]
  - @harness-engineering/orchestrator@0.21.0
  - @harness-engineering/core@0.41.0
  - @harness-engineering/dashboard@0.15.1
  - @harness-engineering/types@0.28.0
  - @harness-engineering/graph@0.12.1
  - @harness-engineering/intelligence@0.11.1
  - @harness-engineering/signals@0.3.1

## 11.0.0

### Minor Changes

- 21df39b: Add failure-reason categorization to `.harness/metrics/adoption.jsonl`.

  Adoption records previously captured `outcome: completed | failed | abandoned` —
  the _what_ of a skill run without the _why_. A new optional `failureCategory`
  field records the reason a run did not complete, drawn from a small closed
  taxonomy (`FailureCategory`): `prerequisite-missing`, `gate-rejected`,
  `user-cancelled`, `timeout`, `dependency-failure`, `agent-error`, and
  `inconclusive`.

  The category is derived by the adoption-tracker hook at the failure/gate points
  already present in the skill-event stream: an `error` event's `failureType` is
  mapped through a keyword table (defaulting to `agent-error`), and a failed
  `gate_result` yields `gate-rejected`. It is only emitted when a reason is
  determinable — completed runs and reason-less abandonments carry no category, so
  the field is never guessed.

  The field is optional and additive: records written before it existed still
  parse, and the reader drops any unrecognized value. Downstream consumers now use
  it — the skill-effectiveness scorer (`detectFailingSkills`) reports a
  per-skill `failureCategories` breakdown, and the catalog retrospective adds a
  per-skill breakdown, a catalog-wide `failureCategoryTotals`, and a rendered
  "Failure categories" section — so failing skills can be grouped by _why_ they
  fail, not just how often.

- 4550b35: Add an `antigravity` plugin-generator target (agy / Antigravity CLI). The
  plugin generator now emits `/harness:*` slash commands, persona agents, and a
  pinned MCP declaration for agy alongside the existing claude/cursor/gemini/codex
  targets, and `harness setup` detects and configures the Antigravity CLI client.

  agy shares the `~/.gemini/` root with Gemini CLI but is a distinct target: it
  reads persona agents from `~/.gemini/agents/*.md` and MCP from
  `~/.gemini/config/mcp_config.json` (declaring MCP in `settings.json` is silently
  ignored). Lifecycle hooks are deferred to a follow-up phase because agy's
  stdin/stdout decision contract differs from Claude Code's exit-code contract.

- 6b3ba5e: Add `api-craft` — an LLM-judgment ceiling skill for API design quality, the
  structural twin of `cli-ergonomics-craft` and the ceiling counterpart to the
  rule-based API floor (OpenAPI-format and webhook-format compliance). A linter can
  confirm a path is documented and a schema validates; only judgment can tell
  whether the endpoint sits at the right abstraction, whether the HTTP verb is
  honest, whether a resource name belongs in the URL or a query param, whether a
  stranger could predict the response shape, and whether the error tells the
  consumer what to do. It discovers a project's own API surface — OpenAPI/Swagger
  documents and route/handler definitions — and critiques whether resources model
  the domain rather than the implementation, whether resource naming and URL
  structure are predictable, whether HTTP methods are honest, whether status codes
  are correct, whether error responses are actionable, whether response shapes are
  predictable and consistent, whether collections paginate and filter consistently,
  whether mutations are idempotency-honest, and whether the API evolves without
  breaking consumers — 9 seed rubrics emitting 3-axis findings (tier × impact ×
  confidence), a curated exemplar set (Stripe / Linear / GitHub / Resend /
  Anthropic), and kind-aware rubric filtering (the idempotency rubric never fires on
  a static OpenAPI document). Ships the `harness api-craft` CLI, the `api_craft` MCP
  tool, and the cross-cutting `critiqueApiSurfaceFile` API.
- 59590da: Arch baseline gating is now delta-vs-base with per-PR allowance files, ending the
  `.harness/arch/baselines.json` merge cascade.

  Previously a PR that added complexity failed the arch gate, and the only way to pass was
  `check-arch --update-baseline`, which REWROTE the shared `baselines.json` snapshot on the
  branch. The `merge=ours` attribute only resolves LOCAL merges, so GitHub's server-side
  3-way merge conflicted, and every merge into the trunk re-conflicted all other open PRs.

  Two additive changes fix it:
  - **Base-aware resolution** (`resolveArchBaseline`): in a PR context the gate compares
    current metrics against the base ref's committed baseline
    (`git show origin/main:…`, overridable via `HARNESS_ARCH_BASE_REF`) rather than the
    working-tree file — a true delta-vs-base. It is strictly fail-open: on the base branch,
    a fresh/detached checkout with no reachable base ref, a non-git directory, or an
    absent/invalid base copy, it falls back to today's working-tree behavior and never
    produces a false failure.
  - **Per-PR allowance files** (`.harness/arch/allowances/<branch>.json`): an intentional
    regression is acknowledged with a uniquely-named per-PR file (the same conflict-free
    one-file-per-PR pattern as changesets), so two branches never touch the same file. In a
    PR context `check-arch --update-baseline --reason "…"` WRITES an allowance instead of
    rewriting the snapshot; on the trunk it keeps the whole-snapshot behavior. The gate
    accepts a regression only when a present allowance covers it. Genuine NEW error-severity
    threshold violations are NEVER allowanced and still hard-fail — only the
    snapshot-commit requirement is removed, not the gate itself.

  The committed snapshot is now single-writer: only the post-merge baseline-refresh job
  advances it, and it also folds in and deletes consumed allowance files.

- d74f5ec: Ship the usage-burn HUD as `@harness-engineering/burn` + `harness burn`, replacing the
  standalone `claude-burn-hud` Python/shell tool.

  The HUD reports Claude Code usage pace from local transcripts: week-anchored spend,
  a baseline-shrunk forecast, per-model family limits, and a `/clear` nudge once the
  checked-out branch has merged. It is a local proxy, never Anthropic's real quota —
  `/usage` remains the authority, and no percentage is trustworthy until reconciled
  against it.

  Two surfaces, split on latency rather than taste:
  - `harness burn` (report, `weeks`, `calibrate`, `budget`, `reset-day`, `scan`,
    `install`) — human-invoked, so the CLI's module graph is affordable.
  - `harness-burn-hud` (`line`, `session-start`, `stop`, `scan`) — a standalone binary
    for the statusline repaint and the Stop hook. `harness --version` costs ~0.85s to
    load against a ~0.11s repaint budget, so this binary imports nothing from
    `@harness-engineering/*`; a test asserts that import graph, because the regression
    would show up only as a terminal that feels slow.

  Every regression test from the Python suite came across, each still tied to a defect
  that actually shipped: the Monday-UTC week assumption that understated a 97% week by
  ~81×, the write race that silently dropped 85% of the record store, transcript usage
  blocks inflating totals ~3.5×, and a 3-hour extrapolation firing CRITICAL. Parity was
  verified against 33,305 real records — every shared record byte-identical, and with
  `now` pinned the summaries differ only in float rendering.

  The port also fixed two hot-path defects of its own: the binary is emitted as `.mjs`
  so Node does not detect-and-reparse it on every launch, and `line` no longer blocks
  forever when run from a terminal.

  `harness burn install` performs the cutover into `~/.claude/settings.json` additively —
  it backs the file up, leaves unrelated hooks alone, and leaves the previous
  `~/.claude/hud` install on disk so there is a way back.

- b83b45b: Add `CanaryAdapter.readRunHistory` (new injectable `CanaryReader` file-read seam +
  permissive `canaryRunRecordSchema`/`canaryTestResultSchema`) and the thin
  `canary_run_history` MCP tool. Reads canary's documented NDJSON run-history store
  (`test-results/reports/history-v2.jsonl`) and degrades to `[]` — never throws — on a
  missing/unreadable store or malformed lines. Foundation for graph/outcome-eval ingest.
- 9852aaa: Wire canary into harness-verify and harness-tdd through the existing adapter seam.

  `CanaryAdapter` gains a total `listFrameworks()` method (execs `canary frameworks --json`,
  zod-parses the framework registry, returns `[]` on any degrade) and a pure
  `resolveTestCommand()` helper that fills the `{file}` placeholder and appends CI flags.
  A new MCP tool, `canary_discover_test_command`, matches candidate test files against the
  registry by longest file-extension suffix and returns the resolved per-file test command.

  `harness-verify` DETECT now consults registry truth for the test command before its
  `package.json`/`Makefile` heuristics, and `harness-tdd` RED offers canary-authored failing
  tests (detect-and-offer). Both degrade silently to today's behavior when canary is absent —
  the dependency stays optional and the adapter boundary is unchanged.

- a060f80: Add `cli-ergonomics-craft` — an LLM-judgment ceiling skill for command-line
  ergonomics quality, the structural twin of `docs-craft` and the ceiling
  counterpart to mechanical CLI checks. Unlike the other craft skills it has no
  rule-based floor twin: a linter can confirm a flag is documented, but only
  judgment can tell whether the name is predictable, whether the help teaches, and
  whether the error says what to do next. It critiques whether command and flag
  names are predictable and consistent, whether help text is task-oriented,
  whether errors are actionable, whether defaults are sane and safe, whether
  output is scannable and terminal-aware, whether the CLI composes (pipeable,
  machine-readable, honest exit codes), and whether destructive actions are
  guarded — 7 seed rubrics emitting 3-axis findings (tier × impact × confidence),
  a curated exemplar set (gh / cargo / ripgrep / docker / Stripe CLI), and
  kind-aware rubric filtering (a pure namespace command is critiqued only for
  naming and help). Ships the `harness cli-ergonomics-craft` CLI, the
  `cli_ergonomics_craft` MCP tool, and the cross-cutting `critiqueCommandFile` API.
- b9380ba: Add `code-craft` — an LLM-judgment ceiling skill for code quality / readability,
  the structural twin of `security-craft` and the counterpart to the rule-based
  code floor (cleanup-dead-code / enforce-architecture / complexity thresholds).
  It walks `packages/*/src`, extracts the substantive units a senior reviews
  (functions, methods, classes) via the TS Compiler API, and critiques each unit
  against 7 seed rubrics — whether the code reveals intent, whether the control
  flow is honest, whether a function tells one story at one altitude, whether each
  abstraction earns its keep, whether it is as simple as it could be, whether the
  signature keeps its promise, and whether a senior would nod or wince. Emits
  3-axis findings (tier × impact × confidence), skips files with no substantive
  unit (`filesSkippedNoUnit` tracked), and delegates identifier-level naming to
  `naming-craft` (re-exported as `critiqueNamesInFile`) rather than duplicating it.
  A curated exemplar set (Anthropic SDK / TanStack Query / ky / SWR / date-fns)
  anchors the catalog. Ships the `harness code-craft` CLI, the `code_craft` MCP
  tool, and the cross-cutting `critiqueCodeInFile` API.
- e294b1d: check-deps no longer fails on cycles inside vendored `node_modules`: the CLI
  `findFiles` helper now applies core's shared `DEFAULT_FIND_FILES_IGNORE`. Adds a
  `deps.exclude` config block (minimatch globs) to suppress additional paths from
  check-deps discovery, threads it through both the layer-validation and
  circular-detection paths, attributes circular findings to their first-cycle
  file, and prints the analyzed-module denominator — failing rather than
  reporting clean when layers are configured but zero modules are analyzed.
  Exports `DEFAULT_FIND_FILES_IGNORE` from `@harness-engineering/core`. (#1188)
- 3dc2ddc: Add a machine-derived award-tier verdict (`awardBar`) to the design-craft
  BENCHMARK output. Every `BenchmarkScore` now carries
  `awardBar: { verdict: 'cleared' | 'not-cleared' | 'indeterminate'; dimensions; shortfalls; reason? }`,
  computed in TypeScript from the 5-dimension radar and the cited exemplars'
  reference scores — never emitted by the LLM (the authority-in-TS pattern used
  by outcome-eval / acceptance-eval). The bar is per-dimension rather than a
  single overall threshold, because an equal-weight mean hides a weak axis: each
  dimension must reach `max(dimensionFloor, round(fraction × median(cited-exemplar
references)))`, so the verdict fails on the exact axis that falls short. Any
  dimension whose confidence is below the floor forces `indeterminate` — a score
  the model is unsure about never certifies award tier. Thresholds are tunable via
  `design.craft.benchmark.awardBar` (`dimensionFloor` default 80, `fraction`
  default 0.95, `confidenceFloor` default medium); omit the block for defaults.
  This replaces free-hand "is this good enough?" judgment with an honest,
  corpus-calibrated machine signal downstream agents can read directly.
- 8b47517: Add a mechanical responsive gate that vetoes the design-craft award-bar
  verdict when a target carries mobile defects. Every `BenchmarkScore.awardBar`
  now carries `responsive: { status: 'clean' | 'defective' | 'not-evaluated';
viewport?; defects[] }`, computed by a new floor-layer module
  (`src/responsive/`) from per-target rendered layout metrics — not a sixth
  aesthetic radar dimension. A `defective` gate (a `horizontal-overflow` or an
  `unreachable-nav` — no visible nav and no menu toggle) forces `not-cleared`
  regardless of the aesthetic score, so `cleared` can no longer certify a
  phone-broken page. Layout metrics are supplied via `responsiveMetrics` (e.g. a
  Playwright MCP run) or a `responsiveProbeCommand` that prints a
  `ResponsiveMetrics[]` manifest (the CLI ships no browser). With no metrics the
  gate is `not-evaluated` and the aesthetic verdict is unchanged; set
  `design.craft.benchmark.awardBar.responsive.require` to force `indeterminate`
  instead of a mobile-blind `cleared`. Thresholds
  (`viewport` 390 / `overflowTolerancePx` 1) are configurable. The aesthetic
  `computeAwardBar` path and its behavior are unchanged.
- 8e99a31: Add `docs-craft` — an LLM-judgment ceiling skill for documentation quality, the
  structural twin of `design-craft` and the counterpart to the rule-based doc
  floor (detect-doc-drift / check-docs / docs-pipeline). It critiques whether a
  doc teaches, whether its order matches the reader's mental model, whether
  examples earn their place, whether the prose is alive, whether an API/reference
  doc predicts the response shape, whether a stranger walks away with the same
  understanding, and whether the doc is scannable — 7 seed rubrics emitting 3-axis
  findings (tier × impact × confidence), a curated exemplar set (Stripe / Vercel /
  MDN / Linear / Tailwind), kind-aware rubric filtering, and hard exclusion of
  sibling-owned trees (knowledge-craft, spec-craft). Ships the `harness docs-craft`
  CLI, the `docs_craft` MCP tool, and the cross-cutting `critiqueDocFile` API.
- 991adce: Add `harness check-deployment` — an enforcing pre/post-deploy gate backed by a
  pure `packages/core/src/deployment` engine. It verifies deployment readiness and
  exits non-zero on unambiguous, incident-causing violations so CI can gate a deploy:
  a hardcoded secret in a pipeline or committed env file (`DEPLOY-SEC001`,
  non-waivable), a deploy target with no rollback path wired (`DEPLOY-RB001`), and a
  direct-to-production deploy with no promotion/approval gate (`DEPLOY-ENV001`).
  Maturity gaps (missing stages, weak env separation, no health check, pipeline
  smells) are surfaced as non-blocking advisories. On a repo with no deployment
  configuration the gate abstains loudly (exit 3, never a false green); `enabled:
false` opts out explicitly (exit 0). The rollback requirement is satisfied by a
  `rollback` config block, a revert/rollback workflow or script, or a documented
  runbook, tying the pre-ship gate to the post-ship rollback circuit breaker. The
  gate is standalone and opt-in via `deployment.enabled` — it is not added to the
  default `ci check`.

  The `@harness-engineering/core` bump ships the new `deployment` engine module
  (detect + evaluate + exit-code) reused by the command.

- 0156e0d: Fix a silent no-op in `code-craft`, `cli-ergonomics-craft`, and `api-craft` when
  run in their default (in-session) runtime mode.

  The default LLM provider for the craft family is the in-session provider: rather
  than call an LLM, it records each prompt and throws a deferral sentinel so the
  host chat session can answer the prompts and feed them back through a second
  `<skill>_finalize` step. `naming-craft` already implemented this two-step
  collect → finalize flow, but the three skills above swallowed the deferral in a
  bare `catch {}` and never surfaced the collected prompts. The result was that a
  default-mode invocation returned zero findings and exited successfully — a silent
  lie that looked like a clean pass.

  These three skills now implement the real two-step flow, mirroring
  `naming-craft`:
  - Each orchestrator gains `collect<Skill>Prompts` (walks the target, builds one
    prompt per unit/command/surface × rubric, persists run-state, and returns the
    prompts) and `finalize<Skill>` (stitches the host's answers back into findings
    through the same parser the inline path uses).
  - The inline entry points (`runCodeCraft`, `runCliErgonomicsCraft`,
    `runApiCraft`) now fail loudly with guidance when handed the in-session
    provider instead of returning an empty result.
  - Three new MCP tools — `code_craft_finalize`, `cli_ergonomics_craft_finalize`,
    and `api_craft_finalize` — complete the flow, and the three primary tools now
    route to the collect step in in-session mode (raising the harness MCP tool
    count to 101).

  Also closes two `code-craft` discovery gaps: it now falls back to conventional
  `src/` (then `app/`) roots when a project has no `packages/` directory — so a
  single-package repo is no longer scanned as empty — and excludes `fixtures/`
  directories from the walk, matching its `cli-ergonomics-craft` and `api-craft`
  twins.

- a6fb723: Add the `harness golden-build` reference-state primitive.

  A golden build is the canonical known-good reference state of the repo — an
  immutable, tag-like snapshot, distinct from the per-metric baselines (arch,
  coverage, benchmark) which are moving numeric ratchets. It answers "is the repo
  still the exact known-good shape we last trusted?" rather than "did metric X
  regress?".

  The snapshot is a composite fingerprint (SHA-256 per reference file) over a
  configurable set of reference files — by default the three metric-baseline files
  plus dependency/config identity anchors (`package.json`, the lockfile, the
  harness config). Hashing the baseline files means a golden sits _above_ them:
  a baseline rewrite moves the golden fingerprint too.

  Three subcommands:
  - `harness golden-build promote` — snapshot the working tree to
    `.harness/golden/manifest.json`. Byte-stable: a re-promote whose fingerprint
    is unchanged leaves the manifest untouched (informational provenance —
    `promotedAt`/`commit`/`branch` — is ignored by comparison and only refreshed
    when the fingerprint actually changes).
  - `harness golden-build verify` — compare the working tree against the golden
    and exit non-zero on any drift (changed, missing, or added reference file).
  - `harness golden-build diff` — explain what has drifted since the last golden
    (advisory; always exits 0).

  Configurable via an optional `golden` config block (`manifestPath`,
  `referencePaths`) and a repeatable `--path` override on every subcommand.

- 4bf8831: Add the Holiday Confidence KPI — the composed "if the senior disappears for two
  weeks, what holds?" measure.

  `computeHolidayConfidence` (in `@harness-engineering/signals`) reports the % of
  merged PRs over a rolling window that cleared all four unwatched-safety gates:
  (a) a multi-persona review fired, (b) the post-merge outcome-eval did not fail,
  (c) no baseline was silently auto-updated during the window, and (d) no curated
  Signal was in breach. Gates (a)/(b) are evaluated per-PR (a graded pass
  fraction); (c)/(d) are window-wide gates that collapse confidence to 0 when the
  window was not safe to leave unwatched. It reuses the existing curated-Signal
  authorities rather than pulling data in parallel — the `gh` merged-PR list plus
  the `## Assessment:` review marker for (a), graph `execution_outcome` nodes for
  (b), and the `baseline-auto-update-count` / all-Signal statuses for (c)/(d). The
  computation is repo-agnostic and parameterizable (window days, project path,
  injectable command runner / graph store / signals), so an adopter project can
  compute it too.

  The new `harness holiday-confidence` command surfaces it (`--window`, `--path`,
  `--json`). The multi-persona-review marker and the default 30-day window are now
  shared constants (`ASSESSMENT_MARKER`, `DEFAULT_WINDOW_DAYS`) so the KPI and the
  `pr-merged-without-multi-persona-review` Signal cannot drift apart.

- 4e73689: Honor persona-declared CI triggers. `harness persona sync-workflows` regenerates
  and drift-guards the committed `.github/workflows/persona-*.yml` files that make
  persona `on_pr` / `on_commit` / `scheduled` triggers real (CLI-command tier only;
  skill/LLM steps are served elsewhere).
  - Adopter-first: defaults to the published CLI via `npx` with a portable header,
    and refuses to run when the project has no `agents/personas/` (never writes the
    bundled personas into `node_modules`). `--runner workspace --advisory`
    reproduces the build-from-source, non-blocking dogfood shape.
  - `--severity` is appended only to commands that accept it (`validate`,
    `check-perf`, `check-security`) — previously it was blanket-appended and made
    most emitted steps hard-error.
  - A persona only gets a workflow when its CI tier adds something `harness ci
check` does not already run (a scheduled sweep, or a command outside the
    `ci check` aggregate), so redundant per-PR duplicate jobs are not emitted.

- ad3a9bb: Change the init default recommendation away from `basic` to
  `load-bearing-minimum`. `harness init` (and the `init_project` MCP tool) now
  scaffold the `load-bearing-minimum` tier when no `--level` is given, and the
  `initialize-harness-project` skill recommends it for new projects — the minimum
  harness that still holds when the senior reviewer is away, rather than the
  no-thresholds `basic` template that does not deliver a load-bearing harness.

  `basic` remains available as an explicit opt-down (`harness init --level basic`)
  for teams that want the lightest possible touch. The `--level` option set is
  unchanged; only the default and the skill's recommendation prose changed.

- ebcb014: Add the `load-bearing-minimum` adoption tier, sitting between `intermediate` and
  `advanced`. It is the minimum harness that still holds when the senior
  disappears for two weeks: the intermediate mechanical gates (ESLint + layer
  enforcement, a cyclomatic-complexity cap of 15, and a module-size cap) plus the
  two agent-loop gates that catch regressions no one is watching for — multi-persona
  review (`harness review-ci`) and the outcome-eval ship gate
  (`harness outcome-eval-ci`) — wired into a scaffolded CI workflow, without the
  full advanced-tier surface area.

  Scaffold it with `harness init --level load-bearing-minimum` (or the
  `init_project` MCP tool). The new `templates/load-bearing-minimum/` template
  ships `harness.config.json`, `eslint.config.mjs`, a `.github/workflows/required-review.yml`
  that runs both gates on pull requests, and `harness:review` / `harness:outcome-eval`
  package scripts for running them locally. The `--level` enum in the config
  schema, the template metadata schema, and the `init_project` MCP tool all accept
  the new value.

- 7369e11: Add opt-in constraint packs — named bundles of blocking rules a project chooses
  to enforce per lifecycle stage rather than all-or-nothing.

  A project opts in via `constraintPacks: [...]` in `harness.config.json`. Each
  pack maps onto the existing security rule sets and elevates a set of rules to
  blocking at the stage(s) it declares (`pre-commit`, `pre-merge`, `pre-release`).
  Three built-in packs ship: `secrets-and-injection` (secrets + injection, at
  pre-merge and pre-release), `ai-agent-safety` (unsafe AI-agent/MCP config, at
  pre-merge), and `web-hardening` (XSS, path traversal, unsafe network, weak
  crypto, at pre-release).

  Packs are a thin overlay on the existing check machinery, not a new enforcement
  engine: `runCIChecks` resolves the opted-in packs and merges their rule
  elevations into the security check's config before it runs, so opting in
  genuinely turns the rules on. A project's own explicit `security.rules` entry
  always wins over a pack overlay (a per-rule escape hatch). `harness ci check`
  gains a `--stage <stage>` flag to enforce only the packs that apply at that
  stage, and the check report carries a per-pack, per-stage compliance summary
  (`compliant` / `non-compliant` / `n/a`). Empty or absent `constraintPacks`
  leaves all existing behavior unchanged.

  Opting into a pack is scoped to exactly that pack's rule prefixes:
  - When a pack force-enables a scanner that was `security.enabled: false`, a
    `'SEC-*': 'off'` base is injected before the pack's elevations, so only the
    pack's own prefixes block — opting into one pack no longer turns on every
    default-error rule in the scanner. Wildcard rule resolution now prefers the
    most-specific (longest-prefix) match, so a narrow elevation is never shadowed
    by that broad base.
  - `web-hardening` no longer promotes every warning/info rule via a global
    `strict` flag (the `securityStrict` pack field is removed); it blocks only its
    four named prefixes (`SEC-XSS-*`, `SEC-PTH-*`, `SEC-NET-*`, `SEC-CRY-*`).
  - Per-pack compliance is attributed by rule prefix: a stage is `non-compliant`
    only when a failing security finding's rule id is covered by that pack's own
    prefixes, so an unrelated finding no longer marks every pack non-compliant.
    `CICheckIssue` gains an optional `ruleId` to carry this attribution.
  - `harness ci check` rejects an unrecognized `--stage` instead of silently
    running every stage, and warns when packs are opted in but the security check
    was skipped.

- 77cbacd: Add an opt-in, **multi-agent** `session-retrospect` trigger so end-of-session analysis reaches manual, interactive sessions across every agent the harness supports — Claude Code, Gemini CLI, Codex CLI, and Cursor.

  The session-archive lifecycle runs its `onArchived` step (summary, index, and retrospection) only when a session is archived, and the only caller that archives a session is the `archive_session` state action used by autonomous flows. A manually driven session is otherwise never archived, so its end-of-session analysis never runs. This trigger closes that gap: at session end it archives the active session through the same public archive seam, so `onArchived` fires for manual sessions too.
  - **One archive engine, many agents.** An agent-agnostic core (opt-in gate + once-per-session dedupe + archive call) is shared by a thin per-agent entry point. When hooks are installed at the `standard` (or `strict`) profile, the trigger is wired into each detected agent's native config: Claude Code `Stop` in `.claude/settings.json`, Gemini CLI `SessionEnd` in `.gemini/settings.json`, Codex CLI `notify` (agent-turn-complete) in `.codex/config.toml`, and Cursor `stop` + `sessionEnd` in `.cursor/hooks.json`. Only agents whose project config dir is present are wired; unrelated user config is preserved and installs are idempotent.
  - **Opt-in.** Every agent's trigger is a no-op unless `HARNESS_SESSION_RETROSPECTION` is enabled — the same flag that gates the retrospection step inside the archive lifecycle.
  - **Once per session.** Because a session-end hook can fire more than once (Claude's `Stop` on every turn-stop; Codex's `notify` on every turn), the trigger archives at most once per session, keyed on the agent's session id via a sentinel under `.harness/state/retrospection/`. A fire that finds no session writes no sentinel, so a session created later in the same run is still caught.
  - **Fail-soft.** Any error is swallowed and the hook exits 0, never blocking or delaying session exit.
  - **Known limitation (Cursor CLI).** Cursor's `sessionEnd` is IDE-only and the local `cursor-agent` CLI has historically emitted only shell-execution events. The trigger is wired for both `stop` and `sessionEnd` so it works in the Cursor IDE agent today and in the local CLI the moment it emits these events. Codex `notify` holds a single program, so an existing non-harness `notify` is reported as a conflict and left untouched rather than clobbered.

- d5760a7: Ship agent-rehearsal fixtures and the `harness rehearse` skill/command.

  `templates/rehearsal-fixtures/` now carries a set of tiny, self-contained,
  deliberately-broken fixtures — each planting exactly one failure mode that a
  real harness check is designed to catch: a hardcoded secret (`check-security`),
  an architectural layer violation and a circular import (`check-arch`), and a
  broken documentation link (`check-docs`). Each fixture ships a `rehearsal.json`
  manifest — the ground truth for what was planted, the check that should catch
  it, the expected fix, and a four-dimension scoring rubric.

  A new `harness rehearse` command drives them: `list` enumerates the fixtures,
  `show <id>` prints a manifest + rubric, and `score --fixture <id> --recovery
<record.json>` grades a structured recovery record with a deterministic,
  IO-free, LLM-free scorer (0-100 across `detected` / `correctCheck` / `fixed` /
  `noCollateral`, with pass/partial/fail tiers). The `harness:rehearse` skill
  (all four platforms) orchestrates the loop — stage a scratch copy, detect and
  repair the planted defect, assemble the record, and score. Use it to train
  personas before production trust, to regression-test the harness's own gates
  against known failure shapes, and to let adopters verify their gates fire.

  The scoring engine, catalogue loader, and contracts (`scoreRecovery`,
  `loadCatalog`, `findFixture`, `RehearsalManifest`, `RecoveryRecord`,
  `RehearsalScore`) are exported from `@harness-engineering/core`.

- 21a995b: Extend the effectiveness scorer to skill grain. A new Bayesian skill scorer
  (`computeSkillEffectiveness`, `detectFailingSkills`, `detectAbandonedSkills` in
  `@harness-engineering/intelligence`) applies the same Laplace-smoothed approach
  as the persona scorer to `.harness/metrics/adoption.jsonl` records, identifying
  failing skills and skills abandoned mid-workflow ranked sample-aware so
  low-volume skills don't dominate.

  The `harness adoption retrospective` command (the catalog-retrospective skill's
  entry point) now consumes these scores: it renders a Bayesian skill-effectiveness
  section in the Markdown report and exposes the same data under the
  `skillEffectiveness` key in `--json` output. This closes the loop between
  adoption telemetry and catalog improvement decisions.

- 840288a: External skill-provider freshness and install follow-through. `harness install` now
  offers to run `generate-slash-commands` for you (TTY-gated, with `--generate` /
  `--no-generate`) instead of only printing the hint. Skill installs record their source
  provenance in a v2 lockfile (GitHub installs capture the resolved commit SHA; v1
  lockfiles still load), and a background check passively nudges when a GitHub or npm
  provider has upstream changes. A new `harness skill update [--check]` command re-pulls
  outdated providers behind a per-provider consent prompt, and `harness update` surfaces
  outdated providers alongside its existing offers. All freshness network behavior honors
  the `HARNESS_NO_UPDATE_CHECK` kill-switch; nothing re-pulls upstream code without an
  explicit confirmation.
- 5c7332f: Add the skill-regression evaluator — a golden-fixture framework that detects
  when a skill's output quality regresses.

  A golden fixture pins one skill: a canonical input, a weighted quality rubric,
  a golden reference output, and a recorded baseline score. The
  `SkillRegressionEvaluator` scores candidate outputs semantically against the
  rubric (an LLM rules each criterion met / not-met; TypeScript computes the
  weighted score@k) and compares the aggregate to the baseline. A drop past the
  fixture's tolerance is a regression.

  The new `harness skill-regression` command runs the gate over a fixtures
  directory, blocking (exit 1) only on a high-confidence regression; every other
  verdict is advisory. Ship authority is derived in TypeScript from
  (verdict, confidence) and is never read from the model. The whole path is
  degrade-safe: a missing provider, missing fixtures, or a malformed judge
  payload resolves to an advisory verdict and exits 0. `--update-baseline`
  re-scores the golden reference output and rewrites the fixture baseline in
  byte-stable JSON. Ships with example fixtures for `harness-spec-craft` and
  `harness-copy-craft`.

- c6ee2dc: Add `uat-signoff` — a human-judged user-acceptance sign-off skill and its
  `uat_signoff` MCP tool. This closes the acceptance/outcome edge of the change
  lifecycle: it is the terminal, human-authority stage under
  `docs/changes/<slug>/`, the same slug used by the spec, plan, code review, and
  `outcome-eval`. Where `acceptance-eval` and `outcome-eval` are
  spec-vs-implementation, LLM-judged, TS-authority-derived, and
  merge/ship-blocking, `uat-signoff` is intent(Success-Criteria)-vs-shipped-reality,
  HUMAN-judged, and advisory. The human is the authority: the skill runs no LLM
  verdict and derives no ship authority — it records the decision a person already
  made.

  The skill is a plain-text guided interview (slug-scoped, no code surface). It
  reads the change's `docs/changes/<slug>/proposal.md` `## Success Criteria` (with
  `plans/` and prior review/outcome-eval records as supporting context), walks the
  human through each acceptance item one at a time (capturing ACCEPT, REJECT, or
  CHANGES_REQUESTED with an optional note), captures one overall decision plus the
  signer, writes `docs/changes/<slug>/signoff.md`, and persists exactly one
  `execution_outcome`-shaped node via the `uat_signoff` MCP tool
  (`source: "uat-signoff"`, `result` derived from the overall decision; the
  per-item dispositions, signer, and closed criteria refs ride in additive
  metadata). Reusing the shared `execution_outcome` shape means the eval-fail-rate
  signal and effectiveness baselines consume the record for free — no new node
  type. The skill ships across all four platform trees (claude-code / cursor /
  codex / gemini-cli) and is wired into the catalog, slash commands, and plugin.

- 409e970: Add a real `--severity <error|warning|info>` flag to `harness validate` and
  `harness check-perf`, mirroring `harness check-security`.

  Persona CI workflows pass a persona-declared `--severity <level>` to their
  command steps, but only `check-security` accepted the flag — `validate` and
  `check-perf` hard-errored on it despite both already carrying a per-finding
  severity model. Both commands now honor the threshold: when `--severity` is set,
  findings below it are excluded from BOTH the report and the pass/fail verdict
  (the command fails only when a finding at or above the threshold exists);
  findings below the threshold never fail the gate.

  Default behavior is unchanged. When `--severity` is omitted, every finding is
  still reported and the verdict fails only on error-severity findings (for
  `validate`, the hard checks that carry no explicit severity continue to fail as
  before) — warnings and info are reported but never flip the verdict.

  Widening the persona generator's flag whitelist so personas can declare these
  thresholds is a follow-up; this change is the command capability only.

- a2e4cc6: Wire outcome-eval in as an automatic, blocking post-execution spec-satisfaction gate.
  - Add `harness outcome-eval-ci`: a headless, CI-runnable surface of the outcome-eval gate. It resolves the spec (explicit `--spec` or auto-discovered from the diff), the diff range, and optional captured test output; runs the `OutcomeEvaluator`; persists the `execution_outcome` node to `.harness/graph`; and turns the TypeScript-derived ship authority into an exit code — blocking (exit 1) only on a high-confidence `NOT_SATISFIED` under `--block-on blocking` (the default). Degrade-safe: no resolvable spec, no analysis provider, an empty diff, or a persistence failure yields an `INCONCLUSIVE`/advisory verdict and exit 0.
  - Enrich `OutcomeEvaluator` persistence: the `execution_outcome` node now carries the full verdict (`rationale`, `authority`, `unmetCriteria`) plus an optional `commit` sha, so a sha-keyed consumer (the pre-merge brief) can reconstruct and surface the verdict. `OutcomeEvalInput` gains an optional `commit` field; the `outcome_eval` MCP tool threads it through. All additive — a node written without a commit keeps the prior shape aside from the new verdict fields. `authority` on the node is the TS-derived value, never read from the LLM.

### Patch Changes

- 88ea428: Add `harness roadmap install-hook` — an adopter-facing installer for the roadmap
  aggregate-regeneration git hook (#688).

  Projects that shard their roadmap (`docs/roadmap.d/`) keep the generated
  `docs/roadmap.md` aggregate fresh with a `pre-commit` step that runs `harness
roadmap regen`. This command installs that step into an adopter's own hook,
  composing safely with an existing husky (`.husky/pre-commit`) or raw
  `.git/hooks/pre-commit` setup. It is idempotent (a fenced managed block is
  replaced in place, never duplicated, and never clobbers the adopter's own hook
  steps) and degrades gracefully when the project is not sharded (skips unless
  `--force`). CI (`harness validate`) remains the authoritative freshness contract;
  this hook is a local developer convenience.

  The `@harness-engineering/core` bump is the read-source invariant-R allowlist
  entry for the new command (the generated hook block names `docs/roadmap.md` as a
  git path, not a content read); no runtime behavior changes in core.

- 0498381: Fix `check-arch --update-baseline` rewriting the committed arch snapshot on a feature branch
  when the base ref is unreadable (closing a gap in the per-PR allowance feature).

  The allowance feature routed `--update-baseline` to the snapshot-rewriting whole-snapshot path
  for EVERY resolution that was not `base-ref`. But a feature branch resolves to `working-tree`
  not only in the legitimate single-writer contexts (on the base branch, in a non-git dir, under
  `HARNESS_ARCH_FORCE_WORKING_TREE`) — it also falls back to `working-tree` whenever the base ref
  is merely unreadable: an unfetched worktree, a shallow clone, or a moved/unreadable base copy.
  In that case `--update-baseline` REWROTE `.harness/arch/baselines.json` on the branch (and
  without `--allow-regress` refused with "it WORSENS N metric(s)"), silently reintroducing the
  exact `baselines.json` merge cascade the allowance mechanism exists to prevent, so a legitimate
  value regression (e.g. `dependency-depth`, `module-size`) could never be acknowledged
  conflict-free.

  The whole-snapshot (snapshot-rewriting) path is now restricted to the contexts where it is
  actually correct — the base branch, a non-git dir, `HARNESS_ARCH_FORCE_WORKING_TREE` (the
  post-merge refresh-baselines job), and a genuine bootstrap where the base branch has no
  baseline at all. A feature branch whose base ref was unreadable but which already has a
  committed baseline now writes a per-PR allowance against the working-tree baseline instead,
  leaving `baselines.json` byte-identical. Aggregate category value regressions and warning-level
  new violations are both allowanceable; error-severity new violations are still never
  allowanceable — a genuine threshold breach must be fixed.
  - `resolveArchBaseline` now reports a `fallback` reason (`forced` / `non-git` / `base-branch` /
    `base-ref-unreachable` / `base-ref-absent` / `base-ref-invalid`) on every non-`base-ref`
    resolution, and a new `isWholeSnapshotContext(resolution)` helper encodes which contexts may
    rewrite the committed snapshot. Both are re-exported from `@harness-engineering/core`.

- fc20e42: Auto-triggered retrospection with applyable proposals.

  Archiving a session — the session terminus — now optionally fires a
  retrospection over the archived session corpus and emits _applyable_ skill
  proposals into `.harness/proposals/`, rather than requiring a manual retro run.

  The trigger reuses the existing session-archive lifecycle: `buildArchiveHooks()`
  gains a third `onArchived` step (alongside summary and search-index) that runs a
  new `retrospectArchivedSession()` in `@harness-engineering/orchestrator`. It is
  opt-in and safe — it fires only when a `sessions.retrospection` config block is
  present (`enabled !== false`) and an analysis provider is available, and every
  step remains individually non-fatal. The `manage_state` `archive_session` MCP
  action activates it live when `HARNESS_SESSION_RETROSPECTION` is set and a
  provider resolves; otherwise behaviour is unchanged.

  Emitted proposals are ordinary `SkillProposal` records — the same shape produced
  by `emit_skill_proposal` — so they carry the target (`targetSkill` for
  refinements), the change (`content.diff`, or `content.skillYaml` + `skillMd` for
  new skills), and the rationale (`justification`), and they surface, gate, and
  promote through the unchanged review pipeline. New in
  `@harness-engineering/types`: `RetrospectionProposalDraftSchema` /
  `RetrospectionProposalsResponseSchema` (a projection of the emit input, no
  parallel proposal type) and a `RetrospectionConfig` on `SessionsConfig`.

  Emission only — nothing is auto-applied. Approval and promotion stay a separate,
  human-gated step.

- b83b45b: Add `CanaryResultsIngestor` — turns canary run history into `test_result` nodes
  (per run + per test) with `tested_by`/`failed_in` edges, reusing existing graph
  node/edge types (no schema bump). Wire `ingest_source({ source: 'test-results' })`
  to read records via the canary adapter (CLI layer) and drive the graph-only
  ingestor; a no-op when canary has produced no results. `CanaryResultsIngestor`
  imports no canary code, so `@harness-engineering/graph` stays free of canary
  coupling.
- 22c2686: Fix `check-docs` / `cleanup` file-discovery blind spots (#1146).

  Three independent blind spots made these gates report on an unrepresentative
  slice of a repo — and, in the degenerate case, a confident 100% green over zero
  files:
  - **`.mjs` / `.cjs` were invisible.** `checkDocCoverage` discovered source with
    `**/*.{ts,js,tsx,jsx}`; it now includes `.mjs`/`.cjs`, matching the entropy
    analyzer. Every ESM-first repo was previously invisible to docs coverage.
  - **Dot-directories were never traversed.** The shared `findFiles` now passes
    `dot: true`, so first-party source under a dot-directory (`.canary/`,
    `.config/`, …) is discovered. The genuine ignore list (`.git`,
    `node_modules`, the `.harness` runtime, virtualenvs, build/tooling caches)
    stays excluded. This also cures false `NOT_FOUND` drift findings from
    `cleanup --type drift`, whose exports index is built from the same discovery.
  - **A zero-file scan reported 100%.** `checkDocCoverage` now reports a `scanned`
    denominator and never returns a confident 100% when it read nothing; the
    `check-docs` command surfaces the abstention explicitly (distinct exit code,
    `x/y files documented` denominator on every run), mirroring the
    `check-security` precedent.

  Additionally, `check-docs` now honors `entropy.excludePatterns` from
  `harness.config.json` (previously hardcoded), so config governs it identically
  to the `harness ci check` path.

- c246089: Add `harness check-operational-drift`: a diff-based check that flags changes to operational-policy surfaces (hook profiles, `.husky/**`, the pre-commit `--skip` list, and `harness.config.json` threshold fields) that lack a corresponding ADR under `docs/knowledge/decisions/`. Advisory by default; configurable to blocking via `operationalPolicy` config or `--strict`.
- bfb3500: Deflake the two CLI tests that block the full-suite `test:coverage` pre-push
  gauntlet.

  The pre-push gate runs `turbo run test:coverage` for the whole workspace, so a
  flaky CLI test gates every PR — including orchestrator-only changes, since CLI
  depends on orchestrator. Two CLI tests fail under v8 coverage + parallel-worker
  CPU starvation:
  - `slash-commands/integration.ts > detects orphaned codex skill directories`
    carried a per-test `{ timeout: 15000 }` cap that overrode the package's 90s
    ceiling. The test runs `generateSlashCommands` twice (heavy synchronous
    filesystem writes) and reliably blew 15s under full-suite coverage load,
    failing effectively every `test:coverage` run. The cap is removed so it
    inherits the generous global ceiling (same fix as #1153 for orchestrator).
  - `commands/scan-config.ts > scans large config files within 100ms` asserted a
    hard 100ms perf budget that v8 instrumentation inflates past. The budget is
    now coverage-aware (relaxed via HARNESS_COVERAGE, forwarded from vitest.config
    when `--coverage` is passed) while still catching an order-of-magnitude
    regression.

  Test-only and deterministic: no source or behavior changes, no assertions
  weakened, no tests skipped, coverage unchanged.

- 160a243: Support path exclusions for the design-token drift linter via `design.exclude`.
  The linter now honors a `design.exclude` glob list (minimatch), stacked on top
  of the project-wide `analysis.exclude` — letting monorepos scope DRIFT-\* findings
  out of token-palette sources, test files, and non-UI code. This also makes the
  drift linter honor `analysis.exclude`, which every other analysis scanner already
  respects. Default behavior is unchanged when neither is configured.
- 0563679: Dogfood the Holiday Confidence KPI in this repo: register the tracking command
  and wire a scheduled workflow that records the measure at each release point, so
  the "if the senior disappears for two weeks, what holds?" signal is exercised on
  our own history rather than only shipped for adopters.
- 1e5db59: Promote two domain skills from advisory prose to load-bearing mechanical checks. `owasp-injection-prevention` gains `SEC-INJ-004`, which flags Prisma `$queryRawUnsafe`/`$executeRawUnsafe` called with interpolated or concatenated input (enforced by `harness-security-scan`). `a11y-aria-patterns` gains a new `AriaScanner` (`A11Y-014` aria-hidden on a focusable element, `A11Y-042` positive tabindex), invoked by `harness-accessibility`. Both checks fire only on statically-decidable values to keep false positives near zero. The CSRF, rate-limiting, and idempotency-key skills remain advisory — a low-false-positive mechanical check is not achievable for them without framework-aware data-flow analysis.
- f91c9c4: Fix documentation-coverage scanner self-excluding when the checkout's own
  absolute path contains a skip-dir segment (notably `.claude`).

  `checkDocCoverage` matched its exclude globs against each file's absolute path
  as well as its scan-root-relative path. When the default skip-dir globs include
  `**/.claude/**` and the checkout lives under `<repo>/.claude/worktrees/<agent>/`
  (where `isolation: worktree` agents run), every file's absolute path contained
  `/.claude/` and matched, dropping all files. The denominator collapsed to zero,
  which — since the zero-denominator became a loud failure — produced
  deterministic false "stale docs" failures on those checkouts (CI was unaffected
  because CI checkouts are not nested under a skip-dir).

  The exclude globs now match the scan-root-relative path only, so the checkout's
  own path prefix can no longer self-match. A skip directory that genuinely lives
  inside the scanned tree is still excluded.

- af8b56f: Make the knowledge graph work inside git worktrees. `.harness/graph/` is
  gitignored, so `git worktree add` never copies it into a linked worktree and
  every graph read reported "No graph found". A new `resolveGraphDir` in
  `@harness-engineering/graph` lets reads borrow the main worktree's graph (located
  via git's `commondir` metadata) when the worktree has none, while writes stay
  worktree-local so a scan never clobbers the main graph and a worktree-local scan
  still takes precedence. All graph read paths (graph query/export/status,
  traceability, impact-preview, freshen, pre-merge-brief, signals, and the whole
  MCP graph surface via the shared loader) are routed through it.
- c2371d1: Fix the hook installer so installed hooks load cleanly in adopter projects.
  - Write `.harness/hooks/package.json` (`{ "type": "module" }`) at install time (both `harness hooks init` and `harness hooks add`). The hook scripts are ES modules shipped as bare `.js`; without this marker Node resolves their module type from the adopter's nearest `package.json` — which is CommonJS-default (or absent) in most projects — and reparses each hook as ESM at runtime, emitting a `MODULE_TYPELESS_PACKAGE_JSON` warning on every hook fire.
  - Ship `read-hook-stdin.js` alongside the hooks that import it. Those hooks were installed without their shared sibling module and failed at load with `ERR_MODULE_NOT_FOUND` — a non-blocking failure that silently stopped the gate from running. A new registry↔import drift guard fails the build if a hook imports a sibling module the installer does not ship, so this cannot silently regress.

- 24ad8c3: Make `harness init --template <name>` actually render standalone named templates.
  `init` passes the `--template` value in as `level`, but `resolveTemplate` only
  matched an adoption-level scaffold (`template.json.level`), so named templates
  whose `template.json` declares no `level` (`ci-pre-merge-brief`, and even the
  documented `orchestrator` example) failed with `Template not found for level: <name>`.
  `resolveTemplate` now falls back to matching by template `name` when no level
  matches, rendering that template standalone — honoring an explicit `extends` but
  never dragging in the basic-level scaffold. `init` also supplies the
  `runner`/`blockOn`/`baseBranch` defaults the `ci-pre-merge-brief` workflow needs
  under strict-mode Handlebars. Level-based `init` is unchanged.
- 68b0da7: Guard the `chmodSync` in `harness roadmap install-hook` with a `process.platform !== 'win32'` check (regression from the initial install-hook landing) so the platform-parity gate passes and Windows adopters don't hit a chmod error.
- d6c160c: Fix two `harness knowledge-pipeline` correctness bugs where the command produced
  confident, unactionable verdicts (#1110, #1111).

  **Coverage abstains on a zero denominator (#1110).** `CoverageScorer` graded a
  domain `F` whenever it had no linkable code (`0/0`), so "no graph / no data" and
  "genuinely bad coverage" were indistinguishable — a fresh checkout with no graph
  scored worse than a real assessment. Domains with no linkable-code denominator
  are now reported as `measured: false` / grade `N/A` and excluded from the
  aggregate; an entirely empty graph yields `graphPresent: false` and an `N/A`
  overall grade. The `--coverage` output prints an explicit "no graph — run
  `harness graph scan`" escalation instead of a grade, and per-domain `0/0` lines
  render `N/A` rather than `F (0/100)`. A first-run drift score (all findings
  `new`) is now labelled so `1.00` is not misread as "everything drifted".

  **Test files and fixtures are excluded from extraction (#1111).** The code-signal
  extractors walked `tests/`, `fixtures/`, `expected/`, and snapshot trees, staging
  test titles and golden-file data as `business_rule`/`business_term` gaps — so the
  gap report's "undocumented" count was dominated by test artifacts. `ExtractionRunner`
  now applies a default exclude set (test files and fixture/golden/snapshot trees,
  mirroring the existing `security.exclude` / `entropy.excludePatterns` conventions),
  extendable via a new `knowledge.extractionExclude` config field. Staged entries
  now carry their source `path` so a finding is attributable without grepping the
  repo. First-party source is untouched.

- 5c72805: Give maintenance checks a standard machine-parseable findings contract (#691).

  `harness maintenance run` (and the cron orchestrator) previously recovered each
  task's findings COUNT by regex-scanning free-text check output
  (`N findings|issues|violations|errors`, plus a keyword fallback). That is
  fragile: checks like `check-docs` (doc-drift) and `cleanup` (entropy) emit no
  clean count — so doc-drift reported a uniform "1 finding" — and any wording
  change could silently break the count.

  A new shared envelope (`@harness-engineering/types`:
  `MaintenanceFindingsContract` + `formatFindingsContract` / `parseFindingsContract`)
  lets a check subcommand emit its count as structured data
  (`{"findings":N,"check":"...","v":1}`) under a `--findings-json` flag. The
  runner's shared spawn/parse core (`runHarnessCheck`) now prefers that envelope
  over the regex on both clean and non-zero exits, and labels the source
  (`findingsSource: 'contract' | 'regex'`). The legacy regex remains the fallback
  for checks not yet migrated.

  Migrated built-in checks: `check-arch`, `check-deps`, `check-docs`, `cleanup`,
  `check-security`, `cross-check` (their registry `checkCommand`s now pass
  `--findings-json`). Fully additive and backward-compatible — the flag defaults
  off for interactive CLI use and unmigrated checks are unchanged.

- 4b6f846: Add `harness mcp list-capabilities [--by-permission] [--json]` — a read-only adopter-audit command that surfaces, per MCP tool, its read/write/exec scopes, network access, and the existing `trustedOutput` trust tag. Scopes are now authoritative, evidence-based DECLARATIONS carried on each tool definition (`capability?: { scopes; network? }`, authored in `tool-capability-declarations.ts` and compiled into the registry), derived from each tool's actual behavior — fs writes, `child_process`/`execFile`/`spawn`, outbound `fetch`/HTTP, graph/DB writes — not from the tool name. The tool-name verb-prefix heuristic is kept only as a clearly-labeled fallback (`source: heuristic`) for any not-yet-declared tool; a coverage test forces every registered tool to declare. Helps adopters see exactly what their agent can do through the MCP server.
- a766cda: Define the `owns:[paths]` owned-files declaration on plan tasks (#601). Adds a cheap, deterministic, graph-free pre-execution conflict forecast: `forecastOwnershipConflicts` and glob-aware `pathsOverlap` (via minimatch) flag task pairs whose declared owned paths overlap and so may conflict if run in parallel. `buildTaskGraph`/`planParallelization` now compute footprint overlap glob-aware and surface an `ownershipForecast` field on `ParallelizationPlan`. Fully additive — absent `owns` preserves current behavior.
- 9e838bb: Add per-skill `capabilities:` declarations to skill.yaml (#558).

  Skills now declare a capability envelope — `{ tools, network, filesystem }` —
  derived mechanically from the existing `tools:` list. `harness skill validate`
  enforces it: every harness-authored skill must declare `capabilities`, and any
  declared envelope must stay consistent with the skill's `tools:` (drift, e.g.
  adding `WebFetch` without `network: true`, fails validation). All 89
  harness-authored skills are seeded. This ships the declaration + validation
  layer; runtime bounds-enforcement is a follow-up.

- 24ad8c3: Graduate the pre-merge brief to an adopter-facing artifact. `harness init` can
  now render the opt-in `ci-pre-merge-brief` template — a GitHub Actions workflow
  that runs `harness review-ci` then upserts the senior-facing `harness
pre-merge-brief` sticky PR comment (diff, review verdict, Signal status,
  outcome-eval, and "worth your eyes") — plus a matching branch-protection ruleset
  for the eventual acknowledgment gate. Mirrors how `ci-required-review` graduated:
  a discoverable, opt-in named template directory rendered by the existing
  `TemplateEngine` (no engine change). Every brief section degrades independently,
  so the workflow runs in a plain adopter CI without a daemon or signal providers.
- 308b4b9: Make the runtime hooks read stdin resiliently under load. `adoption-tracker`,
  `pre-compact-state`, `telemetry-reporter`, `sentinel-post`, and `cost-tracker`
  now read stdin through the shared `readHookStdin()` helper (already used by the
  enforcing hooks) instead of a raw `readFileSync(0)`. The helper retries the
  EAGAIN that fd 0 throws when the writer hasn't filled the pipe yet, so under
  compound load (the pre-push `test:coverage` gate running these hooks under v8
  coverage) the hooks no longer mistake pipe backpressure for empty stdin and
  silently skip their work — the dominant source of non-deterministic failures in
  the pre-push gate (#620). Behavior is otherwise unchanged: these log-only hooks
  still fail open on a genuine read failure or empty stdin.
- cf37c7d: Add `harness proposals status` and correct the skill-proposal docs (#551).

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

- a72ecae: Fix `harness review-ci` crashing with `spawnSync git ENOBUFS` (exit 2, no verdict) on any diff larger than ~1 MB (#1098).
  - The injectable git seam now passes an explicit, bounded `maxBuffer` (256 MB) to `execFileSync`, so `git diff` for large PRs no longer overflows Node's 1 MB default and throws `ENOBUFS`. The bound is applied on the shared seam, covering both the `symbolic-ref` and payload-carrying `diff` calls.
  - `review-ci` now degrades gracefully: if a git/diff/parse step still fails (an overflow beyond the bound, a missing ref, git absent from PATH, or an unparseable diff), it emits a valid, parseable verdict envelope with `skipped: true` and `skipReason: "internal error: <message>"` instead of crashing with a bare exit 2 and empty stdout. A `--json` consumer always receives a parseable result and can distinguish "the reviewer could not run" (process exit 3, abstained) from "the reviewer objected" (exit 1).
  - An unknown `--runner` still fails fast (exit 2) and is never laundered into an abstention.

- 2f5d572: Sharded roadmap: `groom` now archives `done` rows into a sharded archive
  (`docs/roadmap.d/archive/<slug>.md`) instead of the monolith
  `docs/roadmap-archive.md` when the project is in sharded mode. Each done shard is
  MOVED byte-for-byte (full frontmatter + body preserved), so the motion is lossless
  and reversible. The active read path already excludes the `archive/` subdirectory,
  so archived shards drop out of `load()`, the regenerated aggregate `docs/roadmap.md`,
  and active `show`/`query` — the archive is history, not active state. The monolith
  `groom` path is unchanged.

  New core store helpers: `archiveShards`, `restoreShards`, `readArchivedShards`,
  `archiveShardDir`, `ARCHIVE_SUBDIR`, and the project-level `archiveDoneShardsForProject`.

- ad21769: Fix `check-security` scanning no `.mjs`/`.cjs` files, and report the scan
  denominator (#1084).

  The scan glob was `**/*.{ts,tsx,js,jsx,go,py,java,rb}`, so an ESM-only Node
  project got a scan that matched none of its source and a gate that passed because
  it read nothing — indistinguishable, in the output, from a genuinely clean run. In
  the repo where this surfaced, 144 tracked `.mjs` sources went unread while a
  security ledger recorded `securityScore: 100`; a planted AWS key was detected in
  `.ts` and `.py` and invisible in the byte-identical `.mjs`.

  The glob was duplicated across `check-security`, the CI check-orchestrator, and
  the dashboard's security gatherer, and the copies had drifted (the orchestrator's
  also omitted `java`/`rb`). It now has one home,
  `core/src/security/scan-targets.ts` (exported as `SECURITY_SCAN_GLOB` /
  `SECURITY_SCAN_EXTENSIONS` / `SECURITY_SCAN_DEFAULT_IGNORE`), with `mts`/`cts`
  added alongside `mjs`/`cjs`.

  `check-security` now also reports what it read: text output appends the
  files-scanned and rules-applied counts, JSON output gains `scannedNothing` and
  `stats`, and a zero-file scan emits an explicit ABSTAINED issue instead of
  presenting as clean. New `--fail-on-empty` makes that abstention blocking for CI
  gates; the default stays non-blocking so repos with legitimately no scannable
  source are not reddened by the upgrade.

  Behaviour change to expect: projects containing `.mjs`/`.cjs`/`.mts`/`.cts`
  sources will see findings that were previously invisible, including in
  `harness ci check` and the dashboard's security panel.

- 254e959: Add the `harness check-vocabulary` command — a config-driven, adopter-facing semantic-vocabulary gate. It reads a `vocabulary` block from the project's `harness.config.json` (deprecated → canonical term rules, plus `paths`/`exclude` globs) and fails when a deprecated or renamed canonical term reappears in Markdown prose, reporting the file, line, deprecated term, and suggested canonical replacement. The pure scanner strips fenced/inline code, matches case-insensitively on word boundaries, and honors per-rule `allow` exemptions; `--json` output is supported and the gate passes trivially when disabled or ruleless. Harness dogfoods it via its own five seed rules wired into CI.
- 999819a: Fix two config-preservation gaps in the multi-agent session-retrospect installer (follow-up to #1136).

  The installer that wires the opt-in `session-retrospect` trigger into Gemini CLI, Codex CLI, and Cursor documents that "unrelated user config is always preserved," but two paths violated that:
  - **Gemini / Cursor JSON clobber (data loss).** When an existing `.gemini/settings.json` or `.cursor/hooks.json` failed to parse (a hand-edited file, JSONC/comments, a trailing comma, a partial write), the reader treated it as absent and the writer then overwrote the whole file with only the harness hook — silently destroying the user's `theme`, `mcpServers`, and every other setting. The reader now distinguishes absent / valid-object / unparseable and the writers report a `conflict` (leaving the file untouched) instead of overwriting, mirroring how `hooks init` refuses to clobber a malformed `.claude/settings.json`.
  - **Codex TOML corruption.** The `notify` key was inserted before "the first line beginning with `[`". A top-level nested-array literal (e.g. `matrix = [\n  [1, 2],\n]`) has element lines that begin with `[`, so `notify` could be spliced _inside_ the array and corrupt the TOML. `notify` is now prepended as a top-level key at the very top of the file, which is always valid TOML — it precedes every table and is never placed inside a multi-line array.

  Both fixes are covered by new regression tests. Runtime behavior of the hooks themselves is unchanged; this only hardens the one-time install-time config writes.

- 2868bb4: Strip a harness-engineering-internal sub-project reference (`(sub-project #5)`) from the adopter-facing `harness check-design` command description. Part of the broader pass that genericizes internal roadmap/PR/issue/sub-project references leaking into shipped skills, slash commands, and subagent definitions, with a new guard test (`agents/skills/tests/internal-refs.test.ts`) that fails when a new internal reference reaches a distributed surface.
- 3aec4bd: Make the two skill required-section gates read one source of truth.

  The `harness skill validate` CLI validator and the `agents/skills` vitest
  structure test each maintained their own copy of the required-section lists,
  and they had drifted: the validator required `## Rationalizations to Reject`
  on behavioral skills while the structure test did not, so skills missing that
  section passed CI on the weaker gate.

  `@harness-engineering/core` now exports the canonical lists —
  `BEHAVIORAL_REQUIRED_SECTIONS`, `KNOWLEDGE_REQUIRED_SECTIONS`, and
  `RIGID_SECTIONS` — from a new `skills/required-sections` module. The CLI
  validator (`harness skill validate`) imports them instead of its former inline
  copies, so both gates derive their rules from the same constant and cannot
  silently diverge again. Validator behavior is unchanged; this is an
  internal dedup plus a new public export.

- cf9044c: Move the first-run telemetry privacy notice from stderr to stdout so it is visible in IDE sessions where stderr is hidden, and reword it to truthfully describe what is collected (skill name/outcome/duration/phases, OS/Node/harness versions, a random install ID, and — when configured — git user.name and project/team names). The once-only first-run marker behavior and all telemetry send behavior are unchanged.
- 0922728: Tier the skill catalog with first-class curation metadata and surface it.

  Skills now carry a first-class `catalog_tier` field in `skill.yaml` (`0` =
  load-bearing gear, `1` = library / on-demand reference — the default, `2` =
  deprecated / retire candidate). This is distinct from the existing `tier` field,
  which governs slash-command/catalog _loading_; the new axis names how
  load-bearing a skill is. The premise: a senior engineer can hold ~12 skills in
  their head, not hundreds — so the twelve load-bearing gear skills are marked and
  surfaced first.

  The tier is genuinely wired through the surfaces a reader sees:
  - **Skills Catalog** (`docs/reference/skills-catalog.md`) leads with a
    "Load-Bearing Gear (Tier-0)" section and annotates non-default entries with
    their curation tier.
  - **README** gains a "Load-bearing skills (Tier-0)" table mapping each gear skill
    to its slash command.
  - **Dashboard command palette** pins the load-bearing skills in their own section
    above the category groups and badges each card (`@harness-engineering/dashboard`).

  The `@harness-engineering/cli` bump adds the `catalog_tier` field to the skill
  metadata schema. The `@harness-engineering/core` bump tracks the
  `initialize-harness-project` → `harness-initialize-project` skill rename in the
  harness-strength init-skill path (the STRENGTH-005 rule and context loader); no
  runtime behavior changes.

  The load-bearing init skill is renamed from `initialize-harness-project` to
  `harness-initialize-project` so it sorts with the rest of the workflow gear. The
  slash command is unchanged — it stays `/harness:initialize-project`.

- 16ce217: Reduce `parseFencedJson` complexity in `docs-craft/phases/critique.ts` past the
  arch gate's new-code threshold (cyclomaticComplexity 12 > 10), which was blocking
  all commits on `main` (#1087). Fence-stripping and object-narrowing are extracted
  to `stripJsonFence` and `asJsonObject`, leaving the parser as try/catch plus two
  calls. Behaviour is unchanged and the `SEC-DES-001` ignore comment is retained,
  now pointing at `asJsonObject` where the shape gate lives.
- 7541324: Fix two Windows platform-parity failures: `resolveSpecPath` in `outcome-eval-ci` now normalizes joined paths to forward slashes so spec identity is stable across platforms (it previously emitted backslashes on Windows), and the `roadmap install-hook` executable-bit test assertion is now guarded to non-Windows, matching the `chmodSync` platform guard from #1092 (chmod is a no-op on Windows).
- Updated dependencies [88ea428]
- Updated dependencies [21df39b]
- Updated dependencies [0498381]
- Updated dependencies [59590da]
- Updated dependencies [fc20e42]
- Updated dependencies [18f2180]
- Updated dependencies [d74f5ec]
- Updated dependencies [b83b45b]
- Updated dependencies [b83b45b]
- Updated dependencies [9852aaa]
- Updated dependencies [22c2686]
- Updated dependencies [89fcfd7]
- Updated dependencies [9255687]
- Updated dependencies [bfb3500]
- Updated dependencies [2115861]
- Updated dependencies [e294b1d]
- Updated dependencies [1e5db59]
- Updated dependencies [991adce]
- Updated dependencies [29bdefe]
- Updated dependencies [f91c9c4]
- Updated dependencies [a6fb723]
- Updated dependencies [af8b56f]
- Updated dependencies [4bf8831]
- Updated dependencies [d6c160c]
- Updated dependencies [a42b4f2]
- Updated dependencies [d59c152]
- Updated dependencies [5c72805]
- Updated dependencies [7369e11]
- Updated dependencies [de52864]
- Updated dependencies [a766cda]
- Updated dependencies [2f5d572]
- Updated dependencies [e69f401]
- Updated dependencies [4cc1e4e]
- Updated dependencies [97ddd1c]
- Updated dependencies [817e40c]
- Updated dependencies [ad21769]
- Updated dependencies [d3e725d]
- Updated dependencies [d5760a7]
- Updated dependencies [21a995b]
- Updated dependencies [5c7332f]
- Updated dependencies [3aec4bd]
- Updated dependencies [5a454d5]
- Updated dependencies [c9076aa]
- Updated dependencies [0922728]
- Updated dependencies [c6ee2dc]
- Updated dependencies [a2e4cc6]
  - @harness-engineering/core@0.40.0
  - @harness-engineering/types@0.27.0
  - @harness-engineering/intelligence@0.11.0
  - @harness-engineering/orchestrator@0.20.0
  - @harness-engineering/burn@0.1.0
  - @harness-engineering/graph@0.12.0
  - @harness-engineering/dashboard@0.15.0
  - @harness-engineering/signals@0.3.0

## 10.2.0

### Minor Changes

- 1e16944: feat(check-arch): require `--allow-regress --reason` to update a baseline that worsens a metric (#530)

  `harness check-arch --update-baseline` previously accepted regressions silently — a worsened
  complexity/coupling/module-size value could be baked into the baseline with no record. Now,
  when an update would WORSEN any metric versus the current baseline (beyond the configured
  regression tolerance), it is rejected unless the caller passes `--allow-regress --reason "…"`.
  The accepted regression (categories, before→after, delta, commit, reason) is appended to
  `.harness/audit.log`, forcing the decision into the open. A first-capture (no baseline) or a
  non-worsening update is unaffected.

- 79b0764: feat(design-craft): MarketingPage exemplar tier + page-level rubrics

  The design-craft catalog gains a page-scoped `MarketingPage` component type: nine
  award-documented whole-page exemplars (CRAFT-B009..B017 — Awwwards SOTD/HM winners
  and published studio case studies, each with verified provenance) and three
  page-level rubrics — `concept-coherence` (CRAFT-C011), `composition-art-direction`
  (CRAFT-C012), and `surface-texture-material` (CRAFT-C013), all `appliesTo: ['page']`.

  BENCHMARK on a page target with `componentType: 'MarketingPage'` now resolves to the
  marketing-page corpus instead of the product-UI component set, so marketing/brochure
  pages converge toward art-direction craft (concept, composition, texture) rather than
  component polish alone. No matcher changes were needed (open-string ComponentType,
  equality filtering) — recorded in ADR 0082 along with the decision to ship the page
  tier before section-level anchors.

- 1778d71: feat(mcp): let the eval judgment tools run fully-locally

  `acceptance_eval` and `outcome_eval` construct an LLM `AnalysisProvider` to judge
  a spec's acceptance criteria / an outcome — but both hardcoded
  `AnthropicAnalysisProvider` and returned `null` without `ANTHROPIC_API_KEY`, so in
  a fully-local run (no cloud key) the judgment silently degraded to an advisory
  stub and the tools were effectively inert. That left a local pipeline's weak
  coder with no strong judge for the reconciliation it can't do on its own.

  Both resolvers (previously byte-identical) are unified into a shared
  `resolveAnalysisProvider` that adds a local fallback: when no `ANTHROPIC_API_KEY`
  is set but `HARNESS_ANALYSIS_BASE_URL` is, it constructs an
  `OpenAICompatibleAnalysisProvider` against that `/v1` endpoint
  (`HARNESS_ANALYSIS_MODEL` names the judge; `HARNESS_ANALYSIS_API_KEY` defaults to
  `ollama`) — so the reasoner can serve verdicts on-device. Anthropic still wins
  when a key is present (backward compatible); absent both signals, behaviour is
  byte-identical to before (null → advisory).

  This is the foundation for wiring the harness's own verifier/reviewer judgment
  into the local orchestrator's stages; a follow-up threads the reasoner endpoint
  into the injected MCP server and updates the local stage prompt to call these
  tools.

- 0921ca1: feat(roadmap): `harness roadmap sync` CLI with CI-safety guards and zero-denominator exit

  The full bidirectional roadmap↔tracker sync was reachable only through the
  `manage_roadmap action:"sync"` MCP tool. CI could therefore only ever flip rows
  **to `done`** (via `roadmap reconcile`) — every other transition and the whole
  tracker-label push depended on a human remembering to run an MCP tool. In one
  downstream repo that left `last_synced` 22 days behind `last_manual_edit` and 22
  issues with no tracker labels at all, invisible to a tracker scoped by a
  selector label.

  `harness roadmap sync` closes the loop, and is **dry-run by default** — `--apply`
  is required to write anything. Two guards make an unattended run safe by
  switching off the two destructive powers:
  - `--no-state-change` (`syncIssueState: false`) omits the issue `state` field
    from every patch body, so labels converge but no issue is ever closed or
    reopened. The `statusMap` maps `done → closed`, so one mis-set roadmap row was
    otherwise enough to close a live issue.
  - `--no-create` (`allowCreate: false`) never creates a ticket for a row lacking
    an `External-ID`, and reports each skipped row rather than dropping it. A cron
    that invents issues is unacceptable.

  Both defaults preserve today's behaviour exactly; CI turns them off explicitly.
  `--force` maps to the existing `forceSync` and is documented as unsafe
  unattended (it overrides the human-always-wins rule).

  `ExternalSyncOptions` gains `dryRun`, `allowCreate`, and `syncIssueState`,
  threaded through `syncToExternal` / `syncFromExternal` to the adapter write path
  (`TicketWriteOptions` on `TrackerSyncAdapter.updateTicket`; a `syncIssueState`
  constructor option on `GitHubIssuesTrackerAdapter`). `SyncResult` gains
  `dryRun`, `planned`, `skippedCreates`, `skippedStateChanges`, and `examined`.
  The label-preservation logic in `buildIssuePatchBody` — skip the labels field
  entirely when the refresh GET fails, so a transient blip cannot wipe the
  `harness-managed` selector — is unchanged on both guard settings.

  Denominator discipline: every run reports what it examined (rows compared,
  tickets fetched), and the new `ExitCode.ZERO_DENOMINATOR` (3) fires when it
  examined nothing. A sync that matched nothing has abstained, not succeeded, and
  must never read as a pass.

  Intended consumer pattern: a nightly
  `harness roadmap sync --apply --no-create --no-state-change` converges labels
  safely, while issue closure stays with the PR-merge auto-done path.

### Patch Changes

- 0d8078d: fix(config): reserve co-tenant namespaces so harness.config.json stops warning on shared keys

  `harness.config.json` is in practice a **shared file**: sibling tools read their
  own top-level namespace out of it (e.g. Canary reads `canary` directly). Since
  the stripped-key warning landed (#862), harness warned on that live, load-bearing
  block — `⚠ harness.config.json: ignored unknown key 'canary'`. The warning is
  correct from harness's point of view and **actively harmful in effect**: the
  obvious way to silence it is to delete the key, which silently resets the
  co-tenant's gate configuration (#982).

  The dropped-key detector now recognizes reserved co-tenant namespaces at the
  **root** and never reports them: an explicit allow-list (`canary`) plus the
  `x-*` extension convention for tools harness has not been told about. The
  reservation is root-only and narrow — a genuinely-unknown root key
  (`frobnicate`) is still reported, and a `canary` key **mis-nested** under a known
  section (`entropy.canary`) is still caught, since only the root is co-tenant
  space.

  Addresses ask (1) of #982. Asks (2) pin the publisher's own smoke test and (3)
  the release-cadence / `stable` dist-tag / config-migration policy are distribution
  decisions left to the maintainers.

- 6fd4a2f: fix(cli): doctor resolves slash-command references instead of counting files

  `harness doctor` reported `✓ Slash commands installed (N commands)` by counting
  files in the output directory and never checking whether the `@`-references
  inside them resolve. On a machine where the CLI had been upgraded (2.8.0 →
  10.1.0) and the old install directory removed, every one of 51 commands pointed
  at a `SKILL.md` that no longer existed — and doctor was green for ~10 days
  (#1009). A slash command with a dangling `@` still runs, returning its wrapper
  with the skill body silently absent, so doctor was the only surface that could
  catch it.

  The check now resolves rather than counts: for each generated command it
  extracts the absolute `@`-referenced skill assets, verifies they exist, and
  reports `N commands, M resolvable`. When `M < N` it fails, names the first dead
  reference, and points at the fix — `harness generate-slash-commands` — which
  regenerates against the current install. A command with no `@`-refs (e.g. Gemini
  inlines the SKILL body) is self-contained and counts as resolvable.

  This also closes the "silent for 10 days" surface behind #1010: an upgrade that
  leaves generated commands pointing at the previous version's path is now
  detectable and actionable rather than invisible (`harness update` already offers
  regeneration post-upgrade).

- 52e42cb: fix(core): check-harness-strength honors core.hooksPath and never reads partial coverage as solid

  Two companion defects in the STRENGTH auditor:

  **Hook discovery ignored `core.hooksPath` (#1012).** `buildProjectContext` read a
  single hardcoded `.husky/pre-commit` and `resolveHookFiles` searched only
  `.husky` / `.claude/hooks` / `.harness/hooks`. A repo wiring hooks via
  `.githooks/` + `git config core.hooksPath .githooks` (a common non-husky
  convention) therefore had `ctx.preCommit === null`, silently disabling
  **STRENGTH-002 (regression-baseline)** and **STRENGTH-003 (skip-discipline)** —
  the two patterns most specifically about pre-commit behavior — while still
  scoring `solid`. Discovery now resolves `core.hooksPath` from the repo-local
  `.git/config` (file-based, so the auditor stays child_process-free and
  unit-testable), includes that directory in `resolveHookFiles`, and sets
  `ctx.preCommit` from `<resolvedHooksDir>/pre-commit` (falling back to `.husky`
  then `.git/hooks`).

  **Non-evaluable patterns scored as a clean solid (#1013).** When a rule could
  not be evaluated (required input absent) it contributed nothing to the score and
  nothing to the output, so "we could not audit this" read identically to "we
  audited this and it was clean" — a repo where every pattern abstained scored
  100/100 `solid`. The auditor now:
  - reports `summary.rulesApplicable` (the coverage denominator) and
    `summary.skipped: [{ id, gearPiece, reason }]` (the named abstentions);
  - withholds `solid` when coverage is partial, using a new `incomplete` tier so a
    clean score across only some applicable patterns no longer reads as a full
    pass (weaker tiers already signal detected problems and are unchanged);
  - the CLI prints `coverage: N/M patterns evaluated` and lists each skipped
    pattern, so the gap is visible and actionable rather than invisible.

- aaec80f: fix(cli): generated hook commands resolve the main checkout, not the worktree cwd

  `harness hooks init` and `harness hooks add` generated settings.json hook
  commands of the form `node "$(git rev-parse --show-toplevel)/.harness/hooks/<name>.js"`.
  That form has two production failure modes (seen in real repos, 2026-07-31):
  1. **Linked worktree.** `--show-toplevel` returns the _worktree_ root, where the
     machine-local, gitignored `.harness/` does not exist → `MODULE_NOT_FOUND` on
     every tool call. Because the failure is non-blocking, the verify-bypass
     blocker and quality gate **silently stop protecting worktree sessions** —
     gates report as hook errors instead of running. With agent-per-worktree
     workflows, most agent work goes ungated.
  2. **Non-repo cwd.** `git rev-parse` fails and spams
     `fatal: not a git repository` on every tool call.

  Both generators now share a `buildHookCommand(name)` helper that emits:

  ```sh
  g="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || exit 0; f="$(dirname "$g")/.harness/hooks/<name>.js"; [ -f "$f" ] || exit 0; exec node "$f"
  ```

  `--git-common-dir` resolves to the **main** checkout even from a linked
  worktree, so gates run (and protect) against the main repo's `.harness`; the
  `|| exit 0` guards make the hook a silent no-op outside a repo or on a machine
  without `.harness`; and `exec node` preserves the hook's blocking exit code (2).

  Already-onboarded repos keep the old pattern until they re-run `harness hooks
init` — a `harness doctor` migration check is worth a follow-up.

- 6533bbd: fix(cli): protect-config and sentinel-pre must fail CLOSED when they cannot read stdin

  Both are blocking `PreToolUse` guards that read their payload with
  `readFileSync(0)` and treated _any_ throw as "no input", exiting 0 (allow) —
  the same fail-open seam already fixed in `block-no-verify`. On a pipe fd 0 is
  non-blocking, so a read issued before the writer has filled the pipe throws
  `EAGAIN`: the guard went blind and waved the command through while still
  reporting success — a bypass hiding behind a green check (#993). For
  `protect-config` that means a protected linter/formatter config could be edited
  unverified; for `sentinel-pre` it means taint enforcement silently switched off
  mid-session.

  Both now read stdin through the shared `readHookStdin()` helper, which retries
  while the pipe reports `EAGAIN` (bounded, 5s) and reports read success
  separately from read content. A read that _failed_ means the guard is blind and
  it exits 2 (blocked); a read that _succeeded and returned nothing_ stays
  fail-open, as do malformed JSON and (for `protect-config`) a missing
  `file_path`. Regression tests drive a real read failure by opening a directory
  as fd 0 (`EISDIR`) — closing fd 0 does not work because Node substitutes
  `/dev/null`, which reads as empty rather than failing.

- 55827b2: fix(cli): block-no-verify hook must fail CLOSED when it cannot read stdin

  `block-no-verify` read its payload with `readFileSync(0)` and treated _any_
  throw as "no input", exiting 0 (allow). On a pipe that fd is non-blocking, so a
  read issued before the writer has filled the pipe throws `EAGAIN` — and the
  guard silently stopped enforcing while still reporting success. That is how
  `git commit --no-verify` could pass a hook that CI showed as green; it surfaced
  as an intermittent `expected +0 to be 2` on the macOS runner (run 30671939046).
  Issue #619 addressed the symptom by changing how the _test_ fed stdin, leaving
  the fail-open seam in the hook itself.

  Stdin reading moves to a shared `readHookStdin()` helper that retries while the
  pipe reports `EAGAIN` (bounded, 5s) and reports read success separately from
  read content. The hook now distinguishes the two cases that were conflated: a
  read that _failed_ means the guard is blind and it exits 2 (blocked), while a
  read that _succeeded and returned nothing_ is a legitimate empty invocation and
  stays fail-open, as do malformed JSON and a missing `tool_input`.

  Note: `protect-config.js` and `sentinel-pre.js` are also blocking guards with
  the same fail-open read seam and are tracked separately.

- f311473: fix(cli): skill validate scans the working tree, honours its argument, reports the denominator

  `harness skill validate` resolved its skills directory with `resolveSkillsDir()`,
  which walks up from the CLI's own install location and therefore scanned the
  **installed bundle** (`<cli>/dist/agents/skills/...`), not the working tree. When
  authoring a skill in a checkout of this repo the validator could not see it, so
  it reported neither pass nor fail — its silence read as approval, and
  `harness-skill-authoring`'s "no skill ships without validation passing" gate
  could be satisfied while the validator had never looked at the file (#1011).

  Three fixes:
  - **Scan the working tree when inside a harness checkout.** Resolution now prefers
    `resolveProjectSkillsDir()` (the `agents/skills/` above cwd), falling back to
    the bundle otherwise, so a newly authored skill is actually validated.
  - **Honour the skill-name argument.** `harness skill validate <name>` validates
    just that skill and fails if it is not found, instead of ignoring the argument
    and validating the whole catalog.
  - **Report the denominator.** Output now says `Validated N skill(s) in <dir>`
    (and the `--json` payload carries `skillsDir` + `scanned`), so "no errors" is
    distinguishable from "nothing checked".

- Updated dependencies [cc0978a]
- Updated dependencies [85de3dc]
- Updated dependencies [0f64b7d]
- Updated dependencies [14beb17]
- Updated dependencies [369f083]
- Updated dependencies [931cca0]
- Updated dependencies [21325cf]
- Updated dependencies [52e42cb]
- Updated dependencies [6e596de]
- Updated dependencies [733c73b]
- Updated dependencies [783a91d]
- Updated dependencies [2641a7a]
- Updated dependencies [6b6840b]
- Updated dependencies [0472669]
- Updated dependencies [ab8b378]
- Updated dependencies [c5c5247]
- Updated dependencies [a758a0b]
- Updated dependencies [0921ca1]
- Updated dependencies [bc96342]
- Updated dependencies [0f2ab19]
- Updated dependencies [4276030]
  - @harness-engineering/orchestrator@0.19.0
  - @harness-engineering/types@0.26.0
  - @harness-engineering/core@0.39.0
  - @harness-engineering/graph@0.11.12
  - @harness-engineering/dashboard@0.14.8
  - @harness-engineering/intelligence@0.10.2
  - @harness-engineering/signals@0.2.10

## 10.1.0

### Minor Changes

- bb4de5e: feat: surgical-edit path for local/codex agents + apply the ollama-campaign lessons

  A local model driven through Codex has no working `apply_patch` (freeform variant is
  grammar-constrained / GPT-5-only; the function variant is not offered to third-party
  OSS models), so it falls back to shell redirection that clobbers files — observed live
  deleting a barrel `index.ts`. This adds the missing pieces:
  - **`edit_file` MCP tool** (`@harness-engineering/cli`) — exact `old_string` → `new_string`
    surgical replace with a unique-match guard and clear, recoverable errors; refuses
    ambiguous/missing matches instead of guessing. Ships in `harness-mcp`; opt-in via a
    server's `tools` allowlist.
  - **Staged-workflow prompt** now steers local agents to PREFER an exact-edit tool
    (`harness__edit_file` or equivalent) **if present**, and otherwise to edit surgically
    and never rewrite whole files or use `cat >`/`echo >>`/`apply_patch` — degrades
    gracefully for adopters who don't enable the tool.
  - **`reasoningEffort`** on the `codex` backend (`-c model_reasoning_effort`) — a hands-on
    coder wants `'low'`.
  - **Docs:** a codex-backend + `edit_file` section in the multi-backend-routing guide,
    including the sampling constraint (Codex owns the request and auto-pulls the model, so
    sampling params cannot be injected the way endpoint backends do).

  Also locks in the within-run worktree-preservation contract (a gate-block re-dispatch
  reuses the ONE worktree so the agent's uncommitted progress survives) with a regression
  test — the earlier ollama-path bug wiped the worktree every re-dispatch.

### Patch Changes

- Updated dependencies [bb4de5e]
- Updated dependencies [bb4de5e]
- Updated dependencies [bb4de5e]
- Updated dependencies [e35a11b]
  - @harness-engineering/orchestrator@0.18.0
  - @harness-engineering/types@0.25.0
  - @harness-engineering/dashboard@0.14.7
  - @harness-engineering/core@0.38.1
  - @harness-engineering/graph@0.11.11
  - @harness-engineering/intelligence@0.10.1
  - @harness-engineering/signals@0.2.9

## 10.0.0

### Minor Changes

- c4c1dd3: feat(local-models): harness-fit probe — empirical agentic evidence for model recommendation

  The local-model recommender ranks candidates by benchmark evidence plus a thin
  agentic probe that only checks _"can the model emit a `tool_call`?"_ and _"is one
  turn fast enough?"_. A live 3-way head-to-head proved this necessary-but-insufficient
  for autonomous coding: `llama3.3:70b` **passes** the tool-calling gate and is fast,
  yet it **narrated instead of acting** (one tool call, no artifact, gate never green),
  while the smaller `gpt-oss:20b`/`qwen3.6:27b` **acted and converged**. No benchmark or
  thin-probe signal predicted that — only running the real harness did.

  The **harness-fit probe** supplies the missing empirical evidence. It runs a
  benchmark-shortlisted candidate through a small contained coding task **on the real
  harness**, judges convergence (the task's own acceptance command) plus act-vs-narrate
  metrics from the recording stream, and maps them to a coarse `buildQuality ∈ [0, 1]`
  (converged → HIGH, acted-not-converged → MID, narrated → LOW). That number feeds the
  **already-wired** `buildQuality` slot in the `agenticScore` composition — **no
  ranker-math change** — so at equal benchmark score an act-and-converge model out-ranks
  a narrate-only one for autonomous dispatch, while the default `score` ordering is
  untouched.
  - **Pure policy + injected runner (dependency inversion).** `local-models` owns the
    pure parts — the `buildQuality` mapping (`scoreBuildQuality`), the cost-gating policy
    (`selectProbeTargets` / `isProbeDue` / `isCacheFresh` / `probeCacheKey`), the portable
    task-suite schema + `DEFAULT_HARNESS_FIT_TASKS`, and the `HarnessFitRunner` interface.
    The concrete single-dispatch runner (Ollama backend + throwaway workspace + acceptance
    gate, reading the stream for act-vs-narrate metrics) is implemented in the orchestrator
    and injected at the composition root, so `local-models` never depends on the orchestrator.
  - **Single-dispatch convergence micro-probe.** The act-vs-narrate signal is decisive in
    one dispatch; best-of-1, cheapest real signal.
  - **Cost-gated (opt-in, top-N, cadence, cache, prefilter).** Disabled by default
    (`localModels.harnessFit.enabled`). When enabled, only the benchmark top-N are probed
    (never the full set), on a cadence (not every refresh), with `buildQuality` cached by
    model+version and VRAM-unfit / `toolCalling:false` candidates prefiltered out.
  - **Fail-open everywhere.** Any probe error/timeout/pull-failure leaves `buildQuality`
    undefined ⇒ no ranking effect; the refresh is never broken and the pool is never blocked.
  - **Config surface.** New optional `localModels.harnessFit` block (added to both the TS
    type and the Zod schema so it survives config parse) — `enabled`, `topN`, `cadenceMs`,
    `cacheTtlMs`, optional `taskIds`. Adopter-portable probe tasks self-describe their
    acceptance command, so a probe runs in any adopter project.
  - **Wired at the composition root (the probe actually fires).** `startRefreshScheduler`
    constructs the `HarnessFitProbeRunner`, a persistent `HarnessFitCacheFileStore` under
    `~/.harness/local-models/` (buildQuality cache + cadence timestamp), and a
    `reRankWithBuildQuality` binding that re-runs the SAME ranker over the held candidate
    set with probed `buildQuality` threaded in — passing them as the tick's `harnessFit`
    deps ONLY when `localModels.harnessFit.enabled` (config→deps translation:
    `cadenceMs → intervalMs`, `taskIds → tasks`). Disabled/absent ⇒ no deps are passed and
    the tick is byte-identical to before.
  - **Bounded (no hangs).** The runner enforces an overall per-probe wall-clock timeout
    (default 5 min) around both the dispatch and the acceptance-command spawn — `maxTurns`
    bounds turn count but not wall time, so a hung model or hanging acceptance is aborted
    into a fail-open `error` result instead of blocking the refresh tick.
  - **Converged-without-artifact is suspect.** A converged verdict only scores HIGH when the
    model actually touched a file; a trivially-passing acceptance with no artifact drops to
    MID/LOW rather than earning the top band.

  See ADR 0081 (harness-fit probe: benchmarks pre-filter, the harness judges agentic fitness).

- e203b5e: Add `harness integrations sync` — reconcile a project's configured MCP
  servers against the refreshed catalog, with the operator's consent. It diffs
  the configured servers against `INTEGRATION_REGISTRY`, shows what's newly
  suggested (e.g. github, exa, harness) and what's deprecated (perplexity,
  augment-code, sequential-thinking), and applies changes only on agreement:
  report-only by default; `--apply` prompts per group in a TTY; `--yes` applies
  non-interactively; a non-TTY run without `--yes` never mutates (safe in
  automation). Additions/removals reuse the existing add/remove/dismiss config
  plumbing; Tier-1 servers surface their required env var and never invent a
  secret.

  To make it discoverable, `harness update` now prints a report-only drift
  nudge after updating (and `harness doctor`'s freshness advisory points at it),
  so a refreshed catalog isn't invisible to a project that configured its
  servers earlier.

- fac4261: Local backend runs the full harness workflow (gated). A `local`/`pi` dispatch now renders a backend-specific dispatch template (`harness.orchestrator.local.md`). Rather than paraphrasing the workflow inline, that template is a thin indirection shim that delivers the REAL skills over bash: the pi agent runs `harness skill run <name> --autonomous` (which prints the verbatim `SKILL.md`, no MCP required) and follows a `/harness:X` → `harness skill run harness-X` redirect. The new `--autonomous` flag on `harness skill run` prepends an autonomous-decider preamble so a headless agent runs each skill (including brainstorming) at full rigor but decides every fork itself and records it in the spec — with a PR-flag safety valve for low-confidence and strategy-contradiction forks, and no mid-run human pause; absent the flag, skill-run output is byte-identical to before. The orchestrator ENFORCES the verify + outcome-eval gates itself (`runLocalWorkflowGate` in `finalizeNormalCompletion`): a red verify or a high-confidence `NOT_SATISFIED` verdict routes through the existing `emitWorkerExit('error')` retry branch (re-prompt on retry, `needs-human` on budget exhaustion) so poor local output halts rather than ships. Template selection (`resolvePromptTemplate`) falls back to the default Claude template when the local file is absent, and the Claude/AMR completion path is unchanged (the gate is a no-op for non-local backends). A config flag `agent.routing.workflowGates: local | primary` routes the local outcome-eval gate to a stronger provider (default local SEL; the AMR caller is unaffected). See ADRs 0070/0071/0072.
- cffa06a: Refresh the suggested MCP-server catalog to 2026 best-in-class and make it
  freshness-aware. `INTEGRATION_REGISTRY` now suggests context7, playwright,
  the official GitHub MCP, Exa (agent search), and harness's own MCP; the
  stale perplexity / augment-code / sequential-thinking suggestions are
  removed (removal only stops _suggesting_ — it never touches an installed
  integration). Every entry carries a `lastReviewed` date and a
  `CATALOG_LAST_REVIEWED` const; `harness doctor` emits a non-blocking advisory
  when the catalog is older than 120 days so it signals its own staleness.
- 143fb32: feat(orchestrator): flight-recorder black-box — durable per-run forensic records

  The orchestrator now writes a first-class, always-on "black-box" for every run
  (one process lifetime) to `<workspace.root>/../black-box/<runId>/run.json`,
  alongside the existing per-issue streams. Each record pins **provenance** (git
  HEAD/subject/branch, node version, resolved backends + routing) so a run's
  outcome is falsifiable against exactly which code and config produced it, plus
  each unit's terminal **verdict** (`shipped` / `needs-human` / `gate-blocked`)
  with the gate/verify reason and a gate-block count — data that previously lived
  only in stdout and in-memory retry state.

  Read it back with the new `harness orchestrator black-box` command:
  - `harness orchestrator black-box list` — recorded runs, newest first
  - `harness orchestrator black-box show <runId>` — provenance, per-unit verdicts,
    convergence (gate-blocks + reason), and tool-use aggregated from the run's
    recording streams

  Capture is best-effort and never throws — a recorder failure cannot break a
  dispatch. Provenance git probes degrade to `null` outside a git repo, so the
  feature is portable to any adopter running the orchestrator.

- 809d327: feat(analysis): repo-shape awareness — `analysis.exclude` config + pytest support in test-craft (#898)

  Analysis tooling assumed a JS/single-app repo shape. On toolset/overlay repos
  (mixed Python + TS, vendored dirs, flat script sets) the entropy/graph
  scanners were noise-dominated and test-craft silently skipped whole Python
  test suites. Two changes:

  **Project-wide `analysis.exclude` config (precedent: `design.exclude`):**
  - New optional top-level `analysis.exclude` glob list in `harness.config.json`,
    applied ON TOP of each scanner's own excludes so vendored/generated paths
    are declared once. Honored by `detect_entropy`, `run_security_scan`, graph
    code ingestion (`harness graph scan` / `ingest` and the `ingest_source` MCP
    tool — the latter previously ignored `ingest.*` config entirely), and the
    CI check orchestrator (docs, entropy, and security checks).
  - `runEntropyCheck` in the CI orchestrator now passes `entropy.excludePatterns`
    through to the analyzer (previously dropped on that path).
  - `DEFAULT_FIND_FILES_IGNORE` (core `findFiles`) is now sourced from the
    shared `DEFAULT_SKIP_DIRS` walker skip-list instead of a drifted 4-entry
    copy — `.venv`, `venv`, `__pycache__`, `vendor`, caches, and AI-agent
    sandboxes are excluded consistently across every scanner sharing the walker.

  **test-craft learns pytest (fifth framework):**
  - Discovery now matches `test_*.py` / `*_test.py` (skipping `__pycache__`,
    `venv`, `vendor`); extraction is a light-parse (regex + indentation) walk
    capturing `def test_*` functions, `class Test*` nesting, and
    `@pytest.mark.skip/skipif` markers into the same `ExtractedTest` shape the
    critique pipeline already consumes — the 8 seed rubrics are
    language-agnostic and apply unchanged.
  - Source pairing understands Python conventions (`tests/test_foo.py` →
    `src/foo.py`, sibling, and flat-package layouts).
  - `pytest` joins the `frameworks` filter on the CLI (`--frameworks pytest`),
    the MCP tool enum, and `frameworksDetected` in the summary — so Python
    suites are critiqued instead of silently reporting an empty pass.

- fac4261: fix(triage): select the local model from the LMLM pool (reasoning-ranked), not the static config list

  `harness roadmap triage` resolved its local model from `agent.backends.local.model[0]` — a
  fixed, hand-maintained list — so triage could stay pinned to a weak model even after the Local
  Model Lifecycle Manager pool had installed and ranked a stronger one. The live orchestrator does
  not have this problem: its `LocalModelResolver` derives candidates from the pool via
  `poolStateToCandidates(snapshot, profile)`. This brings the same pool-first pick to the one-shot
  CLI triage path so the CLI and live agents agree on the model.
  - The report/brainstorm now prefer the pool's top-ranked model for the **`reasoning`** profile
    (the triage gate's safety rests on reasoning-grade complexity judgment). In a real dogfood run,
    this flipped an item the weak model mis-read as `trivial`/dispatchable to a correct
    `moderate` → held-to-human — without any config change.
  - The static `agent.backends.*.model` list remains the documented **fallback** for pool-less
    adopters and non-Ollama backends; a missing/empty/broken pool degrades to it silently (never an
    error). An explicit `--model` still wins; explicit cloud (`intelligence.provider`) backends
    ignore the local pool pick.
  - Orchestrator now re-exports the pool-state primitives (`PoolStateStore`,
    `poolStateToCandidates`, `DEFAULT_POOL_STATE_PATH`, `PoolState`, `RankProfile`) so the CLI reads
    the persisted pool without a new CLI→local-models package edge.

### Patch Changes

- bd850a8: refactor(setup): extract shared SETUP_CLIENTS descriptor

  Extract the per-client install matrix from `setup.ts`'s inline array into a
  shared `packages/cli/src/setup/clients.ts` descriptor (with a `print-clients.ts`
  tsx emitter), consumed by both `harness setup` and the new generated agent-setup
  `prompt.md`. `runMcpSetup` is behavior-neutral — same five clients, same detect
  dirs and config targets, same OpenCode cross-platform path handling. No
  user-facing CLI behavior change.

- c14320e: fix(arch): give the architecture ratchet a noise tolerance so merging `main` stops forcing `baselines.json` rewrites

  The architecture baseline flagged a regression on _any_ aggregate increase
  (strict `agg.value > baselineValue` in `diff()`), while the coverage and
  benchmark ratchets already absorb run-to-run jitter with a tolerance. That
  asymmetry made `baselines.json` a constant merge-conflict source: when a branch
  merged `main`, main's legitimately-grown totals (e.g. total complexity 283→284,
  module size +119 bytes) counted as _the branch's_ regression against its now
  stale baseline, so the pre-commit gate forced `check-arch --update-baseline`.
  Every concurrent PR rewrote the file to slightly different values and they
  conflicted with each other — and because `.gitattributes` `merge=ours` is inert
  on GitHub's server-side merge, they conflicted there too.

  `ArchConfig` now carries a `regressionTolerance` (fraction, default `0.01`).
  `diff()` accepts it and allows `baselineValue + floor(baselineValue * tolerance)`
  before reporting a regression, so sub-tolerance merge drift no longer trips the
  gate. It self-scales: 1% of a ~300 complexity total is ~3, but 1% of a max-depth
  of 5 floors to 0, so shallow-integer metrics stay strict. Genuine regressions
  (which move the aggregate far past the tolerance) still fail. `diff()` defaults
  to a strict `>` when no tolerance is supplied, so the pure-function contract is
  unchanged.

  Also makes the no-release changeset marker robust to prettier: the empty-marker
  detector in `scripts/check-changesets.mjs` now parses frontmatter by line and
  accepts both `---\n\n---` and prettier's collapsed `---\n---`, so no-release
  markers no longer need a per-PR `.prettierignore` entry (those entries were
  themselves a recurring conflict source).

- c80086a: fix(cleanup): expose drift `type` and `line` in `harness cleanup --json` output

  `harness cleanup` and `harness ci check` report the same underlying
  documentation-drift finding but serialized it differently: `ci check` emitted
  `{message:"Doc drift (api-signature): …", file, line}` while `cleanup` emitted
  `{file, issue:"NOT_FOUND: …"}` — dropping the drift `type` (category) and the
  `line`. A consumer filtering drift by category (e.g. `api-signature`) across
  both commands silently saw zero for `cleanup` regardless of behavior, which read
  as a false "cleanup honors the config but ci check doesn't" discrepancy (#838).

  Each `driftIssues[]` entry now additionally carries `type` (the drift category)
  and `line`, mirroring `ci check`. Purely additive — the existing `file` and
  `issue` fields are unchanged. No threading change was needed: both commands
  already honor `entropy.drift`; this only aligns their output shape.

- 0789d8c: Fix #862: warn on silently stripped/mis-nested harness.config.json keys. The
  shared config loader now performs a schema-aware recursive diff of the raw JSON
  against the zod schema and emits a non-fatal stderr warning naming each dropped
  key (with a near-typo "did you mean" hint), while respecting `.passthrough()`
  sections (security, performance) whose extra keys are intentionally kept. Load
  still succeeds. Also declares the legitimate top-level `pulse` block on the
  schema so it is no longer silently stripped.
- 4bd325b: feat(analyses): consume guardian diff-coverage findings from `.harness/analyses/` (#914)

  Define a harness-owned, tolerant, advisory `GuardianAnalysis` contract
  (`schema: harness.guardian.diff-coverage`) plus a degrade-safe reader that lists
  `.harness/analyses/`, selects guardian records by discriminator, validates with
  zod, and skips unknown/malformed shapes without ever throwing. Wire it into three
  review consumers:
  - `outcome_eval` folds the guardian signal into the verdict rationale (never
    affects TS-derived authority).
  - `pre-merge-brief` surfaces a Guardian diff-coverage section and adds flagged
    records to "Worth your eyes".
  - `harness-code-review` (the 7-phase `runReviewPipeline`) surfaces the guardian
    summary as an advisory context file on every review bundle the agents receive.
    Read caller-side at the CLI layer (`run_code_review` MCP tool + `agent review`
    command) and passed in as plain data, so `@harness-engineering/core` never
    depends on `@harness-engineering/intelligence`.

  A missing/empty/malformed archive leaves every consumer byte-identical to today.

- 2973fcc: fix(ci): coverage ratchet grades only fresh coverage on pre-push (#939)

  The `pre-push` hook runs `turbo run test:coverage --affected` then the coverage
  ratchet with `--allow-missing`. `--affected` regenerates coverage only for
  changed packages, so an UNAFFECTED package keeps a STALE
  `coverage-summary.json` from a previous run. The ratchet graded that stale file
  against baseline and reported a phantom regression (e.g. "packages/orchestrator
  lines dropped from 85.52% to 83.5%"), blocking pushes on fresh clones and
  headless agent sandboxes. `--allow-missing` only skips packages whose coverage
  is absent, not stale-but-present ones.

  Fix: add a unit-testable `pruneCoverageSummaries()` export (plus a `--clean`
  CLI mode) to `scripts/coverage-ratchet.mjs` that deletes stale
  `coverage-summary.json` files, and call it in `.husky/pre-push` BEFORE the
  `--affected` coverage run. Afterwards only re-measured packages have a summary
  (graded); unaffected packages have none (skipped under `--allow-missing`),
  restoring the invariant "measured this run <=> file present". CI's flagless,
  whole-repo authoritative ratchet path is unchanged.

- e527712: Fix #896: craft skills now emit a one-line diagnostic so an empty result is
  distinguishable from "ran clean". The shared summary reports the resolved
  provider/mode and files scanned vs. skipped (with a reason such as an
  unsupported language producing 0 analyzable files), and `HARNESS_CRAFT_LLM`
  naming a backend absent from `agent.backends` now errors explicitly instead of
  silently degrading to in-session.
- afd1099: fix: four downstream-consumer papercuts (#902)

  Repos that consume the harness CLI as a dev-dependency and layer their own
  skills on top (downstream overlay repos) hit four generator/tooling gaps:
  1. **doctor remedy typo** — the architecture-baseline remedy said
     `harness check-arch --update`; the real flag is `--update-baseline`.
  2. **`roadmap.tracker.repo` default** — when `roadmap.tracker.kind` is
     `github` but `repo` is unset, both tracker-config loaders now derive
     `owner/repo` from `git remote get-url origin` (https, ssh, and scp-style
     URLs, with or without `.git`). Explicit config still wins; with no origin
     remote the previous missing-repo handling applies, with a clearer error.
  3. **skills-index provenance + overlay skills** — `buildIndex` labeled
     entries by array position, so a repo without project skills had the entire
     bundled catalog labeled `source:"project"`, and the `projectRoot` argument
     was ignored, so a downstream repo's own `agents/skills/<platform>/` skills
     were never indexed when cwd was elsewhere. Provenance now travels with each
     directory (`resolveAllSkillsDirsWithSource`) and `projectRoot` is honored.
  4. **generated-hook clobber guard** — `initHooks` now records install-time
     content hashes in `.harness/hooks/profile.json` and, on regeneration,
     preserves (and warns about) hook files whose content no longer matches the
     recorded hash instead of silently overwriting hand-edits. `harness hooks
init --force` restores the old overwrite behavior. Installs predating hash
     recording keep the legacy refresh behavior.

- 7c6a4e7: fix(design): drift scanner ignores hex-shaped strings in comments and issue-ref string literals (#750)

  The DRIFT-T\* token-bypass scanner (`detect-design-drift`, surfaced by
  `harness check-design` / `align-design-system`) matched hex- and px-shaped
  strings anywhere in the raw source, including comment text. This produced two
  false-positive classes: GitHub issue/PR references like `(#529)` in a JSDoc
  were reported as `DRIFT-T001` "color #529", and hex values merely described
  in comment prose (e.g. ``e.g. `#e63535` ``) were flagged as hardcoded colors —
  with the same matcher also flagging spacing prose as `DRIFT-T003`.

  The scanner now classifies each source offset as code, string, or comment with
  a lightweight lexer (`//` line comments, `/* */` block comments across lines,
  and quoted strings with escapes) and skips comment-context matches. Hex matches
  inside string literals are additionally rejected only when they match the
  parenthesized issue-reference idiom `(#NNN)` (e.g. test titles like
  `describe('… (#332 Tier-3)')`). Genuine in-code color literals — including
  all-numeric ones like `#666`/`#333` and CSS-shorthand values like
  `"1px solid #0066cc"` — still flag, so no true positives are traded away. This
  is deliberately _not_ the lossy "skip bare 3–4 digit numerics" heuristic, which
  would suppress real 3-digit hex literals.

- c432bca: Fix #915: `check-security --severity` now bounds the pass/fail verdict, not just the report. The verdict was hardcoded to fail only on `error` findings, so `--severity warning`/`info` filtered the displayed findings but could never fail the gate, while lower-severity findings appeared to leak into higher-severity gates. The command now fails only when a finding at or above the requested severity exists — info findings never fail a `--severity error` gate, and a requested threshold actually gates at that level.
- 9f32208: Fix #911: check-arch resolves the working directory from the `-c` config's own
  project instead of process.cwd(), so `harness check-arch -c <path> --update-baseline`
  writes the baseline into that project — and the action-handler tests stop leaking
  writes into this repo's tracked `packages/cli/.harness/arch/baselines.json`.
- e3bd99e: Fix `@req` scan ordering (follow-up to #949): `harness graph scan` ingested code (which extracts `@req` annotations) BEFORE `RequirementIngestor` created the requirement nodes, so on a single `scan` every annotation logged "references non-existent requirement" and no `verified_by` edge formed — it only worked via the two-step `scan` then `ingest --all` workaround. `CodeIngestor.ingest` now accepts a `{ skipRequirementAnnotations }` option and exposes `linkRequirementAnnotations()`; `runScan` defers annotation linking until after requirement nodes exist. Convention-based requirement linking (which needs file nodes) is unaffected.
- 5e24934: fix(generate-slash-commands): add `--skills-dir-only` to scope generation to a single skills tree (#704)

  `harness generate-slash-commands --skills-dir <path>` was only additive: it
  still resolved project, community, and machine-wide global skill sources
  alongside the given dir. This let globally-installed third-party skills
  (`~/.harness/skills/community/…`) leak into generated artifacts.

  Adds an opt-in `--skills-dir-only` flag (`GenerateOptions.skillsDirOnly`) that
  makes `--skills-dir` the exclusive source, skipping all ambient resolution. The
  repo's own plugin-artifact generator uses it so foreign global skills can no
  longer leak into tracked plugin dirs. Default behavior (`harness setup`,
  `harness generate`, MCP) is unchanged — the flag is off unless explicitly set.

- da91e34: test-craft can now emit a machine-readable per-test verdict report (`--emit <path>` CLI flag / `emitTo` MCP arg) so downstream tooling can consume its findings instead of losing them to chat. Part of #914.
- fac4261: fix(triage): don't label a deferred open-decisions lever as "no provider (offline)"

  The cheap-first report holds obviously-out-of-band items (scope-too-large, not-in-band) before
  spending an LLM call, so their open-decisions lever runs without a provider and printed
  `open-decisions: no provider (offline)` — misleading, since a provider WAS available and the
  lever was simply deferred, not missing/mis-configured.

  New `ProbeDeps.modelDeferred` hint (threaded through `triageIssue`): when a model is available
  but its levers were deferred for a cheap pass, the reason reads `not evaluated (item held before
the model pass)`. A genuinely offline run (`--offline` / no provider wired) still reads
  `no provider (offline)`. Wording only — the lever value stays `unknown` and the gate never
  dispatches on an unread lever either way.

- fac4261: fix(triage): health-check the pool model pick + reject truncated native output

  Two silent-degradation fixes surfaced by an adversarial review of the local-model path:
  - **Pool pick now health-checks against the endpoint's `/v1/models`** (`triage-pool.ts`). Before,
    the CLI returned the top-ranked `pool.json` entry without verifying the endpoint serves it — so
    a model `ollama rm`'d out-of-band, or a pool copied onto a host whose `pi` endpoint is
    vLLM/LM-Studio (different model ids), got baked in as the model, every LLM lever 404'd, and the
    report silently fell back to the static path while _claiming_ a model ran. It now picks the
    highest-ranked candidate the endpoint actually serves and otherwise falls back to the config
    list — true parity with the live `LocalModelResolver` (rank, then intersect with the probe).
    Also guards a corrupt empty-string `ollamaName`.
  - **Native `think:false` path rejects truncated output** (`openai-compatible.ts`). It now throws
    on Ollama's `done_reason: 'length'` (mirroring the compat path's `finish_reason === 'length'`
    guard) so a `format`-constrained partial-but-parseable body isn't returned as complete — it
    falls back to the compat path instead. Added tests for the native fallback branches
    (truncation, schema-invalid body, missing content).

- b25c33a: Fix `harness roadmap triage` (and its brainstorm/approve path) to recognize the
  `ollama` backend. The SEL-provider resolver and the pool health-check matched
  only `type: 'local' | 'pi'`, but `ollama` became the default local backend
  (#843). With the shipped default config the resolver returned `null`, so every
  brainstorm halted with "no fork generator or provider wired" — the local-model
  triage path could not run at all. Both call sites now also accept `type:
'ollama'` (an OpenAI-compatible `/v1` endpoint). Verified live: the brainstorm
  now resolves the local provider and the model scores items. Regression test
  added for the `ollama` backend type (the suite previously only exercised
  `local`/`pi`, which is why it stayed green while the real default failed).
- Updated dependencies [c14320e]
- Updated dependencies [f460e42]
- Updated dependencies [84bd986]
- Updated dependencies [1de3ce4]
- Updated dependencies [84bd986]
- Updated dependencies [84bd986]
- Updated dependencies [f460e42]
- Updated dependencies [4bd325b]
- Updated dependencies [af503e4]
- Updated dependencies [77815a8]
- Updated dependencies [d965516]
- Updated dependencies [afd1099]
- Updated dependencies [7d05321]
- Updated dependencies [f460e42]
- Updated dependencies [f460e42]
- Updated dependencies [bad5b81]
- Updated dependencies [f460e42]
- Updated dependencies [0c9a304]
- Updated dependencies [f460e42]
- Updated dependencies [c4c1dd3]
- Updated dependencies [af503e4]
- Updated dependencies [fac4261]
- Updated dependencies [fac4261]
- Updated dependencies [3e5f0ca]
- Updated dependencies [840f92c]
- Updated dependencies [f460e42]
- Updated dependencies [f460e42]
- Updated dependencies [f460e42]
- Updated dependencies [3be9a98]
- Updated dependencies [23ed8fc]
- Updated dependencies [a0ef808]
- Updated dependencies [a06a08e]
- Updated dependencies [545e818]
- Updated dependencies [c80086a]
- Updated dependencies [3b2b8ba]
- Updated dependencies [f460e42]
- Updated dependencies [f460e42]
- Updated dependencies [402d56f]
- Updated dependencies [143fb32]
- Updated dependencies [0c8af29]
- Updated dependencies [fac4261]
- Updated dependencies [f460e42]
- Updated dependencies [c1c0b30]
- Updated dependencies [2e78d78]
- Updated dependencies [809d327]
- Updated dependencies [e3bd99e]
- Updated dependencies [84bd986]
- Updated dependencies [1c95956]
- Updated dependencies [5038b56]
- Updated dependencies [e203b5e]
- Updated dependencies [dc3c932]
- Updated dependencies [3d4c9da]
- Updated dependencies [bd850a8]
- Updated dependencies [c62e59c]
- Updated dependencies [f8c9dd9]
- Updated dependencies [fac4261]
- Updated dependencies [fac4261]
- Updated dependencies [fac4261]
- Updated dependencies [fac4261]
- Updated dependencies [fac4261]
- Updated dependencies [8786245]
  - @harness-engineering/core@0.38.0
  - @harness-engineering/orchestrator@0.17.0
  - @harness-engineering/types@0.24.0
  - @harness-engineering/intelligence@0.10.0
  - @harness-engineering/dashboard@0.14.6
  - @harness-engineering/graph@0.11.10
  - @harness-engineering/signals@0.2.8

## 9.0.0

### Minor Changes

- ef62251: Local backend runs the full harness workflow (gated). A `local`/`pi` dispatch now renders a backend-specific dispatch template (`harness.orchestrator.local.md`). Rather than paraphrasing the workflow inline, that template is a thin indirection shim that delivers the REAL skills over bash: the pi agent runs `harness skill run <name> --autonomous` (which prints the verbatim `SKILL.md`, no MCP required) and follows a `/harness:X` → `harness skill run harness-X` redirect. The new `--autonomous` flag on `harness skill run` prepends an autonomous-decider preamble so a headless agent runs each skill (including brainstorming) at full rigor but decides every fork itself and records it in the spec — with a PR-flag safety valve for low-confidence and strategy-contradiction forks, and no mid-run human pause; absent the flag, skill-run output is byte-identical to before. The orchestrator ENFORCES the verify + outcome-eval gates itself (`runLocalWorkflowGate` in `finalizeNormalCompletion`): a red verify or a high-confidence `NOT_SATISFIED` verdict routes through the existing `emitWorkerExit('error')` retry branch (re-prompt on retry, `needs-human` on budget exhaustion) so poor local output halts rather than ships. Template selection (`resolvePromptTemplate`) falls back to the default Claude template when the local file is absent, and the Claude/AMR completion path is unchanged (the gate is a no-op for non-local backends). A config flag `agent.routing.workflowGates: local | primary` routes the local outcome-eval gate to a stronger provider (default local SEL; the AMR caller is unaffected). See ADRs 0070/0071/0072.
- 723072d: fix(triage): select the local model from the LMLM pool (reasoning-ranked), not the static config list

  `harness roadmap triage` resolved its local model from `agent.backends.local.model[0]` — a
  fixed, hand-maintained list — so triage could stay pinned to a weak model even after the Local
  Model Lifecycle Manager pool had installed and ranked a stronger one. The live orchestrator does
  not have this problem: its `LocalModelResolver` derives candidates from the pool via
  `poolStateToCandidates(snapshot, profile)`. This brings the same pool-first pick to the one-shot
  CLI triage path so the CLI and live agents agree on the model.
  - The report/brainstorm now prefer the pool's top-ranked model for the **`reasoning`** profile
    (the triage gate's safety rests on reasoning-grade complexity judgment). In a real dogfood run,
    this flipped an item the weak model mis-read as `trivial`/dispatchable to a correct
    `moderate` → held-to-human — without any config change.
  - The static `agent.backends.*.model` list remains the documented **fallback** for pool-less
    adopters and non-Ollama backends; a missing/empty/broken pool degrades to it silently (never an
    error). An explicit `--model` still wins; explicit cloud (`intelligence.provider`) backends
    ignore the local pool pick.
  - Orchestrator now re-exports the pool-state primitives (`PoolStateStore`,
    `poolStateToCandidates`, `DEFAULT_POOL_STATE_PATH`, `PoolState`, `RankProfile`) so the CLI reads
    the persisted pool without a new CLI→local-models package edge.

### Patch Changes

- 723072d: fix(triage): don't label a deferred open-decisions lever as "no provider (offline)"

  The cheap-first report holds obviously-out-of-band items (scope-too-large, not-in-band) before
  spending an LLM call, so their open-decisions lever runs without a provider and printed
  `open-decisions: no provider (offline)` — misleading, since a provider WAS available and the
  lever was simply deferred, not missing/mis-configured.

  New `ProbeDeps.modelDeferred` hint (threaded through `triageIssue`): when a model is available
  but its levers were deferred for a cheap pass, the reason reads `not evaluated (item held before
the model pass)`. A genuinely offline run (`--offline` / no provider wired) still reads
  `no provider (offline)`. Wording only — the lever value stays `unknown` and the gate never
  dispatches on an unread lever either way.

- 723072d: fix(triage): health-check the pool model pick + reject truncated native output

  Two silent-degradation fixes surfaced by an adversarial review of the local-model path:
  - **Pool pick now health-checks against the endpoint's `/v1/models`** (`triage-pool.ts`). Before,
    the CLI returned the top-ranked `pool.json` entry without verifying the endpoint serves it — so
    a model `ollama rm`'d out-of-band, or a pool copied onto a host whose `pi` endpoint is
    vLLM/LM-Studio (different model ids), got baked in as the model, every LLM lever 404'd, and the
    report silently fell back to the static path while _claiming_ a model ran. It now picks the
    highest-ranked candidate the endpoint actually serves and otherwise falls back to the config
    list — true parity with the live `LocalModelResolver` (rank, then intersect with the probe).
    Also guards a corrupt empty-string `ollamaName`.
  - **Native `think:false` path rejects truncated output** (`openai-compatible.ts`). It now throws
    on Ollama's `done_reason: 'length'` (mirroring the compat path's `finish_reason === 'length'`
    guard) so a `format`-constrained partial-but-parseable body isn't returned as complete — it
    falls back to the compat path instead. Added tests for the native fallback branches
    (truncation, schema-invalid body, missing content).

- Updated dependencies [2880b3a]
- Updated dependencies [ef62251]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
- Updated dependencies [723072d]
  - @harness-engineering/orchestrator@0.16.0
  - @harness-engineering/types@0.23.0
  - @harness-engineering/intelligence@0.9.0
  - @harness-engineering/dashboard@0.14.5
  - @harness-engineering/core@0.37.1
  - @harness-engineering/graph@0.11.9
  - @harness-engineering/signals@0.2.7

## 8.0.0

### Minor Changes

- f5cbdec: fix(triage): wire the local SEL model into the plain report, add single-item targeting, and distinguish over-large scope

  Three dogfooding fixes to `harness roadmap triage` (still entirely default-off behind
  `roadmap.autoTriage.enabled`):
  - **Live provider in the plain report (efficiently).** The read-only report now resolves
    the SEL provider the same way `--brainstorm` does (local-first, free) and runs the
    semantic-read + open-decisions levers on the local model for a REAL verdict — so items
    are no longer perpetually held as "no provider (offline)". It stays cheap: the graph
    scope + static complexity levers run first for every item, and the LLM levers fire ONLY
    for still-plausible candidates (scope resolved+bounded AND static band trivial|simple).
    Obviously-complex / over-large / unresolved items are held via the cheap path with no
    model call. A new `--offline` flag forces the pure static path. When no provider
    resolves, behavior degrades gracefully to the previous offline path (never an error).
  - **Single-item / limited targeting.** New `--only <substring>` (case-insensitive title
    match) and `--limit <n>` flags, honored by BOTH the plain report and `--brainstorm`, so
    a single item can be triaged in isolation. `--brainstorm` additionally gates the actual
    brainstorm to plausible candidates so it no longer brainstorms items that would only halt.
  - **`scope-too-large` hold reason.** Items whose entities RESOLVE but whose blast radius
    exceeds `boundedScopeMax` were mislabeled `unresolved-scope` (which reads as "no entity
    resolved"). They now carry a distinct `scope-too-large` `HoldReason` / `EscalationCategory`;
    `unresolved-scope` is reserved for the truly-no-entity-resolved case.

### Patch Changes

- Updated dependencies [f5cbdec]
  - @harness-engineering/intelligence@0.8.0
  - @harness-engineering/orchestrator@0.15.1
  - @harness-engineering/dashboard@0.14.4

## 7.0.0

### Minor Changes

- eb74585: feat(triage): roadmap auto-triage — four-gate closed-loop autonomous dispatch (default-off)

  Adds an opt-in system that scores roadmap items, autonomously dispatches the ones it
  can confidently and cheaply scope, and routes everything needing human judgment to a
  human. Entirely default-off (`roadmap.autoTriage.enabled`, byte-identical when off).

  Four gates, ascending in evidence:
  - **Scoping probe** (`intelligence/triage`): four corroborating levers (graph-grounded
    scope / semantic read / open-decisions / precedent). Fail-closed — any `unknown`
    lever holds to a human.
  - **Autonomous brainstorm**: compact fork-loop on the local SEL model; halts unless
    per-fork `confidence==='high'`, hardened with N-sample self-consistency (unstable
    recommendation → forced low). Produces a spec or a halt handoff; executes nothing.
  - **Dispatch + ratchet stage 1**: marks items for the existing orchestrator pickup
    (no new dispatch path); nothing executes without an explicit human go.
  - **Post-diff retrospective**: extends the AMR 4c quality feeder — grades the actual
    diff against the pre-dispatch prediction, blocks+escalates mispredicts, records the
    outcome. Closes the loop; the precedent lever and evidence-gated ratchet (capped at
    v1 stage 2 — no auto-merge) self-calibrate from recorded outcomes.

  New CLI: `harness roadmap triage` (read-only report), `--brainstorm`, and
  `triage approve`. New config section `roadmap.autoTriage`.

### Patch Changes

- cf3420a: fix(routing): `harness routing trace` shows the AMR-effective backend, not the identity default

  `trace --complexity <level>` displayed `decision.backendName` — the identity/default
  chain pick — as the "Backend", so a `trivial` task under AMR showed `primary`/claude
  even though it routes to the `fast`/local backend (the `$0` cost already reflected
  local, making Backend↔cost inconsistent). The trace handler already computed the
  tier-selected backend (`costedBackendName` via the same `selectCheapestQualifying`
  real dispatch uses); the CLI just ignored it and the server didn't return its type.
  - Server: the trace response now also carries `costedBackendType` alongside
    `costedBackendName`.
  - CLI: under a `--complexity`/`--risk` dry-run, the `Backend:` line shows the
    tier-selected backend + type (what real dispatch would use), and notes when AMR
    overrides the identity pick. Non-AMR traces are unchanged.

  Routing behavior itself was always correct — this is a display/observability fix so
  `trace` reflects what the orchestrator actually dispatches.

- Updated dependencies [eb74585]
- Updated dependencies [cf3420a]
  - @harness-engineering/types@0.22.0
  - @harness-engineering/core@0.37.0
  - @harness-engineering/intelligence@0.7.0
  - @harness-engineering/orchestrator@0.15.0
  - @harness-engineering/dashboard@0.14.3
  - @harness-engineering/graph@0.11.8
  - @harness-engineering/signals@0.2.6

## 6.0.1

### Patch Changes

- 4cf05b1: fix(orchestrator): wire the AMR config-file surface — accept backend `capabilities` + `routing.policy`

  AMR's types (`BackendDef.capabilities`, `RoutingConfig.policy`) and the engine that
  reads them shipped, but the config-file Zod validators were never extended, so a
  config carrying them was **rejected** ("Unrecognized key(s)") by both `harness
validate` and the orchestrator loader — you could not enable AMR from
  `harness.config.json` / `harness.orchestrator.md` at all (only via the runtime
  `PUT /api/v1/routing/policy` endpoint). The AMR guide's config-file example was
  therefore aspirational.
  - `BackendDefSchema` gains an optional `capabilities` (`BackendCapabilitiesSchema`:
    tier / costPer1kTokens / privacyClass / contextWindow / vision? / toolUse?),
    `.strict()` so config typos fail loudly.
  - `RoutingConfigSchema` gains an optional `policy` (`RoutingPolicySchema`).
  - The `PUT /routing/policy` route now **imports** the canonical `RoutingPolicySchema`
    instead of its own copy, so the config-file and HTTP-endpoint validation can never
    drift again. (The route-local copy had a 3-value `privacyFloor` enum, silently
    **missing `pooled-isolated`** — now fixed as a side effect.)
  - Additive + default-off: a config without `capabilities`/`policy` validates and
    behaves byte-identically. A compile-time guard + a full-config `validateWorkflowConfig`
    round-trip test (the front door that was never exercised) pin the fix.

- Updated dependencies [4cf05b1]
  - @harness-engineering/orchestrator@0.14.0
  - @harness-engineering/dashboard@0.14.2

## 6.0.0

### Minor Changes

- 681e173: feat(adaptive-model-routing): provider-neutral capability-tier routing (AMR Phases 1–4)

  Adds Adaptive Model Routing — provider-neutral, capability-tier-based backend
  selection driven by task complexity — behind a **default-off** gate. It is fully
  **opt-in**: with no `routing.policy` in `harness.config.json`, `AdaptiveRouter`
  is never constructed, the complexity classifier never runs, and routing is
  byte-identical to the shipped `BackendRouter` (no new spans, LLM calls, or latency).
  - **types**: additive `BackendCapabilities`, `ComplexityVerdict`, `RoutingRequest`,
    `RoutingPolicy`, `RoutingError` (codes `privacy-no-match` / `escalation-exhausted`);
    optional `capabilities?` on `BackendDef`; optional `complexity` / `tierRequired` /
    `estCostUsd` on `RoutingDecision`. `RoutingValue` is **not** widened — tier resolution
    lives entirely in the AMR layer (backward-compatible). `RoutingError` is now the single
    error family for AMR routing failures: the orchestrator's `PrivacyNoMatch` extends it
    (carrying `code: 'privacy-no-match'`), so it is catchable/narrowable as either — a
    backward-compatible refinement (`PrivacyNoMatch` is still an `Error` with the same
    `name`/`code`).
  - **intelligence**: a complexity cascade (static pass → `fast` LLM tie-break →
    confidence-gated `standard` escalation) emitting a `ComplexityVerdict`, plus pure
    `deriveRequiredTier` resolution (matrix → D5 blast-radius `strong` veto →
    low-confidence up-bump → D8 budget clamp → D10 escalation floor). The LLM never
    influences the final tier.
  - **orchestrator**: `AdaptiveRouter` wraps `BackendRouter` (which is unchanged), a
    capability registry + cheapest-qualifying selection that fails **closed** on
    privacy/allowlist exclusion, enriched `routing:decision` telemetry, and a vertical
    `EscalationState` (D10/SC16) that climbs a coherence unit's floor tier on repeated
    quality failures (monotonic, `strong`-capped). Live dispatch routes through
    `AdaptiveRouter` only when a `routing.policy` is present. Both routing hard-fails now
    **surface to a human** via the `needs-human` interaction queue (not just a log): a
    fail-closed `PrivacyNoMatch` at the dispatch boundary emits a distinct
    `routing:no-tier-match` steward escalation (never recorded as a transport failure, never
    fed to escalation) and, because it is deterministic (config-driven privacy floor /
    allowlist that cannot succeed on re-dispatch), is **terminal** — the unit moves to the
    `canceled` lane with no retry enqueued rather than looping through escalate-then-retry.
    An exhausted `strong`-ceiling re-crossing emits `routing:escalation-exhausted`
    (D10 hard-fail-to-human).
  - **cli**: `harness routing trace --complexity <level> --risk <band>` dry-runs a
    routing decision (prints derived tier + chosen backend without dispatching), with
    client-side enum validation.

  Split-routing (D6/SC4) and the live quality-gate fan-in into escalation (Phase 4c)
  are deferred — see `docs/changes/adaptive-model-routing/proposal.md` "Deferred
  follow-ups". No behavior changes for existing single-backend or multi-backend
  configs.

- abbaa89: AMR operator observability. Adds a live routing status surface so operators
  running adaptive routing can see spend, degradation, and escalation — previously
  only routing _decisions_ were inspectable.
  - **`GET /api/v1/routing/status`** (`read-telemetry`) — the live operator view:
    whether AMR is active, budget **spend-vs-cap** (using the monotonic accumulator
    that actually drives the D8 clamp, not the telemetry ring sum), the coherence
    units that have climbed their escalation floor, and the active provider
    allowlist. Always 200; an inactive payload when AMR is off.
  - **`harness routing status`** — renders that payload (budget bar, `DEGRADING`
    flag, escalated-unit table, allowlist).
  - **`harness routing telemetry`** — renders the existing `/routing/telemetry`
    projection with a per-tier distribution and per-decision cost breakdown.

  New: `AdaptiveRouter.getStatus()`, `Orchestrator.getRoutingStatus()`,
  `EscalationState.climbedUnits()`, and the `RoutingStatus` / `RoutingBudgetStatus`
  / `RoutingEscalationUnit` types. Read-only; no dispatch behavior change.

### Patch Changes

- ec649e6: feat(adaptive-model-routing): D8 hard budget cap — force `fast` / surface to a steward at the cap

  Turns the AMR budget from a purely soft, single-step degrade into a cap that
  actually bites at 100% of `capUsd`, while staying **opt-in / default-off** (no
  `routing.policy.budget` ⇒ dispatch is byte-identical).
  - **Hard floor (`degrade`/`pause`):** at/above `capUsd`, the tier is forced all the
    way to `fast` (not just one step). Sound because it only ever routes _cheaper_
    than the existing soft clamp, and it sits **below** the D5 blast-radius veto, so a
    security-forced `strong` task still stays `strong`. `pause` behaves as `degrade`
    here — true blocking admission remains deferred.
  - **`human` mode:** at/above the cap, `AdaptiveRouter.route()` throws a fail-closed
    `RoutingError('budget-exhausted')` **before** selecting a backend (an un-routed
    dispatch spends nothing). The dispatch boundary surfaces the unit once to a
    steward as `routing:budget-exhausted` and drives it terminal — no auto-retry into
    the same cap (mirrors the `privacy-no-match` terminal path). Raise `capUsd` via
    `PUT /api/v1/routing/policy` and re-queue to resume.
  - **Observability:** `RoutingBudgetStatus` gains an `exhausted` flag; `harness
routing status` shows an `EXHAUSTED` state once spend crosses the cap.

  Behavior change to note in release notes: existing `budget` policies that were
  only ever degrading one step will now force `fast` (or surface to a steward, for
  `human`) once spend reaches the cap. It remains a lagging cap under concurrency —
  not an admission gate.

- a7e57ec: Deflake the `LazyLocalAdapter` test suite. Added an optional `makeProvider`
  injection seam to `LazyLocalAdapter` (mirroring the existing `fetchModels` seam)
  so tests resolve against a stub instead of opening a real socket to the endpoint
  — the OpenAI SDK's connect-timeout + retry backoff to a dead port made the suite
  multi-second and flaky under parallel coverage load (~16.5s → 0.6s, deterministic).
  Production default behavior is unchanged.
- 4ee4138: `harness hooks add` now resolves hook scripts from the bundled `dist/hooks/` layout. Previously it only probed the dev layout (`src/hooks/`), so every invocation on a published npm/mise install failed with "Hook scripts not found". It now shares `resolveHookSourceDir()` with `hooks init`, which already handled both layouts.
- ede964d: Reduce cyclomatic complexity across dashboard pages/components, local-models,
  orchestrator, and cli hooks via behavior-preserving extraction. No public API,
  CLI contract, or runtime behavior changes; security-sensitive sentinel hooks
  verified byte-identical in their detection rules. Resolves 18 baselined
  architecture complexity violations and clears three new complexity regressions.
- Updated dependencies [681e173]
- Updated dependencies [42f771f]
- Updated dependencies [f004f04]
- Updated dependencies [d8df71d]
- Updated dependencies [ec649e6]
- Updated dependencies [abbaa89]
- Updated dependencies [ea36b3c]
- Updated dependencies [d40e0a0]
- Updated dependencies [ede964d]
- Updated dependencies [ee1f44a]
- Updated dependencies [787e033]
- Updated dependencies [0c8e2ac]
  - @harness-engineering/orchestrator@0.13.0
  - @harness-engineering/intelligence@0.6.0
  - @harness-engineering/types@0.21.0
  - @harness-engineering/core@0.36.0
  - @harness-engineering/dashboard@0.14.1
  - @harness-engineering/graph@0.11.7
  - @harness-engineering/signals@0.2.5

## 5.0.0

### Minor Changes

- 7527285: Add the `harness:rollback` post-ship revert primitive (roadmap #533). When a merged PR crosses a tracked signal threshold, the engine classifies revert-readiness (clean in-memory `git merge-tree` revert + no dependent later merge) and opens a full-context revert PR — **propose-only in v1; it never auto-merges** (ADR 0063). Adds `classifyRevert`/`RollbackDecision` to core, the `harness rollback evaluate` and `harness rollback sweep` CLI commands, the propose-only `rollback-propose.yml` workflow, a `rollback` config block, and a flag-gated dark eval arm (activates once outcome-eval runs post-merge, #31).

### Patch Changes

- 134b055: feat(lmlm): live HuggingFace candidate discovery on startup + Refresh button

  The recommendation candidate list was a bundled, human-curated `candidates.json`
  imported statically at build. The orchestrator now refreshes it **live from
  HuggingFace** — on startup (in the background, non-blocking) and on the operator's
  **Refresh** button — while keeping the frozen list as the offline-safe fallback.
  - New `discoverCandidates()` in `@harness-engineering/local-models` composes the
    existing HF client + GGUF parser and **merges the curated `ollamaName`/`family`
    tags** from the frozen snapshot back in — the HF API doesn't carry them, and a
    candidate without an `ollamaName` isn't installable, so an un-mappable model is
    dropped rather than surfaced as a broken row.
  - The orchestrator seeds the recommender from the frozen list immediately, then
    swaps in live results when discovery returns; `POST /api/v1/local-models/candidates/refresh`
    re-discovers + re-seeds + re-ranks on demand. Fail-closed: any HF error or empty
    result keeps the current candidates.
  - The dashboard **Refresh** button now triggers the live refresh (one button = "get
    the latest").
  - Discovery defaults to a no-op on the `Orchestrator` (so tests make no network
    calls); the CLI's `orchestrator run` wires the real implementation.

  Delivers the `lmlm-live-hf-candidate-discovery` roadmap item. Note: discovery
  refreshes/ranks the **curated** model set — onboarding a brand-new installable
  model still needs its `ollamaName` mapping added (a deliberate curation boundary).

- Updated dependencies [7527285]
- Updated dependencies [db24d89]
- Updated dependencies [f3a4d31]
- Updated dependencies [eb8435f]
- Updated dependencies [134b055]
- Updated dependencies [f3a4d31]
- Updated dependencies [caf3d70]
- Updated dependencies [be3c714]
  - @harness-engineering/core@0.35.0
  - @harness-engineering/orchestrator@0.12.0
  - @harness-engineering/dashboard@0.14.0
  - @harness-engineering/types@0.20.0
  - @harness-engineering/intelligence@0.5.0
  - @harness-engineering/graph@0.11.6
  - @harness-engineering/signals@0.2.4

## 4.3.3

### Patch Changes

- Updated dependencies [d0ccf48]
  - @harness-engineering/orchestrator@0.11.2
  - @harness-engineering/dashboard@0.13.2

## 4.3.2

### Patch Changes

- d4c77d6: security: remediate open Dependabot advisories
  - dashboard: bump `react-router` to `^7.15.1` (fixes HIGH RCE via vendored turbo-stream and `__manifest` DoS) and `vite` to `^6.4.3`.
  - orchestrator: bump `liquidjs` to `^10.26.0` (fixes CRITICAL RCE) and `@earendil-works/pi-coding-agent` to `^0.79.0` (fixes HIGH local privilege escalation).
  - Root `pnpm.overrides` sweep the remaining transitive advisories (undici, hono, qs, shell-quote, tmp, js-yaml, brace-expansion, protobufjs, @babel/core, uuid, vite@6, @grpc/grpc-js); dev-only, vitepress-pinned residuals are recorded in `auditExceptions`.

- Updated dependencies [d4c77d6]
  - @harness-engineering/dashboard@0.13.1
  - @harness-engineering/orchestrator@0.11.1

## 4.3.1

### Patch Changes

- Updated dependencies [bae23ad]
- Updated dependencies [a9c8994]
- Updated dependencies [cfc06d2]
  - @harness-engineering/orchestrator@0.11.0
  - @harness-engineering/dashboard@0.13.0
  - @harness-engineering/types@0.19.0
  - @harness-engineering/core@0.34.1
  - @harness-engineering/graph@0.11.5
  - @harness-engineering/intelligence@0.4.3
  - @harness-engineering/signals@0.2.3

## 4.3.0

### Minor Changes

- 965cfd3: Local Model Lifecycle Manager (LMLM) backend: hardware-aware ranking + pool
  manager + Ollama installer in the new `@harness-engineering/local-models`
  package; generalized discriminated `ProposalSchema` (`kind: 'skill' | 'model'`,
  backward-compatible on read) in types + the shared proposal store in core;
  background refresh scheduler with silent drift reconciliation, the
  `/api/v1/local-models/*` read routes, kind-aware approve/reject, and
  `local-models:{pool,proposal}` WS topics in the orchestrator; and the
  `harness models {status,suggest,pool,proposals,approve,reject,install,evict,refresh}`
  CLI. Opt-in via `localModels.enabled`; default-off behavior is unchanged.

### Patch Changes

- Updated dependencies [965cfd3]
- Updated dependencies [965cfd3]
  - @harness-engineering/dashboard@0.12.0
  - @harness-engineering/types@0.18.0
  - @harness-engineering/core@0.34.0
  - @harness-engineering/orchestrator@0.10.0
  - @harness-engineering/graph@0.11.4
  - @harness-engineering/intelligence@0.4.2
  - @harness-engineering/signals@0.2.2

## 4.2.0

### Minor Changes

- fc0220f: feat(adoption): add `harness:catalog-retrospective` skill and `harness adoption retrospective` command. Reads `.harness/metrics/adoption.jsonl` and reports top-invoked, top-failing, and abandoned-mid-workflow skills, flags ever-invoked stale skills, and surfaces catalog telemetry coverage, writing a dated report to `docs/retrospectives/<date>.md`. Core adds `getCatalogRetrospectiveReport` / `renderRetrospectiveMarkdown` / `isAbandonedMidWorkflow`.
- 3d772e9: Standardize parallel execution as an automatic part of the build loop. Adds a `PlanTask.dependsOn` schema (`@harness-engineering/types`), a `planParallelization` planner in `@harness-engineering/core` that composes the existing `findParallelGroups` wave-grouper and `predict_conflicts` into a `ParallelizationPlan` (dependency-DAG waves with risk-tiered firing — `auto-dispatch`/`confirm`/`serialize` — a cross-bucket ordering cap, and deterministic narration), and a `plan_parallelization` MCP tool (`@harness-engineering/cli`). The autopilot/execution/planning/parallel-agents skills now consume it to dispatch sound parallel waves without being asked, announce-and-proceed for clean waves and pausing only for genuinely uncertain ones. See ADRs 0056 (risk-tiered non-blocking dispatch) and 0057 (dependsOn plan-task schema).

### Patch Changes

- 1dcea58: Fix the session-start skill-dispatch advisory that could hang every `harness` command indefinitely. The banner fires only on a git HEAD delta — which is exactly what invalidates the health-snapshot cache — so `enrichSnapshotForDispatch` always ran a fresh, expensive full `captureHealthSnapshot` (deps/entropy/graph analysis) and `main()` awaited it unbounded, blocking the CLI after any commit on a large repo. The session-start path is now `cachedOnly`, honoring its documented "always uses cached health snapshot for speed" contract: it degrades to the stale cached snapshot (or a neutral all-clear one) instead of capturing fresh, so the banner never blocks command completion.
- 06a26ee: fix(cli): `check-perf` now loads the harness config so it resolves configured `entryPoints` on monorepos (previously failed with "Could not resolve entry points"). Also breaks two circular dependencies in the drift catalog and the craft LLM provider by extracting import-free type contracts (internal, no API change).
- Updated dependencies [fc0220f]
- Updated dependencies [3d772e9]
  - @harness-engineering/core@0.33.0
  - @harness-engineering/types@0.17.0
  - @harness-engineering/dashboard@0.11.2
  - @harness-engineering/orchestrator@0.9.2
  - @harness-engineering/graph@0.11.3
  - @harness-engineering/intelligence@0.4.1
  - @harness-engineering/signals@0.2.1

## 4.1.0

### Minor Changes

- 7abacd5: feat: senior-engineer pre-merge accountability brief (#569)

  Adds a senior-facing "you are pushing X; here's what to look at" surface on PRs.
  - **New package `@harness-engineering/signals`** — the curated repo-health signal
    computation (`gatherSignals`, `signalRegistry`) extracted from the dashboard into
    a shared leaf so any consumer can gather signals fresh without routing through the
    dashboard app. The dashboard now consumes it (internal rewire, behavior unchanged).
  - **New `harness pre-merge-brief` command** — composes the diff summary, the
    `review-ci --json` verdict, a curated Signal-status snapshot, the outcome-eval
    result, and a derived "👀 Worth your eyes" section into a single sticky PR comment
    (upsert by marker). Each input degrades independently to an "unavailable" line;
    never re-runs the review.
  - **New `harness:pre-merge-brief` skill** (tier 2, `on_pr` + `manual`) wrapping the
    command, plus dogfood wiring in `required-review.yml` (non-blocking).

  The acknowledgment merge gate and the adopter CI template are deferred to tracked
  follow-ups. See ADRs 0054 (composer-not-extension) and 0055 (signals shared leaf).

### Patch Changes

- abcd026: fix(roadmap): make merge-triggered auto-done resilient to malformed closing keywords

  Roadmap rows stayed `planned` after their PR merged when the PR body's closing
  keyword was malformed (e.g. `Closes roadmap #569` — the intervening word breaks
  GitHub's parser), leaving `closingIssuesReferences` empty so auto-done had nothing
  to reconcile.
  - **Backstop:** `roadmap-auto-done.yml` now, when the formal closing references are
    empty, parses issue references from the PR body+title, keeps only those closed as
    completed, and feeds the existing `roadmap reconcile --from-refs` (rows flip only
    on a matching `External-ID`; unmatched refs are ignored).
  - **New pure parser** `parseReferencedIssues` (`@harness-engineering/core`) and a
    testable `harness roadmap referenced-issues` CLI subcommand back the fallback.
  - **Prevention:** autopilot's PR-creation guidance now emits a bare `Closes #<N>`
    (keyword immediately before the ref) derived from the roadmap row's External-ID.

- 52a2410: fix(entropy): honor `entropy.drift` config on the entropy/CI paths and resolve Python symbols

  The api-signature doc-drift detector flooded non-TS projects with false
  positives and offered no honored way to scope or disable it.
  - **Config now threaded (issue #723).** `detect_entropy` (MCP), `run_ci_checks
entropy`, and `harness cleanup` previously built the analyzer with
    `analyze.drift` as a boolean, so it always fell back to
    `DEFAULT_DRIFT_CONFIG`. The CLI config schema also had no place to put drift
    settings. A new `entropy.drift` block (`checkApiSignatures`, `ignorePatterns`,
    `forwardLookingPaths`, `checkStructure`, `docPaths`) is now validated and
    threaded into `analyze.drift` at all three call sites. The MCP handler now
    loads `harness.config.json`, which also fixes `assess_project`.
  - **Python symbols now resolve.** The tree-sitter Python export extractor
    matched raw node types on `module.children`, missing decorated classes
    (`@dataclass`), top-level constants, and all class-body members (dataclass
    fields, enum members, methods) — so documented references to them were
    wrongly flagged as api-signature drift. Extraction now unwraps
    `decorated_definition` / `expression_statement` and descends one level into
    class bodies. Underscore-prefixed members stay private.

- 0c3d8ed: fix: make `harness graph scan` the canonical graph command and deprecate the top-level aliases

  `scan`/`query`/`ingest` are now canonical under the `graph` group
  (`harness graph scan`, etc.) — the form the post-update hook, fallback hints,
  and docs already reference. All user-facing hints now point at
  `harness graph scan`.

  The bare top-level `harness scan`/`query`/`ingest` commands are retained as
  hidden, deprecated aliases: they still run (so existing scripts, CI jobs, and
  muscle memory keep working) but print a one-line deprecation notice to stderr
  directing users to the `harness graph <op>` form. They will be removed in the
  next major. No command is removed in this release, so the change is
  non-breaking.

- 3fbe4fe: fix(assess): honor `tooling.linter` in the lint check (#702)

  The `assess_project` lint check hardcoded `npx turbo run lint --force`, so every
  non-npm project (Python, Go, Rust) got a spurious lint failure (`healthy: false`)
  regardless of its configured linter — breaking the health gate and
  `harness-release-readiness`.

  The lint check now resolves its command from `harness.config.json`
  `tooling.linter`: `ruff` → `ruff check .`, `golangci-lint` → `golangci-lint run`,
  `clippy` → `cargo clippy`. npm/typescript, unconfigured, and unknown-linter
  projects fall back to `turbo run lint`. The config is read as raw JSON because
  `HarnessConfigSchema` declares `tooling` only under `template`, so `loadConfig`
  strips the top-level `tooling` block that `harness init` actually writes.

- Updated dependencies [abcd026]
- Updated dependencies [52a2410]
- Updated dependencies [0c3d8ed]
- Updated dependencies [7abacd5]
  - @harness-engineering/core@0.32.1
  - @harness-engineering/dashboard@0.11.1
  - @harness-engineering/signals@0.2.0
  - @harness-engineering/orchestrator@0.9.1

## 4.0.2

### Patch Changes

- 8971780: fix(sentinel): make sentinel-pre enforce-only so it no longer taints on the agent's own tool inputs

  sentinel-pre previously ran injection detection and wrote taint on tool INPUTS,
  contradicting its documented enforce-only role. Legitimate agent activity — commit-bypass
  flags, base64/git-SHA tokens — tainted the 30-minute session window and then blocked the
  agent's own git push/commit as "destructive". Detection now lives solely in sentinel-post
  (which scans untrusted tool OUTPUT, the real prompt-injection vector); sentinel-pre only
  enforces existing taint. A genuinely tainted session still blocks destructive operations.

## 4.0.1

### Patch Changes

- 6e80e94: fix(cli): `check-perf` now loads the harness config so it resolves configured `entryPoints` on monorepos (previously failed with "Could not resolve entry points"). Also breaks two circular dependencies in the drift catalog and the craft LLM provider by extracting import-free type contracts (internal, no API change).

## 4.0.0

### Minor Changes

- 854b142: Event-sourced state model with a deterministic reducer (#598).

  Replaces the mutated `.harness/state.json` with an append-only event log
  (`state.events.jsonl`) + a deterministic reducer composed of pure projections
  (`coreState` / `lanes` / `audit`) + a materialized snapshot (`state.snapshot.json`).
  Concurrent writers append lock-free with a collision-free `(seq, writerId)` total
  order, eliminating the last-write-wins clobbering of the previous read-modify-write
  model. Legacy `state.json` is migrated via a one-time `state_imported` genesis event.

  Adds an explicit guarded lane state machine for orchestrator/autopilot task lanes
  (`planned → claimed → in_progress → in_review → done`, plus `blocked`/`canceled`)
  with dependency, evidence-for-terminal, and forced-transition guards; the
  orchestrator persists lane transitions durably via the core log.

  Subsumes the Append-Only Session Audit Trail (GH-580): verbatim user input and
  approval prompt/response pairs are captured as audit events. The born-deduplicated
  `events.jsonl` is retired — the observability timeline now derives from the audit
  projection, and skill-lifecycle telemetry is relocated to
  `.harness/metrics/skill-events.jsonl`.

  BREAKING (internal): the deprecated `saveState`/`loadState` exports are removed;
  all state reads/writes now flow through the event-sourced store.

- d80871f: Add the harness-pm persona plus the acceptance-eval skill, MCP tool, and intelligence module — the upstream twin of outcome-eval that gates specs on measurable acceptance criteria. acceptance-eval resolves a spec's acceptance section, critiques observability/testability/completeness (advisory `criteriaFindings`), flags user-visible behaviors with no covering test (advisory `coverageFindings`), and emits a confidence-rated `AcceptanceVerdict` (`MEASURABLE | NOT_MEASURABLE | INCONCLUSIVE`). Merge authority is derived in TypeScript via `deriveAcceptanceAuthority` and never read from the LLM: a high-confidence `NOT_MEASURABLE` blocks; every other verdict is advisory. Exposed as the `mcp__harness__acceptance_eval` MCP tool and the `harness-pm` persona (triggered `on_pr` for `docs/changes/**`).
- 09524aa: Reconcile health-snapshot `passed` flags with active signals (#528). A captured snapshot could report a check as `passed: true` while `signals[]` listed a contradicting problem, so the harness's own self-model — consumed by skill dispatch, recommendation, and insights — reported false-green.

  `core` gains a canonical `health-signals` contract: a single `SIGNAL_REGISTRY` from which `CHECK_SIGNAL_MAP`, `SIGNAL_CATEGORY_MAP`, `SignalName`, and `HEALTH_SIGNAL_NAMES` are all derived, plus a pure `reconcilePassed` (conjunction, monotonic toward fail). `cli` wires `reconcilePassed` into `captureHealthSnapshot` so a check's `passed` can no longer be `true` against an active contradicting signal, and unifies `HEALTH_SIGNALS`/`SIGNAL_CATEGORIES` onto the registry. The `strength-007` strength rule now consumes the derived map, closing a silent entropy/deps/docs false-negative.

  Behavior change: health snapshots and the dispatch/recommendation output they feed will now surface failures that were previously hidden behind false-green flags.

- 4df8934: Add an on-demand maintenance pipeline: `harness maintenance run [taskId...]` and the `/harness:maintenance-pipeline` skill.

  The command runs the maintenance that is actually **overdue** (computed from each task's cron schedule + `history.json`) in a **report-first**, infra-free sweep — no orchestrator, gateway, or `ClaimManager` required. `--all`/`--only`/`--skip` scope selection, `--json` emits a consolidated `ConsolidatedReport` (also written to `.harness/maintenance/last-run-summary.json`), and exit codes are CI-friendly (`0` completed, `1` a task failed to execute, `2` invalid invocation).

  Built on a single shared executor: a `mode: 'report' | 'fix'` parameter on `TaskRunner` (default `fix` leaves cron unchanged), a `selectTasks` overdue/eligibility selector with an `excludeFromHumanSweep` flag on task definitions, and a shared `runHarnessCheck` core used by both the CLI and the cron scheduler. `--fix` dispatches the real maintenance agent dispatcher when an `agent.backends` backend is configured, and skips honestly otherwise.

  This work also corrected pre-existing bugs that affected the cron scheduler too: maintenance check commands now resolve through the harness binary (previously ENOENT), check-execution failures are reported as `failure` instead of being masked as `success`, and two misconfigured built-in checks (`cross-check`, `stale-constraints`) gained real read-only CLI subcommands. ADRs 0049 (one executor, two callers) and 0050 (report-first on-demand) document the design.

- 863df8f: Roadmap-shard follow-ups: correctness + CLI parity.
  - **Offline reconcile honors `state_reason` (correctness).** `harness roadmap
reconcile` no longer flips a row whose linked issue was closed as
    `not_planned`/`wontfix` — only a `completed` close (or a close whose reason the
    tracker does not report, a conservative back-compat default) drives an auto-done
    flip. `ExternalTicketState` now carries an optional `stateReason`, populated by
    the GitHub adapter.
  - **Cross-repo issue mis-map fixed (correctness).** A PR can close an issue in a
    different repo; the prior path built External-IDs from bare numbers against the
    configured repo, so a colliding number could flip the wrong local row. New
    `harness roadmap reconcile --from-refs owner/repo#number` builds each External-ID
    from the ref's own `owner/repo` and matches the full External-ID; the auto-done
    Action now fetches `repository.nameWithOwner` per closing issue and passes refs
    through. `--from-issues` (configured-repo numbers) is retained.
  - **`regen`/`unshard` gain `--dry-run` and `--format json`** for parity with
    `shard` (unshard can now preview before the destructive shard-dir deletion).
  - **Internal cleanup:** the `github:owner/repo#NNN` parser is consolidated into one
    canonical module (`roadmap/external-id.ts`); `roadmapSourceExists` shares the
    shard-dir probe with the storage-mode detector.

- 863df8f: Roadmap shard store — Phase 3 (git and hook integration). Make `docs/roadmap.md`
  a self-healing, conflict-free generated aggregate of the per-row shards under
  `docs/roadmap.d/`:
  - **Regen git hooks (husky):** a pre-commit block regenerates and re-stages
    `docs/roadmap.md` whenever any shard is staged (no-op otherwise), and a new
    `.husky/post-merge` clears `merge=ours` staleness by regenerating after a
    merge. Both are thin wrappers over the deterministic `harness roadmap regen`.
    These are intentionally git hooks, not Claude Code tool-use hooks (those
    registries cannot model `git commit` / `git merge`).
  - **`merge=ours` declaration:** `.gitattributes` now declares
    `docs/roadmap.md merge=ours` so disjoint row edits never re-conflict.
  - **Merge-driver setup + doctor:** `harness init` now runs
    `git config merge.ours.driver true` (non-fatal if git is unavailable), and
    `harness validate` warns when `merge=ours` is declared but the driver is unset
    in the current clone (the one-time per-clone fix).
  - **Read-source invariant (R):** a new core detector
    (`findRoadmapReadSourceViolations` + `ROADMAP_READ_ALLOWLIST`) plus a repo
    guard test fail when any new source file starts reading the generated
    `docs/roadmap.md` aggregate instead of the shard store. The allowlist enumerates
    today's legacy readers and shrinks as writers migrate onto `RoadmapStore`.

- 863df8f: Phase 6 of the roadmap shard store: make sharding discoverable, documented, and
  the default for new projects.
  - **Single detection authority.** `detectRoadmapStorageMode` (and the
    `RoadmapStorageMode` type) now live in `packages/core/src/roadmap/load-mode.ts`
    as the one place that decides `monolith` vs `sharded` (by the presence of
    `docs/roadmap.d/`). `store/factory.ts` delegates to it instead of carrying its
    own inline existence check, so the formal storage mode and the chosen store
    backend can never disagree. Storage mode is modelled as an axis orthogonal to
    `RoadmapMode` (file-backed vs file-less), so the ~28 existing mode consumers are
    unaffected.
  - **Sharded-by-default `harness init`.** A brand-new project is scaffolded with an
    empty `docs/roadmap.d/_meta.md` (emitted via the core `serializeMeta` serializer
    for byte-stable round-tripping) and NO monolith `docs/roadmap.md`. Existing
    projects are left untouched and opt in via `harness roadmap shard`.
  - **Aggregate-drift doctor.** `harness validate` now warns when `docs/roadmap.d/`
    exists but the committed aggregate is stale versus `regenerate(shards)` — the
    CI-checkable freshness contract for adopters, fixed by `harness roadmap regen`.
    No-ops for monolith projects.
  - **Documentation.** ADRs 0050 (read-source invariant R) and 0051 (slug identity +
    External-ID sync key), knowledge entries for the roadmap-store abstraction,
    read-source invariant, slug↔issue identity, and merge-triggered auto-done, an
    adoption/rollout guide, the AGENTS.md roadmap section, and the harness skills
    (agents stop hand-marking rows; promote stages shard + regenerated aggregate).

- 863df8f: Phase 4 of the roadmap shard store: route every roadmap writer and content
  reader through `RoadmapStore`.

  In sharded mode (`docs/roadmap.d/` present) each logical mutation now rewrites
  exactly one shard file (conflict-free by construction) and regenerates the
  aggregate; in monolith mode the on-disk `docs/roadmap.md` is byte-for-byte
  unchanged. Every writer captures `before = structuredClone(roadmap)` and
  persists via `applyRoadmapDiff(store, before, after)`, so only the rows that
  actually changed are written.

  Migrated onto the store:
  - `manage_roadmap` (add / update / remove / promote / sync / groom) and the
    show/query readers, preserving the unblock-only cascade, async external sync,
    and first-claim-wins refusal.
  - `autoSyncRoadmap` and `sync-engine` `fullSync` (now takes a project root) with
    per-shard writeback; the assignee-lifecycle invariant holds on every write.
  - Content readers: `prediction-engine`, `publish-analyses`, `sync-analyses`.
  - Dashboard roadmap reader (`gather/roadmap`) and content writers
    (`routes/actions` claim + status).
  - Orchestrator roadmap writers (`/api/roadmap/append` and the
    `RoadmapTrackerAdapter` claim / release / mark-complete), preserving
    compare-and-set, idempotency, and the RMH005 assignee invariant.

  Behavioral note — prediction engine: routing the roadmap read through the store
  also corrected the path it reads from (`<root>/roadmap.md` →
  `<root>/docs/roadmap.md`). Previously `computeSpecImpacts` always failed to load
  and returned no impacts, so spec-impact adjustments were effectively dead; the
  engine now folds spec impacts into the adjusted forecasts (and warning
  severities) as originally designed.

  New core APIs: `RoadmapStore.removeFeature`, `resolveRoadmapStore` /
  `resolveRoadmapStoreForFile` (mode-detection factories), `applyRoadmapDiff`,
  `roadmapAggregatePath`, and a node-fs roadmap IO adapter.

  The read-source guard (invariant R) is tightened to also catch DYNAMIC-path
  readers/writers — code that threads a `roadmapPath`/`roadmapFile` variable into a
  raw filesystem read/write rather than spelling the `roadmap.md` literal — and its
  allowlist has shrunk to its permanent floor (store + regenerator + factory, the
  git/merge tooling, and non-content path references).

- 863df8f: Phase 5 of the roadmap shard store: auto-done reconciler (D6).

  When a merged PR closes a roadmap row's linked GitHub issue
  (`External-ID: github:owner/repo#NNN`), the matching row is flipped to `done`
  automatically — conflict-free, idempotent, and store-routed.
  - **Core:** `reconcileDoneFromClosedIssues(store, closedExternalIds)` — a pure,
    store-routed function that maps each closed `External-ID` to its row and flips
    non-`done` matches to `done` via `setStatus` (the assignee-lifecycle authority,
    which auto-clears a live assignee and appends one `unassigned` history record),
    persisting through `applyRoadmapDiff` (one shard per matched issue; `_meta.md`
    only when an assignee was cleared). Already-`done` rows are no-ops; unmatched
    ids are reported, not written. Works in both sharded and monolith modes and
    adds no new `roadmap.md` reader (invariant R untouched). Also re-exports the
    `parseExternalId` / `buildExternalId` `External-ID` helpers.
  - **CLI:** `harness roadmap reconcile` — an offline fallback that fetches issue
    state from the configured tracker and reconciles closed issues, plus an
    authoritative `--from-issues <n,...>` path that reconciles exact issue numbers
    with no network fetch. (Offline mode treats any closed issue as done; it cannot
    distinguish a `completed` close from a `not planned`/`wontfix` close — the
    PR-merge workflow path is authoritative.)
  - **CI:** a `pull_request: closed` workflow that, only when the PR is merged,
    resolves the PR's `closingIssuesReferences`, no-ops when none are
    roadmap-linked, runs `harness roadmap reconcile --from-issues`, and commits the
    changed shard(s) + regenerated aggregate back to the base branch.

  Both surfaces share the one store-routed core function.

- 5be1aab: Promote sentinel-pre/sentinel-post to the standard hook profile so default adopters get
  prompt-injection defense out of the box. This changes default _blocking_ behavior:
  in an already-tainted session, sentinel-pre can now block a destructive bash op for
  projects on the standard profile (previously strict-only). Existing standard projects
  pick up the hooks on their next `harness update`. cost-tracker remains strict-only.

### Patch Changes

- a1ec37b: Expand the audit-anatomy ANAT-P\* catalog from 2 to the proposal's target of 10 composition patterns, and refactor the catalog onto a shared `presencePattern` factory (trigger present AND no mitigating affordance in file → one `warn` finding). New patterns:
  - **P003 fetch-without-error** — async load with no error state.
  - **P004 conditional-render-without-fallback** — `{data && <…>}` with no else/empty branch.
  - **P005 form-without-submit-feedback** — submit with no pending/success/error signal.
  - **P006 modal-without-dismiss** — `Modal`/`Dialog`/`Drawer` with no `onClose`/`onDismiss`/`onOpenChange`.
  - **P007 async-action-without-pending** — async handler with no disabled/pending state.
  - **P008 list-without-key** — `.map(...)` rendering elements with no `key`.
  - **P009 router-without-not-found** — route table with no catch-all/404.
  - **P010 destructive-action-without-confirm** — delete/remove with no confirmation step.

  (P001 map-without-empty and P002 fetch-without-loading are unchanged.) Patterns deliberately avoid pure-accessibility checks (deferred to v2 per Decision #2) and stay conservative source-heuristics to keep false positives low. `full` mode runs all 10; `fast` mode is unchanged.

- 59601d0: Stop `check-arch --update-baseline --module <path>` from corrupting the shared architecture baseline (#594). The CI `refresh-baselines` job ran a whole-repo update followed by a `--module packages/cli` update against the same baseline file; because `ArchBaselineManager.update` merges per-category, the second run overwrote the whole-repo `module-size`/`dependency-depth` aggregates with a cli-only subset. Every subsequent `harness ci check` then scanned the whole repo but diffed against the too-small baseline, reporting permanent false `module-size`/`dependency-depth` REGRESSIONS on clean checkouts and built worktrees alike. The arch analyzer already skips `dist/` (via `DEFAULT_SKIP_DIRS`), so the originally-suspected `dist` inflation was not the cause. `runCheckArch` now rejects `--update-baseline` combined with `--module` (a module-scoped subset cannot represent the whole-repo aggregate the baseline stores); `--module` remains valid for scoping a read/diff run. The post-merge CI job no longer runs the `--module packages/cli` refresh, and the committed baseline is regenerated to correct whole-repo values.
- c49c640: Implement the audit-anatomy source-of-truth override layers (follow-up to the component-type resolvers). The `resolveAnatomyRules` resolver previously stubbed Layers 1 and 2 to `null`, so anatomy rules always came from the built-in catalog with no project/author override path:
  - **Layer 1 — JSDoc `@anatomy-*`**: a file's leading doc block can declare its own anatomy via `@anatomy-slot content required`, `@anatomy-state disabled exclusive`, `@anatomy-variant primary|secondary|ghost`, `@anatomy-size sm|md|lg` (`parsers/anatomy-tags.ts`), producing a `ConventionRule` that overrides the catalog default.
  - **Layer 2 — DESIGN.md `## Component Anatomy Overrides`**: a tolerant parser (`parsers/design-overrides.ts`) reads per-component override blocks from the nearest DESIGN.md (list or inline `variants: a, b` styles, `(required)`/`(exclusive)` flags), memoized per DESIGN.md path.

  Resolution order is JSDoc → DESIGN.md → built-in catalog. Components with neither an `@anatomy-*` declaration nor a DESIGN.md override are unchanged (catalog default).

- f40f35d: Implement the audit-anatomy ANAT-P\* pattern engine, which was a no-op (`void mode`) — `full` mode behaved identically to `fast` and `patternsApplied` was always empty. A new, extensible pattern catalog (`catalog/patterns/`) ships the two flagship composition patterns:
  - **ANAT-P001 map-without-empty** — a list rendered with `.map(...)` but no empty-state branch (length-zero guard, `EmptyState`, "no results" copy).
  - **ANAT-P002 fetch-without-loading** — async data loading (`fetch` / query hook / awaited effect) with no loading affordance (skeleton, spinner, Suspense, `isLoading`).

  `full` mode now runs these over every audited file (composition patterns aren't bound to a resolved component type), emits `warn`-severity findings with manual fix hints, and reports the applied pattern ids in `summary.catalog.patternsApplied`; `fast` mode is unchanged (conventions only). Detection uses conservative source heuristics (a finding fires only when the triggering construct is present and no mitigating affordance appears in the file) — no tree-sitter dependency. The `PatternCheck` interface is the extension point for the rest of the catalog (P003+).

- e2f1c3a: Implement the component-type resolver's two explicit-declaration layers for `audit_anatomy`, which were stubbed (`return null` "pending the JSDoc/DESIGN.md parser task") so only the export-name heuristic resolved component types:
  - **Layer 1 — JSDoc `@component-type`**: a new dependency-free JSDoc reader (`parsers/jsdoc.ts`) extracts the file's leading doc block (skipping a `use client` banner) and reads the authoritative `@component-type <Type>` self-declaration.
  - **Layer 2 — DESIGN.md `## Component Registry`**: a new parser (`parsers/design-registry.ts`) finds the nearest `DESIGN.md` up the tree and parses its `| Type | File |` registry table, mapping the audited file to its declared type (parsed registries are memoized per DESIGN.md path).

  Resolution order is JSDoc → registry → export-name → silent skip (Decision #3). The JSDoc reader also exposes `readJsDocTag` for the repeated `@anatomy-*` tags, groundwork for the anatomy-override and ANAT-P\* pattern layers (still pending). No behavior change for files that rely on the export-name layer.

- 19c139a: `harness-brainstorming` Phase 4 now offers both build paths at the handoff instead of only planning. After a spec is approved, it asks the human — in plain text — to choose between **autopilot** (recommended: autonomously chains plan → execute → verify → review) and **planning** (interactive plan only), then sets `suggestedNext` and dispatches accordingly. Autopilot is the recommended default when the spec's `## Implementation Order` lays out clear phases.

  The choice is asked in plain text rather than via `emit_interaction`, since a `transition` records the handoff but does not surface a question. `harness-autopilot` is added to the skill's `depends_on`.

- 3a7cbb5: Wire `design-craft` deep-mode auto-capture through a caller-configured capture command — finishing the `autoCapture` arg, which previously did nothing (`'prompt'`/`'auto'` behaved like `'skip'`). When `mode: 'deep'` needs captures and none are supplied, a new `captureCommand` is invoked (unless `autoCapture: 'skip'`) to render the components and produce screenshots; deep mode then vision-critiques them. This deliberately avoids a built-in headless browser: the project supplies its own render+screenshot step (Storybook, Playwright, etc.).

  Contract: the command receives the candidate files via the `HARNESS_DESIGN_CRAFT_FILES` env var (a JSON array) and prints a JSON array of `{ file, image, component? }` to stdout. A failed command, non-JSON output, or an empty manifest surfaces as a clear tool error. Explicit `captures` still take precedence, and `fast` mode is unaffected. `runCaptureCommand` is exported (with an executor seam) for testing.

- 4b7cfb4: Implement `design-craft` deep mode, which previously hard-errored ("deep mode (render + vision LLM) is not implemented in the Phase 1 MVP"). Deep mode now runs the CRITIQUE phase through the provider's **vision** channel (`callVision`, which was already part of the provider contract but unwired) over caller-supplied rendered screenshots:
  - a new `captures` input (`[{ file, image, component? }]`) carries the screenshots, and a new `runVisionCritique` phase critiques each capture × seed-rubric exactly like `runCritique` does for source code;
  - `mode: 'deep'` routes the critique phase to vision; POLISH and BENCHMARK are unaffected (they were already implemented — the stale module header claiming they "return []" is corrected);
  - when `mode: 'deep'` is requested for the critique phase without `captures`, the tool returns a clear, actionable error rather than the old blanket "not implemented".

  Auto-rendering components to screenshots remains out of scope (the CLI has no browser); captures are supplied by the caller (e.g. a Storybook/Playwright step). `fast` mode behavior is unchanged.

- 34ee21d: Register `scan`, `query`, and `ingest` as subcommands of the `graph` command group (#644). Previously the `graph` group only exposed `status` and `export`, so `harness graph scan` failed with `unknown command 'scan'` — which also broke the post-update graph rebuild in `harness update` (its `runLocalGraphScan` invokes `harness graph scan .`). The top-level `harness scan`/`query`/`ingest` commands continue to work unchanged; both forms now resolve, and the `graph` group mirrors every operation defined under `commands/graph/`.
- dd0f63e: Implement GitLab CI generation for personas (`generateCIWorkflow(persona, 'gitlab')`), which previously returned `Err('GitLab CI generation is not yet supported')`. The generator emits a `.gitlab-ci.yml` pipeline fragment with an `enforce` job (`image: node:20`, `corepack`/`pnpm` setup, one `npx harness <command>` script line per command step) and translates persona triggers into GitLab `rules:` — merge-request pipelines (with `changes:` from path globs), per-branch `$CI_COMMIT_BRANCH` matches, and schedule pipelines (the cron lives in GitLab's pipeline-schedule settings, not the YAML, so it is intentionally omitted). Skill steps are skipped (CI cannot run an AI agent); a persona with only skill steps gets a no-op script so the YAML stays valid.

  Also wires the previously-unreachable platform parameter to a user-facing flag: `harness persona generate <name> --platform gitlab` now writes `<slug>.gitlab-ci.yml` (include it from `.gitlab-ci.yml`), while `--platform github` (the default) continues to write `.github/workflows/<slug>.yml`.

- ff64e41: `protect-config` (PreToolUse:Write|Edit hook) now fails CLOSED (exit 2) in two
  ambiguous cases instead of failing open: a well-formed request with a missing, empty, or
  non-string `file_path`, and any unexpected error in the post-parse processing block. Both emit a
  distinct fail-closed stderr line referencing the unresolvable edit target, rather than the
  "protected config file" message, since the target is unknown. Absent/partial stdin
  (unreadable, empty, or unparseable JSON) still fails OPEN (exit 0) with its existing log,
  preserving the issue-#619 stability under v8 coverage. Closes the silent-yield security gap
  without re-introducing the self-DoS.
- 5fa30f8: Wire up `harness review-ci --comment` to actually post the verdict to the pull request (it previously logged a "not yet wired (Phase 3 stub)" warning). When `--comment` is set, the command now renders the verdict as a Markdown summary — assessment, finding counts, and a list of blocking + other findings — and posts it as a comment on the current branch's PR via `gh pr comment` (piped over stdin so long verdicts never hit the shell arg-length limit). A comment is used rather than a `--request-changes` review so it works in every context, including when the same actor authored the PR and in CI where the bot is not the author; the gate's exit code remains the authoritative merge blocker. If posting fails (no PR, no `gh`, auth error) the command warns and still exits with the verdict's code rather than crashing.

  Also fixes verdict-artifact output, which never worked: `review-ci`'s own `--json <path>` option was silently shadowed by the root program's global `--json` flag (commander routed the value to the parent, so the file was never written). The global `--json` now streams the verdict artifact to stdout (suppressing the human summary so the output stays valid, pipeable JSON), and a new `--out <path>` writes the artifact to a file.

- b85dc83: Implement `harness roadmap migrate --to=file-backed` (reverse migration), which previously errored `--to=file-backed reverse migration is not yet implemented`. It is the inverse of the forward (file-backed → file-less) migration: it fetches every feature from the configured tracker, reconstructs a `docs/roadmap.md` (grouping features by milestone, with un-milestoned features in a Backlog section), and flips `roadmap.mode` back to `file-backed` after taking a byte-identical `harness.config.json.pre-migration` backup — mirroring the forward path's config rewrite.

  Safety: it short-circuits to `already-migrated` when the project is already file-backed, refuses to overwrite an existing `docs/roadmap.md` (the file-less invariant is that the file must not exist), and honors `--dry-run` (prints the plan, writes nothing) and `--format=json`. Exposes `featuresToRoadmap` for reuse/testing.

- 483fe1d: Stop `manage_roadmap update` from re-blocking unrelated features (#610). The post-update cascade re-ran `syncRoadmap`, whose `inferStatus` re-derives `blocked` for any `planned` feature with an unfinished blocker. Because `planned` and `blocked` are lateral in `STATUS_RANK`, that move was not treated as a regression and got applied verbatim — so editing one feature (e.g. setting an assignee) silently flipped every unrelated `planned`-with-pending-blocker row to `blocked`. The cascade is now unblock-only: it drops any transition _into_ `blocked`, matching its documented intent ("flip dependents from `blocked → planned`"). Re-deriving `blocked` remains the explicit `sync` action's job. (Symptoms 1 & 2 from the issue — inline assignee not written and a bystander assignee wiped — were already resolved by the assignee-lifecycle chokepoint, ADR-0045.)
- 4790454: Extract a shared `makeBackendResolver` helper (orchestrator package) used by both the CLI's `harness maintenance run --fix` backend resolution and the orchestrator's `createMaintenanceTaskRunner`, removing the duplicated `name → createBackend(def) | null` resolve logic that could drift. Behavior is unchanged.
- 7421749: Resolve project-local skills in `skill info` and `skill run` (#587). Previously these commands resolved only through `resolveSkillsDir()`, which walks up from the compiled CLI module location first — so in a consuming repo it found the CLI's bundled skills and never the project's own `agents/skills/claude-code/<name>/`. A locally-authored skill was therefore listable via `skill list --local` but reported `Skill not found` by `info`/`run`. Both commands now resolve through a shared `resolveSkillDir(name)` helper that searches the same source set as `skill list` (project-local → community → bundled, first match wins), making discovery consistent across all `skill` subcommands.
- Updated dependencies [854b142]
- Updated dependencies [d80871f]
- Updated dependencies [09524aa]
- Updated dependencies [97b55db]
- Updated dependencies [c68b780]
- Updated dependencies [924490c]
- Updated dependencies [4df8934]
- Updated dependencies [645f21e]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
- Updated dependencies [863df8f]
- Updated dependencies [4790454]
- Updated dependencies [757bfac]
  - @harness-engineering/core@0.32.0
  - @harness-engineering/orchestrator@0.9.0
  - @harness-engineering/intelligence@0.4.0
  - @harness-engineering/types@0.16.2
  - @harness-engineering/dashboard@0.11.0
  - @harness-engineering/graph@0.11.2

## 3.1.0

### Minor Changes

- 32bc061: feat(roadmap): assignee means "who is executing" — set at execution, not selection

  Establish the invariant **`assignee ≠ null ⟺ status == in-progress`**, owned by a
  single core authority (`packages/core/src/roadmap/assignee-lifecycle.ts`), so the
  roadmap assignee always names the _current executor_ (human or machine) and never a
  future-intended owner.
  - **New core authority** exports `isMachineAssignee`, `assigneeInvariantHolds`,
    `isClaimableBy`, `claim` (compare-and-set, first-claim-wins), `release`, and
    `setStatus` (auto-clears the assignee on any transition away from in-progress).
  - **roadmap-pilot** no longer writes the assignee at selection; **harness-execution**
    claims at execution start (stopping cleanly when identity is unresolvable). This fixes
    the orchestrator silently skipping pilot-touched items.
  - **Machine claims never use the GitHub assignee field**: outbound sync drops the
    authenticated-user launder, inbound sync never clobbers a live `orchestrator-*` claim.
    The dead `getAuthenticatedUser` path is removed.
  - **Enforcement:** new health rule **RMH005** fails `harness validate` on any
    non-in-progress row carrying an assignee; `groom` auto-clears such rows.
  - The orchestrator completion path and inbound status sync now route status changes
    through `setStatus()`, so a completed/synced row releases its machine claim instead of
    leaving an invariant-violating `done`+`orchestrator-*` row. `manage_roadmap update`
    surfaces a refused claim explicitly (`claimed: false`, `isError`) under first-claim-wins.

  See ADR-0045 (`docs/knowledge/decisions/0045-assignee-is-an-execution-claim.md`).

- 1997504: Rename the `quality-gate` hook to `quality-warner` and add a blocking `strict-quality-gate` variant.

  The standard-profile hook formerly named `quality-gate` never blocked (it warns on
  stderr and always exits 0), so the name implied enforcement it did not provide. It is
  now `quality-warner`, matching its behavior. A new strict-profile hook,
  `strict-quality-gate`, **exits 2 on genuine format/lint violations** (surfacing them to
  the agent as a must-fix) and fails open — warning and exiting 0 — when the formatter is
  absent, times out, or its output is unparseable. Both hooks share detection through a new
  support module, `format-check.js`, which the installer ships alongside whichever quality
  hook is active.

  **Action required:** re-run `harness hooks init` (or update via plugin) to replace the
  old `quality-gate.js` with `quality-warner.js` + `format-check.js`. There is no
  back-compat alias; the installer self-heals on re-init.

### Patch Changes

- Updated dependencies [32bc061]
- Updated dependencies [e16d5fa]
  - @harness-engineering/core@0.31.0
  - @harness-engineering/orchestrator@0.8.4
  - @harness-engineering/dashboard@0.10.1

## 3.0.1

### Patch Changes

- Updated dependencies [a4a1d8a]
- Updated dependencies [8e8e7c1]
  - @harness-engineering/dashboard@0.10.0
  - @harness-engineering/orchestrator@0.8.3
  - @harness-engineering/types@0.16.1
  - @harness-engineering/core@0.30.1
  - @harness-engineering/graph@0.11.1
  - @harness-engineering/intelligence@0.3.1

## 3.0.0

### Minor Changes

- 8128981: Add `harness:audit-harness-strength` — a self-audit skill + `harness check-harness-strength` command that mechanically audits a project's own harness setup against the seven v5.0 failure patterns and reports a 0–100 strength score, a tier (`solid`/`at-risk`/`theatre`), and per-pattern remediation.
  - New `packages/core/src/harness-strength/` module: `HarnessStrengthAuditor` over a 7-rule registry (`StrengthRule` with an optional `evaluable?()` so absent input is never a false pass), a once-built `ProjectContext` (config, hooks resolved from `.husky/`/`.claude/hooks/`/`.harness/hooks/` + settings.json, workflows, health snapshot, and toolkit-mode templates/init-skill), and a pure deterministic `rollupScore`. Findings carry severity applied by the auditor (config-overridable via `audit.harnessStrength.severities`); `finding.file` is always root-relative.
  - Detects STRENGTH-001..007: non-blocking hooks, pre-commit auto-baseline-on-regression, oversized `--skip` lists, empty `architecture.thresholds`, lowest-tier defaults, PAT-gated auto-approve without independent review (incl. commands inside `run:` blocks), and `passed:true` health-snapshot entries that contradict active signals.
  - New `harness check-harness-strength` command (`@harness-engineering/cli`) mirroring `check-security`: `--mode adopter|toolkit` (auto-detects toolkit), `--severity`, `--report-only`, and `--json` (raw `AuditResult` for downstream dashboard/health-snapshot consumers). Gates non-zero on surviving error-severity findings unless `--report-only`.
  - Ships the rigid `harness:audit-harness-strength` skill (4 platforms) that orchestrates the command rather than re-grepping configs. ADR 0039 documents the decision that self-audit skills must be mechanically enforced, not prose.

- 2896a14: Add `canary_probe` and `canary_recommend_framework` MCP tools wrapping the canary adapter, and wire them into the `harness-test-advisor` Coverage Audit. The audit now probes canary availability (Audit Phase 0) and degrades gracefully with an install nudge when the CLI is absent, and uses deterministic framework recommendations for uncovered files (falling back to the `canary:canary-pick-framework` plugin when degraded). The generative plugin Quality Review path is unchanged. Phase 2 of the canary-test-integration spec.
- db4e2a4: Ship a complete CI workflow on `harness init`. Projects now inherit
  `.github/workflows/ci.yml` automatically — a single fail-fast GitHub Actions job
  that builds, lints, and tests (language-appropriate for TypeScript, Python, Go,
  Rust, and Java) and runs the consolidated `harness ci check` gate on every pull
  request and push to `main`. The workflow is written for both new and existing
  projects and never overwrites an existing workflow file.

  `harness ci init` and `harness init` now route through a single CI generator
  (ADR 0037), so the two paths cannot drift; the enriched GitHub output replaces the
  gate-only `harness.yml` with `ci.yml`. The generated workflow installs the harness
  CLI before the gate and deliberately contains no auto-baseline-update / `git push`
  step (roadmap #525). `harness ci init` also gains a `--language` option.

- d11e2e6: Add roadmap maintenance: health checks, grooming, an `Intake` lane, and a split archive.

  Encodes one principle in code — **a milestone is a theme, a status is a lifecycle stage** — so the roadmap stays tidy over time instead of decaying into an undifferentiated backlog dump.
  - **`@harness-engineering/core`** gains `packages/core/src/roadmap/health.ts`: `checkRoadmapHealth` (read-only diagnostics — RMH001 done-outside-archive, RMH002 unactionable `planned` rows with no spec & no plan, RMH003 lifecycle catch-all milestones `[error]`, RMH004 oversized active milestones) and `groomRoadmap` (pure transform: demote unactionable `planned` to `backlog`, lift `done` features out for archival). The not-found create path in `promoteFeature` now lands new rows in an **`Intake`** lane instead of recreating a `Current Work` catch-all.
  - **`@harness-engineering/cli`** wires `checkRoadmapHealth` into `harness validate` as a `roadmapHealth` check (RMH003 fails validation; others are warnings), and adds a `groom` action to the `manage_roadmap` MCP tool that demotes unactionable `planned` rows and moves completed features into `docs/roadmap-archive.md` under a `Shipped` milestone, keeping the orchestrator's parsed `docs/roadmap.md` lean.
  - The `harness-roadmap` skill documents a `--groom` mode.
  - The `initialize-harness-project` skill now seeds the deferred "Set up design system" entry under the `Intake` lane instead of a `Current Work` catch-all, so freshly-initialized projects start tidy and pass the `roadmapHealth` guard.

- 07c399b: Add `manage_roadmap` action `promote` and the `promoteFeature` core function for the brainstorm-driven roadmap loop (sub-project 1 of 4).

  `promoteFeature` (exported from `@harness-engineering/core`) is a pure, IO-free state-transition over `(Roadmap, { feature, spec, summary? }) → { result, nextRoadmap }`. It advances an existing backlog row to `planned` and links its spec in place — instead of appending a duplicate `planned` row — applying a state-conditional rule set: `backlog → planned`; `planned`/`blocked`/`needs-human` update the spec link while preserving status; `in-progress` and `done` refuse; a genuine lookup miss creates a new `planned` row under "Current Work" (`transitioned: 'created'`, matching the legacy `add` behavior the action replaced), while a probable typo of an existing heading instead returns `not-found` with Levenshtein-ranked `closestMatches`; same-name rows across milestones return `ambiguous` with milestone-qualified matches. A non-`backlog` row already linked to the same spec is an idempotent `noop`. A human-authored summary and the `Plan`/`Assignee`/`Priority`/`External-ID`/`Blockers`/`Milestone` fields are never overwritten. The per-row decision is exposed as `decidePromotionForRow` so the file-less handler shares the same rules.

  The `manage_roadmap` MCP tool (`@harness-engineering/cli`) gains `action: 'promote'` (inputs `feature`, `spec`, optional `summary`), wired in both file-backed and file-less modes, returning the structured `RoadmapPromoteResult` envelope. `harness-brainstorming` Phase 4 now calls `promote` instead of `add` and commits `proposal.md`, `SKILLS.md`, and `roadmap.md` together so the promotion is atomic with the spec. See ADRs 0042 (structured envelopes) and 0043 (rules-in-core).

- f5ec94d: Add `harness:outcome-eval` — an LLM-judgment skill that produces a structured, confidence-rated verdict on whether an implementation satisfied its spec.
  - New `packages/intelligence/src/outcome-eval/` module: `OutcomeEvaluator` (mirrors `PeslSimulator`), a `.strict()` `verdictSchema`, a fence-aware spec-section resolver (Success Criteria → user-visible-behavior → Overview), a conservative-confidence prompt, and the false-positive-critical `deriveAuthority` mapping — authority is always derived in TypeScript and never read from the LLM. `evaluate()` is degrade-safe: provider/parse/missing-spec failures resolve to INCONCLUSIVE/advisory and never throw at the blocking gate.
  - Each `evaluate()` persists exactly one `execution_outcome` node via `ExecutionOutcomeConnector` (additive, backward-compatible `metadata` pass-through), consumable by the effectiveness scorer.
  - New `outcome_eval` MCP tool (`@harness-engineering/cli`) makes the skill genuinely invocable, constructing a real `AnalysisProvider` + `GraphStore` and returning the TS-derived verdict.
  - Wired into the orchestrator as step 6.5 (between Code Review and Ship): a high-confidence `NOT_SATISFIED` blocks ship; every other verdict is advisory. ADRs 0037 (tiered confidence→authority) and 0038 (execution_outcome provenance) document the decisions.

- ca706f5: feat(review-ci): multi-client required-review CI gate (#541)

  Adds `harness review-ci` and its contract. Core gains a versioned `CiReviewVerdict`
  schema, a two-kind runner-preset registry (`agent-cli` + `endpoint`), per-runner
  verdict parsers, and the `runCiReview` orchestrator — a tiered gate (client-agnostic
  heuristic floor always runs; a secret-gated LLM multi-persona tier runs per runner
  and degrades gracefully) with an anti-theatre `block-on` threshold where a required
  runner that fails to execute blocks even under `block-on none`. The CLI gains the
  `harness review-ci` command wiring it, including the local openai-compatible adapter.

  Runners verified against the real CLIs: claude, codex, antigravity (`agy`). `gemini`
  is superseded by antigravity; `cursor`, `local` live verification, and the
  full-agentic-local path are deferred. Adopter templates ship under `templates/ci/`
  (workflow + config-as-code ruleset). See docs/changes/required-review-ci/proposal.md.

### Patch Changes

- 7a118bf: fix(hooks): cost-tracker no longer drops cost entries on a stdin pipe race

  The Stop hook read stdin via `readFileSync(0)`, which throws `EAGAIN` when fd 0 is a non-blocking pipe whose data has not been delivered yet (observed under CI v8 coverage instrumentation). The hook caught the error and fail-opened, silently dropping the cost entry. The read now retries on `EAGAIN` with a bounded backoff; a genuinely empty stdin still returns immediately, so the fail-open paths stay fast.

- 0beffc7: Fix `runDeepReview` in `review-changes` MCP tool emitting the full unpaginated `findings` array via the embedded `pipeline` payload. After passing `_skipPagination: true` to the inner review call, the wrapper was re-emitting `pipeline: parsed` which still carried the full list, silently defeating the intent of the 22dd345f9 "double pagination" fix for any client reading `pipeline.findings`. Now strips `findings` and `findingCount` out of `pipeline` before re-emitting, keeping the paginated top-level fields as the canonical response shape. Surfaced by cross-phase review of the paged-mcp-tool-responses spec.
- 1cbb786: Wire the previously-dead `LazyLocalAdapterOptions.llmTimeoutMs` through to the inner `OpenAICompatibleAnalysisProvider`. Without this, callers pointing at an unreachable local endpoint (LM Studio not running, Ollama not started) blocked for ~7s per call as the OpenAI SDK ran its default 90s timeout + `maxRetries: 2` exponential backoff before throwing. Now `llmTimeoutMs` actually applies — fail-fast on unreachable endpoints when configured.
- Updated dependencies [8128981]
- Updated dependencies [9bbf0a3]
- Updated dependencies [43f7333]
- Updated dependencies [d11e2e6]
- Updated dependencies [07c399b]
- Updated dependencies [4b2f910]
- Updated dependencies [0ca37f4]
- Updated dependencies [a6f7cd3]
- Updated dependencies [f5ec94d]
- Updated dependencies [ca706f5]
  - @harness-engineering/core@0.30.0
  - @harness-engineering/intelligence@0.3.0
  - @harness-engineering/dashboard@0.9.0
  - @harness-engineering/orchestrator@0.8.2

## 2.8.0

### Minor Changes

- 7537425: Add `--revert` to `harness align-design-system` (design-pipeline #1, completes v1 spec SC #26 + #27). After each successful write run, the applied diffs plus a SHA-256 of each post-apply file are persisted to `.harness/align/last-batch.json`. Running `align-design-system --revert` reads that batch, content-hash-checks every file, and inverse-applies each diff — skipping files that were edited externally between apply and revert. Surface area: CLI flag, MCP `align_design_system.revert` input, `meta.revert: true` on the output, and 4-platform SKILL.md updates. The persisted batch is gitignored at `**/.harness/align/`.
- 16375c1: audit-component-anatomy: add public `getCatalogTypes()` export and full `design.strictness` × severity matrix.

  This closes the contract gap between `harness-accessibility` Phase 1 step 2.6 (which references `getCatalogTypes()` from `audit-component-anatomy`'s public export) and the audit module (which previously had no such export). A new catalog registry (`catalog/index.ts`) becomes the single source of truth for component types and conventions — replacing the inline single-entry maps that lived in two resolvers. The `findings/severity.ts` matrix wires `design.strictness` (strict / standard / permissive) through `runAudit` and the convention runner so emitted finding severities match the spec's documented table. Adds 23 new unit + integration tests covering the registry contract, severity matrix, and end-to-end strictness threading.

- 2e03ac9: audit-component-anatomy: add Checkbox convention with `ANAT-D008` (missing required `label` slot).

  Phase 2 catalog expansion — extends the form-control family (Input / Dialog / Select / Switch / Checkbox) after Button, Input, EmptyState, Dialog, Select, and Switch. `Checkbox` joins the registry returned by `getCatalogTypes()`. Sources from the APG `checkbox` pattern (the canonical authoritative spec for the tri-state form control accessible-name mandate). The convention runner emits `ANAT-D008` (severity `error` at standard strictness, `warn` at permissive) when a Checkbox definition's prop type exposes none of the three documented satisfiers: `label` prop, `aria-label` prop, or `aria-labelledby` prop — the same three-satisfier shape as `Input.label` (ANAT-D004), `Dialog.title` (ANAT-D005), `Select.label` (ANAT-D006), and `Switch.label` (ANAT-D007). The five-fold repetition crosses the satisfier set from "recurring coincidence" into established invariant for the form-control family — Radio (`ANAT-D009`) inherits the same shape when it lands. Other anatomy parts (helper-text / error-text slots; `checked` / `unchecked` / `indeterminate` / `focus` / `disabled` recommended states; sizes) ship on the convention for catalog completeness but are not yet wired to finding codes — the `ANAT-D009` Tier-1 form-field overflow slot and the `ANAT-D040`–`D049` Tier-2 form-field band are reserved for follow-up tasks. `indeterminate` is the first tri-state vocabulary in the catalogue; its promotion to Tier-1 is deferred to v1.1. Adds 7 new integration tests covering each satisfier path, strictness=permissive softening + strictness=strict cap, and a Checkbox+Input+Switch three-way partition; 2 catalog-registry unit tests assert Checkbox presence and Tier-1 slot shape (including the `indeterminate` state schema lock). Checkbox becomes a catalogued component sharing the `A11Y-010` / `A11Y-050` deferral path with `harness-accessibility`.

- 87d1ed3: audit-component-anatomy: add Dialog convention with `ANAT-D005` (missing required `title` slot).

  Phase 2 catalog expansion — fourth component after Button, Input, and EmptyState. `Dialog` joins the registry returned by `getCatalogTypes()`. Sources from the APG `dialog-modal` pattern (the canonical authoritative spec for the modal-overlay accessible-name mandate). The convention runner emits `ANAT-D005` (severity `error` at standard strictness, `warn` at permissive) when a Dialog definition's prop type exposes none of the three documented satisfiers: `title` prop, `aria-label` prop, or `aria-labelledby` prop — the same three-satisfier shape as `Input.label` (ANAT-D004). Other anatomy parts (description / close-action / footer slots, `open` / `closed` states, `alert` / `standard` variants, and sizes) ship on the convention for catalog completeness but are not yet wired to finding codes — the `ANAT-D006`–`ANAT-D009` Tier-1 overflow band and the `ANAT-D060`–`ANAT-D069` Tier-2 recommended-overlay-states sub-band are reserved for follow-up tasks. Adds 7 new integration tests covering each satisfier path, strictness=permissive softening + strictness=strict cap, and a Button+Input+Dialog+EmptyState four-way partition; 2 catalog-registry unit tests assert Dialog's presence and Tier-1 slot shape. Dialog becomes the third catalogued component to share the `A11Y-010` deferral path with `harness-accessibility`.

- f3f7eb1: audit-component-anatomy: add EmptyState convention with `ANAT-D020` (missing required `headline` slot).

  Phase 2 catalog expansion — third component after Button and Input. `EmptyState` joins the registry returned by `getCatalogTypes()`. Unlike Button/Input, EmptyState sources from Open UI rather than APG (it is not an interactive ARIA pattern). The convention runner emits `ANAT-D020` (severity `error` at standard strictness, `warn` at permissive) when an EmptyState definition's prop type exposes none of the three documented satisfiers: `title` prop, `headline` prop, or typed `children`. Other anatomy parts (icon, description, primary/secondary action slots, default state, the zero-data / no-results / error variants, and sizes) ship on the convention for catalog completeness but are not yet wired to finding codes — those bands (`ANAT-D021`–`ANAT-D029` Tier-1 overflow, `ANAT-D030+` Tier-2) are reserved for follow-up tasks. Adds 7 new integration tests covering each satisfier path, strictness=permissive softening + strictness=strict cap, and Button+Input+EmptyState three-way partition; 2 catalog-registry unit tests assert EmptyState's presence and Tier-1 slot shape.

- 809046f: audit-component-anatomy: add Input convention with `ANAT-D004` (missing required `label` slot).

  Phase 2 catalog expansion — second component after Button. `Input` joins the registry returned by `getCatalogTypes()`, so `harness-accessibility`'s step 2.6 deferral now suppresses `A11Y-050` (`<input>` without an associated `<label>`) for Input definitions whose prop type exposes no labelling affordance. The convention runner emits `ANAT-D004` (severity `error` at standard strictness, `warn` at permissive) when an Input definition is missing every one of `label` / `aria-label` / `aria-labelledby` props — the three affordances documented in `finding-codes.md` § ANAT-D004 satisfiability. Helper-text and error-text slots ship on the convention for catalog completeness but are reserved for the Tier-2 D040–D049 sub-band, not yet wired to a finding code. Adds 6 new integration tests covering each satisfier path, strictness=permissive softening, and Button+Input co-application; 2 catalog-registry unit tests assert Input's presence and Tier-1 slot shape.

- ef93807: audit-component-anatomy: add Select convention with `ANAT-D006` (missing required `label` slot).

  Phase 2 catalog expansion — fifth component after Button, Input, EmptyState, and Dialog. `Select` joins the registry returned by `getCatalogTypes()`. Sources from the APG `listbox` pattern (the canonical authoritative spec for the listbox accessible-name mandate). The convention runner emits `ANAT-D006` (severity `error` at standard strictness, `warn` at permissive) when a Select definition's prop type exposes none of the three documented satisfiers: `label` prop, `aria-label` prop, or `aria-labelledby` prop — the same three-satisfier shape as `Input.label` (ANAT-D004) and `Dialog.title` (ANAT-D005). `placeholder` is deliberately excluded from the satisfier list per APG `listbox` § "Labeling a Listbox" — placeholder text is announced by some screen readers as a value, not as the field's label, and disappears on selection. Other anatomy parts (helper-text / error-text / placeholder slots, `open` / `focus` / `disabled` / `invalid` recommended states, `single` / `multiple` variants, and sizes) ship on the convention for catalog completeness but are not yet wired to finding codes — the `ANAT-D007`–`ANAT-D009` Tier-1 Input/Select overflow band and the `ANAT-D040`–`ANAT-D049` Tier-2 form-field band are reserved for follow-up tasks. Adds 8 new integration tests covering each satisfier path, the APG-mandated placeholder-non-satisfaction, strictness=permissive softening + strictness=strict cap, and a Button+Input+Dialog+EmptyState+Select five-way partition; 2 catalog-registry unit tests assert Select's presence and Tier-1 slot shape. Select becomes the third catalogued component to share the `A11Y-050` deferral path with `harness-accessibility` (after Input — Dialog uses `A11Y-010`).

- 4726be9: audit-component-anatomy: add Switch convention with `ANAT-D007` (missing required `label` slot).

  Phase 2 catalog expansion — extends the form-control family (Input / Dialog / Switch) after Button, Input, EmptyState, and Dialog. `Switch` joins the registry returned by `getCatalogTypes()`. Sources from the APG `switch` pattern (the canonical authoritative spec for the binary toggle accessible-name mandate). The convention runner emits `ANAT-D007` (severity `error` at standard strictness, `warn` at permissive) when a Switch definition's prop type exposes none of the three documented satisfiers: `label` prop, `aria-label` prop, or `aria-labelledby` prop — the same three-satisfier shape as `Input.label` (ANAT-D004) and `Dialog.title` (ANAT-D005). Other anatomy parts (helper-text / error-text slots; `checked` / `unchecked` / `focus` / `disabled` recommended states; sizes) ship on the convention for catalog completeness but are not yet wired to finding codes — the `ANAT-D006`, `D008`–`D009` Tier-1 form-field overflow band and the `ANAT-D040`–`D049` Tier-2 form-field band are reserved for follow-up tasks. Adds 7 new integration tests covering each satisfier path, strictness=permissive softening + strictness=strict cap, and a Button+Input+Switch three-way partition; 2 catalog-registry unit tests assert Switch presence and Tier-1 slot shape. Switch becomes a catalogued component sharing the `A11Y-010` deferral path with `harness-accessibility`.

- f916694: audit-brand-compliance v1 — 4th composed verifier in `harness check-design`. Ships two rule families: BRAND-T001 (token misuse against `$extensions.harness.brand.forbidden_contexts` per ADR 0028) and BRAND-V001 (forbidden phrases in JSX text + string-typed attributes, case-insensitive substring match). Both rules silently skip when their input resolver returns null — projects opt in by adding the DESIGN.md `## Brand Rules` section or the tokens.json `$extensions.harness.brand` block.

  Module layout under `packages/cli/src/brand/`: `findings/finding.ts` (BrandFinding shape), `resolvers/design-md-brand.ts` (parses voice / tone-by-context / assets / semantic-token-aliases blocks; v1 uses voice only), `resolvers/token-extensions.ts` (walks tokens.json for the brand extension), `rules/token-misuse-rule.ts`, `rules/forbidden-phrases-rule.ts`, and `index.ts` orchestrating `runAuditBrand`. Severity follows the existing model (`error` in strict for both, `error`/`warn` in standard, `info` in permissive).

  Cross-cutting: extracts the formal `Verifier<F, Cat, Meta>` interface into `packages/cli/src/shared/verifier.ts` at the 4th-verifier threshold per the convention note in `check-design.ts`. `DetectDriftOutput`, `AuditAnatomyOutput`, and `AuditBrandOutput` declare conformance via type aliases — zero runtime change, all-additive at the type level. Adding a 5th verifier now costs only a type-alias declaration. Composition wired into `check-design.ts` as VERIFIER 4 (try/catch degrades gracefully on brand failure; `findingsByVerifier.brand` flows through `persistFindings` with the 4-array signature). `harness validate` runs the brand audit when `design.audit.brandCompliance.enabled !== false`.

  Surface area: new MCP tool `audit_brand` ({ path, mode, files?, designStrictness?, rules? }), new `design.audit.brandCompliance` Zod sub-schema (sibling to `componentAnatomy` and `driftDetection`), 4-platform skill markdown (claude-code / codex / cursor / gemini-cli), and the auto-doc regeneration that lists `audit_brand` in `docs/reference/mcp-tools.md`. No standalone `harness audit-brand` CLI command in v1 — brand is reached via `check-design`. No new graph node/edge types — brand findings reuse `VIOLATES_design` via `DesignConstraintAdapter.recordFindings()`.

  Deferred to v1.x: tone-by-context (requires component-state inference from JSX), reading-level + sentence-length rules (attach per tone-context), asset-usage rules (image-tag scanning), semantic-token-alias enforcement (overlaps with detect-drift T001 — design once both have real usage), standalone CLI command, dedicated `VIOLATES_brand` graph edge. v3 LLM-judgment tone rules pair with craft-pipeline #5 copy-craft.

- bec8de7: design-craft catalog increment: widen the POLISH and BENCHMARK seed sets to three entries each by porting the remaining Phase 0 paper artifacts into TypeScript. Adds polish patterns `pattern-skeleton-content-matched` (CRAFT-P002, polish × large — Spinner / Loading text → content-matched skeleton with shimmer + reduced-motion fallback) and `pattern-stagger-timing` (CRAFT-P003, polish × small — list entrances staggered 30-60ms with reverse on exit, capped at 600ms total). Adds exemplars `exemplar-stripe-loading-state` (LoadingState, CRAFT-B002) and `exemplar-raycast-command-palette` (CommandPalette, CRAFT-B003 — sixth componentType, intentionally beyond the v1 seed list to assert the catalog's free-string componentType). All wired through the `mcp__harness__design_craft` MCP tool via the existing `SEED_PATTERNS` / `SEED_EXEMPLARS` constants — no schema or handler changes required. Together with the Phase 2 seed (PR #431) the catalog now exercises tier × impact independence across three combinations (polish × medium, polish × large, polish × small) and BENCHMARK fans out across three component types from v1.
- 40e94df: design-craft BENCHMARK catalog increment: close the CRAFT-B006 anchor reservation called out in `finding-codes.md` by widening the seed exemplar set from 5 to 6. Adds `exemplar-stripe-pay-button` (Button, CRAFT-B006 — high-craft primary CTA: label carries the commit value so the action is specific not generic; the visual treatment is one token + one border, not a gradient/shadow/shine stack; the hover / press / loading / disabled / focus states ride one rhythm; the focus ring uses the three-layer pattern paired with `:focus-visible`; the loading state is layout-locked so the surface does not jitter mid-transaction; sourced from stripe-checkout#pay-button). Together with B001–B005 the seed now covers every canonical componentType the spec calls out for the 50-exemplar plan (EmptyState / LoadingState / ErrorState / Modal / Button + the informal CommandPalette anchor) — subsequent exemplar-widen increments grow horizontally (per-type, multiple exemplars per componentType) rather than introducing new types. The new exemplar is picked up by the existing `handleDesignCraft` runner via `SEED_EXEMPLARS` — no schema, MCP-tool wiring, graph-adapter, or measurement-loop changes; the MCP tool's description string is refreshed to reflect the 10-rubric / 3-pattern / 6-exemplar v1 seed. `catalog-seed.test.ts` asserts the six-type span + anchor-id alignment with `finding-codes.md` and adds a per-canonical-componentType anchor guard; a new end-to-end test scores a `PayButton` fixture against the Stripe exemplar to prove the new Button componentType routes through `runBenchmark` end-to-end.
- b1ae0fa: design-craft BENCHMARK catalog increment: close the CRAFT-B004 / CRAFT-B005 anchor reservations called out in `finding-codes.md` by widening the seed exemplar set from 3 to 5. Adds `exemplar-vercel-error-state` (ErrorState, CRAFT-B004 — four-part anatomy of a high-craft error surface: name the failure specifically, lead with the recovery action, keep diagnostics recessed, communicate severity with typography/color tokens not full-bleed red panels; sourced from vercel-geist#error-state) and `exemplar-linear-issue-modal` (Modal, CRAFT-B005 — proof point that a Modal can carry density without losing focus: one focal region not three competing ones, flat surface, restrained dimmer, tuned spring motion paired with instant keyboard response, optimistic inline mutations; sourced from linear-app#issue-modal). Together with B001-B003 the seed now covers every canonical componentType the spec calls out for the 50-exemplar plan (EmptyState / LoadingState / CommandPalette / ErrorState / Modal — Button remains for CRAFT-B006). The new exemplars are picked up by the existing `handleDesignCraft` runner via `SEED_EXEMPLARS` — no schema, MCP-tool wiring, graph-adapter, or measurement-loop changes; the MCP tool's description string is refreshed to reflect the 10-rubric / 3-pattern / 5-exemplar v1 seed. `catalog-seed.test.ts` asserts the 5-type span + anchor-id alignment with `finding-codes.md`, and a new end-to-end test scores a `DeployError` fixture against the Vercel exemplar to prove the new ErrorState componentType routes through `runBenchmark` end-to-end.
- 5c61231: design-craft: widen BENCHMARK seed to 8 exemplars (B007 Notion empty database + B008 Vercel build progress).

  Phase 2 catalog expansion — opens the horizontal-growth phase of the seed by adding a second EmptyState anchor in the INSTRUCTIONAL register (Notion's empty database surface — "Press / for commands" with no chrome around emptiness, agency-led prompt teaching the system gesture) and a second LoadingState anchor in the NARRATIVE register (Vercel's deployment build progress — multi-phase stepper with tuned breath pulse on the active phase and a streaming log tail). The earlier B001–B006 set anchored each canonical componentType once; B007–B008 establish that growth from here happens horizontally per componentType, with each new anchor carrying a tonal register distinct from its peer so BENCHMARK can score targets against the right model rather than collapsing every empty/loading state toward a single reference.

  The two new exemplars wire into `SEED_EXEMPLARS` at array positions 6 and 7 (preserving `CRAFT-B001..B008 = SEED_EXEMPLARS[0..7]` alignment), carry the ADR 0020 provenance fields (id, version, status, authoredAt, contributors, source.ref), and ship complete 5-dim radarReference baselines so BENCHMARK can compute proximity-to-exemplar deltas. The end-to-end BENCHMARK loop now fans EmptyState targets out across both Linear and Notion in a single pass (and LoadingState targets across both Stripe and Vercel). Adds 2 new wired-end-to-end integration tests (one per new exemplar, mirroring the B004/B005/B006 fixture-and-radar-mock shape) plus a register-distinctness invariant test (asserts EmptyState and LoadingState each carry two anchors). Updates the catalog-seed test's `SEED_EXEMPLARS` shape assertion (now 8 entries in 8-deep stable order). Updates the benchmark-phase wiring test's expected exemplars list for the EmptyInbox fixture (now cites both EmptyState anchors). Updates `finding-codes.md` to retitle the anchor section "B001–B008" (canonical anchors + horizontal-growth pair), document the new B007 / B008 exemplar references including their tonal-register rationale, register the `notion-app#` and `vercel-app#` source-citation prefixes, and shift the reserved range to B009–B050.

- c1ee232: design-craft POLISH catalog increment: widen the v1 polish-pattern seed from 3 to 5, closing the motion sub-category at its target of 3 and opening the typography sub-category per Success Criterion #8 of the design-craft-elevator plan. Adds `pattern-page-transition-crossfade` (CRAFT-P004, foundational × medium — brief opacity crossfade on route change so the SPA reads as a continuous surface rather than a stack of disconnected pages; ~80ms fade-out paired with ~120ms fade-in inside `AnimatePresence` or the native view-transitions API, with `prefers-reduced-motion` fallback; sourced from vercel-geist#page-transition) and `pattern-fluid-type-scale` (CRAFT-P005, polish × large — replace breakpoint-stepped font sizes with a fluid `clamp()` scale calibrated to the audience viewport range, paired with `text-wrap: balance` and `text-wrap: pretty`; introduces two novel `applicableTo.kind` values `tailwind-class` and `css-at-rule`; sourced from vercel-geist#typography). The widened seed deliberately exercises both foundational and polish tiers across the pattern family — P004 is the first foundational-tier polish pattern in the seed, proving tier × impact independence across both pattern catalogues and rubric catalogues. Both honor ADRs 0019 (3-axis output passthrough) and 0020 (provenance fields). Wired through `SEED_PATTERNS` in `catalog/patterns/index.ts`; `catalog-seed` and `polish-phase` integration tests updated to assert the 5-pattern expansion and the new tier × impact pairs. No schema, MCP tool, graph adapter, or measurement-loop changes — the existing handlers iterate `SEED_PATTERNS` and pick up the new entries transparently. Remaining gap to v1 close: P006-P015 (2 skeleton + 2 typography + 3 interaction + 3 layout).
- 3b3d5f0: design-craft POLISH catalog increment: widen the pattern seed by opening the layout and interaction sub-categories of the v1 target (3 motion + 3 skeleton + 3 typography + 3 interaction + 3 layout per Success Criterion #8). Adds `pattern-progressive-corner-rounding` (CRAFT-P006, polish × small — concentric corner math for nested surfaces: `childRadius = parentRadius - gap`, square the child when the gap meets or exceeds the parent radius; sourced from emil-design-eng#progressive-rounding) and `pattern-focus-ring-craft` (CRAFT-P007, foundational × large — three-layer focus ring built from brand accent token + outline-offset + soft halo, paired with `:focus-visible` and reduced-motion fallback; sourced from emil-design-eng#focus-ring). P006 introduces a new `applicableTo.kind` (`css-variable`) alongside the existing CSS / JSX / pattern discriminators, and P007 introduces another (`css-pseudo-class`) — the schema remains intentionally open on `kind` per Phase 0 review O7. P007 is the second foundational-tier pattern in the seed (joining the `CRAFT-P004` reservation) and ties craft to WCAG 2.4.7 without overlapping `harness-accessibility` (the a11y verifier asserts a focus indicator exists at all; this pattern asserts the indicator reads as part of the product). Both honor ADRs 0019 (3-axis output passthrough) and 0020 (provenance fields). Wired through `SEED_PATTERNS` in `catalog/patterns/index.ts`; `catalog-seed` and `polish-phase` integration tests updated to assert the expanded `patternsApplied` ordering plus the new tier × impact pairs and the foundational + polish tier-span guarantee. `finding-codes.md` TOC, P-family range allocation table, and per-code entries refreshed; P004/P005 stay RESERVED for the parallel motion / typography increment; remaining gap to v1 close: P008–P015 (2 skeleton + 2 typography + 2 more interaction + 2 more layout). No schema, MCP tool, graph adapter, or measurement-loop changes.
- c664de8: design-craft Phase 2 increment: extend the seed catalog (3 critique rubrics: hierarchy-clarity, typography-craft, motion-quality; 1 polish pattern: spring-physics; 1 exemplar: linear-empty-list) and wire all three phases (CRITIQUE / POLISH / BENCHMARK) through the `mcp__harness__design_craft` MCP tool. POLISH applies LLM judgment against polish patterns with a lightweight applicability pre-filter to keep fast-mode cheap. BENCHMARK computes 5-dim radar scores with overall = mean(score) + min(confidence) per the locked aggregation rule. Output now reports `summary.catalog.patternsApplied` and `summary.catalog.exemplarsCited`.
- a2b85eb: design-craft Phase 3 increment: ship the growth-infrastructure half of ADR 0020 (living catalog H pattern). Adds `packages/cli/src/design-craft/measurement/` with `recordTrigger`, `recordApply`, `recordCite`, and `getCatalogStats` (file-backed per-project counters under `.harness/design-craft/usage.json`) plus a CRITIQUE-recurrence signal feedback loop (`recordSignalEvent` + `proposeFromRecurringFindings`) that materialises candidate pattern proposals to `.harness/design-craft/proposals/` when a finding shape recurs ≥ N (default 5) times across ≥ 2 distinct projects. The hot path stays cheap (O(1) JSONL append per finding); aggregation runs out-of-band. `mcp__harness__design_craft` now wires every CRITIQUE / POLISH / BENCHMARK run into the counters and event log; tests inject `__recordMeasurement: false` to opt out.
- ad56008: design-craft CRITIQUE catalog increment: widen the rubric seed from 3 to 5 by authoring the next two foundational dimensions called out in success criterion #7. Adds `rubric-color-confidence` (CRAFT-C004, foundational × large — named role usage vs scattered hex, accent restraint, neutral structural work, semantic-color discipline, dark-mode rethink-vs-swap; sourced from refactoring-ui#color + vercel-geist#palette) and `rubric-density-rhythm` (CRAFT-C005, foundational × medium — single-scale honesty, pair-vs-group gap discipline, density-by-role, breakpoint rhythm survival, divider restraint; sourced from refactoring-ui#spacing + linear-app#density). Both flag a code-only mode confidence cap in their prompts and honor ADRs 0019 (3-axis output passthrough) and 0020 (provenance fields). C005's foundational × medium pair deliberately exercises a different tier × impact within the foundational tier than C001/C004 (both large), reinforcing the axes' independence. Wired through `SEED_RUBRICS` in `catalog/rubrics/index.ts`; `critique-mvp` and `measurement-wiring` integration tests updated to assert the 5-rubric expansion. `finding-codes.md` TOC, C-family range allocation table, and per-code entries refreshed; C006–C010 remain RESERVED for the Phase 2B widen to 10. No schema, MCP tool, graph adapter, or measurement-loop changes.
- 7cd76b5: design-craft CRITIQUE catalog increment: widen the rubric seed from 5 to 7 by authoring the first pair of the Phase 2B widen-to-10 set. Adds `rubric-restraint` (CRAFT-C006, foundational × large — addition discipline: every visible element earns its place, single focal action, no nested containers, no redundant labels; sourced from refactoring-ui#less-is-more + dieter-rams#10-principles) and `rubric-polish-details` (CRAFT-C007, polish × medium — focus rings, state coverage, optical alignment, corner-radius nesting, tuned transitions, keyboard story, copy edges; sourced from emil-design-eng#polish-checklist + stripe-press#detail-work). C006 deliberately omits a code-only confidence cap — restraint reads structurally from source (element counts, nesting depth, prop redundancy). C007 introduces the first polish-tier critique rubric to the seed (C003 was polish but flagged with a code-only cap), so the CRITIQUE loop now produces findings across foundational AND polish tiers in a single run. Both honor ADRs 0019 (3-axis output passthrough) and 0020 (provenance fields). Wired through `SEED_RUBRICS` in `catalog/rubrics/index.ts`; `critique-mvp` and `measurement-wiring` integration tests updated to assert the 7-rubric expansion. `finding-codes.md` TOC, C-family range allocation table, and per-code entries refreshed; C008–C010 remain RESERVED for the final Phase 2B widen-to-10 slice. No schema, MCP tool, graph adapter, or measurement-loop changes.
- 51fef7e: design-craft CRITIQUE catalog increment: close the v1 rubric seed by widening from 7 to 10, satisfying Success Criterion #7 of the design-craft-elevator plan. Adds `rubric-copy-voice` (CRAFT-C008, polish × medium — active-voice button labels, recovery-oriented errors, inviting empty states, consistent tone across happy/loading/empty/error states; sourced from refactoring-ui#voice + nicely-said#tone), `rubric-interaction-craft` (CRAFT-C009, polish × large — first-class keyboard story, optimistic mutations, anticipatory focus, distinct hover/active/pressed/focus states, right-friction destructive guards, in-between state handling; sourced from emil-design-eng#interaction + raycast#keyboard-quality), and `rubric-brand-coherence` (CRAFT-C010, foundational × large — same-product-family read across surfaces, load-bearing visual identity, motion character match, coherent flourish system, logo-removal recognition test; sourced from stripe-press#consistency + linear-brand#presence). The closed seed now spreads across every operationally meaningful tier × impact cell the 3-axis model expresses (4 × foundational-large, 1 × foundational-medium, 3 × polish-large, 2 × polish-medium); aspirational-tier rubrics are deferred to the contribution loop per ADR 0020 rather than seeded directly. All three honor ADRs 0019 (3-axis output passthrough) and 0020 (provenance fields). Wired through `SEED_RUBRICS` in `catalog/rubrics/index.ts`; `critique-mvp` and `measurement-wiring` integration tests updated to assert the 10-rubric expansion (10 findings, 10 LLM calls, 10 signal events). No schema, MCP tool, graph adapter, or measurement-loop changes — the existing handlers iterate `SEED_RUBRICS` and pick up the new entries transparently.
- cf54d7d: design-pipeline #1 (detect-design-drift + align-design-system): add finding-code catalog registries and public exports surfaces.

  Both floor-raising sub-skills now ship `catalog/index.ts` registries that are the single source of truth for the v1 DRIFT-\* codes — drift declares `category` + `standardSeverity` per code, align declares `handling` (`codemod-or-suggestion` vs `suggestion-only`) per code. The inline `STANDARD_SEVERITY` table previously embedded in `drift/findings/finding.ts` now reads from the catalog so the public catalog and `severityFor()` cannot drift apart. New `drift/exports.ts` and `align/exports.ts` modules become the stable contract for sibling skills + the (future) #5 design-pipeline orchestrator — mirroring `audit/component-anatomy/exports.ts` so the orchestrator can pattern-match across all floor-raising sub-projects. Adds 17 unit tests covering catalog shape, public re-export parity, severityFor↔catalog consistency, and the drift↔align v1-parity invariant. No runtime behavior change.

- 7c66168: Index `docs/architecture/<topic>/ADR-*.md` (the `harness-architecture-advisor` storage convention) as `decision` graph nodes via a new `DecisionIngestor.ingestArchitecture()` method, wired into `KnowledgePipelineRunner.extract()`. Projects whose primary docs are ADRs no longer report empty knowledge extraction. Markdown-style ADRs (no YAML frontmatter — H1 + `**Date:** / **Status:** / **Deciders:**` lines) are parsed; node IDs are namespaced by topic so duplicate ADR numbers across topics coexist. Closes the Finding-3 feature request in issue #504.

  `KnowledgePipelineResult` now exposes `errors: readonly string[]` aggregating BK + decision ingestor failures across the convergence loop; `harness knowledge-pipeline` text output surfaces the new `decisions` extraction count (previously silently omitted) and prints ingestion warnings to stderr — same silent-discard pattern PR #511 closed for `harness ingest`. `harness ingest --all` now also runs `BusinessKnowledgeIngestor`, restoring symmetry with `--source knowledge`.

- 5f9ed8c: Scaffolds the Local Model Lifecycle Manager (LMLM) — Phase 0.
  - New package `@harness-engineering/local-models` (empty barrel, no business logic yet).
  - New types in `@harness-engineering/types`: `LocalModelsConfig`, `LocalModelsPoolConfig`, `LocalModelsRefreshConfig`, `LocalModelsInstallerConfig`, `LocalModelsHardwareOverride`, plus platform/installer unions.
  - New optional `localModels` block on `HarnessConfigSchema` in the CLI, with Zod defaults that match the spec (24h refresh, 100GB budget, Ollama installer, opt-in disabled by default).

  Disabled by default; `harness validate` on existing configs remains green. Hardware detection, ranking, pool management, installer, proposal lifecycle, scheduler, HTTP/WS surfaces, CLI commands, and dashboard panel land in subsequent phases per `docs/changes/local-model-lifecycle-manager/proposal.md`.

- 7353b60: Add review depth calibration + adversarial / framework-aware reviewers to `harness-code-review`. New `Phase 3.5: CALIBRATE DEPTH` selects Quick / Standard / Deep from diff size and a canonical risk-keyword list, then dispatches three conditional subagents alongside the existing 4 base agents:
  - `adversarial` — assumption violations, composition failures, abuse cases (and at Deep, cascade chains)
  - `typescript-strict` — type holes that disable the checker, refactor regression, complexity growth
  - `frontend-races` — lifecycle cleanup gaps, hook timing, concurrent interactions, stale-response races

  `ReviewFinding` gains two optional additive fields: `subagent` (which subagent produced it) and a widened `confidence` union that accepts both the legacy `'high'|'medium'|'low'` and new numeric anchors `25|50|75|100`. Phase 6 dedup uses confidence as a tiebreaker when severity ties. New `--depth quick|standard|deep` CLI/MCP flag overrides calibration. Reference files: `references/confidence-rubric.md`, `references/risk-keywords.md`. ADR-0034.

### Patch Changes

- 99b5cbf: Fix two silent-failure parsers reported in chat-504:
  - `MermaidParser` no longer drops `.mmd` files whose first non-empty line is a `%%` comment. `detectDiagramType` now skips Mermaid comment lines (matching Mermaid's own grammar) so files starting with provenance headers like `%% Source: docs/foo.md` extract entities normally.
  - `harness ingest --source knowledge` now also runs `BusinessKnowledgeIngestor` against `docs/knowledge/`, `docs/solutions/`, and `STRATEGY.md`. Previously this command only invoked `KnowledgeIngestor`, leaving the business-knowledge substrate reachable only via `harness knowledge-pipeline` and surfacing as a silent `+0 nodes` for users who probed the natural CLI.
  - `harness ingest` CLI output now surfaces `IngestResult.errors[]` to stderr when non-empty, so frontmatter / schema validation failures stop being silently discarded. JSON output is unchanged (errors were already serialized there).

- 318b878: Add `STRATEGY.md` schema and validator (strategic-anchor phase 1 of 8 in the compound-engineering-adoption initiative).
  - `packages/types` exports `StrategyFrontmatter`, `StrategyDoc`, `StrategySection`, `REQUIRED_STRATEGY_SECTIONS`, `OPTIONAL_STRATEGY_SECTIONS`.
  - `packages/core/strategy` exports `StrategyDocSchema`, `StrategyFrontmatterSchema`, `parseStrategyDoc`, `asStrategyDoc`.
  - `packages/core/validation` exports `validateStrategy(cwd)` consumed by `harness validate`.
  - CLI `harness validate` now reports a `strategyConfig` check: soft-passes when STRATEGY.md is absent; fails with a precise per-section message when present and malformed (missing required section, unfilled template placeholder, malformed frontmatter).

  Scope: schema + validator only. The `harness-strategy` skill, the `harness-ideate` skill, init wiring, brainstorming/roadmap-pilot grounding, knowledge-graph integration, and ADRs ship in follow-up PRs (one per phase, matching the feedback-loops cadence).

- af56053: Ship the `harness-strategy` skill and the `writeStrategyDoc` writer (strategic-anchor phase 2 of 8 in the compound-engineering-adoption initiative).
  - `packages/core/strategy` exports `writeStrategyDoc(doc, { cwd, skipBackup? })` — atomic disk write of `STRATEGY.md` with schema-validation-rejects-disk-write, an idempotent `.bak` on first overwrite, H1 preservation across re-writes, and `tmp-<pid>` + `rename` semantics that mirror `writePulseConfig`. Composes a pure `serializeStrategyDoc(doc, opts?)` (also exported) so the serializer is unit-testable without filesystem fixtures.
  - `agents/skills/{claude-code,gemini-cli,cursor,codex}/harness-strategy/` ships the rigid skill (Phase 0 file-state routing; Phase 1 first-run interview in template order; Phase 2 per-section update flow; Phase 3 downstream handoff). `references/interview.md` documents the three pushback rules (fluff detection, goal-as-strategy, feature-list-as-strategy) with detection signals, repair scripts, anti-pattern fixtures, and the hard 2-round-per-section cap.
  - CLI emits `/harness:strategy` via `generate-slash-commands` (and the per-platform plugin generators); the slash command appears in `.claude-plugin/commands/strategy.md`, `.gemini-extension/commands/strategy.toml`, `.cursor-plugin/commands/strategy.md`, plus the `agents/commands/*` mirrors. Skill listed in the auto-generated skills catalog.

  Scope: writer + skill prose only. Init wiring, `harness-ideate`, brainstorming/roadmap-pilot grounding, knowledge-graph integration, and ADRs ship in follow-up PRs (one per phase).

- f0a2fbf: Add `harness-ideate` pre-brainstorm ideation skill across all 4 platforms (claude-code, cursor, codex, gemini-cli). The skill generates ranked candidate ideas grounded in `STRATEGY.md` (when present) and writes a single artifact to `docs/ideation/<slug>-YYYY-MM-DD.md`. Ranking formula: `(impact × confidence) ÷ effort` with the 1/2/3 mapping; strategy-alignment bonus (max +0.75) applied only as a bounded tiebreaker when adjacent base scores differ by ≤ 0.05 — mirrors the `harness-roadmap-pilot` tiebreaker shape. Wires the strategic-anchor flow into init (`initialize-harness-project` Phase 3 step 5c, yes/no/later prompt), brainstorming (Phase 1 step 0a STRATEGY.md grounding + Phase 2 EVALUATE contradiction handling), and roadmap-pilot (Phase 2 step 1a strategy-alignment tiebreaker). Phases 7 (knowledge graph) and 8 (ADRs + AGENTS.md) of the strategic-anchor spec ship in follow-up PRs.
- Updated dependencies [1cc843b]
- Updated dependencies [c17ad8b]
- Updated dependencies [99b5cbf]
- Updated dependencies [7c66168]
- Updated dependencies [5f9ed8c]
- Updated dependencies [ee2f6a0]
- Updated dependencies [7353b60]
- Updated dependencies [318b878]
- Updated dependencies [af56053]
- Updated dependencies [aaefe1b]
  - @harness-engineering/orchestrator@0.8.1
  - @harness-engineering/core@0.29.0
  - @harness-engineering/graph@0.11.0
  - @harness-engineering/types@0.16.0
  - @harness-engineering/dashboard@0.8.2
  - @harness-engineering/intelligence@0.2.7

## 2.7.1

### Patch Changes

- 39bfd73: Fix `harness recommend` crashing with `Unexpected token 'E', "Error: Max"... is not valid JSON` on repos with very large drift reports.

  Root cause: `generateSuggestions` in `@harness-engineering/core` spread sub-arrays into `Array.push` (`suggestions.push(...subList)`), exceeding V8's argument-count limit (~65k) on a 322k-entry drift report and throwing `RangeError: Maximum call stack size exceeded`. The cli's `parseToolResult` then JSON-parsed the resulting error text and crashed the recommend pipeline.

  Core: switched spread-push to `concat` so the suggestion accumulator scales with report size. Cli: made `parseToolResult` honor `isError`, catch parse failures, warn via logger, and fall back to `{}` so a single failing sub-check degrades gracefully instead of taking the whole pipeline down. Both layers gained regression tests with revert-and-fail verified.

- Updated dependencies [39bfd73]
- Updated dependencies [1fd39a6]
  - @harness-engineering/core@0.28.2
  - @harness-engineering/orchestrator@0.8.0
  - @harness-engineering/dashboard@0.8.1

## 2.7.0

### Minor Changes

- e4134d3: Add `align-design-system` — the FIX half of design-pipeline sub-project #1, paired with `detect-design-drift` (shipped PR #396).

  Consumes `DRIFT-*` findings and produces actual code changes:
  - **Auto-applies** safe codemods for **DRIFT-T001 / T002 / T003** — replaces hex / font-family / px-spacing literals with token references where the pre-flight classifier deems the change safe.
  - **Emits precise suggestions** for **DRIFT-T004** (deprecated tokens, migration target ambiguous) and all **DRIFT-P\*** (primitive adoption, requires prop-translation work deferred to v1.x).

  **Three decisions locked in the spec:**
  1. **v1 fix scope** — T001/T002/T003 codemods only. Hex/font/px have unambiguous 1:1 token mappings when a matching token exists. Primitive adoption needs prop-translation tables (`<button>` ⇄ `<Button>` event handlers, ref forwarding, class merging) — substantial design surface deferred to v1.x.
  2. **Standalone + pipeline-handoff field** (mirrors `align-documentation`). One implementation, two callers. Standalone mode runs detect-design-drift internally. Pipeline mode reads `pipeline.driftFindings` from `.harness/handoff.json` and writes `pipeline.fixesApplied` back so the (future) #5 orchestrator can re-verify only affected findings.
  3. **Pre-flight classifier in align** (not on DriftFinding). Safety logic lives next to fix logic; detect's schema stays stable. Per-finding context inspection — token import present? single string-literal context (vs template/concatenation)? exact-match token value? — decides safe-codemod vs suggestion.

  **Surface area:**
  - `harness align-design-system` — CLI command. `--dry-run` for preview; `--mode pipeline` for orchestrator integration; standard `--json` / `--verbose` / `--quiet`. Exit code 0 when ≥0 outcomes produced (fix or suggestion); 1 on at least one codemod failure.
  - `mcp__harness__align_design_system` — MCP tool. Tool count bumps 71 → 72.
  - 4-platform skill markdown shipped (claude-code / codex / cursor / gemini-cli).

  **Co-shipped detect-side improvement (DRIFT-T001 widened):**

  The original DRIFT-T001 rule only flagged hexes NOT in the palette. align's codemod scope required the opposite — hexes IN the palette but used as raw literals (the most common kind of real-world drift). This PR extends DRIFT-T001 to flag BOTH cases with distinct messages:
  - "Hex color X **should use a token reference** instead of a raw literal" (in-palette literal — align can codemod)
  - "Hardcoded color X is not in the design token palette" (off-palette literal — suggestion only)

  This keeps detect's behavior coherent with align's purpose. Updated detect-side test reflects the new expectation.

  **Configuration** (additive, all optional):

  The `align-design-system` skill reads the same `design.strictness` + `design.audit.driftDetection.*` blocks as detect. No new config sub-block in v1 — the pre-flight classifier is the only safety knob and it lives in code, not config.

  **Long-term trajectory** (documented in the spec):
  - v1.x — Primitive-adoption codemods (DRIFT-P\*) with prop-translation tables.
  - v1.x — T001/T002 codemods that add the token import line when missing (driven by config).
  - v1.5 — `Fixer<Finding, Outcome>` interface extraction (parallel to `Verifier<F>` extraction triggered by detect-design-drift).
  - v2 — `harness check-design --fix` shorthand composing check-design with the align family.
  - v3 — LLM-mediated suggestions become fixes (pairs with craft-pipeline).

  **Test plan:**
  - 38 new unit + integration tests across classifier, codemods (T001/T002/T003), and end-to-end (standalone + pipeline + dry-run + idempotency)
  - 90 tests pass across all affected suites (detect tests updated for widened T001; check-design 3-verifier tests unchanged)

- c5f8d01: Add `audit-brand-compliance` — rule-based brand-semantics audit (design-pipeline sub-project #3). The last unshipped floor-layer audit; closes the floor layer and unblocks #5 design-pipeline orchestrator.

  **Two rule families in v1 (narrow + deep):**
  - **BRAND-T001 (token misuse)** — flags tokens used in contexts declared as `forbidden_contexts` in `$extensions.harness.brand`. Recognizes three reference forms: `tokens.X.Y.Z`, `var(--X-Y-Z)`, and `'X.Y.Z'` string literals. Context inference v1 uses same-line + adjacent-non-blank-line vocabulary scan against `cta` / `selection` / `focus` / `data-visualization` / `decorative` / `background` / `text` / `border` / `error` / `success` / `warning`.
  - **BRAND-V001 (forbidden phrases)** — TS Compiler API walk over `.tsx`/`.jsx` files. Scans `JsxText` nodes and string-typed `JsxAttribute` initializers for case-insensitive substring matches against `voice.forbiddenPhrases` from `DESIGN.md ## Brand Rules`.

  **Three decisions locked in the spec:**
  1. **v1 rule scope:** BRAND-T\* + BRAND-V001 only. Defers tone-by-context (needs component-state inference), reading-level / sentence-length (ship with tone-context), asset rules (image-tag + filesystem), and semantic-token-alias enforcement (overlaps with detect-drift T001) to v1.x.
  2. **Input sources:** Both `DESIGN.md ## Brand Rules` AND `tokens.json $extensions.harness.brand`. Per ADR 0028. Either resolver returning null silently skips the matching rule family.
  3. **check-design composition:** 4th verifier (triggers `Verifier<F>` interface extraction).

  **Cross-cutting: Verifier<F> interface extraction**

  The convention note in `check-design.ts` deferred extracting a formal Verifier interface until the 3rd check-\* command landed. Brand makes 4 verifiers in `harness check-design` (anatomy / craft / drift / brand). This PR extracts:

  ```ts
  // packages/cli/src/shared/verifier.ts
  export interface Verifier<F, Cat = ..., Meta = ...> {
    findings: F[];
    summary: { totalFiles, durationMs, bySeverity, byCode };
    catalog: Cat;
    meta: Meta;
  }
  ```

  All three rule-based verifiers (anatomy / drift / brand) declare structural conformance via type aliases. design-craft has a different output shape (cost telemetry, exemplar citations) and remains composed but does not conform — that's by design, the interface captures the rule-based pattern.

  **Surface area:**
  - `audit_brand` MCP tool (count 72 → 73)
  - `harness validate` fast-mode hook gated by `design.audit.brandCompliance.enabled` (default true)
  - 4th verifier in `harness check-design` (degrades gracefully on failure)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `design.audit.brandCompliance.{enabled, rules, fastMode}` config block

  **Configuration** (additive, all optional):

  ```json
  {
    "design": {
      "audit": {
        "brandCompliance": {
          "enabled": true,
          "rules": { "tokenMisuse": true, "voice": true },
          "fastMode": { "maxFiles": 500 }
        }
      }
    }
  }
  ```

  **Long-term trajectory** (documented in proposal):
  - v1.x: BRAND-Tone* tone-by-context rules (after component-state inference matures); BRAND-V002/V003 reading-level + sentence-length; BRAND-A* asset rules; semantic-token-alias enforcement; standalone `harness audit-brand` CLI if signal warrants.
  - v2: `align-brand-compliance` sibling FIX skill (forbidden-phrase suggestions, token-misuse alias swaps); `VIOLATES_brand` dedicated graph edge.
  - v3: LLM-judgment tone rules paired with craft-pipeline #5 copy-craft.

  **Tests:** 35+ new unit + integration tests across resolvers (DESIGN.md parser, $extensions walker), rules (token-misuse, forbidden-phrases), and end-to-end audit composition. check-design test extended for 4-verifier case. 821 tests pass across the cli suite.

- d1c9bda: Add `harness check-design` — single-pass design verifier (design-pipeline sub-project #4).

  Mirrors `harness check-docs` exactly. Composes the two design audits shipped in PRs #372 + #390 (audit-component-anatomy + design-craft critique) into one command. Designed to be invoked by the (future) #5 design-pipeline orchestrator inside its convergence fix loop — same pattern harness-docs-pipeline uses to compose check-docs.

  **CLI:**
  - `harness check-design` — runs both verifiers, aggregates findings, persists to graph
  - `--mode fast|full` (default `full`)
  - `--files <glob>...` for scoping
  - Standard `--json`/`--verbose`/`--quiet`
  - Exit codes: 0 = no error-severity findings; 1 = error-severity findings present; 2 = at least one verifier failed (degraded)

  **New exports:**
  - `runDesignCraft` from `packages/cli/src/mcp/tools/design-craft.ts` — programmatic entry point that returns `Result<DesignCraftOutput, ...>` (unwrapped from the MCP response wrapper). Same contract as `handleDesignCraft`.
  - `CraftFindingRecord` type from `@harness-engineering/graph` (was internal to `DesignConstraintAdapter.ts`; needed by check-design to format findings for `recordFindings()`).

  **Verifier-shape convention** (NOT extracted as a formal interface in this PR per the spec's "data points reveal shape" principle):

  Both invoked audits return `{ findings: F[], summary: { bySeverity, byCode, durationMs, ... }, ... }`. `check-design.ts` notes this convention in a top-of-file comment so the next check-\* author follows the pattern. The `Verifier<F>` interface gets extracted when the **third** check-\* command lands.

  **Graceful degradation:** if either verifier throws, the other still runs; failed verifiers surface in `summary.verifiersFailed`; exit code 2 (degraded) instead of crashing.

  **Long-term trajectory** (documented in proposal — not in this PR):
  - v2 = `harness validate` wraps `check-design --fast` internally (one impl, two surfaces)
  - v3 = check-\* commands become facades over graph queries (`harness findings`)

- bbc164f: Make harness skills and personas discoverable in Codex CLI, and fix a long-standing scanner false-positive flood.

  **@harness-engineering/cli** (minor): the Codex slash-command adapter now writes to `~/.codex/skills/<name>/SKILL.md` with the YAML frontmatter Codex's skill discovery requires; all 50 harness skills are reachable via `$harness-debugging`, `/skills`, and auto-trigger. The agent-definitions adapter emits real Codex subagent TOMLs at `~/.codex/agents/<name>.toml` (12 personas) so they appear in `/agent`. Both surfaces previously wrote dead files Codex ignored.

  **@harness-engineering/core** (patch): `SecurityScanner` now honors `// harness-ignore SEC-XXX: justification` on the line above the flagged code, matching the convention already in use across the repo. Previously only same-line annotations were recognized, so every prior-line annotation silently re-fired the suppressed rule.

  **@harness-engineering/orchestrator** / **@harness-engineering/dashboard** (patch): annotate the previously-flagged `JSON.parse` and `writeFile` sites with the explanatory `// harness-ignore` comments the scanner now reads correctly. No runtime behavior change.

  Also includes an infra fix to `.husky/pre-push` so nvm's Node takes precedence over Homebrew's on PATH (otherwise `better-sqlite3` fails to load under a newer Homebrew Node and blocks every push).

- 44b9c2e: Add **copy-craft** — third member of the craft-pipeline initiative (sub-project #5 of 10). LLM-judgment skill for ALL prose-in-code across **six surfaces**: error messages, log lines, CLI output strings, commit subjects, PR descriptions, and code comments. Primary domain is error messages (universally bad in most codebases). NO rule-based floor exists — pure ceiling.

  **Three decisions locked:**
  1. **All 6 surfaces from the roadmap entry.** Errors, logs, CLI output, commit subjects, PR descriptions, code comments. Single PR covers the full prose-in-code surface area. Graceful degradation for surfaces requiring external infra (git binary, gh CLI auth).
  2. **TS Compiler API for source-side extraction.** Same approach naming-craft uses. Precise: knows when a string literal is inside an `Error` constructor vs an arbitrary function call. Avoids false positives. Commit subjects and PR descriptions use shell-out (different infra).
  3. **Living catalog H (ADR 0020).** Continues the established craft pattern. Seed rubrics with contribution/signal/version fields reserved.

  **8 seed rubrics** (one file per rubric, matches naming-craft / spec-craft layout):

  | Rubric                                | Surfaces                        | Source                                               |
  | ------------------------------------- | ------------------------------- | ---------------------------------------------------- |
  | `COPY-R001` WHAT/WHY/HOW-TO-FIX       | error                           | Stripe API error guide + Nielsen #9                  |
  | `COPY-R002` calm-not-panicky          | error, log                      | Mailchimp voice + Atlassian writing                  |
  | `COPY-R003` specific-not-generic      | error, log, cli-output          | Martin, Clean Code (error handling)                  |
  | `COPY-R004` signal-not-noise          | log                             | Google SRE book                                      |
  | `COPY-R005` grep-survives             | log, cli-output                 | SRE + Unix philosophy                                |
  | `COPY-R006` describes-change-not-work | commit, pr-description          | Tim Pope, "A Note About Git Commit Messages"         |
  | `COPY-R007` stranger-in-6-months      | commit, pr-description, comment | Software-engineering folklore (durability principle) |
  | `COPY-R008` WHY-not-WHAT              | comment                         | Martin, Clean Code ch. 4 + Beck                      |

  **Six extractors** (three infrastructures):
  - **Source-side** (TS Compiler API, single pass per file amortizes parse cost):
    - `extract/source.ts` — handles errors (`throw new <X>Error(...)`, `Err({ message: ... })`), logs (`console.X`, `logger.X`, `pino.X`, `winston.X`), CLI output (path-scoped to `packages/cli/src/commands/`), and comments (excludes JSDoc + license banners)
  - **Git** (`extract/commits.ts`) — shells out `git log --pretty=format:'%H%x09%s' --since=...`; 10s timeout; skips silently when not in a git repo
  - **GitHub** (`extract/pr-descriptions.ts`) — shells out `gh pr list --json number,title,body`; skips silently when `gh` binary missing OR `gh auth status` fails

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal.

  **Cross-cutting:** `critiqueCopyInFile(file, opts)` exported (source-side surfaces only). Future craft skills + `harness-brainstorming` can invoke per-file copy critique without a project walk.

  **Surface area:**
  - `harness copy-craft` CLI command (`--files` / `--surfaces` / `--max-files` / `--max-items-per-file` / `--commits-since` / `--pr-limit` / `--json`)
  - `copy_craft` MCP tool (count 76 → 77)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.copy.{enabled, maxFiles, maxItemsPerFile, surfaces, commitsSince, prLimit}` config block

  **Graceful degradation contract:** `summary.skippedSurfaces` records `{ surface, reason }` for each surface whose prerequisites weren't met. Surfaces that ran appear in `summary.catalog.surfacesScanned`. Skipped surfaces are visible in the report; not failures.

  **Tests:** 30 new tests across source extractor (errors / logs / cli-output / comments), commits extractor (with real `git init` integration), PR extractor (graceful-contract assertion), rubric mapping, critique phase, and end-to-end pipeline (mock LLM). 883 tests pass across the cli suite. Smoke-tested end-to-end against the harness repo's own source + git history: 97 commit subjects + 29 comments extracted from a 5-file scope; 252 findings emitted from the 8 rubrics × applicable surfaces; mock provider's deterministic low-confidence response preserves ADR 0019 honesty.

  **Long-term trajectory:**
  - v1.x: multi-line commit body + PR body critique; JSDoc / TSDoc (or docs-craft hand-off); PR comments + review comments; per-language support (Python `raise`/`logging`, Go `fmt.Errorf`/`log.Printf`, Rust `panic!`/`tracing`); `align-copy` sibling FIX skill for safe error-message rewrites.
  - v2: author-attributed signals via Hermes; integration with craft-pipeline orchestrator (shared `pipeline.copyFindings`).
  - v3: LLM-judgment via project's brand voice (when audit-brand-compliance v2 ships voice-attribute critique).

- 0eac8eb: Design-pipeline coordination commits — wire up the Phase 1 vertical-slice MCP tools end-to-end.

  **MCP server registration** — `mcp__harness__audit_anatomy` and `mcp__harness__design_craft` are now registered in `TOOL_DEFINITIONS` / `TOOL_HANDLERS` and discoverable to MCP clients (previously exported but unregistered).

  **`harness.config.json` schema extensions** — adds optional `design.audit.componentAnatomy.*` (gates audit-component-anatomy + the harness-accessibility deferral; controls catalog scoping, fast-mode behavior) and `design.craft.*` (gates harness-design-craft; controls fast/deep mode, autoCapture B' behavior, LLM provider, catalog scoping, signal feedback threshold). All fields optional with sensible defaults; omitting either block uses built-in defaults. Zero impact on existing configs.

  **`DesignConstraintAdapter.recordFindings()`** — generic finding-ingestion entry point that both audit-component-anatomy (ANAT-\*) and harness-design-craft (CRAFT-\*) call to persist findings as graph state. Idempotent (re-running produces no duplicate edges). Per finding: lazy `design_constraint` node creation + `violates_design` edge from file to constraint with per-finding metadata (line, severity, message, evidence, runId). Uses existing graph taxonomy — no NodeType/EdgeType additions.

  **`harness-accessibility` deferral patch** — Phase 1 step 2.6 added: when `design.audit.componentAnatomy.enabled = true` (default), A11Y-010 (interactive without accessible label) and A11Y-050 (input/select/textarea without label) are deferred to audit-component-anatomy for components in its catalog. Same i18n-style deduplication pattern proven in step 2.5. Catalog set loaded via `getCatalogTypes()` from audit-component-anatomy's public export — zero rule-content duplication.

  **Deferred to a follow-up commit:** `harness validate` fast-mode hook for audit-anatomy (the largest individual coordination item; requires touching the validate command path). The other coordination items are surgical extensions that close the loop on Phase 1 without requiring validate changes.

- ec3e872: Add **design-pipeline orchestrator** — the last unshipped sub-project of the design-pipeline initiative (#5). Closes the initiative end-to-end.

  A new `harness-design-pipeline` skill + `harness design-pipeline` CLI command + `run_design_pipeline` MCP tool that composes detect-design-drift, align-design-system, audit-component-anatomy, audit-brand-compliance, and design-craft-elevator into a sequential pipeline with convergence-based remediation.

  **Three decisions locked in the spec:**
  1. **New `harness-design-pipeline` skill** (mirrors `harness-docs-pipeline`). Keeps `harness check-design` focused on single-pass verification; orchestrator owns the multi-pass loop. Pattern parity with docs-pipeline.
  2. **FILL phase does BOTH bootstrap AND craft polish.** (a) Stubs missing DESIGN.md / tokens.json / Component Registry / Brand Rules sections with TODO placeholders (mirrors docs-pipeline's AGENTS.md bootstrap). (b) Invokes design-craft-elevator POLISH for ceiling-layer suggestions.
  3. **Generic `VerifierRegistry<F>` consumer.** AUDIT phase iterates a registry of verifiers conforming to the just-extracted `Verifier<F>` interface (PR #399). Adding a 5th rule-based verifier in the future requires only a `register()` call — zero orchestrator changes.

  **Six phases:**

  | Phase   | Role                                                                                |
  | ------- | ----------------------------------------------------------------------------------- |
  | FRESHEN | Read-only check: DESIGN.md / tokens.json / Component Registry / Brand Rules / graph |
  | DETECT  | Invoke detect-design-drift; populate `context.driftFindings`                        |
  | FIX     | Convergence loop (max 5 iterations) with align-design-system — only when `--fix`    |
  | AUDIT   | Generic Verifier<F> registry loop (audit-anatomy + audit-brand)                     |
  | FILL    | Bootstrap missing inputs + invoke design-craft-elevator POLISH                      |
  | REPORT  | Compute `pass`/`warn`/`fail` verdict; aggregate summary                             |

  **Iron Law (per harness-docs-pipeline):** the orchestrator DELEGATES, never reimplements. If you find yourself writing drift detection, fix application, or audit logic inside the orchestrator, STOP — delegate to the dedicated sub-skill. Tests enforce this: orchestrator imports only sub-skill entry points (no rule logic).

  **Surface area:**
  - `harness design-pipeline` CLI command (`--fix`, `--no-freshen`, `--no-fill`, `--ci`, `--mode`, `--files`, `--design-strictness`, `--json`)
  - `run_design_pipeline` MCP tool (count 73 → 74)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - `DesignPipelineContext` carried across phases via `.harness/handoff.json` `pipeline` field (align-design-system v1 already supports this protocol)
  - `VerifierRegistry` class generalizing Verifier<F> consumption

  **Verdict computation:**
  - `pass` — zero findings, zero suggestions, zero bootstrapped
  - `warn` — any warn-severity finding OR craft suggestion OR bootstrapped any input
  - `fail` — any error-severity finding remains after FIX

  Exit codes: 0 (pass/warn), 1 (fail), 2 (pipeline crashed with all verifiers down).

  **Convergence loop:** bounded at 5 iterations (matches docs-pipeline). Stops when align applies 0 fixes (converged) or when total drift count fails to decrease (no progress).

  **Tests:** 28 new tests across registry, phase implementations (freshen, fill, report), and end-to-end integration (empty project bootstrap, clean project pass, drift project fail, `--no-freshen` / `--no-fill` flag behavior, verifiersRun list). 818 tests pass across the cli suite. Smoke-tested end-to-end: detect+anatomy+brand+craft all fire correctly on a fixture project; verdict and per-phase counts surface as expected.

  **Long-term trajectory** (documented in spec):
  - v1.x — `--interactive` mode (terminal sessions with diff preview + per-fix approval); `--phase` flag to run a specific phase in isolation; `--persist` flag to write findings to `.harness/graph/`; `--watch` for development; per-phase telemetry via Hermes.
  - v2 — `align-brand-compliance` + `align-anatomy` FIX skills compose into the FIX phase loop alongside align-design-system; cross-orchestrator composition with craft-pipeline.
  - v3 — graph-as-source-of-truth: orchestrator becomes a graph-query facade.

  **Design-pipeline initiative state after merge: COMPLETE.** All 6 sub-projects shipped (#0 brand-guidelines ADR, #1 detect+align, #2 anatomy, #3 brand, #4 check-design verifier, #5 this orchestrator, #6 design-craft). Floor + ceiling + orchestrator end-to-end.

- 878eb6d: Design-pipeline initiative decomposition + Phase 1 vertical slices for sub-projects #2 and #6.

  **New MCP tools** (registered separately in a follow-up commit; exports ready):
  - `mcp__harness__audit_anatomy` (`packages/cli/src/mcp/tools/audit-anatomy.ts`) — audit component definitions for missing required anatomy parts (slots, states, sizes). Vertical-slice scope: Button + ANAT-D001 working end-to-end. Pattern findings (ANAT-P\*) deferred.
  - `mcp__harness__design_craft` (`packages/cli/src/mcp/tools/design-craft.ts`) — first LLM-judgment-based skill in harness. Three branchable phases (CRITIQUE / POLISH / BENCHMARK). Vertical-slice scope: CRITIQUE with hierarchy-clarity rubric + 3-axis (tier × impact × confidence) finding schema + 5-dim radar for BENCHMARK schema.

  **New internal modules** (CLI-internal, not exported):
  - `packages/cli/src/audit/component-anatomy/` — TypeScript Compiler API parser, ConventionRule + PatternRule types (with Phase 0 spike's recommended `postProcess` + `auxiliary` additive fields), 3-layer source-of-truth resolver (JSDoc → DESIGN.md → conventions), 3-layer component-type resolver, convention runner.
  - `packages/cli/src/design-craft/` — 3-axis findings schema, deterministic priority derivation, hierarchy-clarity rubric, mock LLM provider, CRITIQUE phase with permissive LLM-output parser.

  **Two new skills** added at `agents/skills/{claude-code,gemini-cli,cursor,codex}/{audit-component-anatomy,harness-design-craft}/` (4-platform parity, markdown-only per the established harness skill convention).

  **Five new ADRs** establishing reusable patterns:
  - 0018 LLM-judgment skill pattern
  - 0019 3-axis craft output model + 5-dim radar
  - 0020 Living-catalog H pattern
  - 0021 Detect-and-offer B' pattern
  - 0028 Brand-guidelines source of truth (path A: extend DESIGN.md + claim DTCG `$extensions.harness.brand`)

  **ADR cleanup (0022)**: renumbered 5 duplicate ADRs in the 0003-0007 range to 0023-0027 with inbound reference sweep across `AGENTS.md`, `docs/conventions/`, and feedback-loops plan/proposal docs. README rule ("Never reuse a number") now honored.

  **Deferred to follow-up commits** (intentional scope split — see PR description):
  - Tree-sitter pattern engine + JSDoc/DESIGN.md parsers for #2
  - DesignConstraintAdapter graph integration for both skills
  - harness-accessibility i18n-style deferral patch
  - `harness.config.json` schema extensions (`design.audit.componentAnatomy.*`, `design.craft.*`)
  - `packages/cli/src/mcp/server.ts` registration of both new tools (2-line wire-ups)
  - Vision-LLM + playwright MCP rendering for #6 deep mode
  - POLISH + BENCHMARK phase implementations + B' detect-and-offer for #6
  - Remaining catalog content for both skills (Phase 2)

  Test coverage: 4/4 audit-anatomy vertical-slice tests passing; 7/7 design-craft vertical-slice tests passing; full skills package 23941/23941 passing.

- 4215328: Add `detect-design-drift` — design-system drift verifier (design-pipeline sub-project #1, detect half).

  Floor-layer rule-based skill. Scans the project for two families of drift, reports findings, never modifies source. The matching fixer (align-design-system) is intentionally a separate sub-project so detect can ship first and stay testable in isolation.

  **Two rule families (gated independently via config):**
  - **DRIFT-T\* — token bypass.** Regex-based detection against `design-system/tokens.json` (W3C DTCG format).
    - DRIFT-T001 — hex color literal outside the loaded palette
    - DRIFT-T002 — font-family string outside the typography palette (system fallbacks always allowed)
    - DRIFT-T003 — pixel margin/padding/gap value outside the spacing scale (skipped when no spacing tokens)
    - DRIFT-T004 — reference to a `$deprecated: true` token (or `$extensions.harness.deprecated: true`), in both string-literal and CSS-var-kebab forms
  - **DRIFT-P\* — primitive adoption.** TS Compiler API JSX parsing against `design-system/DESIGN.md` `## Component Registry`.
    - DRIFT-P001 — raw `<button>` where `Button` is registered
    - DRIFT-P002 — raw `<input>` where `Input` is registered
    - DRIFT-P003 — raw `<a>` where `Link` or `Anchor` is registered
    - DRIFT-P004 — raw `<textarea>` where `Textarea` is registered

  **Soft-dependency design.** Either resolver returning `null` (`tokens.json` absent, or DESIGN.md without a `## Component Registry` section) is not a failure — the matching rule family silently skips. Projects that haven't opted in see zero false positives.

  **Surfaces:**
  - `harness validate` — fast-mode hook (gated by `design.audit.driftDetection.enabled`, default `true`). Degrades gracefully on verifier failure (single warning, other checks continue).
  - `harness check-design` — third composed verifier alongside audit-component-anatomy and design-craft critique. Findings flow into `DesignConstraintAdapter.recordFindings()` for idempotent graph persistence.
  - `mcp__harness__detect_drift` — MCP tool. Input: `{ path, mode, files?, designStrictness?, rules? }`. Output: `{ findings, summary, catalog, meta }`. Consumed by the (future) #5 design-pipeline orchestrator.

  **Severity model.** Mirrors audit-anatomy. `design.strictness: strict` → every finding `error`; `standard` → T001/T002/P001 `error`, rest `warn`; `permissive` → everything `info`.

  **Config additions** (all optional — block-omission yields built-in defaults):

  ```json
  {
    "design": {
      "audit": {
        "driftDetection": {
          "enabled": true,
          "rules": { "tokenBypass": true, "primitiveAdoption": true },
          "fastMode": { "maxFiles": 500 }
        }
      }
    }
  }
  ```

  **Verifier-shape convention** — third invoker of the `{ findings, summary, catalog, meta }` shape (per `check-design-verifier` changeset note). The `Verifier<F>` interface extraction trigger is now met; deferred to a follow-on PR so this ship stays focused.

  **Long-term trajectory** (documented in proposal — not in this PR): primitive-adoption subsumes legacy DESIGN-001/002 in v1.x; align-design-system ships as a sibling sub-project; pluggable resolver interface supports projects that ship non-DTCG token formats.

- 597c3d4: Add **knowledge-craft** — ninth sub-project of the craft-pipeline initiative (#9 of 10; fifth non-design). LLM-judgment skill for knowledge-entry quality under `docs/knowledge/`. Critiques whether an entry states a load-bearing FACT (not paraphrase of code), earns a place in the knowledge graph taxonomy, carries forward a decision that would otherwise erode, or could be picked up by a stranger six months from now. The ceiling counterpart to `harness-knowledge-pipeline` (procedural ingestion) and `harness-detect-doc-drift` (structural).

  **Three decisions locked:**
  1. **v1 scope: `docs/knowledge/` EXCLUDING `decisions/`.** Hard exclusion of the `decisions/` subdir avoids double-critique with spec-craft (which owns ADRs). AGENTS.md deferred to v1.x (different shape: navigational manifest vs fact-bearing entry).
  2. **Per-file granularity.** Knowledge entries are typically focused single-topic docs (1-3 sections); per-file aligns with how knowledge authors think. Per-section adds prompt overhead without localization gain at this scale; per-claim is too noisy + expensive.
  3. **Reference graph types in rubrics, no graph reads at runtime.** `KNOW-R003` (earns-graph-place) names `business_fact` / `business_rule` / `business_concept` / `business_decision` in its rubric description so the LLM critiques against the taxonomy; knowledge-craft never imports from `@harness-engineering/graph`. Avoids coupling to harness-knowledge-pipeline while keeping the rubric semantically aware.

  **7 seed rubrics** (one file per rubric, matches naming-craft / spec-craft / copy-craft layout):

  | Rubric      | Title                                               |
  | ----------- | --------------------------------------------------- |
  | `KNOW-R001` | States a load-bearing fact (not paraphrase)         |
  | `KNOW-R002` | Truth a code reader could not derive                |
  | `KNOW-R003` | Earns a place in the knowledge graph taxonomy       |
  | `KNOW-R004` | Carries forward a decision that would erode         |
  | `KNOW-R005` | Deleting would lose specific knowledge              |
  | `KNOW-R006` | Concrete and operationally defined (not platitudes) |
  | `KNOW-R007` | A stranger could pick it up six months from now     |

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal, living-catalog H seed format (`contribution` / `signal` / `version` fields reserved).

  **Cross-cutting API:** `critiqueKnowledgeFile(file, opts)` exported. Future composition target — `harness-knowledge-pipeline` can call this when a fresh entry lands at ingest time (v2). Mirrors the same shape as `critiqueSpecFile` / `critiqueCopyInFile` / `critiqueNameFile`.

  **Surface area:**
  - `harness knowledge-craft` CLI command (`--files` / `--exclude-dirs` / `--max-files` / `--json`)
  - `knowledge_craft` MCP tool (count 78 → 79)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - Plugin slash-commands generated for `.claude-plugin/` + `.cursor-plugin/`

  **Tests:** 22 new tests (8 discover + 5 critique + 9 integration) covering: hard-exclusion of `decisions/`, graph-taxonomy-naming contract for KNOW-R003 (no graph imports at runtime), per-file critique with mock LLM, cross-cutting `critiqueKnowledgeFile`, files override, maxFiles cap, excludeDirs honoring, README exclusion (case-insensitive), POSIX path normalization. 109 sibling craft tests (naming/spec/copy/design) still pass after the new module imports `shared/craft`.

  **Long-term trajectory:**
  - v1.x: AGENTS.md critique with dedicated manifest rubrics; per-section / per-claim opt-in for very large entries; `align-knowledge` sibling FIX skill for safe rewrites (load-bearing-fact extraction, redundancy collapse); graph-aware mode (opt-in: critique against actual ingested nodes).
  - v2: composes with `harness-knowledge-pipeline` at ingest time — fresh entries run knowledge-craft critique inline.
  - v3: cross-entry consistency rubrics ("this entry contradicts another entry's claim").

- 17beb09: Add **naming-craft** — first member of the craft-pipeline initiative (sub-project #1 of 10). LLM-judgment skill that critiques identifier names (variables, functions, types, files) against a curated rubric catalog seeded from Martin / Beck / Karlton.

  **Three decisions locked in the spec:**
  1. **v1 identifier kinds: variables + functions + types + files.** Covers ~80% of naming value in TS codebases. Modules / branches / commit subjects deferred to v1.x (different infrastructure; commit subjects belong to copy-craft #5).
  2. **Convention source: catalog-only + derived-from-code.** No project input required. Universal rubrics ship in the default catalog; case convention (camelCase / snake_case / PascalCase) is sampled from the project's existing identifiers via majority-rule (>50% threshold). Below threshold → silent skip of convention-conformance rubric.
  3. **Living catalog H (ADR 0020).** Mirrors design-craft's catalog pattern. Seed rubrics with `contribution` / `signal` / `version` fields reserved for future growth mechanism.

  **6 seed rubrics** (one file per rubric, matches design-craft layout):
  - `NAME-R001` predictive power (Martin)
  - `NAME-R002` concreteness (Martin / Beck)
  - `NAME-R003` verb/noun honesty (Beck)
  - `NAME-R004` convention conformance (Karlton)
  - `NAME-R005` scope match (Beck)
  - `NAME-R006` encoded measure / unit (Pragmatic Programmer)

  **Honors ADRs 0018-0021:**
  - ADR 0018 (LLM-judgment skill pattern): confidence is first-class on every finding; LlmProvider records cost telemetry.
  - ADR 0019 (3-axis output): tier × impact × confidence emitted on every finding, never collapsed to single severity.
  - ADR 0020 (living catalog H): every finding carries `cite.rubricId` for catalog usage signal; rubric `signal`/`contribution`/`version` fields ship reserved.

  **Cross-cutting:** other craft skills (docs-craft / test-craft / code-craft) will call `critiqueNamesInFile(file, opts)` — exported entry point that operates on a single file without project re-walk. Pre-computed convention can be passed through to avoid re-sampling per consumer.

  **Reuses design-craft infrastructure:** imports `LlmProvider` + `MockLlmProvider` + `derivePriority` directly. Extraction to `packages/cli/src/shared/llm/` deferred until a second non-design craft skill needs differences (v2 decision).

  **Surface area:**
  - `harness naming-craft` CLI command (`--files` / `--kinds` / `--max-files` / `--max-identifiers-per-file` / `--json` / `--verbose`)
  - `naming_craft` MCP tool (count 73 → 74)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.naming.{enabled, maxFiles, maxIdentifiersPerFile}` config block under a new top-level `craft.*` namespace
  - Cross-cutting API: `runNamingCraft(input)` + `critiqueNamesInFile(file, opts)`

  **Tests:** 22 new unit + integration tests across extractor, convention sampler, classifier, critique phase, and end-to-end pipeline (with mock LLM provider). 801 tests pass across the cli suite. Smoke-tested end-to-end on a fixture file: 23 findings emitted from 6 rubrics × ~5 identifiers; convention sampler correctly derives `camelCase` for variables/functions and `null` for types (single type sample insufficient for majority).

  **Long-term trajectory:**
  - v1.x: module / branch / commit-subject naming; POLISH phase; per-project rubric overrides; per-language (Python / Go / Rust) idiom catalogs; `align-naming` sibling FIX skill once safe-rename heuristics mature.
  - v2: extract shared craft infrastructure (`LlmProvider` + 3-axis types + `derivePriority`) to `packages/cli/src/shared/craft/` when a second non-design craft skill lands; cross-craft convergence inside the (future) craft-pipeline orchestrator with shared `pipeline.namingFindings` field.
  - v3: aesthetic-intent-aware naming — when project has declared `harness-design` aesthetic intent, naming critique matches identifier verbosity to that aesthetic (terse for minimalist, descriptive for verbose).

- 57f89b6: Add **security-craft** — tenth (and final) sub-project of the craft-pipeline initiative (#10 of 10; sixth non-design). The craft-pipeline initiative completes with this PR. LLM-judgment skill for security posture on TS/JS source — the ceiling counterpart to `harness-security-scan` (CVE/OWASP rule-based floor) and `harness-security-reviewer` (procedural review). Threat-modeling-as-skill rather than pattern-matching. Critiques whether trust boundaries are respected, where implicit privilege escalation lurks, whether the code defends in depth or just at the gate, whether principle of least authority is honored.

  **Three decisions locked:**
  1. **v1 scope: source code only (TS/JS).** Walks `packages/*/src/`. Excludes IaC, dependency manifests, CI configs (floor concerns covered by CVE scanners + image-scanning). Narrowest scope = highest signal-to-noise; matches the per-file pattern of knowledge-craft + copy-craft.
  2. **AST-driven targeting.** Uses TS Compiler API to detect security signals in any file: HTTP handlers, middleware, auth APIs, `child_process`/`eval`/`new Function`, `fs` writes, JWT/session/cookie APIs, raw SQL queries, network egress, secret handling. **Files with zero signals are skipped entirely** — no path-heuristic fallback. AST awareness (not regex) avoids common FPs like `exec` in a comment or `eval` as a variable name.
  3. **Conservative confidence default.** Rubric prompts bias the LLM toward `medium` confidence; `high` requires a specific, named anti-pattern or visible missing guard. Per ADR 0019, low/medium-confidence findings are de-emphasized in reports. Directly mitigates the roadmap's flagged FP risk for judgment-based security (which the roadmap called out as the hardest craft to land well).

  **8 seed rubrics** (one file per rubric, each declaring `appliesToSignals` for pre-filter):

  | Rubric     | Title                                           | Applies to signals                                  |
  | ---------- | ----------------------------------------------- | --------------------------------------------------- |
  | `SEC-R001` | Trust boundary respected                        | http-handler, middleware, raw-query, privileged-op  |
  | `SEC-R002` | Principle of least authority honored            | auth-api, privileged-op, http-handler               |
  | `SEC-R003` | Defense in depth (not gate-only)                | auth-api, http-handler                              |
  | `SEC-R004` | Assumed adversary realistic for the deployment  | http-handler, middleware, auth-api                  |
  | `SEC-R005` | Data flow across trust boundaries is visible    | http-handler, raw-query, data-egress, privileged-op |
  | `SEC-R006` | Fail closed, not open                           | auth-api, middleware, http-handler                  |
  | `SEC-R007` | Secrets carried in a shape that resists leakage | secret-handling                                     |
  | `SEC-R008` | Authorization check happens before the action   | http-handler, privileged-op                         |

  **7 signal kinds** detected via single-pass TS Compiler API walk:
  - `http-handler` — `(req, res)` / `(req, res, next)` shapes; `app.get/post/...`; `@Get/@Post/...` decorators
  - `middleware` — `(req, res, next) =>` / `(ctx, next) =>` shapes
  - `auth-api` — `jwt.{sign,verify}`, `bcrypt.{hash,compare}`, `argon2.*`, `passport.*`, `req.session.*`, `res.cookie`
  - `privileged-op` — `child_process.{exec,spawn,...}`, `eval`, `new Function`, `vm.runIn*`, `fs.{writeFile,unlink,chmod,...}`
  - `data-egress` — `fetch`, `axios.*`, `http.request`, `https.request`, `net.connect`
  - `raw-query` — `*.query/raw/$queryRaw/$executeRaw` with SQL-shaped template literal
  - `secret-handling` — secret-named variable (`token`, `password`, `apiKey`, …) flowing into `console.*` / `logger.*` / `JSON.stringify` / template-literal sink

  **Honors ADRs 0018-0021:** confidence first-class (and conservatively biased), 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal, living-catalog H seed format.

  **Cross-cutting API:** `critiqueSecurityInFile(file, opts)` exported. Returns `[]` for files with no security signals (consistent with the orchestrator's FP-management strategy). Mirrors the shape of `critiqueKnowledgeFile` / `critiqueCopyInFile` / `critiqueSpecFile` / `critiqueNameFile`.

  **Surface area:**
  - `harness security-craft` CLI command (`--files` / `--packages` / `--max-files` / `--max-signals-per-file` / `--json`)
  - `security_craft` MCP tool (count 79 → 80)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - Plugin slash-commands generated for `.claude-plugin/` + `.cursor-plugin/`

  **FP-management strategy** (three independent layers):
  1. AST-driven signal detection — files with zero security-relevant constructs are skipped entirely; no broad-glob fallback.
  2. Per-rubric `appliesToSignals` pre-filter — a file with one `secret-handling` signal only fires SEC-R007, not all 8 rubrics.
  3. Conservative-confidence system prompt — LLM defaults to `medium` confidence; `high` requires a specific, named anti-pattern.

  **Tests:** 45 new tests (8 discover + 21 signals + 5 critique + 11 integration) covering: AST awareness (comments/variable-name "eval" don't fire), every signal kind, per-rubric pre-filter, conservative-confidence contract, cross-cutting API returns `[]` for no-signal files. 167 sibling craft tests (naming/spec/copy/test/design/knowledge) still pass after the new module imports `shared/craft`.

  **craft-pipeline initiative completes** with this PR. 10 sub-projects shipped across naming-craft (#1), spec-craft (#6), copy-craft (#5), test-craft (#3), knowledge-craft (#9), security-craft (#10), and the design-pipeline-side craft skills (design-craft + the 4 design-pipeline siblings).

  **Long-term trajectory:**
  - v1.x: IaC critique with dedicated rubrics (Dockerfile USER, k8s securityContext, Terraform IAM); multi-file auth-flow tracing (handler → middleware → service via graph); `align-security` sibling FIX skill (aggressive FP safeguards); test-file security critique; `craft.security.confidenceFloor` runtime config; framework expansions (tRPC, Convex, Cloudflare Workers, Hono RPC).
  - v2: composes with `harness-security-scan` at scan time — CVE findings carry a security-craft "shape" rubric for context.
  - v3: assumed-adversary-as-config — project declares its threat model and rubrics critique against the declared model rather than inferring.

- dcca2ce: Spec B (Granular Task→Backend Routing): per-skill + per-cognitive-mode routing axes with fallback chains, BackendRouter chain-walk emitting RoutingDecision records, config validator (hard error + warn semantics), dispatch-site wiring with `HARNESS_BACKEND_OVERRIDE` env hint, RoutingDecisionBus with bounded ring buffer, 3 HTTP routes + WS topic `routing:decision`, `harness routing {config,trace,decisions}` CLI + `harness skill run --backend`, dashboard `/routing` panel (4 cards + WS + polling fallback), 5 ADRs (0029-0033). RoutingValue schema widening is additive/non-breaking (scalar form preserves byte-identical pre-Spec-B behavior).
- 800fed8: Add **spec-craft** — second member of the craft-pipeline initiative (sub-project #6 of 10). LLM-judgment skill for spec quality. Highest-leverage craft skill because spec quality compounds across the entire planning → implementation → review lifecycle below it. Triggered the v2 extraction of shared craft infrastructure: this PR moves `LlmProvider` + 3-axis types + `derivePriority` to `packages/cli/src/shared/craft/` so design-craft + naming-craft + spec-craft (and every future craft skill) import from one canonical home.

  **Three decisions locked:**
  1. **v1 spec scope: proposals + ADRs.** `docs/changes/*/proposal.md` + `docs/knowledge/decisions/*.md`. Excludes READMEs / general docs (docs-craft #2 territory). RFCs deferred to v1.x.
  2. **Per-section critique.** Specs parsed by H2 into named sections; rubrics declare which canonical section names they apply to. Localized findings (`Decisions:34 is vague`) beat doc-scoped findings (`spec is vague`). Better cost control + signal quality than whole-doc critique.
  3. **Shared craft extraction NOW.** Second non-design craft consumer triggers the extraction (noted in naming-craft's changeset). Stops the duplication pattern at 2 consumers; `LlmProvider` + `MockLlmProvider` + 3-axis types + `derivePriority` move to `packages/cli/src/shared/craft/`. design-craft and naming-craft keep their old import paths via re-export shims (zero behavior change).

  **7 seed rubrics** (one file per rubric, matches naming-craft layout):
  - `SPEC-R001` **sharpness vs vagueness** — applies to all sections
  - `SPEC-R002` **cuts at the joints** — decisions, scope, technical-design
  - `SPEC-R003` **two readers, same understanding** — decisions, success-criteria
  - `SPEC-R004` **load-bearing vs ambient context** — decisions, overview
  - `SPEC-R005` **honest rationalizations** — rationalizations\* (regex)
  - `SPEC-R006` **non-goals are non-goals** — out-of-scope* / non-goals* (regex)
  - `SPEC-R007` **stranger in 6 months** — applies to all sections

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved, `cite.rubricId` on every finding for catalog usage signal.

  **Cross-cutting:** `critiqueSpecFile(file, opts)` exported so future craft skills (or `harness-brainstorming`) can invoke spec critique on a doc they're already processing without re-walking the project.

  **Shared craft extraction (cross-cutting, zero behavior change):**
  - New: `packages/cli/src/shared/craft/llm/provider.ts` — `LlmProvider`, `LlmCallCost`, `MockLlmProvider`, `getProvider`
  - New: `packages/cli/src/shared/craft/findings/axes.ts` — `Tier`, `Impact`, `Confidence`
  - New: `packages/cli/src/shared/craft/findings/derived.ts` — `derivePriority`
  - `packages/cli/src/design-craft/llm/provider.ts` becomes a re-export shim
  - `packages/cli/src/design-craft/findings/derived.ts` becomes a re-export shim
  - `packages/cli/src/design-craft/findings/schema.ts` imports the 3-axis types from shared and re-exports them
  - `packages/cli/src/naming-craft/llm/provider.ts` + `findings/derived.ts` + `findings/schema.ts` now import directly from shared (no longer from design-craft)

  All existing design-craft + naming-craft tests pass unchanged (846/846 across the cli suite).

  **Surface area:**
  - `harness spec-craft` CLI command (`--files` / `--kinds` / `--sections` / `--max-files` / `--max-sections-per-file` / `--json`)
  - `spec_craft` MCP tool (count 75 → 76)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.spec.{enabled, maxFiles, maxSectionsPerFile}` config block under the `craft.*` namespace

  **Tests:** 32 new tests across section parser, rubric mapping, spec discovery, critique phase, and end-to-end pipeline (mock LLM). 846 tests pass across the cli suite. Smoke-tested end-to-end against the repo's own specs: 5 docs scanned, 32 sections parsed, 94 findings emitted (7 rubrics × applicable sections); mock provider's deterministic low-confidence response preserves ADR 0019's honesty contract.

  **Long-term trajectory:**
  - v1.x: doc-level summary mode; RFC docs; POLISH phase (concrete rewrites of weak sections); per-project rubric override config; `align-spec` sibling FIX skill; per-section opt-out via `<!-- spec-craft:skip -->`.
  - v2: integration with `harness-brainstorming` so freshly-authored specs get critique inline; integration with `harness-soundness-review` for floor + ceiling paired runs.
  - v3: cross-spec consistency rubrics (e.g., is this spec's `Decisions` honest about constraints declared in an upstream ADR?).

- b8d97b0: Add **test-craft** — fourth member of the craft-pipeline initiative (sub-project #3 of 10). LLM-judgment skill for test quality across **vitest / jest / mocha / playwright**. Per-`it`/`test` block critique with best-effort source pairing for contract-vs-implementation rubrics. Tests are often the worst-written code in a codebase precisely because the rule-based floor (coverage threshold) is so easy to clear.

  **Three decisions locked:**
  1. **All four frameworks** (vitest / jest / mocha / playwright). Each framework has its own import-detection signature; once detected, the AST extraction is uniform (all use `describe`/`it`/`test` calls). Discovery cost is the framework-detection layer; runtime cost stays the same.
  2. **Per-`it`/`test` block critique.** Localized findings pin to a specific test (vs `describe`-scoped). Higher LLM call count but maps to actionable fix scope.
  3. **Source pairing (best-effort).** Resolves `foo.test.ts` → `foo.ts` (sibling), `../src/foo.ts`, or `../../src/foo.ts`. Skip silently when no match; non-source-dependent rubrics still fire. Enables contract-vs-implementation rubrics that need the function's public surface.

  **8 seed rubrics** from the test-quality canon:

  | Rubric                                  | Source                                                          |
  | --------------------------------------- | --------------------------------------------------------------- |
  | `TEST-R001` contract-not-narrative-name | Kent C. Dodds + Beck                                            |
  | `TEST-R002` meaningful-assertion        | Fowler "Refactoring" + xUnit Patterns (Meszaros)                |
  | `TEST-R003` arrange-act-assert          | Bill Wake "3A" + xUnit Patterns                                 |
  | `TEST-R004` fixture-earns-setup-cost    | xUnit Patterns                                                  |
  | `TEST-R005` single-responsibility       | Beck + Fowler (test smells: Eager Test)                         |
  | `TEST-R006` deleting-loses-something    | Kent C. Dodds, "Write tests. Not too many. Mostly integration." |
  | `TEST-R007` contract-not-implementation | Beck + Fowler + "Testing Trophy"                                |
  | `TEST-R008` explicit-failure-mode       | xUnit Patterns + general folklore                               |

  **Honors ADRs 0018-0021:** confidence first-class, 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal.

  **Cross-cutting:** `critiqueTestsInFile(file, opts)` exported (honours framework filter and source-pairing toggle). Future craft skills + `harness-tdd` integration can invoke per-file test critique without a project walk.

  **Surface area:**
  - `harness test-craft` CLI command (`--files` / `--frameworks` / `--max-files` / `--max-tests-per-file` / `--no-source-pair` / `--json`)
  - `test_craft` MCP tool (count 77 → 78)
  - 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
  - New `craft.test.{enabled, maxFiles, maxTestsPerFile, frameworks, sourcePair}` config block
  - Plugin slash-command files pre-generated for `.claude-plugin` and `.cursor-plugin`

  **Extractor handles** `.skip` (kept and critiqued — implementation has signal), `.only` (flagged in metadata, still critiqued), `.todo` (excluded — no body). Non-string-literal test names (computed / template) skip silently.

  **Tests:** 35+ new tests across framework detection (5 frameworks), per-test extraction (skip/only/todo + nesting + body), source-pair resolver (sibling/peer/monorepo + truncation + null), critique phase, end-to-end pipeline. 912 tests pass across the cli suite. Smoke-tested end-to-end against the harness cli package: 13 tests extracted from 3 files, all source-paired correctly; 104 findings emitted (13 × 8 rubrics ≈ correct); mock provider's deterministic low-confidence response preserves ADR 0019 honesty.

  **Long-term trajectory:**
  - v1.x: fixture/helper/mock file critique; `.test-d.ts` type tests; snapshot rubrics; per-framework rubric extensions (Playwright `test.step`, vitest `bench`); cross-test consistency rubrics; `align-test` sibling FIX skill.
  - v2: integration with `harness-tdd` so fresh tests get critique inline.
  - v3: execution-aware critique (run the test, capture failure messages, critique their clarity).

### Patch Changes

- ae11a71: Add `better-sqlite3` as a runtime dependency. The CLI bundles orchestrator code that imports `better-sqlite3` (webhook queue, session search-index) and ships those chunks in `dist/`. Native bindings cannot be bundled by tsup, so the published `@harness-engineering/cli` package must declare `better-sqlite3` as a direct dependency. Without this, `npm i -g @harness-engineering/cli` succeeds but any sqlite-backed feature throws `Cannot find module 'better-sqlite3'` at runtime.
- a061773: Fix harness security scanner false positives on `security-craft/extract/signals.ts`. The scanner is regex-based and matched three comments that described what the AST detector looks for (`new Function(...)`, `Bare identifier calls: eval(...), fetch(...)`, `Raw query: db.query(\`...\${x}...\`)`) as actual sinks. Rewrote the three comments to describe the same logic without the literal patterns the regex scanner triggers on. No behavior change — pure documentation rewrite. `harness ci check --skip arch` now exits 0 (was exit 1 with 3 SEC-INJ-001/SEC-INJ-002 error-severity findings).
- Updated dependencies [d1c9bda]
- Updated dependencies [bbc164f]
- Updated dependencies [573c23b]
- Updated dependencies [16048ad]
- Updated dependencies [0eac8eb]
- Updated dependencies [dcca2ce]
  - @harness-engineering/graph@0.10.0
  - @harness-engineering/core@0.28.1
  - @harness-engineering/orchestrator@0.7.0
  - @harness-engineering/dashboard@0.8.0
  - @harness-engineering/types@0.15.0
  - @harness-engineering/intelligence@0.2.6

## 2.6.2

### Patch Changes

- Updated dependencies [bce809f]
  - @harness-engineering/orchestrator@0.6.1
  - @harness-engineering/dashboard@0.7.1

## 2.6.1

### Patch Changes

- 8678fee: Fix `ensureHarnessGitignore` overwriting `.harness/.gitignore` on every MCP start. The function now merges template entries into an existing file instead of replacing it, preserving any custom entries added by users.

## 2.6.0

### Minor Changes

- 4aa241f: Hermes Phase 2: Custom maintenance jobs + pre-launch OSV malware guard + disk hygiene

  Extends `MaintenanceScheduler` beyond the 21 built-in tasks with user-defined
  `customTasks` in `harness.orchestrator.md`. Adds a pre-launch OSV malware
  guard via `harness mcp-guard check`, and broadens `harness cleanup-sessions`
  into a per-target `.harness/` disk-hygiene sweep.

  **New surfaces:**
  - `CustomTaskDefinition` + `CheckScriptDefinition` + `OutputRetentionConfig` +
    `CleanupConfig` + `OsvGuardConfig` types (`@harness-engineering/types`).
  - `RunResult.origin: RunOrigin` discriminated provenance tag set by the
    scheduler / CLI / API / chain entry point.
  - `TaskOutputStore` persists per-run outputs to
    `.harness/maintenance/<task-id>/outputs/<iso>.json` with last-N + maxAgeDays
    retention. Default 50 runs / 30 days, overridable per-task.
  - `CheckScriptRunner` spawns arbitrary executables and parses a JSON status
    envelope (`{status, findings?, wakeAgent?, message?, outputs?}`) from the
    last non-empty stdout line.
  - `ContextResolver` injects `## Upstream context` (from `contextFrom`) and
    `## Reference skills` (from `inlineSkills`) into the agent prompt, with a
    warn-then-truncate token budget.
  - `validateCustomTasks` runs at orchestrator boot: cycle detection across the
    merged `contextFrom` graph, per-type required-field checks, skill / script
    existence (when injected), kebab-case task IDs, no-collision with built-ins.
  - `createOsvClient` (`@harness-engineering/core`) — OSV.dev REST client with
    24h disk cache (`.harness/cache/osv/`), fail-open default, `strict` mode.
  - `harness mcp-guard check [--strict] [--json]` CLI subcommand. Exits 2 on any
    `MAL-*` advisory match against an `.mcp.json` `mcpServers` `npx`-launched
    package. Suitable as a `pre-mcp-launch` hook from host plugin manifests.
  - `harness mcp-guard cache clear` subcommand.
  - `harness cleanup-sessions --all` / `--include` / `--exclude` extension.
    Default no-flag behavior unchanged. Registered targets: `sessions` (24h),
    `cache` (7d), `maintenance` (30d), `dashboard-state` (14d), `snapshots`
    (14d), `analyzer-output` (7d).
  - `harness maintenance list` / `harness maintenance show <task-id>` CLI
    subcommands.

  **Backwards compatibility:** All 21 built-in tasks run through the legacy
  `CheckCommandRunner` + `CommandExecutor` paths unchanged. New fields on
  `TaskDefinition` / `RunResult` / `MaintenanceConfig` are optional. The
  `harness maintenance run <task-id>` CLI subcommand and `/api/v1/jobs/maintenance/{id}/*`
  routes are deferred to a follow-up that lands alongside the Phase 0 Gateway API.

  **Knowledge artifacts:**
  - ADR 0015 — Custom maintenance task model.
  - `docs/knowledge/orchestrator/custom-maintenance-jobs.md`.
  - `docs/knowledge/cli/pre-launch-osv-guard.md`.

- c3653ff: Hermes Phase 4: Skill proposal / refinement loop with provenance + soundness gate

  Agent-emitted skill proposals routed through a review queue gated by a
  mechanical soundness check before promotion to the catalog. Closes the
  K1 killer-adoption row from the Hermes adoption meta-spec.

  **New surfaces:**
  - MCP tool `emit_skill_proposal` (tier `standard`) — writes
    `.harness/proposals/<id>.json` and emits `proposal.created`. Emit is
    non-blocking; the soundness gate fires on approve, not on emit.
  - CLI `harness proposals list|show|approve|reject` for queue management
    plus one-shot `harness backfill-skill-provenance` migration that
    stamps `provenance: user-authored` on every pre-Phase-4 catalog skill.
  - Dashboard `/s/proposals` page with inline content, gate findings,
    approve / reject / edit / run-gate actions; reviewer-UX budget < 30s
    per proposal.
  - Seven gateway routes under `/api/v1/proposals/*` (list / get /
    run-gate / approve / reject / edit) — reads use `read-status`,
    mutations require the new `manage-proposals` scope (8th entry in
    `SCOPE_VOCABULARY` and `TokenScopeSchema`).
  - Three lifecycle events (`proposal.created` / `approved` / `rejected`)
    fan out via the Phase 0 webhook bus and Phase 3 notification sinks
    with envelope derivers.
  - Maintenance task `proposal-provenance-backfill` (housekeeping #4,
    Feb 31 cron so the loop never fires automatically).

  **Strict invariants:** `kind` ↔ content shape (new-skill ⇒
  skillYaml+skillMd; refinement ⇒ targetSkill+diff); gate freshness
  < 24h before promotion; refinement edits must diverge from git HEAD
  before approval stamps provenance; provenance enum is closed
  (`community | agent-proposed | user-authored`, expansion requires ADR
  amendment).

  **Skills-mode soundness review degradation:** v1 ships mechanical
  structural checks (kebab-case name, parseable skill.yaml, SKILL.md
  bounds, unified-diff well-formedness). The full
  `harness:soundness-review --mode skill` vocabulary is a follow-up spec;
  both implementations share the same finding shape so the swap is
  purely additive.

  **Test coverage:** 75 new tests across five packages (types schema 15,
  core store + usage 9, MCP tool 8, CLI subcommand 6 + backfill 6,
  orchestrator gate 6 + promote 7 + events 4 + routes 10, envelope
  derivers 4 new rows). Existing scopes test passes with the new
  vocabulary entry.

  ADRs: 0016 (workflow), 0017 (token scope). Knowledge nodes:
  `skill-proposals.md`, `skill-provenance.md`. Spec + plan at
  `docs/changes/hermes-phase-4-skill-proposals/`.

  **Incidental fix:** Replaces a fixed 150ms wait in
  `packages/orchestrator/src/server/webhooks-integration.test.ts` with a
  poll loop. The fixed wait flaked under coverage instrumentation and
  blocked the Phase 4 pre-push hook.

### Patch Changes

- c94bac8: Harden `harness update` against empty `npm view` responses and migrate to the renamed `@earendil-works/pi-coding-agent` SDK.
  - `getLatestVersionAsync` now rejects when `npm view <pkg> dist-tags.latest`
    returns empty stdout. Previously a transient registry hiccup rendered as
    `cli: v2.4.5 → v` in the update banner; now the package is silently
    skipped by the caller's `Promise.allSettled`.
  - `@mariozechner/pi-coding-agent@^0.73.1` → `@earendil-works/pi-coding-agent@^0.74.1`
    (the maintainer renamed the package family). Eliminates 4 of 6 npm
    deprecation warnings during `harness update`. The 2 remaining
    (`prebuild-install`, `node-domexception`) are transitives through
    `better-sqlite3` and `@google/genai` respectively — out of our control
    until upstream bumps.

  No behavior change beyond the deprecation cleanup.

- Updated dependencies [c94bac8]
- Updated dependencies [4aa241f]
- Updated dependencies [c3653ff]
  - @harness-engineering/orchestrator@0.6.0
  - @harness-engineering/types@0.14.0
  - @harness-engineering/core@0.28.0
  - @harness-engineering/dashboard@0.7.0
  - @harness-engineering/intelligence@0.2.5

## 2.5.0

### Minor Changes

- 3d6e340: Hermes Phase 1: Session Search + Insights

  Adds a SQLite FTS5 full-text index over `.harness/sessions/` and
  `.harness/archive/sessions/`, plus an LLM-generated retrospective summary
  written to `<archive>/llm-summary.md` when a session is archived, plus a
  composite `harness insights` aggregator covering health / entropy / decay /
  attention / impact.

  **New CLI:**
  - `harness search "<query>"` — FTS5 + BM25 over indexed session memory.
  - `harness insights` — composite project report.

  **New MCP tools:**
  - `search_sessions` (tier: core)
  - `summarize_session` (tier: standard — LLM-spend implication)
  - `insights_summary` (tier: core)

  **New config (optional, all defaults are sensible):**

  ```jsonc
  {
    "sessions": {
      "search": { "indexedFileKinds": [...], "maxIndexBytesPerFile": 262144 },
      "summary": { "enabled": true, "inputBudgetTokens": 16000, "timeoutMs": 60000 }
    }
  }
  ```

  **Backwards compatible:** existing `harness.config.json` files validate
  unchanged; `archiveSession()`'s second argument is optional.

  Dashboard Search + Insights pages are deferred to follow-up roadmap item
  `hermes-phase-1.1-dashboard-ui`. See
  `docs/changes/hermes-phase-1-session-search/proposal.md` and the
  companion ADR
  `docs/knowledge/decisions/0013-hermes-phase-1-session-memory-architecture.md`.

- 2481e59: Hermes Phase 3: Multi-sink notifications + doctor hardening

  Generalizes `CINotifier` into a `NotificationSink` interface, ships Slack
  (incoming-webhook) as the first concrete in-tree adapter, adds a
  `wrap_response` envelope formatter for platform-shape delivery, and extends
  `harness doctor` with four content-aware checks (hook syntax, baseline
  freshness, session-taint corruption, live pings).

  **New surfaces:**
  - `NotificationSink` interface + `eventTypeMatches` glob matcher
    (`@harness-engineering/core`).
  - `wrapResponse(event)` envelope formatter with per-event-type handlers
    (`@harness-engineering/core`).
  - `SlackSink` and `CIGithubSink` adapters
    (`@harness-engineering/core`).
  - `SinkRegistry` + `wireNotificationSinks` orchestrator wiring
    (`@harness-engineering/orchestrator`).
  - New config block on `WorkflowConfig.notifications` with Zod schemas
    exposed from `@harness-engineering/types`.
  - `harness notifications test` CLI subcommand
    (`@harness-engineering/cli`).
  - `harness doctor` gains hook-syntax, baseline-freshness, session-taint,
    and `--live` ping checks.

  **Backwards compatible:** existing `harness.config.json` files validate
  unchanged; orchestrator boot constructs the registry only when
  `notifications.sinks` is non-empty.

  See `docs/changes/hermes-phase-3-notifications/proposal.md` for the
  full design.

### Patch Changes

- Updated dependencies [3d6e340]
- Updated dependencies [2481e59]
- Updated dependencies [2602530]
  - @harness-engineering/types@0.13.0
  - @harness-engineering/core@0.27.0
  - @harness-engineering/orchestrator@0.5.0
  - @harness-engineering/dashboard@0.6.7
  - @harness-engineering/intelligence@0.2.4

## 2.4.5

### Patch Changes

- Updated dependencies [2724dfe]
  - @harness-engineering/core@0.26.4
  - @harness-engineering/dashboard@0.6.6
  - @harness-engineering/orchestrator@0.4.6

## 2.4.4

### Patch Changes

- a58f9c6: Add `webhook-queue.sqlite`, `webhook-queue.sqlite-wal`, `webhook-queue.sqlite-shm`, and `maintenance/` to the canonical `.harness/.gitignore` template written by `ensureHarnessGitignore`.

  The Phase 3 webhook delivery queue persists state in `.harness/webhook-queue.sqlite` (plus its WAL and SHM sidecars), and the maintenance runner writes per-tick history to `.harness/maintenance/`. Both are ephemeral runtime artifacts that should never be committed. Before this change they were left untracked but unignored, so `git status` always showed them as new files in any project running the orchestrator and they were easy to commit by accident. They now match the same ignore semantics as the rest of the harness runtime directory.

## 2.4.3

### Patch Changes

- Updated dependencies [1796528]
  - @harness-engineering/core@0.26.3
  - @harness-engineering/dashboard@0.6.5
  - @harness-engineering/orchestrator@0.4.5

## 2.4.2

### Patch Changes

- Updated dependencies [48e0b5b]
  - @harness-engineering/types@0.12.0
  - @harness-engineering/core@0.26.2
  - @harness-engineering/dashboard@0.6.4
  - @harness-engineering/intelligence@0.2.3
  - @harness-engineering/orchestrator@0.4.4

## 2.4.1

### Patch Changes

- 7ae0561: Fix `harness update` reporting "All packages are up to date" while a stale background notification simultaneously printed "Update available". The post-command notification is now suppressed during the `update` subcommand (its fresh `npm view` is authoritative), and the cached check state is invalidated after a successful update so subsequent invocations don't display pre-upgrade data.

  `harness update` also now detects every `harness` binary on `PATH` (`which -a` / `where`) and warns when more than one global install is present. If the user opts in, npm-style installs are uninstalled from their respective prefixes; pnpm/yarn installs are surfaced with the exact command to run manually. This prevents the case where `npm install -g` lands in one prefix while the shell continues resolving an older binary from another prefix.

- Updated dependencies [7ae0561]
  - @harness-engineering/core@0.26.1
  - @harness-engineering/dashboard@0.6.3
  - @harness-engineering/orchestrator@0.4.3

## 2.4.0

### Minor Changes

- 56176cd: feat(compliance): branch naming convention and `harness verify` command (closes #319)

  Adds a project-wide branch naming convention with optional `harness.config.json`
  override under `compliance.branching`, and a `harness verify` command that
  checks the current branch against the convention.
  - **Core:** New `validateBranchName` export from `@harness-engineering/core`
    with `BranchingConfig` type. Enforces prefix list, strict kebab-case slugs
    (no leading/trailing or doubled hyphens), optional ticket-ID pattern
    (`feat/PROJ-123-desc`), slug length cap, and ignore globs for long-lived
    branches.
  - **CLI:** New `harness verify` command. Works without a `harness.config.json`
    by falling back to schema defaults. Supports `--branch <name>` and reads
    `HARNESS_BRANCH` / `GITHUB_HEAD_REF` / `CI_COMMIT_REF_NAME` /
    `BUILDKITE_BRANCH` so CI runners in detached-HEAD state can still verify
    the PR source branch. `--json` emits a machine-readable result.
  - **Config:** Adds `compliance.branching` to `HarnessConfigSchema` with
    fields `prefixes`, `enforceKebabCase`, `customRegex`, `ignore`, and
    `maxLength` (default 60; set to 0 to disable). Defaults declared in the
    schema are the single source of truth.

  Defaults: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`; ignore
  `main`, `release/**`, `dependabot/**`, `harness/**`. `customRegex` is a full
  override -- when set, the prefix, kebab-case, and length checks are bypassed.

### Patch Changes

- bed30c4: fix(deps): bump `@typescript-eslint/typescript-estree` to `^8.29.0` (closes #318)

  The bundled `@typescript-eslint/typescript-estree@7.18.0` capped supported
  TypeScript at `<5.6.0`, so every CLI invocation that parsed TS on a modern
  TypeScript (5.6+ / 6.x) emitted a noisy "you are running a version of
  TypeScript which is not officially supported" warning to stderr. The warning
  cluttered CI logs and hook output and falsely implied a project misconfig.

  Bumps both `@harness-engineering/cli` and `@harness-engineering/core` to
  `^8.29.0`. The 8.x line supports TS 5.6+ and has experimental support for
  newer versions; parser behavior for valid TS is unchanged.

- Updated dependencies [bed30c4]
- Updated dependencies [56176cd]
  - @harness-engineering/core@0.26.0
  - @harness-engineering/dashboard@0.6.2
  - @harness-engineering/orchestrator@0.4.2

## 2.3.2

### Patch Changes

- bdcfdec: fix(cli/update): detect outdated CLI even when `npm list -g` does not see it (closes #317)

  `harness update` was reporting "All packages are up to date" while a separate
  banner inside the same transcript advertised "Update available: vX -> vY", and
  never actually performed the self-upgrade. Repeated runs were a no-op.

  Root cause: the foreground check in `runUpdateAction` discovered installed
  packages by parsing `npm list -g --json`. When harness was installed via
  Homebrew, bun, asdf, or under a different nvm prefix than the shell's current
  `npm`, `npm list -g` returned no `@harness-engineering/*` entries. `packages`
  came out empty, `checkAllPackages` had nothing to compare, and the code fell
  straight into the "up to date" exit path — printing the success line, refreshing
  hooks, and shelling out to a child `harness generate`. That child process is
  where the contradictory "Update available" banner came from: its own
  `printUpdateNotification` reads the cached state populated by the background
  `npm view` check (which doesn't depend on `npm list` and so works correctly),
  and its stderr inherits to the parent terminal.

  Fix: trust `CLI_VERSION` (loaded from the running CLI's `package.json`) as the
  authoritative current version for `@harness-engineering/cli`, exactly as the
  background check already does. `getInstalledPackages` always includes the CLI;
  `getInstalledVersions` falls back to `CLI_VERSION` when `npm list -g` doesn't
  report it; `getInstalledVersion` does the same. The foreground check now
  correctly identifies the outdated CLI and reaches the install path on the
  user's first `harness update` invocation.

## 2.3.1

### Patch Changes

- bb7658b: fix(graph/ingest): materialize general Markdown as `document` nodes (#302); consolidate skip-dir usage across walkers and glob excludes

  **`@harness-engineering/graph`:**
  - Issue #302 — `KnowledgeIngestor.ingestAll()` only ran `ingestADRs`, `ingestLearnings`, and `ingestFailures`. Top-level `README.md`/`AGENTS.md` and `docs/**/*.md` (non-ADR) were silently skipped, so no `document` nodes existed and no `documents` edges were created for general docs. The `detect-doc-drift` skill's graph-enhanced traversal was a no-op on any project without a `docs/adr/` directory.
  - New `KnowledgeIngestor.ingestGeneralDocs(projectPath)` materializes `document` nodes for top-level `*.md` (non-recursive) and `docs/**/*.md` (recursive), skipping subdirs owned by sibling ingestors (`docs/adr` → `ingestADRs`, `docs/knowledge` → `BusinessKnowledgeIngestor`, `docs/changes` → `RequirementIngestor`, `docs/solutions` → solutions pipeline). Node id format: `doc:<rel-path>`. Title parsed from the first H1, falling back to the filename. Runs `linkToCode(content, nodeId, 'documents')` so mentioned code symbols get `documents` edges automatically. Wired into `ingestAll()`, so both the MCP `ingest_source` (knowledge|all) handler and the CLI `harness ingest --source knowledge` path benefit without further changes.
  - New `skipDirGlobs(skipDirs?)` helper exported from `@harness-engineering/graph`. Converts a skip-dirs set (default: `DEFAULT_SKIP_DIRS`) into minimatch glob patterns of the form `**/<name>/**`. Use this for tools that exclude via globs (security scan, doc coverage, entropy snapshot) instead of by reading directory names during traversal — the previously hand-maintained `['**/node_modules/**', '**/dist/**']` mini-lists across packages now derive from the canonical 60+ entry set automatically.
  - Consolidated all hand-rolled skip-dir lists inside the graph package around `DEFAULT_SKIP_DIRS`: `KnowledgeIngestor.findMarkdownFiles`, `BusinessKnowledgeIngestor.findMarkdownFiles` (the byte-identical twin of the #302 bug), `DiagramParser.findDiagramFiles`, `ExtractionRunner.walkSources`. Each picks up the full coverage from #274 (Python `__pycache__`/`.venv`, JS framework caches `.next`/`.turbo`/`.vite`, AI agent sandboxes `.claude`/`.cursor`/`.codex`, etc.) for free, and any future addition to `DEFAULT_SKIP_DIRS` propagates everywhere.

  **`@harness-engineering/core`:**
  - `architecture/collectors/module-size.ts` and `architecture/collectors/dep-depth.ts`: `isSkippedEntry` now combines `name.startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`. Preserves the existing broad dotfile heuristic and adds curated non-dotfile names (`vendor`, `out`, `target`, `build`, `coverage`, etc.).
  - `entropy/detectors/size-budget.ts:dirSize`: skip-set widened from `{node_modules, .git}` to the full `DEFAULT_SKIP_DIRS`. Size budgets now exclude `dist`, `build`, `.turbo`, etc., matching intent.
  - `performance/critical-path.ts`: source-file walker uses `DEFAULT_SKIP_DIRS`.
  - `security/types.ts:DEFAULT_SECURITY_CONFIG.exclude` and `security/config.ts:SecurityConfigSchema.exclude`: default exclude list is now `[...skipDirGlobs(), '**/*.test.ts', '**/fixtures/**']` — file-type/fixture filters preserved, dir-skip portion derives from the canonical set.
  - `ci/check-orchestrator.ts`: same treatment for the two `excludePatterns` defaults (doc-coverage fallback and security-scan ignore fallback).
  - `entropy/snapshot.ts`: `excludePatterns` fallback now derives from `skipDirGlobs()`. Also corrects a latent bug — the previous `'node_modules/**'` (no leading `**/`) only matched top-level `node_modules`, missing nested ones in monorepos.

  **`@harness-engineering/cli`:**
  - `commands/migrate.ts:walk`: skip-set uses `DEFAULT_SKIP_DIRS`.
  - `commands/install.ts`: skill-scan walker combines `startsWith('.')` with `DEFAULT_SKIP_DIRS.has(name)`.
  - `config/schema.ts:EntropyConfigSchema.excludePatterns`: default is now `[...skipDirGlobs(), '**/*.test.ts']`.

  **Tests:**
  - New `general docs ingestion (issue #302)` block in `packages/graph/tests/ingest/KnowledgeIngestor.test.ts`: 5 cases covering top-level README/AGENTS creation, `documents`-edge linking to mentioned code symbols, ADR non-duplication, ownership-aware subdir skipping (`docs/{adr,knowledge,changes,solutions}`), and `.harness/*.md` exclusion. Revert-and-fail check confirms 3 of the 5 fail without the fix; the remaining 2 guard against future over-ingestion.
  - Updated `packages/cli/tests/commands/install.test.ts` `child_process` mock to use `importOriginal()` partial pattern so transitively-loaded code from `@harness-engineering/graph` resolves correctly.

- Updated dependencies [38fa742]
- Updated dependencies [bb7658b]
  - @harness-engineering/core@0.25.0
  - @harness-engineering/dashboard@0.6.1
  - @harness-engineering/orchestrator@0.4.1
  - @harness-engineering/graph@0.9.0
  - @harness-engineering/intelligence@0.2.2

## 2.3.0

### Minor Changes

- 287ca16: feat(roadmap): tracker-only roadmap mode (file-less)

  Adds opt-in file-less roadmap mode where the configured external tracker is canonical, eliminating `docs/roadmap.md` as a multi-session conflict surface. See [`docs/changes/roadmap-tracker-only/proposal.md`](https://github.com/Intense-Visions/harness-engineering/blob/main/docs/changes/roadmap-tracker-only/proposal.md) and ADRs 0008–0010.

  **`@harness-engineering/core`:**
  - New `packages/core/src/roadmap/tracker/` submodule: `IssueTrackerClient` interface lifted from orchestrator, `createTrackerClient(config)` factory, body-metadata block parser/serializer, ETag store with LRU eviction, conflict-detection policy, and `GitHubIssuesTrackerAdapter` for file-less mode.
  - New `packages/core/src/roadmap/mode.ts` with `getRoadmapMode(config)` helper.
  - New `packages/core/src/roadmap/load-tracker-client-config.ts` (canonical home for tracker-config loading; replaces three duplicates in cli/dashboard/orchestrator).
  - New `packages/core/src/roadmap/migrate/` namespace: body-diff, history-event hashing, plan-builder, idempotent runner.
  - New `packages/core/src/validation/roadmap-mode.ts` with `validateRoadmapMode` enforcing `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.
  - New `scoreRoadmapCandidatesFileLess` in `packages/core/src/roadmap/pilot-scoring.ts` (priority + createdAt sort, deliberate D4 semantic break).
  - Config schema: `roadmap.mode: "file-backed" | "file-less"` (optional, defaults to `"file-backed"`).
  - Fixes pre-existing `TS2322` in `packages/core/src/roadmap/tracker/adapters/github-issues.ts` (`updateInternal` return shape) and `TS2379` in `packages/cli/src/commands/validate.ts` (call site against `RoadmapModeValidationConfig` widened to accept `undefined`).

  **`@harness-engineering/orchestrator`:**
  - New tracker kind `tracker.kind: "github-issues"` in workflow config selects `GitHubIssuesTrackerAdapter` (see ADR 0010 for the kind-schema decoupling rationale vs `roadmap.tracker.kind: "github"`).
  - `createTracker()` dispatches on `tracker.kind`; the Phase 4 stub at orchestrator constructor is removed.
  - Roadmap-status (S5) and roadmap-append (S6) endpoints translate `ConflictError` to HTTP `409 TRACKER_CONFLICT` shape; React surface lands in a follow-up.

  **`@harness-engineering/cli`:**
  - New `harness roadmap` command group with `harness roadmap migrate --to=file-less [--dry-run]` subcommand. One-shot, dry-run-capable, idempotent migration that creates GitHub issues for unmigrated features, writes body metadata blocks, posts deduplicated history comments, archives `docs/roadmap.md`, and flips `roadmap.mode`.
  - `manage_roadmap` MCP tool is mode-aware: in file-less mode, dispatches through `IssueTrackerClient` instead of touching `docs/roadmap.md`.
  - `harness validate` runs the two new cross-cutting rules `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT`.

  **Documentation:**
  - Three ADRs added under `docs/knowledge/decisions/`: 0008 (tracker abstraction in core), 0009 (audit history as issue comments), 0010 (`tracker.kind` schema decoupling).
  - New knowledge domain `docs/knowledge/roadmap/` with three entries: `file-less-roadmap-mode` (business_concept), `tracker-as-source-of-truth` (business_rule), `roadmap-migration-to-file-less` (business_process).
  - `docs/guides/roadmap-sync.md` gains a `## File-less mode` section.
  - `docs/reference/configuration.md`, `docs/reference/cli-commands.md`, `docs/reference/mcp-tools.md`, and `AGENTS.md` updated.
  - Migration walkthrough at `docs/changes/roadmap-tracker-only/migration.md` (shipped in Phase 5).
  - Proposal §F2 wording reworded to "best-effort detection" per Phase 2 D-P2-B.

### Patch Changes

- Updated dependencies [287ca16]
- Updated dependencies [ed16b44]
  - @harness-engineering/core@0.24.0
  - @harness-engineering/orchestrator@0.4.0
  - @harness-engineering/dashboard@0.6.0

## 2.2.1

### Patch Changes

- d83e162: fix(hooks): block-no-verify only matches argv-token flags, not substrings (#285)

  The block-no-verify PreToolUse hook previously did a naive substring test for
  `--no-verify` against the entire Bash command, so it blocked commits whose
  message body, heredoc, or shell comment merely _mentioned_ the flag. The
  detector now strips quoted strings, heredoc bodies, and shell comments before
  testing, and matches `--no-verify` and `git commit -n` only when they appear
  as standalone argv tokens.

## 2.2.0

### Minor Changes

- d77d0f4: feat: distribute harness as the `harness-claude` Claude Code marketplace plugin

  Replaces #267, which shipped a Claude-only marketplace plugin under the name `harness` with a partial component surface (skills + MCP only). This change:
  1. **Renames** the plugin to `harness-claude` and reframes the marketplace listing so the name no longer implies tool-agnostic coverage. Sibling plugins for Cursor, Gemini CLI, and Codex are planned as follow-up PRs (`harness-cursor`, `harness-gemini`, `harness-codex`); OpenCode is covered by extending `harness setup`.
  2. **Adds persona subagents.** New `scripts/generate-plugin-agents.mjs` runs `harness generate-agent-definitions --platforms claude-code` and writes 12 rendered subagent files (`harness-architecture-enforcer.md`, `harness-code-reviewer.md`, …) to `.claude-plugin/agents/`. The plugin manifest references this directory via the `agents` field.
  3. **Adds lifecycle hooks.** New `scripts/generate-plugin-hooks.mjs` writes `.claude-plugin/hooks.json` with the `standard` profile (block-no-verify, protect-config, quality-gate, pre-compact-state, adoption-tracker, telemetry-reporter), pointing at `${CLAUDE_PLUGIN_ROOT}/.harness/hooks/<name>.js` so the scripts already shipped at `.harness/hooks/` (per #270) execute against the user's project at install time.
  4. **Consolidates plugin distribution artifacts under `.claude-plugin/`.** Slash commands moved from `commands/` (repo root) to `.claude-plugin/commands/`. Subagents moved from `agents/agents/claude-code/` to `.claude-plugin/agents/`. Frees the repo-root `commands/` slot for the future `harness-gemini` extension (Gemini uses TOML in its own `commands/` and would otherwise collide).
  5. **Adds drift guards.** Each generator gains a `--check` mode that runs the generator into a staging dir, diffs the result against the committed artifact, and exits non-zero on drift. `pnpm generate:plugin:check` chains all three. CI (`.github/workflows/ci.yml`) runs this check on every PR — no more silent drift between `agents/skills/claude-code/` and the plugin's slash command/subagent set.
  6. **Switches generators from `dist/bin/harness.js` to `tsx packages/cli/src/bin/harness.ts`.** Plugin maintenance no longer requires `pnpm build` first. `tsx` is added as a root devDependency.
  7. **Extends `initialize-harness-project` skill with Phase 5 (INSTRUMENT) and Phase 6 (FINALIZE).** The skill now closes the bootstrap parity gap that plugin install does not cover — knowledge graph (`harness scan`), architecture baseline (`harness check-arch --update-baseline`), performance baseline (`harness check-perf`), telemetry identity (`harness telemetry identify`), legacy layout migration (`harness migrate --dry-run`), and Tier-0 MCP integrations (`harness integrations add context7|sequential-thinking|playwright`). Includes a "Plugin-only callout" telling the model to prefix CLI invocations with `npx @harness-engineering/cli` when no global binary is on PATH, plus a worked example showing a full plugin-only bootstrap.

  **Plugin manifest now exposes:**

  | Field        | Path                          | Components                     |
  | ------------ | ----------------------------- | ------------------------------ |
  | `skills`     | `./agents/skills/claude-code` | All harness skills             |
  | `commands`   | `./.claude-plugin/commands/`  | 37 `/harness:*` slash commands |
  | `agents`     | `./.claude-plugin/agents/`    | 12 persona subagents           |
  | `hooks`      | `./.claude-plugin/hooks.json` | Standard hook profile          |
  | `mcpServers` | inline                        | `harness` MCP server via `npx` |

  **Out of scope (tracked as follow-up issues):**
  - `harness-cursor`, `harness-gemini`, `harness-codex` sibling plugins.
  - OpenCode integration via extended `harness setup`.
  - Consolidation of `agents/skills/{claude-code,codex,cursor,gemini-cli}/` — these are already hard-linked to a single inode (no actual duplication on disk), so this becomes a presentation/discovery refactor rather than a data-layer one.

- af02d63: feat: ship `harness-codex` marketplace plugin (PR-D in the marketplace stack)

  Final entry in the multi-tool marketplace stack: `harness-codex` for Codex
  CLI. Sibling to `harness-claude` (#284), `harness-cursor` (#288), and
  `harness-gemini` (#290).

  **The thinnest plugin of the four.** Codex's plugin spec
  (`developers.openai.com/codex/plugins/build`) only defines `skills`,
  `mcpServers`, `apps`, and `hooks` fields — no slash-command surface, no
  agents field. So `harness-codex` ships exactly what Codex actually
  consumes:
  - **`.codex-plugin/plugin.json`** — manifest pointing at
    `./agents/skills/codex` for skills and wiring the harness MCP server.
  - **`.codex-plugin/marketplace.json`** — marketplace entry with
    `policy.installation: AVAILABLE`, `category: Productivity`.
  - No `commands/`, no `agents/`, no `hooks.json` — see "Out of scope" below.

  **Generator changes:**
  - **`generate-plugin.mjs --target codex`** is a no-op by design (manifest
    is hand-maintained, no auto-generated artifacts). Wired into
    `pnpm generate:plugin:{codex,all,check}` so CI's drift guard covers all
    four targets uniformly even though codex has nothing to drift from.
  - **`plugin-config.mjs`** gained a `generateCommands` flag (alongside
    `generateAgents` and `generateHooks` from PR-C) so the generator can
    short-circuit each artifact type independently. Existing entries
    (claude, cursor, gemini) set `generateCommands: true`; codex sets all
    three to `false`.

  **Out of scope (intentional):**
  - **No slash commands.** Codex's plugin spec doesn't define a commands
    surface — Codex picks up skills directly via the manifest's `skills`
    field and surfaces them via the `$skill` invocation syntax.
  - **No persona subagents.** Like Gemini, Codex plugins have no agents
    field. Persona behavior remains reachable via `harness.run_persona`
    exposed by the MCP server.
  - **No lifecycle hooks.** Codex's plugin spec mentions a `hooks` field
    but the schema (event names, command resolution, env vars) is not
    documented yet. Deferred until the spec stabilizes — when it does,
    set `generateHooks: true` for codex and the existing generator will
    produce `.codex-plugin/hooks.json` from the same `STANDARD_HOOKS` list
    the other plugins use.

  **Stack complete:**

  | Tool        | Plugin           | Surface                                          |
  | ----------- | ---------------- | ------------------------------------------------ |
  | Claude Code | `harness-claude` | skills + commands + agents + hooks + MCP         |
  | Cursor      | `harness-cursor` | skills + commands + agents + hooks + rules + MCP |
  | Gemini CLI  | `harness-gemini` | commands + GEMINI.md context + MCP               |
  | Codex CLI   | `harness-codex`  | skills + MCP                                     |

  The follow-up — OpenCode integration via extending `harness setup` (PR-E)
  — remains tracked as a separate issue. OpenCode auto-discovers
  `.claude/skills/`, so the work there is mostly an MCP target wire-up, not
  a new manifest.

- c0b9d38: feat: ship `harness-cursor` marketplace plugin (PR-B in the marketplace stack)

  Sibling plugin to `harness-claude` (#284) for Cursor's marketplace. Same
  component surface — skills, `/harness:*` slash commands, persona subagents,
  lifecycle hooks, MCP server — plus 4 curated project rules that fire as
  `alwaysApply` in every Cursor session.

  **New surface:**
  - **`.cursor-plugin/plugin.json` + `.cursor-plugin/marketplace.json`** —
    Cursor marketplace manifest, mirrors the Claude plugin shape.
  - **`.cursor-plugin/{commands,agents,hooks.json,rules}/`** — auto-generated
    artifacts under the same path convention as `.claude-plugin/`.
  - **4 hand-written Cursor rules** (`.mdc` files in `.cursor-plugin/rules/`):
    - `validate-before-commit` — run `harness validate` before any commit.
    - `respect-architecture` — stay within layer boundaries declared in
      `harness.config.json`; no `// harness-ignore` to suppress violations.
    - `use-harness-skills` — prefer `/harness:*` skills over freelancing for
      common tasks; surface explicit skip reasons.
    - `respect-hooks` — never propose `--no-verify` or hook-bypass workarounds;
      fix the underlying issue or update calibration.

  **CLI changes:**
  - **`renderCursorAgent`** (`packages/cli/src/agent-definitions/render-cursor.ts`)
    — new renderer for Cursor subagent markdown (frontmatter `name` +
    `description`, no `tools` field). Wired into `getRenderer` in
    `generate-agent-definitions.ts`. `resolveOutputDir` simplified to take any
    `Platform` (was hardcoded for claude-code/gemini-cli only).
  - **`renderCursorCommand`** (`packages/cli/src/slash-commands/render-cursor-command.ts`)
    — new renderer for Cursor plugin slash commands (frontmatter `name` +
    `description`, body uses `<context>`/`<objective>`/`<execution_context>`/
    `<process>` blocks). Distinct from the existing `renderCursor`, which still
    serves `harness setup`'s `~/.cursor/rules/` flow.
  - **`harness generate-slash-commands --cursor-mode <rules|commands>`** — new
    flag (default `rules` for backward compatibility) selects between the two
    Cursor renderers.

  **Generator consolidation:**
  - **`scripts/generate-plugin.mjs --target <claude|cursor> [--check]`** —
    single parameterized generator replaces the three Claude-specific scripts
    from PR-A (`generate-plugin-{commands,agents,hooks}.mjs`). All three
    artifacts produced per target. Per-target config (plugin dir, slash command
    platform, agent platform, hooks command template) lives in
    `scripts/lib/plugin-config.mjs`.
  - **`pnpm generate:plugin:check`** chains both targets; CI runs it on every PR.
  - Per-target `pnpm generate:plugin:claude` and `pnpm generate:plugin:cursor`
    for partial regeneration.

  **Cursor-specific notes:**
  - Cursor's hook `command` paths use relative form (`./.harness/hooks/<name>.js`)
    rather than the `${CLAUDE_PLUGIN_ROOT}` env var. Cursor doesn't document an
    equivalent env var, but their hook docs show relative paths resolve to the
    plugin install dir.
  - Cursor distinguishes `commands` (slash) from `rules` (always-apply guidance)
    in the plugin manifest. The harness plugin uses both.

  **Out of scope (tracked as follow-up issues):**
  - `harness-gemini` (PR-C) and `harness-codex` (PR-D) sibling plugins.
  - Cursor's `harness-cursor:harness` natural-language router command appears
    in `.cursor-plugin/commands/harness.md` rather than as a parent-level
    command (Cursor's slash-commands generator doesn't special-case
    `command_name` the way Claude/Gemini do). Functional but slightly noisy in
    the command list. Optional cleanup.

- 38d2d84: feat: ship `harness-gemini` marketplace extension (PR-C in the marketplace stack)

  Sibling extension to `harness-claude` (#284) and `harness-cursor` (#288) for
  Gemini CLI's extension marketplace. Same MCP and slash-command surface, but
  scoped to what Gemini extensions actually support.

  **New surface:**
  - **`.gemini-extension/gemini-extension.json` + `marketplace.json`** —
    Gemini extension manifest with `mcpServers` and `contextFileName`. Mirrors
    the marketplace manifest shape used by the Claude and Cursor siblings.
  - **`.gemini-extension/GEMINI.md`** — context document loaded automatically
    when the extension activates. Documents the persona table, the skill
    surface, and how to invoke `/harness:*` commands. Stands in for the
    native subagent and hooks fields that Gemini extensions don't have.
  - **`.gemini-extension/commands/*.toml`** (37 files) — auto-generated TOML
    slash commands. Same set the Claude and Cursor plugins ship.

  **CLI changes:**
  - **`generate-plugin.mjs`** now accepts `--target gemini`. Per-target
    config in `scripts/lib/plugin-config.mjs` gained three flags so the
    generator can be honest about each tool's actual surface:
    - `commandExt` — `.md` for Claude/Cursor, `.toml` for Gemini. Diff and
      prettier formatting branch on this. (Prettier doesn't format TOML, so
      the gemini path skips prettier.)
    - `generateAgents` — `false` for Gemini (no native subagents field). The
      generator skips the agent-rendering step entirely instead of writing
      dead-end files no platform reads.
    - `generateHooks` — `false` for Gemini (no native hooks field).
  - **`pnpm generate:plugin:gemini`** + **`generate:plugin:all`** /
    **`generate:plugin:check`** include the gemini target. CI runs the
    combined check on every PR.

  **Scope differences from Claude/Cursor siblings:**

  Gemini extensions only support commands + MCP servers + a context document.
  Two surfaces present in the Claude and Cursor plugins are intentionally
  out of scope here:
  - **No persona subagents.** Gemini extensions don't have an agents field.
    Persona behavior is documented in GEMINI.md and exposed through
    `/harness:*` commands and `harness.run_persona` (MCP).
  - **No lifecycle hooks.** Gemini extensions don't support hooks. Users
    wire `harness validate` / `harness check-arch` into CI manually, the
    same way they would without the extension.

  **Out of scope (tracked as follow-up):**
  - `harness-codex` (PR-D) sibling extension.
  - OpenCode integration via extending `harness setup` (PR-E). OpenCode
    auto-discovers `.claude/skills/`, so the work there is mostly an MCP
    target wire-up, not a new manifest.

- 11a5912: feat: integrate OpenCode in `harness setup` (PR-E in the marketplace stack)

  Adds OpenCode as the fifth supported AI client in `harness setup`. Unlike
  the four marketplace plugins (PR-A through PR-D), OpenCode joins via the
  existing `harness setup` flow rather than its own marketplace manifest —
  OpenCode plugins are JS/TS code, not declarative manifests, and OpenCode
  auto-discovers `.claude/skills/` so it shares Claude's skill tree without
  any plugin-side wiring.

  **What ships:**
  - **`harness setup` detects `~/.config/opencode/`** as a new client marker
    and writes the harness MCP server to `./opencode.json` in the project
    root. Skipped (with a friendly warning) when neither the global config
    dir nor a project-local `opencode.json` is present.
  - **`harness setup-mcp --client opencode`** wires up the MCP server
    standalone for users who want fine-grained control.
  - **Tier-0 MCP integrations parity** — context7, sequential-thinking, and
    playwright are written to `opencode.json` alongside `.mcp.json` and
    `.gemini/settings.json`, mirroring the existing Gemini parity block.

  **OpenCode's MCP shape differs from the others:**

  OpenCode uses `mcp` (not `mcpServers`) at the top level, and each entry
  uses `type: "local"`, a single combined `command` array (executable +
  args), `enabled`, and `environment`. The new `writeOpencodeMcpEntry`
  helper translates the standard `{command, args?, env?}` shape into
  OpenCode's wire format.

  **Test coverage:**
  - 6 new tests in `setup-mcp.test.ts` covering the OpenCode branch
    (configure, skip-if-configured, all-clients, key preservation).
  - 6 new tests in `integrations/config.test.ts` covering the
    `writeOpencodeMcpEntry` translation (mcp field, command array,
    environment translation, top-level field preservation, mcp entry
    preservation).
  - 3 new tests in `setup.test.ts` covering Tier-0 OpenCode parity
    (project-local marker, global marker, neither-present negative).

  **Stack complete:**

  | Tool         | Integration                                  | Status         |
  | ------------ | -------------------------------------------- | -------------- |
  | Claude Code  | `harness-claude` marketplace plugin          | shipped (#284) |
  | Cursor       | `harness-cursor` marketplace plugin          | shipped (#288) |
  | Gemini CLI   | `harness-gemini` marketplace extension       | shipped (#290) |
  | Codex CLI    | `harness-codex` marketplace plugin           | shipped (#291) |
  | **OpenCode** | **via `harness setup` (no plugin manifest)** | **this PR**    |

  **README updates:**
  - Quick Start now lists Gemini CLI and Codex CLI marketplace plugins as
    shipped (they were "coming" before PR-C/PR-D landed) and adds an
    OpenCode bullet pointing to the npm path.
  - Plugin-vs-npm parity table replaces the outdated "Gemini CLI / Codex /
    OpenCode integration ❌ (sibling plugins coming)" row with two rows
    reflecting current state — Gemini/Codex shipped via plugins, OpenCode
    via `harness setup`.
  - MCP config table gains an OpenCode row showing the project-local
    `opencode.json` path.

## 2.1.1

### Patch Changes

- ba8da2e: fix(core, cli): preserve tracked categories on `check-arch --update-baseline` (#268)

  `harness check-arch --update-baseline` rewrote `.harness/arch/baselines.json` from scratch using only the categories present in the current `runAll()` output. Any tracked category that the run did not emit — for example because a collector silently returned `[]` after a transient failure or a filtered run — was permanently dropped from the baseline. Combined with the `.husky/pre-commit` hook that auto-stages the regenerated file, this could erase tracked `complexity`, `layer-violations`, and `circular-deps` allowlists in a normal commit without surfacing as a diff worth reviewing.

  **`@harness-engineering/core`:**
  - `packages/core/src/architecture/baseline-manager.ts` — adds `ArchBaselineManager.update(results, commitHash)`. It captures fresh metrics, merges them onto the on-disk baseline (categories present in `results` overwrite, categories absent are preserved), and saves atomically. This mirrors the merge-on-write pattern already used by `packages/core/src/performance/baseline-manager.ts :: BaselineManager.save`.
  - `capture()` and `save()` keep their existing pure / overwrite-only contracts.

  **`@harness-engineering/cli`:**
  - `packages/cli/src/commands/check-arch.ts` — the `--update-baseline` branch now calls `manager.update(results, commitHash)` instead of `manager.capture(results, commitHash)` followed by `manager.save(baseline)`. No CLI surface changes.

  **Tests:**
  - `packages/core/tests/architecture/baseline-manager.test.ts` — three new cases under `describe('update()')`: preserves existing categories when results omit them (the literal #268 reproduction), overwrites categories present in both, writes a fresh baseline when none exists. Each was verified to fail when `update()` is reverted to plain `capture()`+`save()`.
  - `packages/cli/tests/commands/check-arch.test.ts` — adds an integration smoke test that pre-seeds all seven categories and asserts every category is still present after `--update-baseline`, guarding against future regressions in the wiring.

- 54d9494: fix(core): resolve `.js` imports to `.ts`/`.jsx` source files (#279)

  Three resolvers in `packages/core` (dead-code reachability, dependency-graph construction, review-context scoping) silently dropped edges when an import specifier wrote a runtime extension different from the on-disk source extension. On TS NodeNext / "Bundler" projects this caused ~75% false-positive dead-code findings; the same bug class affects Babel/webpack JSX projects (`./Foo.js` → `Foo.jsx`).

  **`@harness-engineering/core`:**
  - `packages/core/src/entropy/detectors/dead-code.ts :: resolveImportToFile` — was the proximate cause of the reported symptom. Appended `.ts` to a `.js` path producing non-existent `foo.js.ts` lookups; now strips the JS-style extension and tries each TS/JSX equivalent before falling back.
  - `packages/core/src/constraints/dependencies.ts :: resolveImportPath` — `hasKnownExt` flat-union accepted `.js` as already-resolved, so dependency-graph edges pointed to non-existent nodes. Now async; verifies file existence before returning. The previous `fromLang === 'typescript'` gate was dropped — Babel/JSX projects need the same swap.
  - `packages/core/src/review/context-scoper.ts :: resolveImportPath` — candidate list never tried stripping `.js` first; now does, with `index.{ts,tsx,jsx}` directory fallbacks.
  - New shared `JS_EXT_FALLBACKS` map (`.js → [.ts, .tsx, .jsx]`, `.jsx → [.tsx]`, `.mjs → [.mts]`, `.cjs → [.cts]`) covers both real-world conventions: TS NodeNext and Babel/webpack JSX.

  **`@harness-engineering/cli`:**
  - `harness cleanup --type dead-code` no longer flags files imported via NodeNext-style `.js` extensions (or Babel-style `.js → .jsx`) as dead. Symptom regression on this monorepo: total findings **1480 → 1016 (-31%)**, dead files **394 → 185 (-53%)**.
  - Downstream commands that consume the dependency graph (`harness fix-drift`, `harness check-perf` coupling/fan-in, `harness knowledge-pipeline`) now see complete edges for `.js`-imported files.

  **Tests:**
  - `packages/core/tests/entropy/detectors/dead-code.test.ts` — 4 NodeNext cases (file, subdirectory, folder-index, full-report).
  - `packages/core/tests/constraints/dependencies.test.ts` — TS NodeNext + Babel JSX cases via `buildDependencyGraph`.
  - `packages/core/tests/review/context-scoper.test.ts` — TS NodeNext + Babel JSX cases via `scopeContext` import fallback.
  - New fixtures under `packages/core/tests/fixtures/{entropy/dead-code-nodenext,nodenext-imports,jsx-imports}/`.
  - Each new test was verified to fail when the corresponding source fix is reverted.

- a1df67e: fix(core, cli): track `.harness/hooks/` and `.harness/security/timeline.json` by default (#270)

  Two pieces of harness state are team-shared but were ignored by the `.harness/.gitignore` that `harness init` scaffolds, so a fresh clone ran without policy enforcement and with no shared security-trend history until someone re-ran `harness init`:
  - **`.harness/hooks/`** — the per-profile policy scripts (`block-no-verify.js`, `protect-config.js`, `quality-gate.js`, `pre-compact-state.js`, `adoption-tracker.js`, `telemetry-reporter.js`, plus `profile.json` for `standard`; `cost-tracker.js`, `sentinel-pre.js`, `sentinel-post.js` add for `strict`). Treat the directory like a tracked lockfile: review CLI-upgrade diffs.
  - **`.harness/security/timeline.json`** — append-only security trend ledger keyed by commit hash. Tracking it surfaces score deltas in PR diffs and gives `findingLifecycles` a real audit trail.

  **`@harness-engineering/cli`:**
  - `packages/cli/src/templates/post-write.ts` — `ensureHarnessGitignore` no longer emits `hooks/`, and replaces `security/` with `security/*` + `!security/timeline.json`.
  - `packages/cli/tests/templates/post-write.test.ts` — adds two assertions that pin the new semantics so future edits cannot silently revert them.

  **`@harness-engineering/core`:**

  `security/timeline.json` was not actually share-safe before this change: `findingLifecycles[].file` stored whatever path the scanner emitted, which is absolute (`packages/cli/src/commands/check-security.ts:90` globs with `absolute: true`). Committing it would have leaked every developer's home-directory username and produced near-guaranteed merge conflicts whenever two developers scanned. The CLI default flip is paired with a normalization fix at the timeline boundary:
  - `packages/core/src/security/security-timeline-manager.ts` — `capture()` and `updateLifecycles()` now relativize `finding.file` against `rootDir` before computing `findingId` and persisting, so IDs are rootDir-independent (two clones agree). Paths that escape `rootDir` (relative starts with `..`) are passed through unchanged so we never silently misattribute findings outside the project.
  - `load()` migrates legacy absolute paths under `rootDir` to repo-relative form on first read and re-saves the file. One-shot fixup; subsequent reads are no-ops.
  - `packages/core/tests/security/security-timeline-manager.test.ts` — six new cases under `describe('path normalization (issue #270)')` covering: absolute→relative on write, no-double-strip on already-relative, rootDir-independent IDs across two managers, escape-paths preserved, on-load migration with re-save, and no-op when paths are already clean.

  **Repo dogfood:**
  - `.gitignore`, `.harness/.gitignore`, `packages/cli/.harness/.gitignore` — flipped to the new template form.
  - `.harness/security/timeline.json`, `packages/cli/.harness/security/timeline.json` — migrated from absolute to relative paths and now tracked.
  - `.harness/hooks/` — now tracked (7 standard-profile entries).

- Updated dependencies [ba8da2e]
- Updated dependencies [54d9494]
- Updated dependencies [a1df67e]
  - @harness-engineering/core@0.23.8
  - @harness-engineering/dashboard@0.5.2
  - @harness-engineering/orchestrator@0.3.2

## 2.1.0

### Minor Changes

- fix(ingest, graph): resolve `harness ingest` OOM/recursion crashes (#274) and `loadGraph` V8 string-cap crashes (#276) on real-world monorepos.

  **`@harness-engineering/graph`:**
  - Issue #274 — recursive walker with a 22-entry inline if-chain skip list crashed with `Maximum call stack size exceeded` or heap-OOM on monorepos with populated build caches. The skip list missed `.turbo`, `.vite`, `.cache`, `.docusaurus`, `.wrangler`, `.svelte-kit`, `.parcel-cache`, `storybook-static`, `playwright-report`, `test-results`, `.pytest_cache`, `.pnpm-store`, `.nuxt`, and AI agent sandbox dirs (`.claude`, `.cursor`, `.codex`, `.gemini`, `.aider`). The `.claude/worktrees/` omission alone could multiply walker workload by 50× on heavy users of Claude Code's worktree feature.
  - New shared `DEFAULT_SKIP_DIRS` constant (60+ entries) at `packages/graph/src/ingest/skip-dirs.ts`, exported from the package barrel along with `resolveSkipDirs`. Covers VCS, package managers, JS/TS framework caches, test/coverage outputs, Python virtualenvs and bytecode, JVM build outputs, IDE metadata, and AI agent sandboxes.
  - `CodeIngestor.findSourceFiles` rewritten as an iterative BFS walker — no more recursion, bounded by frontier size rather than path depth.
  - New `CodeIngestorOptions` constructor parameter: `skipDirs` (replace defaults), `additionalSkipDirs` (extend defaults), `excludePatterns` (minimatch globs), `respectGitignore` (default-on, supports the common `.gitignore` subset; negation is dropped silently).
  - Issue #276 — `loadGraph` slurped `graph.json` into one V8 string and crashed with `RangeError: Invalid string length` on graphs > ~512 MB. Production monorepos with thousands of source files hit this easily.
  - On-disk schema bumped v1 → v2: `graph.json` is now NDJSON, one record per line with a `kind` discriminator (`"node"` or `"edge"`). Reader uses `readline` so peak string size is bounded by the largest single record. Old v1 graphs trigger the existing `schema_mismatch` path → automatic rebuild on next scan.
  - New `loadGraphMetadata` helper (exported) reads only `metadata.json`. New `nodesByType` field on `GraphMetadata` enables a fast-path for summary callers that never touch `graph.json`.
  - `RangeError: Invalid string length` now wraps into an actionable error pointing at the offending file and likely cause.

  **`@harness-engineering/cli`:**
  - New `ingest` config block on `HarnessConfigSchema` mirroring `CodeIngestorOptions`. Use `additionalSkipDirs` to extend the comprehensive defaults without replacing them, `excludePatterns` for glob-based exclusions, and `respectGitignore: false` to opt out of `.gitignore` honoring.
  - `harness scan` and `harness ingest --source code` load the `ingest` block via best-effort `loadIngestOptions` — if `harness.config.json` is missing or malformed, falls back to defaults silently.
  - `harness graph status` now reads only `metadata.json` (via `loadGraphMetadata`) and returns instantly with full per-type node breakdown, even on multi-GB graphs that previously failed to load.
  - `harness graph status` reports a clear `schema_mismatch` message instead of an opaque parse error when the graph was written by an older schema version.
  - The CLI's MCP `glob-helper` now imports the shared `DEFAULT_SKIP_DIRS` so the MCP file walker and the graph ingester can no longer drift.

  **Documentation:**
  - `docs/reference/configuration.md` — new `ingest` section documenting `skipDirs`, `additionalSkipDirs`, `excludePatterns`, `respectGitignore`, the comprehensive default list, and a worked example.

  **Tests:**
  - New `packages/graph/tests/ingest/CodeIngestor-skip-dirs.test.ts` — asserts default coverage of `.claude`/`.vite`/`.turbo`/etc., custom `additionalSkipDirs`/`skipDirs`/`excludePatterns` work, `.gitignore` is honored, iterative walker handles deeply nested directories.
  - New `packages/graph/tests/store/Serializer.test.ts` — asserts NDJSON line shape, save/load roundtrip preserves nodes and edges, metadata fast-path returns counts without reading `graph.json`, schema-mismatch on legacy v1 files, large-graph (5K nodes + 5K edges) streams cleanly.
  - Existing `packages/cli/tests/commands/graph.test.ts` updated to assert the v2 NDJSON shape.

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.8.0
  - @harness-engineering/core@0.23.7
  - @harness-engineering/dashboard@0.5.1
  - @harness-engineering/intelligence@0.2.1
  - @harness-engineering/orchestrator@0.3.1

## 2.0.0

### Patch Changes

- Updated dependencies [8825aee]
- Updated dependencies [8825aee]
  - @harness-engineering/orchestrator@0.3.0
  - @harness-engineering/dashboard@0.5.0
  - @harness-engineering/types@0.11.0
  - @harness-engineering/intelligence@0.2.0
  - @harness-engineering/core@0.23.6

## 1.28.1

### Patch Changes

- Updated dependencies [18412eb]
  - @harness-engineering/graph@0.7.1
  - @harness-engineering/core@0.23.5
  - @harness-engineering/dashboard@0.4.1
  - @harness-engineering/intelligence@0.1.5
  - @harness-engineering/orchestrator@0.2.17

## 1.28.0

### Minor Changes

- 3bfe4e4: feat(config): add `design.enabled` tri-state config field for design-system opt-in/decline.
  - New `design.enabled?: boolean` field on `DesignConfigSchema`. Tri-state runtime semantics:
    - `true` — design system enabled; `harness-design-system` fires on `on_new_feature`.
    - `false` — explicitly declined; skill skips with a permanent-decline log line.
    - absent — undecided; skill surfaces a gentle prompt.
  - `.superRefine()` ensures `design.platforms` is a non-empty `('web' | 'mobile')[]` whenever `design.enabled === true`.
  - `initialize-harness-project` Phase 3 step 5b now records the choice via `emit_interaction` (yes / no / not sure) for non-test-suite projects; Phase 4 step 4 promotes the roadmap nudge to an active question and auto-adds a `Set up design system` planned roadmap entry when both answers are yes.
  - 6-variant fixture matrix and a yes/yes end-to-end test cover all answer combinations.

  Spec: `docs/changes/init-design-roadmap-config/proposal.md`. Verification report: `docs/changes/init-design-roadmap-config/verification/2026-05-03-phase5-report.md`.

- 3bfe4e4: feat(cli): add `harness migrate` command for legacy artifact layout.

  Migrates pre-co-location project artifacts (`.harness/architecture/`, `docs/plans/`, etc.) into the canonical layout. Supports `--dry-run` to preview the migration plan, interactive orphan bucketing, and a `--non-interactive` mode for CI use.

  Subsequent refactor pass hardened the implementation:
  - Replaced shell-string `git mv` with `execFileSync` (no shell metacharacter interpolation surface).
  - Tightened filename-prefix matching to require a word boundary (so plan `authhelper-plan` no longer falsely maps to topic `auth`).
  - Switched `runMigrate` return type to `Promise<Result<MigrationResult, CLIError>>` matching the convention used by `runCleanupSessions` and the rest of the CLI commands.
  - Resolves `harness.config.json` relative to the migrate cwd; warns explicitly on parse failure rather than silently falling back.
  - Skips the interactive orphan prompt during `--dry-run`.

- 3bfe4e4: feat: configurable domain inference for the knowledge pipeline.

  **`@harness-engineering/graph`:**
  - New shared helper `inferDomain(node, options)` at `packages/graph/src/ingest/domain-inference.ts`. Exported from the package barrel along with `DomainInferenceOptions`, `DEFAULT_PATTERNS`, `DEFAULT_BLOCKLIST`.
  - Built-in patterns cover common monorepo conventions: `packages/<dir>`, `apps/<dir>`, `services/<dir>`, `src/<dir>`, `lib/<dir>`.
  - Reserved blocklist prevents misclassification of infrastructure paths: `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`.
  - Generic first-segment fallback after blocklist filter; preserves existing `KnowledgeLinker` connector-source branch and the `metadata.domain` highest-precedence behavior.
  - Refinements: code-extension allowlist (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) so directories with dots in names like `foo.bar/` retain their full segment; symmetric blocklist returns `'unknown'` when a pattern captures a blocklisted segment instead of bleeding into the generic fallback.
  - Wired into `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer`. Each gains an optional `inferenceOptions: DomainInferenceOptions = {}` constructor parameter — back-compat preserved for single-arg construction.
  - `KnowledgePipelineRunner` accepts `inferenceOptions` on its per-run options and threads to all four construction sites.
  - Test coverage: 19 unit tests for the helper + 11 wiring/integration tests across consumer classes + 3 end-to-end fixture tests.

  **`@harness-engineering/cli`:**
  - New optional config: `knowledge.domainPatterns: string[]` and `knowledge.domainBlocklist: string[]` on `HarnessConfigSchema`. Pattern format is the literal `prefix/<dir>` (regex `^[\w.-]+\/<dir>$`); blocklist entries are non-empty strings. Both default to `[]` and **extend** the built-in defaults rather than replacing them.
  - `harness knowledge-pipeline` reads both fields via `resolveConfig()` and maps them to the runner's `inferenceOptions.extraPatterns` / `extraBlocklist`.
  - 22 schema validation tests covering valid populated / valid empty / valid absent / invalid pattern / invalid blocklist element / default-propagation cases.

  **Documentation:**
  - `docs/reference/configuration.md` — new `knowledge` section documenting both fields, the built-in defaults, the precedence order, both refinements, and a worked `agents/<dir>` example.
  - `docs/knowledge/graph/node-edge-taxonomy.md` — new "Domain Inference" section with a 6-row precedence-walkthrough table.
  - `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` — one-line note in EXTRACT phase pointing at the config override.

  **Known follow-up:** Phase 6 verification showed the real-repo `unknown` bucket did not close as projected on this monorepo (helper + wiring + integration test all pass independently, but the production pipeline runtime path appears to lose `node.path` between extraction and aggregation). The diagnostic is filed as `Diagnose pipeline node-path loss for domain inference` on the roadmap.

  Spec: `docs/changes/knowledge-domain-classifier/proposal.md`. Verification report: `docs/changes/knowledge-domain-classifier/verification/2026-05-03-phase6-report.md`.

### Patch Changes

- 3bfe4e4: fix(roadmap): unblock dependents when blocker is marked done.

  Previously, marking a blocker feature as `done` left its dependents in the `blocked` state until manually updated. The roadmap now propagates done-status to dependents, transitioning them back to `planned` (or whatever their pre-block status was) when the blocker is resolved.

- Updated dependencies [3bfe4e4]
- Updated dependencies [3bfe4e4]
  - @harness-engineering/dashboard@0.4.0
  - @harness-engineering/graph@0.7.0
  - @harness-engineering/core@0.23.4
  - @harness-engineering/intelligence@0.1.4
  - @harness-engineering/orchestrator@0.2.16

## 1.27.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/dashboard@0.3.0

## 1.27.0

### Minor Changes

- Knowledge document materialization pipeline

  **@harness-engineering/graph:**
  - Add KnowledgeDocMaterializer that generates markdown knowledge docs from graph gap analysis
  - Wire KnowledgeDocMaterializer into pipeline convergence loop
  - Pass store to generateGapReport for differential gap analysis
  - Add materialization field to KnowledgePipelineResult
  - Fix filePath normalization to forward slashes for Windows compatibility
  - Fix conditional spread for exactOptionalPropertyTypes compatibility
  - Address review findings in knowledge pipeline
  - Add integration tests for pipeline materialization

  **@harness-engineering/cli:**
  - Display differential gaps and materialization results in knowledge-pipeline output

  **@harness-engineering/dashboard:**
  - Add knowledge pipeline to skill registry

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.6.0
  - @harness-engineering/dashboard@0.2.2
  - @harness-engineering/core@0.23.3
  - @harness-engineering/orchestrator@0.2.15

## 1.26.1

### Patch Changes

- Updated dependencies [e3dc2e7]
  - @harness-engineering/orchestrator@0.2.14
  - @harness-engineering/dashboard@0.2.1

## 1.26.0

### Minor Changes

- f62d6ab: Knowledge pipeline (Phases 4-5)

  **@harness-engineering/graph:**
  - Add KnowledgePipelineRunner with 4-phase convergence loop for end-to-end knowledge extraction
  - Complete Phase 4 knowledge pipeline with D2/PlantUML parsers, staging aggregator, and CLI integration
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add DiagramParseResult types and MermaidParser for diagram-to-graph ingestion
  - Add StructuralDriftDetector with deterministic classification
  - Add ContentCondenser with passthrough and truncation tiers
  - Add KnowledgeLinker with heuristic pattern registry, clustering, staged output, and deduplication
  - Add code signal extractors for business knowledge extraction
  - Add business knowledge foundation with `business_fact` node type and `maxContentLength` config field
  - Add `execution_outcome` node type and `outcome_of` edge type

  **@harness-engineering/cli:**
  - Add Phase 5 Visual & Advanced pipeline capabilities
  - Add business-signals source to graph ingest

### Patch Changes

- f62d6ab: Resolve CLI typecheck errors for optional intelligence import and fix formatting failures
- f62d6ab: Supply chain audit — fix HIGH vulnerability, bump dependencies, migrate openai to v6
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
- Updated dependencies [f62d6ab]
  - @harness-engineering/graph@0.5.0
  - @harness-engineering/dashboard@0.2.0
  - @harness-engineering/orchestrator@0.2.13
  - @harness-engineering/linter-gen@0.1.7
  - @harness-engineering/core@0.23.2
  - @harness-engineering/types@0.10.1

## 1.25.7

### Patch Changes

- f0a7cdd: fix(init): skip project scaffolding for pre-existing projects (#235)

  `harness init` no longer creates scaffold files (pom.xml, App.java, etc.) when the target directory already contains a project. Detects existing projects by checking for common build/config markers and only writes harness config files.

## Unreleased

### Fixed

- fix(init): skip project scaffolding for pre-existing projects ([#235](https://github.com/Intense-Visions/harness-engineering/issues/235))

  `harness init --language java` (and the MCP `init_project` tool) no longer creates scaffold files (pom.xml, App.java, checkstyle.xml, etc.) when the target directory already contains a project. Added `isExistingProject()` detection that checks for 13 common build/config markers (build.gradle, package.json, go.mod, pyproject.toml, Cargo.toml, etc.). When an existing project is detected, only harness infrastructure files (harness.config.json, AGENTS.md) are written. Also added build.gradle/build.gradle.kts to `NON_JSON_PACKAGE_CONFIGS`. Use `--force` to override.

## 1.25.6

### Patch Changes

- 528a72f: Fix two root causes preventing PostHog telemetry data collection

  **CLI command telemetry:**
  Commander.js `preAction` hook used `thisCommand` (root program) instead of `actionCommand` (the actual subcommand). `resolveCommandName` always returned `""`, silently skipping adoption record writes. Fixed by using the correct `actionCommand` parameter.

  **Skill invocation telemetry:**
  `emitEvent()` was implemented but never called from production code. Wired event emission into MCP tool handlers (`manage_state`, `emit_interaction`, `run_skill`) so the adoption-tracker Stop hook has events to process. Added new `event-emitter.ts` module with `emitSkillEvent` for phase transitions, gate results, handoffs, and errors.

- Updated dependencies
  - @harness-engineering/dashboard@0.1.8

## 1.25.5

### Patch Changes

- fix(ci): cross-platform CI fixes for Windows test timeouts and coverage scripts
- fix(cli): prevent `--global` from orphaning core harness slash commands

  `harness generate-slash-commands --global` and `harness update` (global) no longer remove core harness commands when run from a project with installed third-party skills.

- fix(telemetry): use `distinct_id` (snake_case) for PostHog batch API

  PostHog requires `distinct_id` but the code sent `distinctId` (camelCase), causing all telemetry events to be silently rejected with HTTP 400. Added identity fallbacks from `harness.config.json` name and `git config user.name`. Added `harness telemetry test` command for verifying PostHog connectivity.

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.23.0
  - @harness-engineering/types@0.10.0
  - @harness-engineering/orchestrator@0.2.11
  - @harness-engineering/dashboard@0.1.7

## 1.25.4

### Patch Changes

- ad48d91: Fix orchestrator state reconciliation, stale worktree reuse, and dashboard production proxy

  **@harness-engineering/orchestrator:**
  - Reconcile completed/claimed state against roadmap on each tick: completed entries are released after a grace period when they reappear as active candidates, and orphaned claims are released when escalated issues leave active candidates
  - Always recreate worktrees from latest base ref on dispatch instead of reusing stale worktrees from before an orchestrator restart
  - Add `analyses/`, `interactions/`, `workspaces/` to `.harness/.gitignore` template so orchestrator runtime directories are never committed

  **@harness-engineering/dashboard:**
  - Proxy orchestrator API and WebSocket in production mode (`harness dashboard run`), not just in Vite dev server — fixes dashboard failing to connect to orchestrator in production
  - Fix CORS to allow non-loopback HOST bindings

  **@harness-engineering/cli:**
  - Add `--orchestrator-url` flag to `harness dashboard` command for configuring the orchestrator proxy target

- Updated dependencies [ad48d91]
  - @harness-engineering/orchestrator@0.2.10
  - @harness-engineering/dashboard@0.1.6

## 1.25.3

### Patch Changes

- 1d0fdd8: Rename orchestrator config file from WORKFLOW.md to harness.orchestrator.md. The CLI default for `--workflow` now points to `harness.orchestrator.md`.
- Updated dependencies [1d0fdd8]
  - @harness-engineering/orchestrator@0.2.9

## 1.25.2

### Patch Changes

- 2911ef5: Fix telemetry pipeline and hook path resolution
  - Fix identity field lowercasing in telemetry wizard: project name, team, and alias now preserve original casing
  - Add `hooks/` and `security/` to `.harness/.gitignore` template so generated artifacts are never committed
  - Add CLI command telemetry: every `harness` CLI invocation writes an adoption record to `adoption.jsonl`, flushed to PostHog on the next invocation
  - Fix hook path resolution: use `git rev-parse --show-toplevel` so hooks resolve correctly when Claude Code CWD is a subdirectory
  - Untrack `.harness/security/timeline.json` (runtime artifact committed before gitignore rule existed)

## 1.25.1

### Patch Changes

- 370cefb: Fix hook refresh failure after global install. `resolveHookSourceDir()` path resolution failed in bundled dist layout, and `copy-assets.mjs` was not copying hook scripts to `dist/hooks/`.

## 1.25.0

### Minor Changes

- f1bc300: Add `harness validate --agent-configs` for hybrid agent-config validation.
  - Preferred path shells out to the [agnix](https://github.com/agent-sh/agnix) binary when it
    is installed (385+ rules across CLAUDE.md, hooks, agents, skills, MCP).
  - When agnix is unavailable (or disabled via `HARNESS_AGNIX_DISABLE=1`), the command runs a
    built-in TypeScript fallback rule set (`HARNESS-AC-*`) covering broken agents, invalid
    hooks, unreachable skills, oversize CLAUDE.md, malformed MCP entries, persona references,
    and `.agnix.toml` sanity.
  - `harness init` now ships a default `.agnix.toml` so the agnix path works with no extra
    configuration.
  - Supports `--strict`, `--agnix-bin`, `--json`, and `HARNESS_AGNIX_BIN` env override.

### Patch Changes

- Harden orchestrator, rate limiter, and container security defaults.

  **@harness-engineering/orchestrator:**
  - Extract PR detection from `Orchestrator` into standalone `PRDetector` module
  - Fix rate-limiter stack overflow risk by replacing `Math.min(...spread)` with `reduce`
  - Ensure rate limit delays are always >= 1ms
  - Default container network to `none` and block privileged Docker flags
  - Fix stale claim detection: missing timestamp now treated as stale
  - Fix scheduler to only record `lastRunMinute` on task success
  - Add error handling for `ensureBranch`/`ensurePR`/agent dispatch in task-runner
  - Add resilient `rebase --abort` recovery in pr-manager

  **@harness-engineering/core:**
  - Fix `contextBudget` edge cases (zero total tokens, zero `originalSum` during redistribution)
  - Parse `npm audit` stdout on non-zero exit in `SecurityTimelineManager`
  - Add security rule tests (crypto, deserialization, express, go, network, node, path-traversal, react, xss)

  **@harness-engineering/cli:**
  - Break `StepResult` type cycle between `setup.ts` and `telemetry-wizard.ts` via `setup-types.ts`

- Updated dependencies [f1bc300]
- Updated dependencies
  - @harness-engineering/core@0.22.0
  - @harness-engineering/orchestrator@0.2.8
  - @harness-engineering/dashboard@0.1.5

## 1.24.3

### Patch Changes

- 46999c5: Fix `harness dashboard` returning 404 on all routes by serving built client static files from the Hono API server with SPA fallback.
- 802a1dd: Fix `search_skills` returning irrelevant results and compaction destroying skill content.
  - Index all non-internal skills regardless of tier so the router can discover Tier 1/2 skills
  - Add minimum score threshold (0.25) to filter noise from incidental substring matches
  - Fix `resultToMcpResponse` double-wrapping strings with `JSON.stringify`, which collapsed newlines and caused truncation to drop all content
  - Truncate long lines to fit budget instead of silently skipping them; cap marker cost at 50% of budget
  - Exempt 12 tools from lossy truncation (run_skill, emit_interaction, manage_state, etc.) — use structural-only compaction for tools whose output must arrive complete

- Updated dependencies [46999c5]
- Updated dependencies [802a1dd]
  - @harness-engineering/dashboard@0.1.4
  - @harness-engineering/core@0.21.4
  - @harness-engineering/orchestrator@0.2.7

## 1.24.1

### Patch Changes

- 5bbad27: Fix `harness update` to check all installed packages for updates, not just CLI. Adds `--force` and `--regenerate` flags.

## 1.24.0

### Minor Changes

- Skill dispatcher enhancements, knowledge skill infrastructure, and structural improvements
  - Add `related_skills` traversal and knowledge auto-injection (cap N=3) to skill dispatcher
  - Add `paths` glob dimension to skill scoring (0.20 weight)
  - Add NL router skill with `command_name` override
  - Add `--skills-dir`, bulk install, global skills, and GitHub source to install command
  - Replicate knowledge skills across gemini-cli, cursor, and codex platforms
  - Add `return` after `process.exit()` calls for TypeScript control-flow correctness
  - Replace `!!` with `Boolean()` for explicit boolean coercion in integrations list
  - Reduce Tier 2 structural complexity across CLI commands

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @harness-engineering/core@0.21.2
  - @harness-engineering/graph@0.4.2
  - @harness-engineering/linter-gen@0.1.6
  - @harness-engineering/orchestrator@0.2.6
  - @harness-engineering/types@0.9.1

## 1.23.2

### Patch Changes

- Reduce cyclomatic complexity in `traceability` command
- Updated dependencies
  - @harness-engineering/core@0.21.1 — fix blocked status corruption in external sync

## 1.23.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.21.0 — roadmap sync: remove auto-assignee, add title-based dedup, single fetch per cycle

## 1.23.0

### Minor Changes

- Add `assignee` field to `manage_roadmap update` action

  The `update` action now accepts an `assignee` parameter that delegates to `assignFeature()` for proper assignment history tracking (new assignment and reassignment with unassigned + assigned records). Because `update` is a mutating action, `triggerExternalSync` fires automatically — fixing the bug where the roadmap pilot skill bypassed sync by calling `assignFeature()` directly.

## 1.22.0

### Minor Changes

- Predictive architecture failure analysis, spec-to-implementation traceability, architecture decay timeline, and skill recommendation engine

## 1.21.0

### Minor Changes

- Return readable markdown from emit_interaction instead of JSON blob

  Split the single JSON content item into dual items: rendered markdown first (audience: user+assistant) and metadata JSON second (audience: assistant), with MCP audience annotations. This makes emit_interaction output readable on Gemini CLI and other clients that display raw MCP tool responses.

### Patch Changes

- Fix search_skills to find skills by name and description, not just keywords

## 1.20.1

### Patch Changes

- Fix injection scanner false positives on trusted MCP tool output

  The sentinel injection guard was scanning output from all MCP tools, including harness-internal tools like `run_skill` and `gather_context` that return project documentation and state. Skill docs containing legitimate patterns (e.g., `<context>` XML tags, "auto-approve" feature descriptions) triggered INJ-CTX-003 and INJ-PERM-003, tainting the session and blocking git operations.

  Added `trustedOutputTools` option to the injection guard middleware. All harness MCP tools are marked as trusted (opt-in), skipping output scanning while preserving input scanning. New tools default to untrusted.

## 1.20.0

### Minor Changes

- Load project `.env` for external sync — The MCP server's `triggerExternalSync` now loads `.env` from the project root when `GITHUB_TOKEN` is not already in the environment, fixing token discovery when the MCP server's working directory differs from the project.

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.19.0 — GitHub sync assignee push and auto-population

## 1.19.0

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.18.0 — GitHub milestone sync, feature type labels, rate limit retry

## 1.18.0

### Minor Changes

- Environment configuration via `.env` file
  - **dotenv support** — Added `dotenv` as a runtime dependency. Both CLI entry points (`harness`, `harness-mcp`) now load `.env` from the working directory at startup via `import 'dotenv/config'`.
  - **`.env.example`** — New file at repo root documenting all known environment variables: API keys (GITHUB_TOKEN, CONFLUENCE_API_KEY, CONFLUENCE_BASE_URL, JIRA_API_KEY, JIRA_BASE_URL, SLACK_API_KEY), integrations (PERPLEXITY_API_KEY), feature flags (HARNESS_NO_UPDATE_CHECK, CI), and server config (PORT).
  - **`.gitignore` hardening** — Broadened env file patterns from `.env` / `.env*.local` to `.env*` with `!.env.example` exception, catching all variants (`.env.production`, `.env.staging`, etc.).

## 1.17.0

### Minor Changes

- Roadmap sync, auto-pick, and assignment
  - **External tracker sync** — Bidirectional sync between roadmap.md and GitHub Issues via `TrackerSyncAdapter` interface. Split authority: roadmap owns planning fields, GitHub owns execution/assignment. Sync fires on every state transition (task-start, task-complete, phase-start, phase-complete, save-handoff, archive_session).
  - **Auto-pick pilot** — New `harness-roadmap-pilot` skill with AI-assisted next-item selection. Two-tier scoring: explicit priority first (P0-P3), then weighted position/dependents/affinity score. Routes to brainstorming (no spec) or autopilot (spec exists).
  - **Assignment with affinity** — Assignee, Priority, and External-ID fields on roadmap features. Assignment history section in roadmap.md enables affinity-based routing. Reassignment produces audit trail (unassigned + assigned records).
  - **New types** — `Priority`, `AssignmentRecord`, `ExternalTicket`, `ExternalTicketState`, `SyncResult`, `TrackerSyncConfig` in @harness-engineering/types.
  - **Config schema** — `TrackerConfigSchema` and `RoadmapConfigSchema` added to `HarnessConfigSchema` for validated tracker configuration.

### Patch Changes

- Updated dependencies
  - @harness-engineering/types@0.7.0
  - @harness-engineering/core@0.17.0
  - @harness-engineering/graph@0.3.5
  - @harness-engineering/orchestrator@0.2.5

## 1.16.0

### Minor Changes

- Multi-platform MCP expansion, security hardening, and release readiness fixes

  **@harness-engineering/cli (minor):**
  - Multi-platform MCP support: add Codex CLI and Cursor to `harness setup-mcp`, `harness setup`, and slash command generation
  - Cursor tool picker with `--pick` and `--yes` flags using `@clack/prompts` for interactive tool selection
  - TOML MCP entry writer for Codex `.codex/config.toml` integration
  - Sentinel prompt injection defense hooks (`sentinel-pre`, `sentinel-post`) added to hook profiles
  - `--tools` variadic option for `harness mcp` command
  - Fix lint errors in hooks (no-misleading-character-class, unused imports, `any` types)
  - Fix cost-tracker hook field naming (snake_case → camelCase alignment)
  - Fix test gaps: doctor MCP mock, usage fetch mock, profiles/integration hook counts

  **@harness-engineering/core (minor):**
  - Usage module: Claude Code JSONL parser (`parseCCRecords`), daily and session aggregation
  - Security scanner: session-scoped taint state management, `SEC-DEF-*` insecure-defaults rules, `SEC-EDGE-*` sharp-edges rules
  - Security: false-positive verification gate replacing suppression checks, `parseHarnessIgnore` helper
  - Fix lint: eslint-disable for intentional zero-width character regex in injection patterns

  **@harness-engineering/types (minor):**
  - Add `DailyUsage`, `SessionUsage`, `UsageRecord`, and `ModelPricing` types for cost tracking
  - Export aggregate types from types barrel

  **@harness-engineering/orchestrator (patch):**
  - Integrate sentinel config scanning into dispatch pipeline
  - Fix conditional spread for optional line property

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.16.0
  - @harness-engineering/types@0.6.0
  - @harness-engineering/orchestrator@0.2.4
  - @harness-engineering/graph@0.3.4

## 1.15.0

### Minor Changes

- **Hooks system** — 6 hook scripts (`block-no-verify`, `cost-tracker`, `pre-compact-state`, `protect-config`, `quality-gate`, `profiles`) with profile tiers (minimal/standard/strict). CLI commands `hooks init`, `hooks list`, `hooks remove` for managing Claude Code hooks via `settings.json` merge.
- **Code navigation MCP tools** — Register `code_outline`, `code_search`, and `code_unfold` tools in the MCP server, powered by the new core code-nav module.
- **Event timeline in `gather_context`** — Structured event log integration for richer context assembly.
- **Learnings progressive disclosure** — Depth parameter in `gather_context` and `loadBudgetedLearnings` for layered context retrieval. Frontmatter annotations and index entry extraction.
- **Onboarding funnel** — `harness setup` command, `doctor` health check, and first-run welcome experience.
- **Session learning promotion** — Autopilot DONE state promotes session learnings and suggests pruning.

### Patch Changes

- Fix shell injection and `-n` flag bypass in hook scripts
- Fix `execFileSync` consistency and MCP-003 wildcard in security/hooks
- Fix stale scripts, malformed settings, and fallback error in hooks CLI
- Fix roadmap sync guard with directional protection
- Updated dependencies
  - @harness-engineering/core@0.15.0
  - @harness-engineering/types@0.5.0

## 1.14.0

### Minor Changes

- **Multi-language template system** — 5 language bases (Python, Go, Rust, Java, TypeScript) and 10 framework overlays (FastAPI, Django, Gin, Axum, Spring Boot, Next.js, React Vite, Express, NestJS). Language-aware resolution in `TemplateEngine` with `detectFramework()` auto-detection.
- **`--language` flag** — Explicit language selection for `harness init` with conflict validation against detected framework.
- **Framework conventions** — `harness init` appends framework-specific conventions to existing AGENTS.md and persists tooling/framework metadata in `harness.config.json`.
- **Session sections in `manage_state`** — New session section actions (read, append, status update) with schema-validated definitions.
- **Session section retrieval in `gather_context`** — New `sessions` include key for loading session section data.
- **MCP `init_project` enhancements** — Accepts `language` parameter and persists tooling metadata.

### Patch Changes

- Fix `detectFramework` file descriptor leak with try/finally guard
- Fix enum constraints on session section and status MCP schema properties
- Reduce cyclomatic complexity across template and tool modules
- Updated dependencies
  - @harness-engineering/core@0.14.0
  - @harness-engineering/types@0.4.0

## 1.13.1

### Patch Changes

- **Graph tools decomposition** — Split `graph.ts` (821 lines) into 9 focused modules under `tools/graph/`: `query-graph`, `search-similar`, `find-context-for`, `get-relationships`, `get-impact`, `ingest-source`, `detect-anomalies`, `ask-graph`, and shared utilities.
- **Roadmap handler refactor** — Extracted 6 action handlers from `handleManageRoadmap` into standalone functions with shared `RoadmapDeps` interface.
- **Three-tier skill loading** — New `search_skills` MCP tool (46 total). Skill dispatcher with tier-based loading, index builder, and stack profile detection.
- **`check_docs` docsDir fix** — `check_docs` MCP tool and `harness add` command now honor the `docsDir` config field.
- **Cross-platform path fix** — `path.relative()` outputs normalized to POSIX separators across glob helper and path utilities.
- **Gather-context fix** — Resolved `exactOptionalPropertyTypes` error in gather-context tool.
- MCP tool count test assertions updated from 45 to 46.
- Updated dependencies
  - @harness-engineering/core@0.13.1
  - @harness-engineering/orchestrator@0.2.3

## 1.13.0

### Minor Changes

- Efficient Context Pipeline: session support in MCP tools, learnings prune command, roadmap parser fix
  - **`harness learnings prune`**: New CLI command that analyzes global learnings for recurring patterns, presents improvement proposals, and archives old entries keeping 20 most recent
  - **`gather_context` session support**: Added `session` and `learningsBudget` parameters for session-scoped context loading with token-budgeted learnings
  - **`manage_state` session support**: All 7 actions (show, learn, failure, archive, reset, save-handoff, load-handoff) now accept `session` parameter for session-scoped state
  - **`emit_interaction` session support**: Handoff writes respect session scoping when `session` parameter is provided
  - **Roadmap parser fix**: `manage_roadmap` no longer clobbers the roadmap file — parser accepts both `### Feature: X` and `### X` formats, serializer outputs format matching actual roadmap

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.13.0
  - @harness-engineering/types@0.3.1

## 1.12.0

### Minor Changes

- Add constraint sharing commands and private registry support
  - `harness install-constraints` — install shared constraint bundles with conflict detection, dry-run mode, and `--force-local`/`--force-package` resolution
  - `harness uninstall-constraints` — remove contributed rules using lockfile-driven tracking
  - `harness install --from` — install skills from local paths (directories or tarballs)
  - `harness install --registry` / `harness search --registry` / `harness publish --registry` — private registry support with `.npmrc` token reading
  - Upgrade detection in `install-constraints` (uninstall old version before installing new)
  - Fix `exactOptionalPropertyTypes` violation in install command

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.12.0
  - @harness-engineering/orchestrator@0.2.1

## 1.11.0

### Minor Changes

- # Orchestrator Release & Workspace Hardening

  ## New Features
  - **Orchestrator Daemon**: Implemented a long-lived daemon for autonomous agent lifecycle management.
    - Pure state machine core for deterministic dispatch and reconciliation.
    - Multi-tracker support (Roadmap adapter implemented).
    - Isolated per-issue workspaces with deterministic path resolution.
    - Ink-based TUI and HTTP API for real-time observability.
  - **Harness Docs Pipeline**: Sequential pipeline for documentation health (drift detection, coverage audit, and auto-alignment).

  ## Improvements
  - **Documentation Coverage**: Increased project-wide documentation coverage to **84%**.
    - Comprehensive JSDoc/TSDoc for core APIs.
    - New Orchestrator Guide and API Reference.
    - Unified Source Map reference for all packages.
  - **Workspace Stability**: Resolved all pending lint errors and type mismatches in core packages.
  - **Graceful Shutdown**: Added signal handling and centralized resource cleanup for the orchestrator daemon.
  - **Hardened Security**: Restricted orchestrator HTTP API to localhost.

### Patch Changes

- Updated dependencies
  - @harness-engineering/orchestrator@0.2.0
  - @harness-engineering/core@0.11.0
  - @harness-engineering/types@0.3.0
  - @harness-engineering/graph@0.3.2
  - @harness-engineering/linter-gen@0.1.3

## 1.10.0

### Minor Changes

- **Merge `@harness-engineering/mcp-server` into CLI** — the MCP server (42 tools, 8 resources) now ships as part of the CLI package. Installing `@harness-engineering/cli` provides both `harness` and `harness-mcp` binaries.
  - Move source to `packages/cli/src/mcp/` (server, tools, resources, utils)
  - Move tests to `packages/cli/tests/mcp/` (37 test files, 889 tests)
  - Add `harness mcp` subcommand and `harness-mcp` bin entry
  - Add `@modelcontextprotocol/sdk` as dependency (externalized in tsup)
  - Re-export `createHarnessServer`, `startServer`, `getToolDefinitions` from CLI index
  - `@harness-engineering/mcp-server` is now deprecated
- Add lint check to `assess_project` tool with enforcement in execution skill
- Embed automatic roadmap sync into pipeline skills
- Update `release-readiness` skill to use `assess_project` with lint

### Patch Changes

- Replace `no-explicit-any` casts with typed interfaces in `gather-context`
- Unify `paths.ts` with `findUpFrom` + `process.cwd()` fallback
- Updated dependencies
  - @harness-engineering/core@0.10.1
  - @harness-engineering/graph@0.3.1

## 1.9.0

### Minor Changes

- Pick up composite MCP tools (`gather_context`, `assess_project`, `review_changes`), agent workflow acceleration, and `detect_anomalies` tool via updated mcp-server

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.10.0
  - @harness-engineering/graph@0.3.0

## 1.8.0

### Minor Changes

- Upgrade `review` command with `--comment`, `--ci`, `--deep`, and `--no-mechanical` flags for the unified 7-phase review pipeline
- Add update-check hooks with startup background check and notification helpers
- Read `updateCheckInterval` from project config in update-check hooks
- Add `parseConventionalMarkdown` utility for interaction surface patterns

### Patch Changes

- Resolve TypeScript strict-mode errors and platform parity gaps
- Updated dependencies
  - @harness-engineering/core@0.9.0
  - @harness-engineering/types@0.2.0

## 1.7.0

### Minor Changes

- Remove `harness-mcp` binary from CLI package to break cyclic dependency with `@harness-engineering/mcp-server`. The `harness-mcp` binary is now provided exclusively by `@harness-engineering/mcp-server`. Users who install the CLI globally should also install `npm install -g @harness-engineering/mcp-server` for MCP server support.
- Remove `@harness-engineering/mcp-server` from production dependencies

### Patch Changes

- Align dependency versions across workspace: `@types/node` ^22, `vitest` ^4, `minimatch` ^10, `typescript` ^5.3.3

## 1.6.2

### Patch Changes

- Bundle workspace packages into CLI dist so global install works without sibling packages

## 1.6.1

### Patch Changes

- Updated dependencies
  - @harness-engineering/graph@0.2.1

## 1.6.0

### Minor Changes

- Add agent definition generator for persona-based routing
- Add 5 new graph-powered skills: harness-impact-analysis, harness-dependency-health, harness-hotspot-detector, harness-test-advisor, harness-knowledge-mapper
- Add 2 new personas: Graph Maintainer, Codebase Health Analyst
- Update all 12 Tier-1/Tier-2 skill SKILL.md files with graph-aware context gathering notes
- Add graph refresh steps to 8 code-modifying skills
- Add platform parity lint rule (platform-parity.test.ts) ensuring claude-code and gemini-cli skills stay in sync
- Update 3 existing personas with graph skill references

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.8.0
  - @harness-engineering/graph@0.2.0

## 1.5.0

### Minor Changes

- Discover project-local skills in `generate-slash-commands` by default instead of only finding built-in global skills
  - New `--include-global` flag merges built-in skills alongside project skills
  - Project skills take precedence over global skills on name collision
  - Falls back to global skills when run outside a project (backward compatible)
  - Helpful message when no skills are found with guidance on `--include-global` and `create-skill`
- Export `SkillSource` type from package index

### Patch Changes

- Fix `create-skill` to scaffold with both `claude-code` and `gemini-cli` platforms by default

## 1.4.0

### Patch Changes

- Fix `update` command to use `@latest` per package instead of a single version

## 1.3.0

### Minor Changes

- Add CI/CD integration commands and documentation
  - New `harness ci check` command: runs all harness checks (validate, deps, docs, entropy, phase-gate) with structured JSON output and meaningful exit codes
  - New `harness ci init` command: generates CI config for GitHub Actions, GitLab CI, or a generic shell script
  - New CI types: `CICheckReport`, `CICheckName`, `CIPlatform`, and related interfaces
  - Core `runCIChecks` orchestrator composing existing validation into a single CI entrypoint
  - 4 documentation guides: automation overview, CI/CD validation, issue tracker integration, headless agents
  - 6 copy-paste recipes: GitHub Actions, GitLab CI, shell script, webhook handler, Jira rules, headless agent action

### Patch Changes

- Updated dependencies
  - @harness-engineering/core@0.7.0

## 1.2.2

### Patch Changes

- Fix slash command descriptions not appearing in Claude Code by moving YAML frontmatter to line 1

## 1.2.1

### Patch Changes

- dc88a2e: Codebase hardening: normalize package scripts, deduplicate Result type, tighten API surface, expand test coverage, and fix documentation drift.

  **Breaking (core):** Removed 6 internal helpers from the entropy barrel export: `resolveEntryPoints`, `parseDocumentationFile`, `findPossibleMatches`, `levenshteinDistance`, `buildReachabilityMap`, `checkConfigPattern`. These were implementation details not used by any downstream package. If you imported them directly from `@harness-engineering/core`, import from the specific detector file instead (e.g., `@harness-engineering/core/src/entropy/detectors/drift`).

  **core:** `Result<T,E>` is now re-exported from `@harness-engineering/types` instead of being defined separately. No consumer-facing change.

  **All packages:** Normalized scripts (consistent `test`, `test:watch`, `lint`, `typecheck`, `clean`). Added mcp-server to root tsconfig references.

  **mcp-server:** Fixed 5 `no-explicit-any` lint errors in architecture, feedback, and validate tools.

  **Test coverage:** Added 96 new tests across 13 new test files (types, cli subcommands, mcp-server tools).

  **Documentation:** Rewrote cli.md and configuration.md to match actual implementation. Fixed 10 inaccuracies in AGENTS.md.

- Updated dependencies [dc88a2e]
  - @harness-engineering/core@0.6.0

## 1.1.1

### Patch Changes

- Fix setup-mcp to write Claude Code config to .mcp.json (not .claude/settings.json), add Gemini trusted folder support, fix package name to @harness-engineering/mcp-server, and export CLI functions for MCP server integration.

## 1.1.0

### Minor Changes

- Add setup-mcp command and auto-configure MCP server during init for Claude Code and Gemini CLI

## 1.0.2

### Patch Changes

- Bundle agents (skills + personas) into dist for global install support

## 1.0.1

### Patch Changes

- Bundle templates into dist for global install support
