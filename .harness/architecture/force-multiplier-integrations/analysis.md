# Analysis: Force-Multiplier Integrations

## Research Summary

Researched 25+ tools across 7 categories, evaluated against harness's existing architecture
(41 MCP tools, 4 graph connectors, 4 ingestors, 2 platforms, connector interface pattern).

## Ecosystem Context (March 2026)

- **MCP is now the standard.** Linux Foundation governed (AAIF), 12,230+ public servers, 97M+ SDK downloads.
  Native in ChatGPT, Claude, Gemini, VS Code, Cursor, JetBrains. OAuth 2.1 mandated.
- **MCP gateways emerging.** Docker MCP Gateway, Traefik Hub, Kong, Lunar.dev MCPX — enabling
  orchestration of multiple MCP servers behind a single endpoint.
- **Knowledge graph MCP servers exist.** Neo4j, Graphiti (Zep), Memgraph, CodeGraphContext —
  harness's LokiJS graph could be exposed the same way.

## Tool Evaluation Matrix

### Tier 1: High-Value, Low-Friction Integrations

| Tool           | Category      | API                      | MCP                          | Storage          | Why Force-Multiplier                                                                    |
| -------------- | ------------- | ------------------------ | ---------------------------- | ---------------- | --------------------------------------------------------------------------------------- |
| **Obsidian**   | Knowledge     | Filesystem + REST plugin | 5+ servers                   | Local markdown   | Bidirectional sync with harness graph; developers already use it; zero cloud dependency |
| **Perplexity** | AI Research   | Full REST (Sonar)        | Official (4 tools)           | Cloud            | Gives agents real-time web knowledge — biggest capability gap filler                    |
| **Mermaid**    | Visualization | OSS library              | Multiple community           | Text in markdown | Agents write it natively; lives in repo; zero friction                                  |
| **Linear**     | Project Mgmt  | Full GraphQL + webhooks  | Official (expanded Feb 2026) | Cloud            | Modern Jira alternative with superior API; free tier with API access                    |

### Tier 2: High-Value, Medium-Friction Integrations

| Tool           | Category      | API                      | MCP                   | Storage       | Why Force-Multiplier                                           |
| -------------- | ------------- | ------------------------ | --------------------- | ------------- | -------------------------------------------------------------- |
| **Tana**       | Knowledge     | Local API (Jan 2026)     | Official local MCP    | Cloud + local | Structured supertags map to typed graph entities; official MCP |
| **Eraser.io**  | Visualization | AI diagramming API       | MCP with token auth   | Cloud         | Polished architecture diagrams from code/descriptions          |
| **NotebookLM** | Research      | Enterprise only ($9/mo)  | Community (fragile)   | Cloud         | Powerful synthesis but fragile integration surface             |
| **Nanobanana** | Visual Gen    | Gemini API               | Community MCP servers | Cloud         | Architecture visualizations, infographics from graph data      |
| **Raycast**    | Distribution  | Extension API (React/TS) | MCP client            | Local (macOS) | Distribution surface for harness on macOS                      |

### Tier 3: Evaluate Later

| Tool              | Category      | Notes                                                 |
| ----------------- | ------------- | ----------------------------------------------------- |
| **ReadMe.io**     | Documentation | Built-in MCP per project; good for API doc generation |
| **Roam Research** | Knowledge     | Official MCP; graph structure but cloud-only          |
| **Mem.ai**        | Knowledge     | Official MCP; semantic search over agent memory       |
| **tldraw**        | Visualization | Official MCP app (March 2026); interactive canvas     |
| **Warp**          | Terminal      | MCP client (experimental); consumes harness tools     |

### Not Recommended

| Tool              | Category  | Reason                                                       |
| ----------------- | --------- | ------------------------------------------------------------ |
| **Heptabase**     | Knowledge | No public API; MCP is write-only                             |
| **Reflect**       | Knowledge | Community MCP only; E2E encrypted limits programmatic access |
| **Elicit**        | Research  | Internal-use-only license; no MCP                            |
| **Consensus**     | Research  | Application-only API; hard to access                         |
| **Amazon Q/Kiro** | IDE       | Competing paradigm, not complementary                        |

## Integration Architecture Patterns

### Pattern A: MCP Peer (Consume External MCP Servers)

Harness agents connect to external MCP servers alongside the harness MCP server.
The agent orchestrates between them.

```
Agent (Claude Code / Gemini CLI)
  ├── harness MCP server (41 tools)
  ├── Obsidian MCP server (vault read/write)
  ├── Perplexity MCP server (web search)
  └── Linear MCP server (issue tracking)
```

**Pros:** Zero code changes to harness; each tool is independent; follows MCP standard.
**Cons:** No deep graph integration; agent must manually coordinate; context window pressure.

### Pattern B: Graph Connector (Ingest Into Harness Graph)

External tools feed data into harness's knowledge graph via new GraphConnector implementations.
Harness agents get enriched context automatically.

```
External Tools → GraphConnectors → GraphStore → Harness Skills/Agents
  ├── ObsidianConnector (parse vault markdown, wikilinks, frontmatter)
  ├── LinearConnector (issues, projects, cycles)
  └── PerplexityConnector (cached research results)
```

**Pros:** Deep integration; agents get enriched context without extra tool calls; single query interface.
**Cons:** More implementation work; sync complexity; stale data risk.

### Pattern C: Bidirectional Bridge (Graph ↔ External Tool)

Harness graph syncs bidirectionally with external tools. Harness artifacts (ADRs, learnings,
roadmap) push to external tools; external tool data pulls into graph.

```
Harness Graph ←→ Bridge ←→ External Tool
  ├── Obsidian Bridge (graph → vault notes; vault notes → graph nodes)
  ├── Linear Bridge (roadmap features → Linear issues; issue status → roadmap)
  └── Mermaid Bridge (graph topology → auto-generated diagrams in docs/)
```

**Pros:** Maximum value; keeps both sides in sync; compounds over time.
**Cons:** Highest complexity; conflict resolution; maintenance burden.

## Compounding Effects

The real force-multiplier is **integrations feeding each other**:

1. **Perplexity** researches a topic → results feed into **Obsidian** vault
2. **Obsidian** vault ingested into harness **graph** → enriches agent context
3. Agent produces ADR/learnings → pushed back to **Obsidian** vault
4. Agent generates architecture diagram → **Mermaid** in repo + **Eraser.io** for polished version
5. Roadmap features sync to **Linear** → team tracks progress
6. **Nanobanana** generates visual assets from graph data → embedded in docs

This creates a **knowledge flywheel**: research → knowledge → context → better agent output → more knowledge.
