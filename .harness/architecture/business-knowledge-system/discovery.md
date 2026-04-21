# Discovery: Business Knowledge System

**Date:** 2026-04-21
**Topic:** Expanding the memory/graph system to include multi-level business knowledge
**Participants:** Chad Warner, Architecture Advisor

---

## Q1: What Problem Are You Solving?

Skills lack business domain context, causing technically correct but business-unaware decisions. The gap is between "what the code does" and "what the business needs."

Current knowledge types are operationally focused:

- Code structure (28 graph node types)
- Operational history (learnings, failures, decisions)
- Session state (terminology, constraints, risks)
- External signals (Jira, Slack, Confluence via connectors)

**Missing:** Why the business exists, what it cares about, what rules govern it, and what strategic direction it's heading.

**Key finding:** ~60-70% of atomic business knowledge can be gleaned from existing codebase signals + external systems. The remaining 30-40% (strategy, revenue, contracts) requires human authoring.

---

## Q2: What Are Your Hard Constraints?

- **Graph infrastructure** — 28 node types, 24 edge types, in-memory GraphStore. Extensible via new types + metadata.
- **MCP protocol** — All skill interaction via MCP tools. New knowledge must be MCP-accessible.
- **Token budgets** — Assembler defaults to 4000 tokens. Knowledge must be retrievable at right granularity.
- **Authority hierarchy** — Session > global > learnings > graph. Business knowledge must slot in appropriately.
- **Existing connectors** — Jira, Slack, Confluence, CI connectors exist but extract data, not knowledge.

---

## Q3: What Are Your Soft Preferences?

**Knowledge hierarchy:** 3-tier model preferred over 5+:

- **Fact** — single assertion with evidence ("Settlement SLA: <2s")
- **Concept** — bounded topic linking multiple facts ("Payment domain")
- **Narrative** — strategic context explaining why and direction

**Extraction approach:** Auto-extract from code + external systems, surface gaps for human enrichment.

**Visual knowledge:** Diagrams, charts, mockups encode dense business knowledge. Three approaches:

1. Diagram-as-code (Mermaid/D2) — parseable, versionable, lowest cost
2. Vision model analysis — works with any visual format, medium cost
3. Tool API integration (Figma, Miro) — highest accuracy, highest cost

---

## Q4: What Have You Already Considered?

### Existing Foundations

- **Session sections** — proto-knowledge (terminology, decisions, constraints) but session-scoped and ephemeral
- **KnowledgeIngestor** — proves ADR/learnings ingestion pattern works
- **External connectors** — bring in Jira/Slack/Confluence but as generic nodes, not knowledge
- **Graph extensibility** — adding node types is a schema change, not a rewrite

### Knowledge Sources Already Available

- **Code signals:** Module names, test descriptions, enum values, validation rules, API paths, error messages
- **Jira:** Acceptance criteria, labels, custom fields, comments, attachments (mostly discarded today)
- **Slack:** Decisions in threads, authority citations, reaction-based consensus (lost today)
- **Confluence:** Structured docs, page hierarchy, labels, attachments (truncated to 2000 chars today)
- **Visual artifacts:** Architecture diagrams, mockups, state machines, ER diagrams (completely ignored today)

### What Connectors Currently Discard

- Jira: comments, attachments, custom fields, epic context, issue type
- Slack: thread structure, reactions, file uploads, referenced documents
- Confluence: page hierarchy, labels, attachments, comments, content >2000 chars
- No GitHub issues/PRs connector exists

---

## Q5: What Does Success Look Like in 6 Months?

**Target:** Skills automatically surface business context for the domains they touch, without being told each time.

**Concrete test:** "When I run the architecture advisor on a feature touching the payment domain, it automatically surfaces PCI compliance as a hard constraint, settlement SLA <2s, and partner API contract requirements."

**Foundation metric:** Business knowledge exists for top 5 domains, is fresh (<30 days), consumed by skills, and doesn't contradict itself.

---

## Additional Discovery: Knowledge Pipeline

A `/harness:knowledge-pipeline` analogous to `/harness:docs-pipeline`:

- Phase 1: EXTRACT — glean knowledge from codebase + external systems
- Phase 2: RECONCILE — compare extracted to stored knowledge
- Phase 3: DETECT — identify drift, gaps, contradictions
- Phase 4: REMEDIATE — surface enrichment prompts for human review
- Convergence loop until drift score falls below threshold

---

## Additional Discovery: Visual Knowledge

The system is entirely text-centric. Visual artifacts (diagrams, mockups, charts) are dense knowledge carriers:

- Architecture diagrams encode domain boundaries, data flow, integration points
- Sequence diagrams encode business processes and actor responsibilities
- Mockups encode user mental models and feature scope
- State machines encode business lifecycles

**Approach:** Diagram-as-code first (parseable), vision model second (broad coverage), tool APIs third (deepest integration).
