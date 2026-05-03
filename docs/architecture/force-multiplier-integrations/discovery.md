# Discovery: Force-Multiplier Integrations

## 1. What problem are we solving?

Harness currently operates as a **closed loop** — agents work within the codebase using skills, constraints, and a knowledge graph, but the intelligence stays local. The bottleneck is **context richness**: agents make better decisions when they have more signal about intent, design rationale, prior art, and cross-project patterns. Today's graph ingests code, git, Jira, Slack, Confluence, and CI — but misses the broader knowledge ecosystem where developers actually think and research.

Two sides of the problem:

- **Inbound context:** Agents lack access to research notes, design explorations, competitive analysis, brainstorm artifacts, and accumulated institutional knowledge that lives _outside_ the repo.
- **Outbound intelligence:** Harness produces valuable artifacts (ADRs, learnings, roadmaps, review findings) that could amplify developer understanding if surfaced in the right place at the right time — but they stay in `.harness/` and `docs/`.

## 2. What are the hard constraints?

- **MCP-native:** Any integration must work through the MCP protocol or the existing connector interface. No proprietary IDE plugins.
- **Platform-agnostic:** Must work with both Claude Code and Gemini CLI (and future platforms).
- **Credential safety:** All secrets via environment variables, never config files.
- **Privacy-first:** User controls what data leaves the machine. No silent cloud uploads.
- **Connector contract:** External integrations follow `GraphConnector` interface (name, source, ingest method).
- **No new runtimes:** Must work within Node.js ecosystem (the monorepo stack).

## 3. What are the soft preferences?

- Tools with APIs or file-based sync preferred over browser-only tools.
- Open-source or tools with generous free tiers preferred.
- Tools developers already use > niche-but-powerful tools nobody knows.
- Bidirectional sync preferred over one-way ingestion.
- Integrations that compound (tools feeding each other) preferred over isolated connectors.

## 4. What has already been considered?

**User-mentioned:**

- **Nanobanana** — AI-powered research/knowledge tool
- **NotebookLM** — Google's research assistant that synthesizes documents into interactive knowledge
- **Obsidian** — Local-first knowledge management with graph visualization and plugin ecosystem

**Already implemented:**

- Jira, Slack, Confluence, GitHub Actions connectors
- MCP server with 41 tools
- Interaction surface abstraction for cross-platform support
- Knowledge graph with 4 ingestors (code, git, knowledge, design)

**Research-identified (not yet integrated):**

- GSD v2 context pipeline patterns
- CodeRabbit review context ratios
- Kiro spec-driven development patterns

## 5. What does success look like in 6 months?

- A developer using harness has their _entire knowledge ecosystem_ feeding agent context — not just the codebase, but their research notes, design explorations, competitive analysis, and institutional memory.
- Harness-produced artifacts (ADRs, learnings, roadmap, review findings) are automatically surfaced where the developer already works — in their knowledge base, their note-taking tool, their research environment.
- The feedback loop between "human thinks" and "agent executes" has fewer blind spots because context flows freely between the tools.
- New team members onboard faster because harness + knowledge tools create a self-documenting, queryable institutional memory.
