# Analysis: Graphify vs `@harness-engineering/graph`

**Read-only research.** Evidence is cited `file:line` for our code and by URL for Graphify.

## The two things are not the same category

|                | **Graphify**                                                                                       | **`@harness-engineering/graph`**                                                                                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape          | Standalone **CLI + MCP server** (Python) that emits artifacts                                      | Embedded **TS library** (`v0.13.1`), consumed in-process                                                                                                                                                       |
| Primary job    | "Query your codebase instead of grepping" — a code+docs **concept graph** for an AI assistant      | **Substrate** for the whole harness analytical surface                                                                                                                                                         |
| Output         | `graph.json` / `graph.html` / `GRAPH_REPORT.md` in `graphify-out/`                                 | Live TS objects: `GraphStore`, `ContextQL`, `Assembler`, adapters                                                                                                                                              |
| Consumers      | The human + the AI assistant, via CLI/MCP                                                          | **91 non-test source files across 7 packages** (`cli` 50, `intelligence` 14, `core` 12, `orchestrator`/`dashboard` 5 each, `signals` 3)                                                                        |
| Model scope    | Code + docs concepts                                                                               | Code **+** ADR/decision/learning/failure, VCS, observability, design tokens, business knowledge, requirements/traceability, execution outcomes — **37 node types, 29 edge types** (`packages/graph/README.md`) |
| Embeddings     | **Deliberately none** ("not a vector index")                                                       | `VectorStore` + `FusionLayer` hybrid keyword+semantic search                                                                                                                                                   |
| License / tier | OSS (Apache-2.0/MIT dual) + proprietary **enterprise cloud** ("always-on layer", app.graphify.com) | Ours (MIT), fully owned                                                                                                                                                                                        |

The core insight: **Graphify's value is the code-graph slice. Our graph's value is everything the code-graph feeds** — the ~15 adapters that turn the graph into harness analyses. Graphify has no equivalent of those, no TS API, and a different product goal.

## What Graphify does STRONGER (verified)

