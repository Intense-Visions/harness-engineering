# Plan: New Skills & Personas (Phase 8 of 10)

**Date:** 2026-03-18
**Spec:** .harness/architecture/graph-context-system/ADR-001.md
**Estimated tasks:** 10
**Estimated time:** 40-60 minutes

## Goal

Create 5 new graph-powered skills (impact-analysis, dependency-health, hotspot-detector, test-advisor, knowledge-mapper), 2 new personas (Graph Maintainer, Codebase Health Analyst), and update 3 existing personas (Architecture Enforcer, Documentation Maintainer, Entropy Cleaner) to reference graph skills. These are all documentation/configuration artifacts (SKILL.md, skill.yaml, persona YAML) — no new TypeScript code needed since the skills use existing graph MCP tools.

## Observable Truths (Acceptance Criteria)

1. When `agents/skills/claude-code/harness-impact-analysis/` is examined, it shall contain SKILL.md and skill.yaml with graph-based impact analysis workflow.
2. When `agents/skills/claude-code/harness-dependency-health/` is examined, it shall contain SKILL.md and skill.yaml with graph-based dependency health analysis.
3. When `agents/skills/claude-code/harness-hotspot-detector/` is examined, it shall contain SKILL.md and skill.yaml with co-change hotspot detection.
4. When `agents/skills/claude-code/harness-test-advisor/` is examined, it shall contain SKILL.md and skill.yaml with graph-based test selection.
5. When `agents/skills/claude-code/harness-knowledge-mapper/` is examined, it shall contain SKILL.md and skill.yaml with auto-generated knowledge map workflow.
6. When `agents/personas/graph-maintainer.yaml` is examined, it shall define a persona for graph freshness and data quality.
7. When `agents/personas/codebase-health-analyst.yaml` is examined, it shall define a persona for proactive structural analysis.
8. When the 3 existing persona YAMLs are reviewed, they shall reference new graph skills alongside existing ones.
9. `pnpm build` succeeds (no breakage from new files).

## [ADDED] New Artifacts

- [ADDED] `harness-impact-analysis` skill — graph-based "if I change X, what breaks?"
- [ADDED] `harness-dependency-health` skill — hub/orphan/cycle/deep-chain detection
- [ADDED] `harness-hotspot-detector` skill — co-change analysis from git + graph
- [ADDED] `harness-test-advisor` skill — graph-based "what tests should I run?"
- [ADDED] `harness-knowledge-mapper` skill — auto-generated knowledge maps from graph
- [ADDED] `graph-maintainer` persona — graph freshness, connector health, data quality
- [ADDED] `codebase-health-analyst` persona — proactive structural analysis

## [MODIFIED] Changes to Existing Artifacts

- [MODIFIED] `architecture-enforcer.yaml` — add `harness-dependency-health` skill
- [MODIFIED] `documentation-maintainer.yaml` — add `harness-knowledge-mapper` skill
- [MODIFIED] `entropy-cleaner.yaml` — add `harness-hotspot-detector`, `harness-impact-analysis` skills

## File Map

```
CREATE agents/skills/claude-code/harness-impact-analysis/SKILL.md
CREATE agents/skills/claude-code/harness-impact-analysis/skill.yaml
CREATE agents/skills/claude-code/harness-dependency-health/SKILL.md
CREATE agents/skills/claude-code/harness-dependency-health/skill.yaml
CREATE agents/skills/claude-code/harness-hotspot-detector/SKILL.md
CREATE agents/skills/claude-code/harness-hotspot-detector/skill.yaml
CREATE agents/skills/claude-code/harness-test-advisor/SKILL.md
CREATE agents/skills/claude-code/harness-test-advisor/skill.yaml
CREATE agents/skills/claude-code/harness-knowledge-mapper/SKILL.md
CREATE agents/skills/claude-code/harness-knowledge-mapper/skill.yaml
CREATE agents/personas/graph-maintainer.yaml
CREATE agents/personas/codebase-health-analyst.yaml
MODIFY agents/personas/architecture-enforcer.yaml
MODIFY agents/personas/documentation-maintainer.yaml
MODIFY agents/personas/entropy-cleaner.yaml
```

## Tasks

### Task 1: Create harness-impact-analysis skill

**Depends on:** none
**Files:** agents/skills/claude-code/harness-impact-analysis/SKILL.md, skill.yaml

1. Create `skill.yaml`:
   - name: harness-impact-analysis
   - cognitive_mode: analytical-reporter
   - triggers: on_pr, manual
   - type: rigid
   - tools: Bash, Read, Glob, Grep

