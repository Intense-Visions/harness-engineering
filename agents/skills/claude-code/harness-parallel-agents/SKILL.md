# Harness Parallel Agents

> Dispatch independent tasks to concurrent agents, integrate results, and verify no conflicts. Only for truly independent problems.

## When to Use
- When 3 or more tasks are truly independent (no shared state, no shared files, different subsystems)
- When tasks involve investigation or implementation in separate parts of the codebase
- When parallel execution would meaningfully reduce wall-clock time
- When a plan has tasks explicitly marked as parallelizable
- NOT when failures across tasks might be related (investigate serially to find the common cause)
- NOT when tasks need full system understanding to complete correctly
- NOT when agents would modify the same files or shared state
- NOT when there are fewer than 3 independent tasks (overhead of coordination outweighs parallelism)
- NOT when the tasks are sequential by nature (each depends on the previous)

## Process

### Step 1: Identify Independent Problem Domains

Before dispatching anything in parallel, rigorously verify independence:

1. **List the candidate tasks.** Pull from the plan, or identify from the current work.

2. **Check file overlap.** For each pair of tasks, compare the files they will read and write. Any overlap in WRITE targets means they are NOT independent. Overlap in READ targets is acceptable only if neither task writes to those files.

3. **Check state overlap.** Do any tasks share database tables, configuration files, environment variables, or in-memory state? If yes, they are NOT independent.

4. **Check import graph overlap.** If Task A modifies module X and Task B imports module X, they are NOT independent — Task B's tests may be affected by Task A's changes.

5. **When in doubt, run serially.** The cost of a false parallel dispatch (merge conflicts, subtle bugs, wasted work) far exceeds the cost of running serially.

### Step 2: Create Focused Agent Tasks

For each independent task, write a focused agent brief:

1. **Scope.** Exactly what files and directories this agent may touch. Be explicit about boundaries — the agent should not explore outside its scope.

2. **Goal.** One sentence: what is the observable outcome when this agent is done?

3. **Constraints.** What the agent must NOT do:
   - Do not modify files outside your scope
   - Do not install new dependencies without approval
   - Do not change shared configuration
   - Run `harness validate` before your final commit

4. **Expected output.** What the agent should produce:
   - Commit(s) on the current branch
   - Test results (all pass)
   - Summary of what was done and any surprises

5. **Context.** Give each agent the minimum context it needs. Include relevant file paths, type definitions it will use, and API contracts it must respect. Do not dump the entire codebase context — focused agents work better with focused context.

### Step 3: Dispatch Concurrently

1. **Launch agents in parallel.** Use subagent dispatch (TaskCreate or platform-specific parallel execution).

2. **Do not intervene while agents are running** unless one reports a blocker. Let them complete independently.

3. **Collect results.** Wait for all agents to finish. Gather their outputs: commits, test results, and summaries.

### Step 4: Integrate Results

1. **Check for conflicts.** Even with verified independence, unexpected conflicts can occur:
   - Git merge conflicts in any file
   - Two agents added the same import or export
   - Test names collide
   - Shared configuration was modified despite constraints

2. **If conflicts exist, resolve them manually.** Do not ask an agent to fix conflicts it does not have full context for. You have the full picture; the agents did not.

3. **Run the FULL test suite.** Not just each agent's tests — the complete project test suite. Parallel changes can cause integration failures that individual test runs miss.

4. **Run `harness validate`.** Verify project-wide health after integration.

5. **If integration fails,** identify which agent's changes caused the failure. Revert that agent's commits, fix the issue serially, and re-integrate.

### Step 5: Verify and Commit

1. **Verify all observable truths** from the plan are satisfied after integration.

2. **If all tests pass and harness validates,** the parallel execution is complete.

3. **Write a summary** of what was parallelized, what each agent produced, and any integration issues that were resolved.

## Harness Integration

- **`harness validate`** — Each agent runs this before its final commit. Run again after integration.
- **`harness check-deps`** — Run after integration to verify no cross-boundary violations were introduced by the combined changes.
- **Agent dispatch** — Use platform-specific parallel execution (e.g., Claude Code subagents via TaskCreate, or separate terminal sessions).
- **Test runner** — Full suite must run after integration, not just individual agent tests.

## Success Criteria

- Independence was verified before dispatch (file overlap, state overlap, import graph)
- Each agent had a focused brief with explicit scope, goal, constraints, and expected output
- All agents completed successfully (or blockers were reported)
- Integration produced no merge conflicts (or conflicts were resolved)
- Full test suite passes after integration
- `harness validate` passes after integration
- No agent modified files outside its declared scope

## Examples

### Example: Parallel Implementation of Three Independent Services

**Context:** Plan has Tasks 4, 5, and 6 which implement UserService, ProductService, and NotificationService. Each service is in its own directory, has its own types, and has no cross-service dependencies.

**Step 1: Verify independence**
```
Task 4 (UserService):      writes src/services/user/*, reads src/types/user.ts
Task 5 (ProductService):   writes src/services/product/*, reads src/types/product.ts
Task 6 (NotificationService): writes src/services/notification/*, reads src/types/notification.ts

File overlap: NONE (different directories, different type files)
State overlap: NONE (different DB tables, no shared config)
Import graph: NONE (no cross-service imports)
Verdict: INDEPENDENT — safe to parallelize
```

**Step 2: Create agent briefs**
```
Agent A — UserService:
  Scope: src/services/user/, src/services/user.test.ts
  Goal: UserService with CRUD operations, all tests passing
  Constraints: Do not modify files outside src/services/user/. Run harness validate.
  Context: User type definition in src/types/user.ts, DB helper in src/utils/db.ts

Agent B — ProductService:
  Scope: src/services/product/, src/services/product.test.ts
  Goal: ProductService with CRUD operations, all tests passing
  Constraints: Do not modify files outside src/services/product/. Run harness validate.
  Context: Product type definition in src/types/product.ts, DB helper in src/utils/db.ts

Agent C — NotificationService:
  Scope: src/services/notification/, src/services/notification.test.ts
  Goal: NotificationService with create and list, all tests passing
  Constraints: Do not modify files outside src/services/notification/. Run harness validate.
  Context: Notification type in src/types/notification.ts, email utility in src/utils/email.ts
```

**Step 3-4: Dispatch, integrate**
```
All 3 agents complete. No merge conflicts.
Run full test suite: 34 tests, all pass.
Run harness validate: passes.
```

### Example: When NOT to Parallelize

**Situation:** Tasks 7 and 8 both modify `src/api/routes/index.ts` to add new route handlers.

```
Task 7: writes src/api/routes/users.ts, MODIFIES src/api/routes/index.ts
Task 8: writes src/api/routes/products.ts, MODIFIES src/api/routes/index.ts

File overlap: BOTH WRITE to src/api/routes/index.ts
Verdict: NOT INDEPENDENT — run serially
```