1. **AST fidelity & language breadth.** Graphify parses **37 tree-sitter grammars** (Python, TS/JS, Go, Rust, Java, C/C++, Ruby, C#, Kotlin, Swift, PHP, SQL, Terraform, Vue/Svelte/Astro, …) — deterministic AST, no LLM ([README](https://github.com/Graphify-Labs/graphify/blob/v8/README.md)). Ours does 6 languages (`.ts/.tsx/.js/.jsx/.py/.go/.rs/.java`) via **regex symbol extraction**, not AST — `packages/graph/src/ingest/CodeIngestor.ts:34,103-121`. Tree-sitter is materially more accurate than regex for anything past TS/JS.
2. **Explicit edge provenance.** Every edge is tagged `EXTRACTED` (explicit in source) / `INFERRED` (resolved by graphify) / `AMBIGUOUS` (LLM tiebreak). Ours carries only `confidence?: number` (0-1) with **no provenance enum** — `packages/graph/src/types.ts:138,262`. Provenance makes "cite what you read vs what you guessed" a first-class property; we cannot currently express it.
3. **Community detection.** Leiden algorithm partitions the graph into labeled subsystems (`--cluster-only` reruns without re-extraction). We have only `clusterBySource` (group-by-source-node) in `packages/graph/src/ingest/KnowledgeLinker.ts:163` — not real community detection.
4. **First-class graph primitives for humans.** `graphify path A B` (shortest path between any two concepts) and `graphify explain Concept` (degree, source, neighbors). We have `explain`/`impact`/`relationships` NLQ intents over a BFS (`packages/graph/src/nlq/`), but no arbitrary two-node shortest-path.
5. **"Every edge explained" + shipped visualization.** `graph.html` (interactive force-directed) and `GRAPH_REPORT.md` (god-nodes, surprising connections, inline WHY). We have no built-in human-facing viz/report exporter.
6. **Multi-modal ingest** (PDF/DOCX/XLSX/images/video via LLM backends). We ingest markdown knowledge artifacts only.
7. **Distribution & proof.** ~108k stars, ~5M downloads, named production users. Battle-tested extraction.

## What OUR graph does STRONGER (verified)

1. **Unified cross-domain model.** 37 node types spanning knowledge, VCS, observability, **design tokens, business knowledge, requirements/traceability, execution outcomes** (`packages/graph/README.md`). Graphify is code+docs only. This model is _the_ thing the harness is built on.
2. **The analysis adapter layer.** `GraphEntropyAdapter`, `GraphConstraintAdapter`, `GraphComplexityAdapter`, `GraphCouplingAdapter`, `GraphAnomalyAdapter`, `CascadeSimulator` (`compute_blast_radius`), `TaskIndependenceAnalyzer`, `ConflictPredictor`, `queryTraceability`, `GraphFeedbackAdapter`. **None of this exists in Graphify.** These power `detect_entropy`, `enforce-architecture`, `check_traceability`, impact analysis, etc.
3. **Token-budget-aware context Assembly.** `Assembler` does phase-aware context selection under token budgets with coverage reports — purpose-built for feeding agents. Graphify returns scoped subgraphs, not budgeted context.
4. **Hybrid semantic search.** `FusionLayer` blends keyword + embedding similarity. Graphify deliberately refuses embeddings — a strength for pure-deterministic tracing, a weakness for "find me something _like_ this."
5. **In-process TS API.** 91 importers call it as a library. Graphify's only integration surfaces are CLI stdout and an MCP server — neither is an in-process API.
6. **Full ownership.** No external tool version-coupling, no enterprise-tier gating risk, no Python runtime in the harness.

## Integration points (what "replace" would touch)

- 91 non-test files import `@harness-engineering/graph`; the CLI package alone has 50.
- Every harness analysis MCP tool that reads the graph (entropy, constraints, complexity, coupling, anomaly, blast-radius, traceability, task-independence, conflict-prediction) is an adapter over `GraphStore`.
- `saveGraph`/`loadGraph` serialization, `SyncManager` connectors (Jira/Slack/Confluence/CI), and the NLQ surface (`askGraph`) all bind to our node/edge model.

## Technical debt relevant to the decision

- Our `CodeIngestor` is **regex-based**, not AST — the single largest fidelity gap, and the clearest thing Graphify does better. This is where adoption has real leverage.
- We have no human-facing graph visualization; Graphify ships one.
- Provenance is collapsed into a single `confidence` float; we cannot distinguish "read directly" from "inferred."

## Full feature pass (verified against `v8` README, 2026-08-26)

A second exhaustive sweep confirmed Graphify is broader than a code-map. The complete surface:

- **It is also an agent-memory / RAG competitor.** Benchmarked on LOCOMO (recall@10 0.497, QA 45.3%) and **LongMemEval-S (76% QA, "tied with dense RAG")** with 0 LLM credits for graph build. It positions the graph as the thing an assistant queries _instead of_ embeddings-RAG. Relevant to due-diligence: competitive, not dominant, on memory QA — reinforces "don't replace, it's not strictly better."
- **PR-review intelligence.** `graphify prs --triage` (AI-ranked review queue), `--conflicts` (merge-order risk via **shared communities**), `--worktrees` (branch→PR map), `prs <n>` (graph impact of a PR); MCP tools `list_prs`/`get_pr_impact`/`triage_prs`. Overlaps our own PR/impact surface (see Convergent overlaps).
- **9-backend semantic extraction** (Gemini/Claude/claude-cli/OpenAI/DeepSeek/Kimi/Azure/Bedrock/Ollama) for the docs/media pass; code is always AST-only/local.
- **Graph-interop hub.** Exports: `graph.html`, `GRAPH_REPORT.md`, `graph.json`, SVG, **GraphML (Gephi/yEd)**, **Cypher for Neo4j/FalkorDB (+ direct push)**, **Obsidian vault**, agent-crawlable **wiki**, **Mermaid call-flow HTML**.
- **Work-memory / reflection loop.** `save-result` (outcome ∈ useful|dead_end|corrected) → `reflect` → LESSONS.md, lessons tagged **preferred|tentative|contested** (recency-weighted with provenance) and a **"code changed — re-verify"** staleness flag surfaced in `explain`/`query`.
- **Freshness machinery.** `--update` (incremental re-extract of changed files only), `graphify hook install` (post-commit/post-checkout auto-rebuild, AST-only/no API cost), `graphify watch` (live sync), a **git merge driver** that union-merges `graph.json` without conflict markers, and a **512 MiB** graph cap.
- **Distribution breadth.** `graphify install` targets 25+ assistants (Claude Code, Cursor, Codex, Gemini, Copilot, Aider, Kilo, Kiro, Antigravity, …), plus a **`--strict` PreToolUse hook that blocks the first raw source read and redirects the agent to query the graph.**
- **Dependency/infra graph.** Manifest parsing (`pyproject.toml`/`go.mod`/`pom.xml`) → package nodes with `depends_on`; live **PostgreSQL** schema introspection; Rust **Cargo** deps.
- **Cross-project global graph** (`graphify global`) and `graphify add <url>` / `clone <repo>` to pull external papers/videos/repos in.
- **MCP server** with stdio + HTTP transports, `--api-key` auth, `--stateless` for load-balancing — a team-shareable query endpoint.
- **Enterprise tier** (app.graphify.com, YC S26): "always-on" continuous background updating across meetings/docs/code. The OSS `v8` tool is the free floor; continuous-sync is the paid upsell.

## Convergent overlaps (we already do the harness-native version)

Not gaps — flagged so we don't "adopt" what we already have, differently framed:

| Graphify feature                                    | Our equivalent                                                                 | Note                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `prs --conflicts` (merge risk via shared community) | `ConflictPredictor` + `TaskIndependenceAnalyzer` (co-change)                   | Different signal; ours is co-change-based                                                                     |
| `get_pr_impact`                                     | `CascadeSimulator` / `compute_blast_radius`, `get_impact`                      | Ours is probability-weighted BFS                                                                              |
| `save-result`/`reflect` → LESSONS                   | `learning`/`failure`/`execution_outcome` nodes + skill-effectiveness baselines | Convergent validation; **the "code changed — re-verify" staleness flag is the one sharp idea worth stealing** |
| MCP `query_graph`/`shortest_path`                   | `ask_graph`/`query_graph` MCP tools + NLQ                                      | We already expose via the harness MCP surface                                                                 |
| `depends_on` package graph                          | `supply-chain-audit`, `dependency-health`                                      | Different lens; not a model gap                                                                               |

## Consumption path if we ever depended on Graphify

Graphify exposes: CLI (`query`/`path`/`explain` → stdout JSON), an **MCP server** (`query_graph`, `get_node`, `get_neighbors`, `shortest_path`, `get_pr_impact`, `triage_prs`), and raw `graph.json`. The JSON schema is **not formally documented** — brittle to depend on across its unstable `v8` branch.