2. Create `SKILL.md` with workflow:
   - **Purpose**: Answer "if I change X, what breaks?"
   - **Phase 1: Identify Changes** — Parse diff or accept file list
   - **Phase 2: Graph Impact Query** — For each changed file, use `get_impact` MCP tool to find affected tests, docs, downstream code
   - **Phase 3: Risk Assessment** — Rank by graph distance (direct → transitive), compute impact score
   - **Phase 4: Report** — Structured output: affected modules, tests to run, docs to update, downstream consumers
   - Include graph tool usage examples: `query_graph`, `get_impact`, `get_relationships`

3. Commit: `feat(skills): create harness-impact-analysis skill`

---

### Task 2: Create harness-dependency-health skill

**Depends on:** none
**Files:** agents/skills/claude-code/harness-dependency-health/SKILL.md, skill.yaml

1. Create `skill.yaml`:
   - name: harness-dependency-health
   - cognitive_mode: analytical-reporter
   - triggers: scheduled, manual
   - type: rigid

2. Create `SKILL.md` with workflow:
   - **Purpose**: Analyze structural health and surface problems before they become incidents
   - **Phase 1: Graph Metrics** — Query graph for:
     - Hub detection: nodes with high fan-in (>10 inbound edges)
     - Orphan detection: unreachable file nodes
     - Cycle detection: circular edge paths via `check_dependencies`
     - Deep chain detection: import chains >N hops
   - **Phase 2: Health Score** — Compute weighted score (0-100) based on metrics
   - **Phase 3: Recommendations** — Specific actions: split hubs, remove orphans, break cycles
   - **Phase 4: Report** — Structured health report with trends if prior runs exist
   - Include graph tool usage: `query_graph`, `get_relationships`, `check_dependencies`

3. Commit: `feat(skills): create harness-dependency-health skill`

---

### Task 3: Create harness-hotspot-detector skill

**Depends on:** none
**Files:** agents/skills/claude-code/harness-hotspot-detector/SKILL.md, skill.yaml

1. Create `skill.yaml`:
   - name: harness-hotspot-detector
   - cognitive_mode: analytical-reporter
   - triggers: scheduled, manual
   - type: rigid

2. Create `SKILL.md` with workflow:
   - **Purpose**: Identify modules representing structural risk via co-change analysis
   - **Phase 1: Co-Change Analysis** — Query graph for `co_changes_with` edges from GitIngestor, identify file pairs that always change together but live apart
   - **Phase 2: Churn Analysis** — Find files with highest commit frequency (commit nodes), correlate with module structure
   - **Phase 3: Coupling Detection** — Detect high logical coupling (co-change) with low structural coupling (no direct imports), flag as hidden dependencies
   - **Phase 4: Report** — Ranked hotspot list with risk scores: churn rate, coupling score, change frequency
   - Include graph tool usage: `query_graph` (co_changes_with edges), `get_relationships`, `search_similar`

3. Commit: `feat(skills): create harness-hotspot-detector skill`

---

### Task 4: Create harness-test-advisor skill

**Depends on:** none
**Files:** agents/skills/claude-code/harness-test-advisor/SKILL.md, skill.yaml

1. Create `skill.yaml`:
   - name: harness-test-advisor
   - cognitive_mode: advisory-guide
   - triggers: on_pr, manual
   - type: flexible

2. Create `SKILL.md` with workflow:
   - **Purpose**: Answer "I changed these files — what tests should I run?"
   - **Phase 1: Parse Changes** — Accept diff or file list
   - **Phase 2: Test Discovery** — For each changed file, use `get_impact` to find test files connected via imports/calls edges. Rank by graph distance (direct importers first, transitive second)
   - **Phase 3: Priority** — Output three tiers: Must Run (direct test coverage), Should Run (transitive), Could Run (related modules)
   - **Phase 4: Command** — Generate actual test commands: `npx vitest run <file1> <file2>`
   - Include graph tool usage: `get_impact`, `query_graph`, `find_context_for`

3. Commit: `feat(skills): create harness-test-advisor skill`

---

### Task 5: Create harness-knowledge-mapper skill

**Depends on:** none
**Files:** agents/skills/claude-code/harness-knowledge-mapper/SKILL.md, skill.yaml

1. Create `skill.yaml`:
   - name: harness-knowledge-mapper
   - cognitive_mode: constructive-architect
   - triggers: on_commit, scheduled, manual
   - type: rigid

2. Create `SKILL.md` with workflow:
   - **Purpose**: Auto-generate always-current knowledge maps from graph topology
   - **Phase 1: Graph Survey** — Query graph for module structure, entry points, layer hierarchy
   - **Phase 2: Generate Map** — Use `find_context_for` to build structured markdown: Repository Structure, Module Dependencies, Entry Points, API Surface
   - **Phase 3: Coverage Audit** — Use `check_docs` to identify code nodes without `documents` edges. List undocumented modules.
   - **Phase 4: Output** — Generate AGENTS.md-compatible content, or standalone knowledge map document
   - Include graph tool usage: `query_graph`, `search_similar`, `find_context_for`, `check_docs`

