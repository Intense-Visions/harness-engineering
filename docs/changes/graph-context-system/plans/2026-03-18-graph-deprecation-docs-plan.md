# Plan: Deprecation & Documentation (Phase 10 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 8
**Estimated time:** 40-60 minutes

## Goal

Create new graph documentation (package README, guides), update critical existing docs to reflect the graph system, and mark OmniContext as deprecated. After this phase, the Unified Knowledge Graph migration is complete.

## Observable Truths (Acceptance Criteria)

1. When `packages/graph/README.md` is examined, it shall contain package overview, API reference, quick start, and dependency list.
2. When `docs/guides/graph-connectors.md` is examined, it shall document connector setup, auth, and configuration for all 4 connectors (Jira, Slack, Confluence, CI).
3. When `docs/guides/graph-context-assembly.md` is examined, it shall document graph-driven context assembly patterns.
4. When `docs/guides/writing-custom-connectors.md` is examined, it shall document the GraphConnector interface and implementation guide.
5. When `AGENTS.md` is examined, it shall reference `packages/graph/` in project structure and graph concepts.
6. When `README.md` is examined, it shall list `packages/graph` in package table and updated MCP tool count.
7. When `agents/skills/README.md` is examined, it shall categorize skills as graph-transformed, graph-enhanced, and graph-enabled.
8. When the ADR checklist is reviewed, all 10 phases shall be marked complete.

## [ADDED] New Documentation

- [ADDED] `packages/graph/README.md` — Package overview, API reference, quick start
- [ADDED] `docs/guides/graph-connectors.md` — Connector setup and configuration guide
- [ADDED] `docs/guides/graph-context-assembly.md` — Context assembly patterns
- [ADDED] `docs/guides/writing-custom-connectors.md` — Custom connector implementation guide

## [MODIFIED] Existing Documentation

- [MODIFIED] `AGENTS.md` — Add graph package and concepts
- [MODIFIED] `README.md` — Add graph to package table, update counts
- [MODIFIED] `agents/skills/README.md` — Categorize skills by graph integration level
- [MODIFIED] ADR-001 — Mark all phases complete

## File Map

```
CREATE packages/graph/README.md
CREATE docs/guides/graph-connectors.md
CREATE docs/guides/graph-context-assembly.md
CREATE docs/guides/writing-custom-connectors.md
MODIFY AGENTS.md (add graph package reference)
MODIFY README.md (add graph to package table)
MODIFY agents/skills/README.md (categorize by graph level)
MODIFY .harness/architecture/graph-context-system/ADR-001.md (mark phases complete)
```

## Tasks

### Task 1: Create packages/graph/README.md

**Depends on:** none
**Files:** packages/graph/README.md

1. Create README with:
   - Package description and purpose
   - Architecture overview (Store, Query, Ingest, Search, Adapters)
   - Quick start (GraphStore, CodeIngestor, ContextQL, FusionLayer)
   - API reference (exported classes and their key methods)
   - Node types and edge types tables
   - Connector list (Jira, Slack, Confluence, CI)
   - Dependencies list

2. Commit: `docs(graph): create package README`

---

### Task 2: Create connector setup guide

**Depends on:** none
**Files:** docs/guides/graph-connectors.md

1. Create guide covering:
   - Overview of connector architecture
   - Configuration in harness.config.json
   - Setup for each connector: Jira, Slack, Confluence, CI (GitHub Actions)
   - Environment variables, auth, filtering options
   - SyncManager usage for incremental sync
   - Troubleshooting common issues

2. Commit: `docs(guides): create graph connector setup guide`

---

### Task 3: Create context assembly guide

**Depends on:** none
**Files:** docs/guides/graph-context-assembly.md

1. Create guide covering:
   - How graph-driven context assembly works
   - Assembler class usage (assembleContext, computeBudget, filterForPhase)
   - MCP tools for context (find_context_for, query_graph, search_similar)
   - Intent-driven assembly patterns
   - Token budget management with graph density
   - Examples for common workflows (code review, planning, debugging)

2. Commit: `docs(guides): create graph context assembly guide`

---

### Task 4: Create custom connector guide

**Depends on:** none
**Files:** docs/guides/writing-custom-connectors.md

1. Create guide covering:
   - GraphConnector interface specification
   - Step-by-step implementation walkthrough
   - HttpClient dependency injection for testing
   - linkToCode utility usage
   - SyncManager registration
   - Testing patterns with mock HTTP client
   - Example: building a custom connector

2. Commit: `docs(guides): create custom connector implementation guide`

---

### Task 5: Update AGENTS.md with graph references

**Depends on:** none
**Files:** AGENTS.md

1. Add `packages/graph/` to project structure section with brief description
2. Add graph concepts to key concepts section (knowledge graph, ContextQL, FusionLayer)
3. Update any context assembly references to mention graph-enhanced mode

4. Commit: `docs: update AGENTS.md with graph system references`

---

### Task 6: Update README.md and agents/skills/README.md

**Depends on:** none
**Files:** README.md, agents/skills/README.md

1. **README.md**:
   - Add `@harness-engineering/graph` to package table with description
   - Update MCP tools count (now 31)
   - Add graph to feature list

2. **agents/skills/README.md**:
   - Add categorization: Graph-Transformed (7), Graph-Enhanced (5), Graph-Enabled (5 new)
   - List new skills in appropriate category

3. Commit: `docs: update README and skills README with graph integration`

---

### Task 7: Mark ADR phases complete and deprecate OmniContext

**Depends on:** none
**Files:** .harness/architecture/graph-context-system/ADR-001.md

1. In the ADR checklist section, change all `- [ ]` to `- [x]` for Phases 1-10
2. Add a "Completion" section at the end noting:
   - All 10 phases completed on 2026-03-18
   - OmniContext is deprecated — harness graph is the single context system
   - Final stats: node types, edge types, connectors, skills, personas

3. Commit: `docs(adr): mark all phases complete, deprecate OmniContext`

---

### Task 8: Final verification

**Depends on:** Tasks 1-7
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `pnpm build --filter @harness-engineering/graph`
2. Run: all test suites
3. Verify all new docs are non-empty and well-structured
4. Verify AGENTS.md, README.md, skills README updated
5. Commit: `chore: verify Phase 10 — Unified Knowledge Graph migration complete`

---

## Dependency Graph

```
Task 1 (graph README) ────→ Task 8 (verify)
Task 2 (connectors guide) →│
Task 3 (assembly guide) ──→│
Task 4 (custom guide) ────→│
Task 5 (AGENTS.md) ───────→│
Task 6 (READMEs) ─────────→│
Task 7 (ADR complete) ────→│
```

**Parallelizable:** All tasks 1-7 are independent.

## Traceability Matrix

| Observable Truth              | Delivered By |
| ----------------------------- | ------------ |
| 1. Graph package README       | Task 1       |
| 2. Connector guide            | Task 2       |
| 3. Context assembly guide     | Task 3       |
| 4. Custom connector guide     | Task 4       |
| 5. AGENTS.md updated          | Task 5       |
| 6. README.md updated          | Task 6       |
| 7. Skills README categorized  | Task 6       |
| 8. ADR phases marked complete | Task 7       |
