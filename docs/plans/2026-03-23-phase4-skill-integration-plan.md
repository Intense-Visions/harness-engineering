# Plan: Phase 4 -- Skill Integration for Task Independence Detection

**Date:** 2026-03-23
**Spec:** docs/changes/task-independence-detection/proposal.md
**Estimated tasks:** 1
**Estimated time:** 3 minutes

## Goal

The harness-parallel-agents skill references `check_task_independence` as the primary independence verification method in Step 1, with the manual 5-step checklist preserved as fallback documentation.

## Observable Truths (Acceptance Criteria)

1. When an agent reads SKILL.md Step 1, the system shall instruct it to call `check_task_independence` as the **primary** independence verification method before any manual checking.
2. The manual 5-step checklist (file overlap, state overlap, import graph overlap, etc.) shall remain in SKILL.md as explicitly labeled fallback documentation under a "Manual Fallback" subsection.
3. The "Graph-Enhanced Context" section shall be updated to reference `check_task_independence` as the automated tool, replacing the `query_graph` + `get_impact` manual approach as the primary method.
4. The example section shall include a `check_task_independence` tool call demonstrating the primary workflow.
5. `harness validate` shall pass after all changes.
6. The gemini-cli skill (a symlink to claude-code) shall require no separate update.
7. skill.yaml shall NOT be modified (MCP tools are not listed in `tools:` -- confirmed by codebase convention; no skill.yaml in the project lists MCP tool names).

## File Map

- MODIFY `agents/skills/claude-code/harness-parallel-agents/SKILL.md`

**Not modified (with rationale):**

- `agents/skills/claude-code/harness-parallel-agents/skill.yaml` -- The `tools:` list contains agent-native tools (Bash, Read, Write, etc.), not MCP tools. No skill.yaml in the codebase lists MCP tool names. `check_task_independence` is available to agents via the MCP server directly.
- `agents/skills/gemini-cli/harness-parallel-agents/` -- This is a symlink to `../claude-code/harness-parallel-agents`, so the claude-code update propagates automatically.

## Tasks

### Task 1: Update SKILL.md to reference check_task_independence as primary method

**Depends on:** none (Phase 2 MCP tool and Phase 3 tests are complete)
**Files:** `agents/skills/claude-code/harness-parallel-agents/SKILL.md`

1. Open `agents/skills/claude-code/harness-parallel-agents/SKILL.md`

2. **Replace Step 1 content** (lines 19-31 approximately). The new Step 1 should:

   a. **Primary method:** Call `check_task_independence` with the candidate tasks and their file lists. Present the tool call format and explain the output (conflict matrix, parallel groups, verdict).

   b. **Fallback subsection:** Keep the manual 5-step checklist under a clearly labeled "#### Manual Fallback (when MCP tool is unavailable)" heading. The five steps (list candidates, check file overlap, check state overlap, check import graph overlap, when in doubt run serially) remain intact but are demoted from primary to fallback.

3. **Update the "Graph-Enhanced Context" section** (lines 33-40). Replace the `query_graph` + `get_impact` manual approach with a reference to `check_task_independence`, which internally uses the graph for expansion. Keep `query_graph` and `get_impact` as supplementary tools for custom queries, but note that `check_task_independence` is the preferred single-call method.

4. **Update the first example** (lines 113-129) to show the `check_task_independence` tool call workflow:

   ````
   **Step 1: Verify independence**

   Call `check_task_independence`:
   ```json
   {
     "path": ".",
     "tasks": [
       { "id": "task-4", "files": ["src/services/user/service.ts", "src/services/user/service.test.ts", "src/types/user.ts"] },
       { "id": "task-5", "files": ["src/services/product/service.ts", "src/services/product/service.test.ts", "src/types/product.ts"] },
       { "id": "task-6", "files": ["src/services/notification/service.ts", "src/services/notification/service.test.ts", "src/types/notification.ts"] }
     ]
   }
   ````

   Result:

   ```json
   {
     "analysisLevel": "graph-expanded",
     "groups": [["task-4", "task-5", "task-6"]],
     "verdict": "3 of 3 tasks can run in parallel in 1 group"
   }
   ```

   All tasks are independent. Proceed to dispatch.

   ```

   ```

5. **Update Success Criteria** (line 104) to add: "Independence was verified via `check_task_independence` (or manual fallback if tool unavailable)"

6. Run: `harness validate`

7. Verify the symlink: confirm `agents/skills/gemini-cli/harness-parallel-agents/SKILL.md` reflects the same content (it should, since it is a symlink).

8. Commit: `feat(skills): reference check_task_independence as primary method in parallel-agents skill`

**Exact edits to make:**

**Edit A -- Replace Step 1 (lines 19-31):**

Replace:

```markdown
### Step 1: Identify Independent Problem Domains

Before dispatching anything in parallel, rigorously verify independence:

1. **List the candidate tasks.** Pull from the plan, or identify from the current work.

2. **Check file overlap.** For each pair of tasks, compare the files they will read and write. Any overlap in WRITE targets means they are NOT independent. Overlap in READ targets is acceptable only if neither task writes to those files.

3. **Check state overlap.** Do any tasks share database tables, configuration files, environment variables, or in-memory state? If yes, they are NOT independent.