3. Commit: `feat(skills): create harness-knowledge-mapper skill`

---

### Task 6: Create Graph Maintainer persona

**Depends on:** Tasks 2, 5
**Files:** agents/personas/graph-maintainer.yaml

1. Create persona YAML following existing format:

   ```yaml
   version: 1
   name: Graph Maintainer
   description: Keeps the knowledge graph fresh, monitors connector health, and ensures data quality
   role: Re-scan codebase, sync external connectors, detect graph anomalies, maintain graph freshness
   skills:
     - harness-dependency-health
     - harness-knowledge-mapper
     - validate-context-engineering
   commands:
     - scan
     - ingest
     - graph status
   triggers:
     - event: scheduled
       cron: '0 4 * * *'
     - event: on_commit
       conditions:
         branches: ['main']
     - event: manual
   config:
     severity: warning
     autoFix: false
     timeout: 600000
   outputs:
     agents-md: false
     ci-workflow: true
     runtime-config: true
   ```

2. Commit: `feat(personas): create Graph Maintainer persona`

---

### Task 7: Create Codebase Health Analyst persona

**Depends on:** Tasks 1, 2, 3
**Files:** agents/personas/codebase-health-analyst.yaml

1. Create persona YAML:

   ```yaml
   version: 1
   name: Codebase Health Analyst
   description: Proactively identifies structural problems, coupling risks, and architectural drift
   role: Run health checks, detect hotspots, analyze impact, surface risks before they become incidents
   skills:
     - harness-hotspot-detector
     - harness-dependency-health
     - harness-impact-analysis
     - cleanup-dead-code
   commands:
     - graph status
     - check-deps
   triggers:
     - event: scheduled
       cron: '0 6 * * 1'
     - event: on_pr
       conditions:
         min_files: 10
     - event: manual
   config:
     severity: warning
     autoFix: false
     timeout: 600000
   outputs:
     agents-md: false
     ci-workflow: true
     runtime-config: true
   ```

2. Commit: `feat(personas): create Codebase Health Analyst persona`

---

### Task 8: Update 3 existing personas with graph skills

**Depends on:** Tasks 1-5
**Files:** agents/personas/architecture-enforcer.yaml, documentation-maintainer.yaml, entropy-cleaner.yaml

1. **architecture-enforcer.yaml**: Add `harness-dependency-health` to skills list.

2. **documentation-maintainer.yaml**: Add `harness-knowledge-mapper` to skills list.

3. **entropy-cleaner.yaml**: Add `harness-hotspot-detector` and `harness-impact-analysis` to skills list.

4. Commit: `feat(personas): update existing personas with graph-powered skills`

---

### Task 9: Regenerate slash commands

**Depends on:** Tasks 1-5
**Files:** none (command output)

1. Run: `harness generate-slash-commands` (if available) to pick up new skills.
2. If not available, verify manually that the new skill directories contain valid SKILL.md + skill.yaml.
3. Commit: skip if no file changes

---

### Task 10: Build and verification

**Depends on:** Tasks 1-9
**Files:** none (verification only)

[checkpoint:human-verify]

1. Verify all 5 new skill directories exist with SKILL.md + skill.yaml
2. Verify both new persona YAMLs exist
3. Verify 3 existing persona YAMLs are updated
4. Run: `pnpm build` — verify no breakage
5. Run: graph + core + MCP tests — verify no regressions
6. Commit: `chore: verify Phase 8 build and tests`

---

## Dependency Graph

```
Task 1 (impact-analysis) ──→ Task 7 (health analyst persona) ──→ Task 8 (update personas) ──→ Task 9 ──→ Task 10
Task 2 (dependency-health) ──→ Task 6 (graph maintainer) ──→│
                            ──→ Task 7 ──→│
Task 3 (hotspot-detector) ──→ Task 7 ──→│
Task 4 (test-advisor) ──→ Task 9 ──→ Task 10
Task 5 (knowledge-mapper) ──→ Task 6 ──→│
```

**Parallelizable:**

- Tasks 1, 2, 3, 4, 5 (all independent — different skill directories)
- Tasks 6, 7 (after their dependencies — different persona files)

## Traceability Matrix

| Observable Truth                   | Delivered By |
| ---------------------------------- | ------------ |
| 1. harness-impact-analysis skill   | Task 1       |
| 2. harness-dependency-health skill | Task 2       |
| 3. harness-hotspot-detector skill  | Task 3       |
| 4. harness-test-advisor skill      | Task 4       |
| 5. harness-knowledge-mapper skill  | Task 5       |
| 6. Graph Maintainer persona        | Task 6       |
| 7. Codebase Health Analyst persona | Task 7       |
| 8. Existing personas updated       | Task 8       |
| 9. Build succeeds                  | Task 10      |
