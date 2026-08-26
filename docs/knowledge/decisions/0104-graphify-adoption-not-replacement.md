---
number: "0104"
title: Do not replace @harness-engineering/graph with Graphify; port select capabilities instead
date: 2026-08-26
status: accepted
tier: medium
source: docs/architecture/graphify-adoption/
---

# ADR-0104: Do not replace `@harness-engineering/graph` with Graphify; port select capabilities instead

## Context

[Graphify](https://github.com/Graphify-Labs/graphify) (graphify.net / graphify.com) is a widely adopted (~108k GitHub stars, YC S26) knowledge-graph tool. It is a **standalone Python CLI + MCP server** that maps a codebase (plus docs/PDFs/media) into a queryable concept graph an AI assistant queries "instead of grepping," with deterministic tree-sitter AST parsing across 37 language grammars, every edge tagged `EXTRACTED`/`INFERRED`/`AMBIGUOUS`, Leiden community detection, PR-review intelligence, a work-memory/reflection loop, and broad graph-DB interop. It is benchmarked as an agent-memory/RAG competitor (LongMemEval-S 76% QA, "tied with dense RAG"). The OSS `v8` tool is free (Apache-2.0/MIT); continuous "always-on" updating is a proprietary enterprise upsell.

We were asked to determine, as due diligence, what Graphify does stronger/weaker, what to adopt or ignore, and specifically **whether it should replace our `@harness-engineering/graph` package wholesale**.

The decisive constraint is integration depth. `@harness-engineering/graph` is not a code-map — it is the in-process TypeScript **substrate** for the harness's entire analytical surface: a 37-node-type / 29-edge-type unified model spanning code, knowledge (ADR/decision/learning/failure), VCS, observability, **design tokens, business knowledge, requirements/traceability, execution outcomes**, consumed by ~15 analysis adapters (entropy, constraints, complexity, coupling, anomaly, blast-radius, task-independence, conflict-prediction, traceability, feedback) and a token-budget-aware `Assembler`. It is imported by **91 non-test source files across 7 packages** (CLI alone: 50). Graphify has none of that model or those adapters, no in-process TS API, and an undocumented `graph.json` schema on an unstable branch.

Full evidence in `docs/architecture/graphify-adoption/{discovery,analysis,proposal}.md`.

## Decision

**Reject wholesale replacement, and reject any runtime dependency on Graphify (including an optional sidecar).** Keep `@harness-engineering/graph` as the substrate. Instead, port a small set of specific capabilities Graphify does better into our own graph, reimplemented in TypeScript with zero external coupling:

1. A first-class edge **provenance enum** (`EXTRACTED` / `INFERRED` / `AMBIGUOUS`) alongside the existing `confidence` float, set at ingest time.
2. **Community detection** (Leiden/Louvain) with labeled subsystems exposed on nodes.
3. A **`shortestPath(a, b)`** query primitive and an optional human-facing `graph.html` / report exporter.
4. A **"code changed — re-verify" staleness flag** on `learning`/`execution_outcome` nodes (the sharpest idea from Graphify's reflection loop).
5. Optionally, a **"query the graph instead of grepping"** enforcement pattern via our existing `skillHooks` framework (mirroring Graphify's `--strict` PreToolUse hook).

The Graphify **polyglot sidecar** (ingest its `graph.json` for 37-language tree-sitter fidelity) is explicitly **out of scope** for this decision. It remains a possible future experiment only if a concrete polyglot repo proves our regex-based `CodeIngestor` too lossy; it is not adopted now because of the Python-runtime cost, dependency on an undocumented schema, and enterprise-tier drift risk.

## Alternatives considered

- **Option B — polyglot sidecar (`GraphifyIngestor`):** buys multi-language AST fidelity cheaply, our graph stays the substrate. Rejected as the standing decision because it adds a Python runtime and a brittle dependency on an undocumented, fast-moving external schema for a gain (AST breadth) that is not today's pain. Kept as a documented future option, not a commitment.
- **Option C — wholesale replacement (the question asked):** rejected as a category error. It would delete the cross-domain model and adapter layer the harness is built on, break 91 importers across 7 packages, forfeit our semantic `FusionLayer`, and create an existential dependency on an external startup's OSS tier with a proprietary upsell. Graphify is a graph *generator + query server*, not a substitute for our graph *library + analysis platform*.

## Consequences

### Positive

- The harness analytical surface is untouched; no regression risk to entropy/constraints/traceability/blast-radius.
- Provenance and community labels, once ported, flow into our existing adapters for free — a capability Graphify cannot give us because it lacks those adapters.
- Zero new runtime, zero external version-coupling, zero enterprise-tier gating exposure. We own the roadmap.
- A written, evidence-cited record of what we deliberately did and did not adopt.

### Negative

- We forgo Graphify's 37-language tree-sitter fidelity for now; our `CodeIngestor` stays regex-based beyond TS/JS. — *Mitigation:* the sidecar (Option B) remains available if a real polyglot need emerges; revisit then.
- Porting community detection (Leiden) and the exporter is net-new engineering. — *Mitigation:* sequence provenance first (highest leverage, smallest surface); defer viz/community as separate items.

### Neutral

- Several Graphify features are convergent with existing harness capability (PR-conflict prediction, impact analysis, MCP query surface, reflection/learnings) — validating our direction rather than exposing gaps.
- This ADR was authored via the architecture-advisor topic-folder flow and landed on branch `analysis/graphify-adoption`; the canonical `manage_adr` MCP tool was not used because it is not git-worktree-aware (tracked separately as a filed bug).

## Action items

- [ ] Add `provenance` to the edge schema in `packages/graph/src/types.ts` and set it in `CodeIngestor`/`TopologicalLinker` — owner: graph maintainer.
- [ ] Add a community-detection pass over `GraphStore` with labeled nodes — owner: graph maintainer.
- [ ] Add `shortestPath(a,b)` to `ContextQL` + surface via NLQ/CLI — owner: graph maintainer.
- [ ] Add a "code changed — re-verify" staleness flag to `learning`/`execution_outcome` nodes — owner: graph maintainer.
- [ ] File a roadmap item for the optional Graphify sidecar experiment, gated on a demonstrated polyglot fidelity gap — owner: architecture.