4. **Check import graph overlap.** If Task A modifies module X and Task B imports module X, they are NOT independent — Task B's tests may be affected by Task A's changes.

5. **When in doubt, run serially.** The cost of a false parallel dispatch (merge conflicts, subtle bugs, wasted work) far exceeds the cost of running serially.
```

With:

````markdown
### Step 1: Verify Task Independence

Before dispatching anything in parallel, verify independence using `check_task_independence`:

1. **List the candidate tasks.** Pull from the plan, or identify from the current work. For each task, identify the files it will read and write.

2. **Call `check_task_independence`.** Pass the tasks with their file lists:

   ```json
   {
     "path": "<project-root>",
     "tasks": [
       { "id": "task-a", "files": ["src/module-a/index.ts", "src/module-a/index.test.ts"] },
       { "id": "task-b", "files": ["src/module-b/index.ts", "src/module-b/index.test.ts"] }
     ],
     "depth": 1
   }
   ```
````

The tool checks direct file overlap AND transitive dependency overlap (via the knowledge graph when available). It returns:

- **`pairs`**: Pairwise independence results with overlap details
- **`groups`**: Safe parallel dispatch groups (connected components of the conflict graph)
- **`verdict`**: Human-readable summary (e.g., "3 of 4 tasks can run in parallel in 2 groups")
- **`analysisLevel`**: `"graph-expanded"` (full analysis) or `"file-only"` (graph unavailable)

3. **Act on the result.** If all tasks are in one group, dispatch them all in parallel. If tasks are split across groups, dispatch each group as a separate parallel wave. If tasks conflict, investigate the overlaps and consider restructuring.

4. **When in doubt, run serially.** The cost of a false parallel dispatch (merge conflicts, subtle bugs, wasted work) far exceeds the cost of running serially.

#### Manual Fallback (when MCP tool is unavailable)

If `check_task_independence` is not available, verify independence manually:

1. **Check file overlap.** For each pair of tasks, compare the files they will read and write. Any overlap in WRITE targets means they are NOT independent. Overlap in READ targets is acceptable only if neither task writes to those files.

2. **Check state overlap.** Do any tasks share database tables, configuration files, environment variables, or in-memory state? If yes, they are NOT independent.

3. **Check import graph overlap.** If Task A modifies module X and Task B imports module X, they are NOT independent — Task B's tests may be affected by Task A's changes.

4. **When in doubt, run serially.** Same principle as above.

````

**Edit B -- Replace "Graph-Enhanced Context" section (lines 33-40):**

Replace:
```markdown
### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate independence verification:

- `query_graph` — get the dependency subgraph per candidate task and check for node overlap between tasks
- `get_impact` — verify tasks do not write to overlapping files or share transitive dependencies

Automated graph-based independence verification replaces manual import grep and catches transitive overlaps that file-level checks miss. Fall back to file-based commands if no graph is available.
````

With:

```markdown
### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, `check_task_independence` automatically uses it for transitive dependency analysis (this is the `"graph-expanded"` analysis level). No manual graph queries are needed for independence checking.

For custom queries beyond independence checking, these tools remain available:

- `query_graph` — get the dependency subgraph for a specific module or file
- `get_impact` — assess the impact radius of changes to a specific module

When no graph is available, `check_task_independence` falls back to file-only overlap detection and flags `analysisLevel: "file-only"` so you know transitive dependencies were not checked.
```

**Edit C -- Update the first example's Step 1 (lines 118-129):**

Replace:

```markdown
**Step 1: Verify independence**
```

Task 4 (UserService): writes src/services/user/_, reads src/types/user.ts
Task 5 (ProductService): writes src/services/product/_, reads src/types/product.ts
Task 6 (NotificationService): writes src/services/notification/\*, reads src/types/notification.ts

File overlap: NONE (different directories, different type files)
State overlap: NONE (different DB tables, no shared config)
Import graph: NONE (no cross-service imports)
Verdict: INDEPENDENT — safe to parallelize

```

```

With:

````markdown
**Step 1: Verify independence**

Call `check_task_independence`:

```json
{
  "path": ".",
  "tasks": [
    {
      "id": "task-4-user",
      "files": [
        "src/services/user/service.ts",
        "src/services/user/service.test.ts",
        "src/types/user.ts"
      ]
    },
    {
      "id": "task-5-product",
      "files": [
        "src/services/product/service.ts",
        "src/services/product/service.test.ts",
        "src/types/product.ts"
      ]
    },
    {
      "id": "task-6-notification",
      "files": [
        "src/services/notification/service.ts",
        "src/services/notification/service.test.ts",
        "src/types/notification.ts"
      ]
    }
  ]
}
```
````

Result:

```json
{
  "analysisLevel": "graph-expanded",
  "groups": [["task-4-user", "task-5-product", "task-6-notification"]],
  "verdict": "3 of 3 tasks can run in parallel in 1 group"
}
```

All tasks are independent — safe to parallelize.

````

**Edit D -- Update Success Criteria (line 104):**

Replace:
```markdown
- Independence was verified before dispatch (file overlap, state overlap, import graph)
````

With:

```markdown
- Independence was verified before dispatch via `check_task_independence` (or manual fallback if tool unavailable)
```
