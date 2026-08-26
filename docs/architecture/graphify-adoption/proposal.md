# Proposal: how to relate to Graphify

Three options. The headline question — *"use it wholesale as a replacement for the graph package?"* — is Option C, presented honestly and rejected on evidence.

---

### Option A: Cherry-pick capabilities into our graph (no runtime dependency)

**Summary.** Keep `@harness-engineering/graph` as the substrate. Port the specific ideas Graphify does better, reimplemented in TS: edge **provenance enum** (`EXTRACTED`/`INFERRED`/`AMBIGUOUS`), **community detection** (Leiden/Louvain), a **shortest-path** query primitive, and the "**every edge explained**" discipline plus an optional `graph.html`/report exporter.

**How it works:**
1. Add a `provenance` field alongside `confidence` in the edge schema (`types.ts`); set it at ingest time (AST-explicit → EXTRACTED, resolver-derived → INFERRED).
2. Add a community-detection pass over `GraphStore` and expose labels on nodes.
3. Add `shortestPath(a, b)` to `ContextQL`; surface via NLQ + a CLI verb.
4. Add an optional exporter that emits a human-facing viz/report from any `GraphStore`.

**Pros:**
- No Python runtime, no external version-coupling, stays in-process — respects the 91-importer reality.
- Provenance and community labels flow into *our* adapters (entropy, traceability, blast-radius) for free — Graphify's don't.
- We own the roadmap; no enterprise-tier gating risk.

**Cons:**
- Reimplementation effort — medium — we don't get 37 tree-sitter grammars for free (see Option B for that specific gap). *Mitigation:* scope to provenance + community + path first; defer AST breadth.
- Leiden in TS is non-trivial — medium. *Mitigation:* start with Louvain or a small vetted lib.

**Effort:** Medium (incremental, per-capability PRs). **Risk:** Low. **Best when:** the goal is durable capability we control — which the due-diligence + 91-importer facts point to.

---

### Option B: Polyglot sidecar — ingest Graphify's `graph.json` as an optional code-AST source

**Summary.** Leave the substrate alone; add an **optional** `GraphifyIngestor` adapter that shells out to Graphify (or reads a pre-generated `graph.json`) and maps its code nodes/edges into our model — buying 37-language tree-sitter fidelity + provenance without reimplementing a parser. Opt-in, degrades gracefully when Graphify is absent.

**How it works:**
1. New adapter runs `graphify` (if installed) over the repo, reads `graphify-out/graph.json`.
2. Maps Graphify code nodes/edges → our `file`/`function`/`class` nodes + `imports`/`calls` edges, carrying the provenance tag.
3. Our adapters/analyses consume the enriched `GraphStore` unchanged.

**Pros:**
- Best AST fidelity across many languages with **zero parser maintenance** on our side.
- Our graph stays the substrate and analysis layer; Graphify is a pluggable enrichment, never the core.
- "Polyglot OK" answer makes this viable.

**Cons:**
- **Python runtime dependency** for the enriched path — high operational cost (packaging, air-gap, CI). — *Mitigation:* strictly opt-in; TS regex path remains the default.
- Depends on Graphify's **undocumented `graph.json` schema** on an unstable `v8` branch — medium/high brittleness. — *Mitigation:* pin a version; contract-test the mapping.
- Only helps the **code-graph slice** — nothing for our knowledge/design/business/traceability model.
- Enterprise-tier drift risk: continuous-update features live behind the paid cloud.

**Effort:** Medium. **Risk:** Medium. **Best when:** we have real polyglot repos where regex extraction is demonstrably too lossy and the language matters more than owning the pipeline.

---

### Option C: Wholesale replacement (the question asked) — REJECTED

**Summary.** Delete `@harness-engineering/graph`; make Graphify the graph.

**Why it fails (honest cons):**
- **Category mismatch — high.** Graphify is a code+docs concept-graph generator with a CLI/MCP surface. It has **no** design-token / business-knowledge / requirement-traceability / execution-outcome model, **no** analysis adapters, **no** token-budget Assembler, and **no** in-process TS API. Replacing our library with it deletes the substrate that `detect_entropy`, `enforce-architecture`, `check_traceability`, `compute_blast_radius`, etc. are built on.
- **Blast radius — high.** 91 non-test importers across 7 packages (50 in `cli`) bind to our node/edge model and TS API. All would need rewriting against Graphify's undocumented JSON + MCP tools.
- **Strategic coupling — high.** Existential dependency on an external YC startup's OSS tier, with an explicit proprietary enterprise upsell for the always-on features.
- **Loses our differentiators — medium.** Semantic `FusionLayer` search and the unified cross-domain model both vanish.

**Effort:** Large (a rewrite, not an adoption). **Risk:** High. **Best when:** never, at our current integration depth.

---

## Comparison matrix

| Criterion        | A: Cherry-pick | B: Sidecar | C: Wholesale replace |
| ---------------- | -------------- | ---------- | -------------------- |
| Complexity       | Low–Med        | Med        | Very High            |
| AST fidelity gain| Partial        | **Full (37 langs)** | Full           |
| Keeps our model  | **Yes**        | **Yes**    | No                   |
| Keeps adapters   | **Yes**        | **Yes**    | No                   |
| Runtime added    | None           | Python     | Python + loses TS API|
| External coupling| None           | Medium     | Existential          |
| Effort to build  | Medium         | Medium     | Large                |
| Effort to change | Low            | Medium     | High                 |
| Risk             | **Low**        | Medium     | High                 |
| Fits 91-importer reality | **Yes** | Yes        | No                   |

## Adopt / ignore (post deep-pass)

**Adopt (port into our graph, no dependency):**
1. **EXTRACTED / INFERRED / AMBIGUOUS provenance enum** on edges — highest leverage; flows into every adapter.
2. **Community detection** (Leiden/Louvain) with labeled subsystems.
3. **`shortestPath(a,b)`** query primitive + a human-facing `graph.html`/report exporter.
4. **The "code changed — re-verify" staleness flag** on learnings — the single sharpest idea from their reflection loop; small, high-value addition to our `learning`/`execution_outcome` nodes.
5. **"Query the graph instead of grepping" enforcement** — their `--strict` PreToolUse hook is a behavioral pattern we can now express via our own `skillHooks` framework.

**Ignore (not our need / we already have it):**
- The "no embeddings" dogma — keep our semantic `FusionLayer`.
- Multi-modal media/PDF/video ingest and the 9 LLM extraction backends.
- Graph-DB interop exports (Neo4j/FalkorDB/GraphML/Obsidian/Mermaid) — no consumer today.
- Cross-project global graph, `add <url>`/`clone`, live PostgreSQL/Cargo introspection.
- The enterprise "always-on" cloud tier.
- PR-conflict-via-community and `get_pr_impact` — we already have `ConflictPredictor` + `compute_blast_radius` (convergent, not a gap).

## Recommendation

**Do not replace wholesale (Option C is a category error given 91 importers and the adapter layer).**

Lead with **Option A**: port provenance + community detection + shortest-path + the "explain every edge"/viz discipline into our graph as durable, owned capability. These flow into our existing adapters immediately and carry zero external coupling.

Hold **Option B** as an *optional, opt-in follow-on experiment* — the sidecar is the only way to get 37-language tree-sitter fidelity cheaply, but its Python runtime + undocumented-schema brittleness make it wrong as a default or a dependency. Reach for it only if a concrete polyglot repo proves regex extraction too lossy.

> If the single most valuable thing turns out to be multi-language AST accuracy (not provenance/community), the ranking flips toward B-first. Confirm which capability gap actually hurts today before sequencing.
