# Harness Soundness Review

> Deep soundness analysis of specs and plans. Auto-fixes inferrable issues, surfaces design decisions to you. Runs automatically before sign-off.

## When to Use

- Automatically invoked by harness-brainstorming before spec sign-off (`--mode spec`)
- Automatically invoked by harness-planning before plan sign-off (`--mode plan`)
- Manually invoked to review a spec or plan on demand
- NOT for reviewing implementation code (use harness-code-review)
- NOT as a replacement for mechanical validation (harness validate, check-deps remain as-is)
- NOT in CI — this is a design-time skill

## Arguments

- **`--mode spec`** — Run spec-mode checks (S1-S7). Invoked by harness-brainstorming.
- **`--mode plan`** — Run plan-mode checks (P1-P7). Invoked by harness-planning.

## Process

### Iron Law

**No spec or plan may be signed off without a converged soundness review. Inferrable fixes are applied silently. Design decisions are always surfaced to the user.**

---

### Finding Schema

Every finding conforms to this structure:

```json
{
  "id": "string — unique identifier",
  "check": "string — e.g. S1, P3",
  "title": "string — one-line summary",
  "detail": "string — explanation with evidence",
  "severity": "error | warning — errors block sign-off",
  "autoFixable": "boolean — whether fixable without user input",
  "suggestedFix": "string | undefined — what the fix would do",
  "evidence": ["string[] — references to spec/plan sections and codebase files"]
}
```

---

### Phase 1: CHECK — Run All Checks for Current Mode

Execute all checks for the active mode. Classify each finding as `autoFixable: true` or `false`. Record total issue count.

#### Graph Detection and Fallback

Before running checks, determine graph availability:

1. Check whether `.harness/graph/` exists.
2. If present, these MCP tools enhance checks S3, S5, P1, P3, P4:
   - `query_graph` — traverse module/dependency nodes to verify referenced patterns and architectural compatibility
   - `find_context_for` — search for related design decisions from other specs
   - `get_relationships` — verify dependency direction and layer compliance
   - `get_impact` — analyze downstream impact to verify dependency completeness
3. If absent, use the "Without graph" path for every check. Do not block or warn — all checks produce useful results from document analysis and codebase reads alone.

Per-check procedures include "Without graph" and "With graph" variants. Use whichever matches step 1.

#### Spec Mode Checks (`--mode spec`)

| #   | Check                      | What it detects                                                              | Auto-fixable?                                                 |
| --- | -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| S1  | Internal coherence         | Contradictions between decisions, technical design, and success criteria     | No — surface to user                                          |
| S2  | Goal-criteria traceability | Goals without success criteria; orphan criteria not tied to any goal         | Yes — add missing links, flag orphans                         |
| S3  | Unstated assumptions       | Implicit assumptions not called out (e.g., single-tenant, always-online)     | Partially — infer obvious ones, surface ambiguous             |
| S4  | Requirement completeness   | Missing error/edge cases, failure modes; EARS unwanted-behavior gaps         | Partially — add obvious error cases, surface design-dependent |
| S5  | Feasibility red flags      | Design depends on nonexistent codebase capabilities or incompatible patterns | No — surface with evidence                                    |
| S6  | YAGNI re-scan              | Speculative features that crept in during conversation                       | No — surface to user                                          |
| S7  | Testability                | Vague success criteria not observable or measurable ("should be fast")       | Yes — add thresholds where inferrable                         |

##### S1 Internal Coherence

**Analyze:** Decisions table, Technical Design, Success Criteria, Non-goals.

**Detection:**

1. Verify each decision is consistent with Technical Design. "Use approach A" in decisions + "approach B" in design = contradiction.
2. Verify no success criterion contradicts a decision or non-goal.
3. Verify no non-goal has a corresponding implementation section.
4. Flag any pair where one section asserts X and another asserts not-X.

**Classification:** Always `severity: "error"`, `autoFixable: false`. Contradictions require user judgment.

**Example:**

```json
{
  "id": "S1-001",
  "check": "S1",
  "title": "Decision contradicts Technical Design",
  "detail": "D3 says 'use SQLite' but Technical Design > Data Layer describes PostgreSQL with migrations.",
  "severity": "error",
  "autoFixable": false,
  "suggestedFix": "Align Technical Design with decision (SQLite) or update decision to PostgreSQL.",
  "evidence": ["Decisions D3: 'Use SQLite'", "Technical Design > Data Layer: 'PostgreSQL schema'"]
}
```

##### S2 Goal-Criteria Traceability

**Analyze:** Overview (goals), Success Criteria.

**Detection:**

1. Extract goals from Overview.
2. For each goal, check at least one success criterion covers it. No match = **gap**.
3. For each criterion, check it traces to a goal. No match = **orphan**.
4. Flag gaps and orphans separately (different fix strategies).

**Classification:**

- Missing links (goals without criteria): `severity: "warning"`, `autoFixable: true`. Fix: add criterion derived from Technical Design.
- Orphan criteria: `severity: "warning"`, `autoFixable: false`. Removing criteria is a design decision.

**Example:**

```json
{
  "id": "S2-001",
  "check": "S2",
  "title": "Goal has no success criterion",
  "detail": "Goal 'Support offline mode' has no corresponding criterion.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Add: 'App functions without network for all read operations, returning cached data.'",
  "evidence": ["Overview: 'Support offline mode'", "Success Criteria: no match"]
}
```

##### S3 Unstated Assumptions

**Analyze:** Technical Design, Decisions table, data structures, integration points.

**Detection:**

- **Document analysis:** Scan for implicit assumptions about runtime (single-process, always-online), data (fits in memory, UTF-8 only), deployment (single-tenant, specific cloud), user context (admin access). Check whether spec states them.
- **Without graph:** Read referenced source files to identify conventions the spec assumes but does not state. Use Grep/Glob to verify referenced patterns exist.
- **With graph:** Use `query_graph` for related modules' assumptions. Use `find_context_for` to surface conflicting design decisions.

**Classification:**

- Obvious (Node.js runtime, filesystem access, UTF-8): `severity: "warning"`, `autoFixable: true`. Fix: add to Assumptions section.
- Ambiguous (single-tenant vs multi-tenant, concurrency model): `severity: "warning"`, `autoFixable: false`. User decides.

**Example:**

```json
{
  "id": "S3-001",
  "check": "S3",
  "title": "Implicit Node.js runtime assumption",
  "detail": "Technical Design references 'path.join' and 'fs.readFileSync' without declaring Node.js runtime.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Add to Assumptions: 'Runtime: Node.js >= 18.x (LTS).'",
  "evidence": [
    "Technical Design > File Operations: path.join, fs.readFileSync",
    "No Assumptions section"
  ]
}
```

```json
{
  "id": "S3-002",
  "check": "S3",
  "title": "Ambiguous concurrency model",
  "detail": "Technical Design describes a background job processor but does not specify in-process, worker thread, or separate process. Affects error isolation and deployment.",
  "severity": "warning",
  "autoFixable": false,
  "suggestedFix": "Add decision specifying concurrency model: in-process event loop, worker_threads, or separate process.",
  "evidence": [
    "Technical Design > Job Processor: 'processes background jobs'",
    "Decisions table: no concurrency entry"
  ]
}
```

##### S4 Requirement Completeness

**Analyze:** Technical Design (data structures, API endpoints, integration points), Success Criteria.

**Detection:**

- **Error cases:** For each operation, identify what happens on missing/null/malformed input. Flag operations with no defined error behavior.
- **Edge cases:** For each numeric field, check boundary values (zero, negative, overflow). For each string field, check empty string, very long string, and special character handling. For each collection, check empty collection behavior.
- **Failure modes:** For each external dependency, check timeout/unavailability/partial-failure behaviors. Apply EARS "Unwanted" pattern: "If [failure], then system shall [graceful behavior]."
- **Codebase context:** Read referenced modules for established error patterns.

**Classification:**

- Obvious error cases (file I/O, network, JSON parsing): `severity: "warning"`, `autoFixable: true`. Fix follows codebase patterns.
- Design-dependent error handling (retry? cache? fail?): `severity: "warning"`, `autoFixable: false`.

**Example:**

```json
{
  "id": "S4-001",
  "check": "S4",
  "title": "Missing file-not-found error case",
  "detail": "Config read with fs.readFileSync has no ENOENT handling. Codebase convention (packages/core/src/config.ts) returns defaults.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Add: 'If config file missing (ENOENT), return default config. Log debug message.'",
  "evidence": [
    "Technical Design: 'read config from harness.config.json'",
    "Codebase: config.ts returns defaults on ENOENT"
  ]
}
```

```json
{
  "id": "S4-002",
  "check": "S4",
  "title": "Undefined retry strategy for external service",
  "detail": "Technical Design calls an external API for license validation but specifies no timeout, unavailability, or error behavior. Design decision affects UX (block vs degrade).",
  "severity": "warning",
  "autoFixable": false,
  "suggestedFix": "Add decision: 'When license API unavailable: (a) fail open with warning, (b) fail closed, or (c) cache last result for N hours.'",
  "evidence": [
    "Technical Design > License Check: 'call /api/validate on startup'",
    "No fallback behavior specified"
  ]
}
```

##### S5 Feasibility Red Flags

**Analyze:** Technical Design (referenced modules, dependencies, patterns, APIs).

**Detection:**

- **Without graph:** For each referenced module/function/class, use Glob/Grep to verify existence. Read source to verify expected signatures match. Flag nonexistent modules, wrong signatures, incompatible patterns.
- **With graph:** Use `query_graph` to verify modules exist and check dependencies. Use `get_relationships` for architectural compatibility. Use `get_impact` for cascading effects not in spec.

**Classification:** Always `severity: "error"`, `autoFixable: false`. Feasibility problems require design revision.

**Example:**

```json
{
  "id": "S5-001",
  "check": "S5",
  "title": "Referenced function has different signature",
  "detail": "Spec says 'validateDependencies(projectPath)' but actual signature is 'validateDependencies(config: ProjectConfig): ValidationResult'.",
  "severity": "error",
  "autoFixable": false,
  "suggestedFix": "Update Technical Design to use actual signature with ProjectConfig parameter.",
  "evidence": [
    "Technical Design: 'call validateDependencies(projectPath)'",
    "packages/core/src/validator.ts:42: actual signature"
  ]
}
```

##### S6 YAGNI Re-scan

**Analyze:** Technical Design, Decisions table, Implementation Order.

**Detection:**

1. For each component/interface/config option, check whether a goal or criterion requires it. Flag "for future use" or "in case we need" items.
2. Flag decision rationale referencing hypothetical future requirements.
3. Flag config options toggling undefined features.
4. Flag abstraction layers introduced solely for "flexibility" with no current consumer.

**Classification:** Always `severity: "warning"`, `autoFixable: false`. Removing features is a design decision.

**Example:**

```json
{
  "id": "S6-001",
  "check": "S6",
  "title": "Speculative configuration option",
  "detail": "'pluginDir' config option defined but no goal/criterion mentions plugins.",
  "severity": "warning",
  "autoFixable": false,
  "suggestedFix": "Remove pluginDir and plugin loading from Technical Design.",
  "evidence": ["Technical Design: 'pluginDir: string'", "Overview/Criteria: no plugin mention"]
}
```

##### S7 Testability

**Analyze:** Success Criteria.

**Detection:**

1. Evaluate each criterion for observability and measurability.
2. Flag vague qualifiers: "should be fast", "handles errors well", "is user-friendly", "scales appropriately".
3. Flag criteria describing internal implementation rather than observable outcomes.
4. Where Technical Design provides context, infer a specific threshold.

**Classification:**

- Vague with inferrable threshold: `severity: "warning"`, `autoFixable: true`. Fix: replace vague qualifier with specific threshold.
- Fundamentally unmeasurable: `severity: "error"`, `autoFixable: false`. User must rewrite.

**Example:**

```json
{
  "id": "S7-001",
  "check": "S7",
  "title": "Vague performance criterion",
  "detail": "Criterion #3 says 'build should be fast'. Technical Design mentions 30-second CI timeout.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Replace with 'build completes in under 30 seconds on CI'.",
  "evidence": ["Criteria #3: 'build should be fast'", "Technical Design > CI: '30-second timeout'"]
}
```

#### Plan Mode Checks (`--mode plan`)

| #   | Check                  | What it detects                                         | Auto-fixable?                           |
| --- | ---------------------- | ------------------------------------------------------- | --------------------------------------- |
| P1  | Spec-plan coverage     | Success criteria with no corresponding task(s)          | Yes — add missing tasks                 |
| P2  | Task completeness      | Tasks missing inputs, outputs, or verification          | Yes — infer and fill in                 |
| P3  | Dependency correctness | Cycles in dependency graph; undeclared dependencies     | Yes — add missing edges                 |
| P4  | Ordering sanity        | Same-file tasks in parallel; consumers before producers | Yes — reorder                           |
| P5  | Risk coverage          | Spec risks without mitigation in plan                   | Partially — add obvious, surface others |
| P6  | Scope drift            | Plan tasks not traceable to any spec requirement        | No — surface to user                    |
| P7  | Task-level feasibility | Undecided dependencies; tasks too vague to execute      | No — surface to user                    |

##### P1 Spec-Plan Coverage

**Analyze:** Spec's Success Criteria and plan's Tasks. Requires both documents.

**Detection:**

- Without graph: Extract each criterion. Search plan tasks' descriptions, verification steps, and observable truths for coverage. Flag criteria with no task coverage.
- With graph: Use traceability edges between criteria and tasks. Flag criteria with no inbound edge.

**Classification:** Always `severity: "error"`, `autoFixable: true`. Fix: add task covering the criterion.

**Example:**

```json
{
  "id": "P1-001",
  "check": "P1",
  "title": "Spec criterion not covered by any plan task",
  "detail": "Criterion #4 ('structured error responses with request-id') has no plan task.",
  "severity": "error",
  "autoFixable": true,
  "suggestedFix": "Add task implementing structured error responses with request-id headers.",
  "evidence": ["Spec Criteria #4", "Plan Tasks 1-8: no task references error format"]
}
```

##### P2 Task Completeness

**Analyze:** Each task in the Tasks section.

**Detection:** Verify each task has: (a) clear inputs, (b) clear outputs, (c) verification criterion. Flag tasks missing any element.

**Classification:** Always `severity: "warning"`, `autoFixable: true`. Fix: infer the missing element from context (e.g., if a task says "create src/foo.ts" but has no verification, add "Run: `npx vitest run src/foo.test.ts`" if a test file exists, or "Run: `tsc --noEmit`" as minimal verification).

**Example:**

```json
{
  "id": "P2-001",
  "check": "P2",
  "title": "Task missing verification criterion",
  "detail": "Task 3 has inputs and outputs but no verification step.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Add: 'Run: npx vitest run src/services/notification-service.test.ts'",
  "evidence": ["Task 3: no 'Run:' or 'Verify:' step", "Task 4 creates the test file"]
}
```

##### P3 Dependency Correctness

**Analyze:** "Depends on" declarations across all tasks, file paths/artifacts each task references.

**Detection:**

- Build dependency graph from all "Depends on: Task N" declarations.
- **Cycle detection:** Topological sort. Failure = cycle. Report involved tasks.
- **Missing edges:** For each task, extract files it reads/imports. If created by another task (per File Map), verify dependency is declared.
- Without graph: Parse file paths from task descriptions and File Map.
- With graph: Use `get_impact` on output files to verify downstream consumers are declared as dependents.

**Classification:**

- Cycles: `severity: "error"`, `autoFixable: false`. Requires task restructuring.
- Missing edges: `severity: "warning"`, `autoFixable: true`. Fix: add "Depends on" declaration.

**Example:**

```json
{
  "id": "P3-002",
  "check": "P3",
  "title": "Missing dependency edge",
  "detail": "Task 5 imports src/types/notification.ts (created by Task 1) but does not declare dependency.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Add 'Depends on: Task 1' to Task 5.",
  "evidence": [
    "Task 5: imports notification.ts",
    "File Map: created by Task 1",
    "Task 5 Depends on: Task 4 only"
  ]
}
```

```json
{
  "id": "P3-001",
  "check": "P3",
  "title": "Dependency cycle detected",
  "detail": "Tasks form a cycle: Task 3 -> Task 5 -> Task 3. Topological sort fails.",
  "severity": "error",
  "autoFixable": false,
  "suggestedFix": "Break cycle by merging Tasks 3 and 5, or extract shared dependency into a new task.",
  "evidence": [
    "Task 3: 'Depends on: Task 5'",
    "Task 5: 'Depends on: Task 3'",
    "Topological sort failed"
  ]
}
```

##### P4 Ordering Sanity

**Analyze:** Task execution order, file paths each task touches, parallel opportunities.

**Detection:**

- **File conflict:** If two tasks touch the same file without a dependency edge, flag as potential conflict.
- **Consumer-before-producer:** If Task A creates something Task B imports, but B is numbered before A with no dependency, flag it.
- Without graph: Parse file paths from descriptions and File Map.
- With graph: Use file ownership data for accurate conflict detection including indirect conflicts (barrel exports).

**Classification:** Always `severity: "warning"`, `autoFixable: true`. Fix: reorder tasks or add dependency edges.

**Example:**

```json
{
  "id": "P4-001",
  "check": "P4",
  "title": "Consumer scheduled before producer",
  "detail": "Task 2 imports from src/types/user.ts created by Task 4, with no dependency declared.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Add 'Depends on: Task 4' to Task 2, or reorder type definition before Task 2.",
  "evidence": ["Task 2: imports user.ts", "Task 4: creates user.ts", "Task 2 Depends on: none"]
}
```

##### P5 Risk Coverage

**Analyze:** Spec's risk-related content and plan's tasks/checkpoints.

**Detection:** Identify risks in: explicit "Risks" sections, decision rationale mentioning tradeoffs, success criteria implying failure modes, non-goals with adjacent risk. For each, check plan for: (a) mitigation task, (b) acknowledging checkpoint, or (c) explicit "accepted risk" note. Flag uncovered risks.

**Classification:**

- Obvious mitigation (technical, straightforward): `severity: "warning"`, `autoFixable: true`. Fix: add mitigation task.
- Judgment-dependent (design tradeoff): `severity: "warning"`, `autoFixable: false`. Surface with options.

**Example:**

```json
{
  "id": "P5-001",
  "check": "P5",
  "title": "Spec risk has no mitigation in plan",
  "detail": "Risk 'convergence loop may not terminate' has no plan task testing termination.",
  "severity": "warning",
  "autoFixable": true,
  "suggestedFix": "Add task testing convergence termination with fixed-point inputs.",
  "evidence": ["Spec Risks: 'loop may not terminate'", "Plan Tasks 1-8: no termination test"]
}
```

```json
{
  "id": "P5-002",
  "check": "P5",
  "title": "Risk requires design judgment to mitigate",
  "detail": "Spec notes 'auto-fix may introduce new issues'. Mitigation depends on design choice: (a) rollback mechanism, (b) single-pass limit, or (c) human approval for cascading fixes.",
  "severity": "warning",
  "autoFixable": false,
  "suggestedFix": "Choose strategy: (a) rollback — add undo capability, (b) single-pass — simpler but less thorough, (c) human gate — safer but slower.",
  "evidence": [
    "Spec Risks: 'Auto-fixes may introduce new issues'",
    "Decisions: no mitigation strategy"
  ]
}
```

##### P6 Scope Drift

**Analyze:** Plan tasks vs spec goals, success criteria, and technical design.

**Detection:** For each plan task, check traceability: (a) directly implements a criterion, (b) necessary prerequisite, or (c) infrastructure called for in spec. Flag untraceable tasks.

**Classification:** Always `severity: "warning"`, `autoFixable: false`. User confirms whether each flagged task is in scope.

**Example:**

```json
{
  "id": "P6-001",
  "check": "P6",
  "title": "Plan task not traceable to spec requirement",
  "detail": "Task 8 ('Add Redis caching layer') not traceable to any spec goal or criterion.",
  "severity": "warning",
  "autoFixable": false,
  "suggestedFix": "Remove Task 8, or add corresponding goal/criterion to spec.",
  "evidence": ["Task 8: 'Redis caching'", "Spec: no mention of caching"]
}
```

##### P7 Task-Level Feasibility

**Analyze:** Each task's description, file paths, code snippets, referenced decisions.

**Detection:**

- **Undecided dependencies:** Task requires a decision not in spec's Decisions table. Indicators: "depending on approach chosen", "if we go with option A".
- **Vague instructions:** Task lacks specificity for single-context-window completion. Indicators: "implement the service" without function list, "add validation" without rules.
- **Oversized tasks:** Task touches >3 files or combines multiple independent concerns.

**Classification:** Always `severity: "error"`, `autoFixable: false`. Requires planner revision.

**Example:**

```json
{
  "id": "P7-001",
  "check": "P7",
  "title": "Task depends on undecided design choice",
  "detail": "Task 7 says 'implement caching layer' but Decisions table has no caching strategy entry.",
  "severity": "error",
  "autoFixable": false,
  "suggestedFix": "Make caching decision in spec (e.g., 'D5: LRU with 5-min TTL'), then update Task 7.",
  "evidence": ["Task 7: 'Implement caching layer'", "Decisions: no caching entry"]
}
```

```json
{
  "id": "P7-002",
  "check": "P7",
  "title": "Task too vague to execute in one context window",
  "detail": "Task 4 says 'implement the notification service' without specifying methods, signatures, or error handling. Cannot complete without making design decisions.",
  "severity": "error",
  "autoFixable": false,
  "suggestedFix": "Split into sub-tasks: (a) NotificationService.create() with signature/errors, (b) NotificationService.list() with filtering, (c) NotificationService.markRead() with idempotency.",
  "evidence": [
    "Task 4: 'Implement the notification service'",
    "No signatures, no error spec",
    "Iron law: every task completable in one context window"
  ]
}
```

---

### Phase 2: FIX — Auto-Fix Inferrable Issues

For every finding where `autoFixable: true`:

1. Apply the fix to the spec or plan document in place.
2. Log what changed and why.
3. Do NOT prompt the user — these are mechanical.

For `autoFixable: false`: skip. They surface in Phase 4.

#### Silent vs Surfaced Classification

| Check | Auto-fixable findings                         | Fix behavior                     |
| ----- | --------------------------------------------- | -------------------------------- |
| S1    | None                                          | Always surfaced                  |
| S2    | Missing traceability links                    | Silent fix                       |
| S2    | Orphan criteria                               | Surfaced — design decision       |
| S3    | Obvious assumptions (runtime, encoding)       | Silent fix                       |
| S3    | Ambiguous assumptions (concurrency, tenancy)  | Surfaced — user chooses          |
| S4    | Obvious error cases (file I/O, JSON, network) | Silent fix                       |
| S4    | Design-dependent error handling               | Surfaced — user chooses strategy |
| S5    | None                                          | Always surfaced                  |
| S6    | None                                          | Always surfaced                  |
| S7    | Vague criteria with inferrable thresholds     | Silent fix                       |
| S7    | Unmeasurable criteria                         | Surfaced — user rewrites         |
| P1    | Missing task for uncovered criterion          | Silent fix                       |
| P2    | Missing inputs, outputs, or verification      | Silent fix                       |
| P3    | Missing dependency edges                      | Silent fix                       |
| P3    | Dependency cycles                             | Surfaced — design decision       |
| P4    | File conflicts or consumer-before-producer    | Silent fix                       |
| P5    | Obvious risk mitigation                       | Silent fix                       |
| P5    | Judgment-dependent mitigation                 | Surfaced — user chooses          |
| P6    | None                                          | Always surfaced                  |
| P7    | None                                          | Always surfaced                  |

**Rule:** A fix is silent when the correct resolution requires no design judgment. If two or more plausible resolutions exist, surface it.

#### Fix Procedures by Check

##### S2 Fix: Add Missing Success Criteria

**When:** A goal has no corresponding success criterion.

1. Read Technical Design for context on the uncovered goal.
2. Draft a specific, observable, testable criterion (EARS patterns if applicable).
3. Append to Success Criteria with next available number.
4. Log the fix.

**Fix log example:**

```
[S2-001] FIXED: Added criterion #11 for 'Support offline mode':
  'App functions without network for all read operations, returning cached data.'
  Derived from: Technical Design > Offline Cache.
```

##### S7 Fix: Replace Vague Criteria

**When:** Criterion uses vague qualifiers and Technical Design provides a threshold.

1. Identify vague qualifier.
2. Find related threshold in Technical Design.
3. Replace vague text with specific threshold, citing source.
4. Log the fix.

**Fix log example:**

```
[S7-001] FIXED: Replaced criterion #3 'build should be fast' with:
  'Build completes in under 30 seconds on CI (per Technical Design > CI Config).'
```

##### S3 Fix: Add Obvious Assumptions

**When:** Technical Design implies assumptions not documented in spec.

1. Identify assumption from evidence (e.g., `fs.readFileSync` implies Node.js).
2. Create Assumptions section if missing (after Non-goals).
3. Add assumption as bullet with brief rationale.
4. Log the fix.

**Fix log example:**

```
[S3-001] FIXED: Added assumption: 'Runtime: Node.js >= 18.x (LTS).'
  Evidence: Technical Design references path.join, fs.readFileSync.
```

##### S4 Fix: Add Obvious Error Cases

**When:** An operation has no error behavior and codebase has established pattern.

1. Identify operation missing error handling.
2. Read codebase module for established error pattern.
3. Add error case using EARS "Unwanted" pattern near the operation.
4. Log the fix.

**Fix log example:**

```
[S4-001] FIXED: Added ENOENT error case for config read:
  'If config missing, return defaults. Log debug message.'
  Following: packages/core/src/config.ts pattern.
```

##### P1 Fix: Add Missing Tasks

**When:** A spec criterion has no corresponding plan task.

1. Read criterion and Technical Design for context.
2. Draft task with file paths, test commands, commit message.
3. Insert at appropriate position respecting dependencies.
4. Update File Map if needed.
5. Log the fix.

**Fix log example:**

```
[P1-001] FIXED: Added Task 9 for criterion #5 (error logging):
  'Create src/utils/error-logger.ts. Verify: npx vitest run error-logger.test.ts'
```

##### P2 Fix: Fill Missing Task Elements

**When:** Task missing inputs, outputs, or verification.

1. Identify missing element.
2. Infer from task description and surrounding tasks.
3. Add to task.
4. Log the fix.

**Fix log example:**

```
[P2-001] FIXED: Added verification to Task 3:
  'Run: npx vitest run src/services/notification-service.test.ts'
```

##### P3 Fix: Add Missing Dependency Edges

**When:** Task B uses artifact from Task A without declaring dependency.

1. Identify producer task from File Map.
2. Add "Depends on: Task N" to consuming task.
3. Log the fix.

**Fix log example:**

```
[P3-001] FIXED: Added 'Depends on: Task 2' to Task 5.
  Task 5 imports src/types/notification.ts created by Task 2.
```

##### P4 Fix: Reorder Conflicting Tasks

**When:** Two tasks touch same file without sequencing, or consumer before producer.

1. Identify conflict.
2. Reorder via task numbers or dependency edge.
3. Update all "Depends on" cross-references.
4. Log the fix.

**Fix log example:**

```
[P4-001] FIXED: Added 'Depends on: Task 4' to Task 2.
  Both modify src/routes/index.ts. Sequencing prevents conflicts.
```

##### P5 Fix: Add Obvious Mitigation Tasks

**When:** Spec risk has no plan coverage and mitigation is straightforward.

1. Read risk description.
2. Draft mitigation task or extend existing task's verification.
3. Insert at appropriate position.
4. Log the fix.

**Fix log example:**

```
[P5-001] FIXED: Added Task 10 for convergence termination testing.
  Mitigates: 'convergence loop may not terminate'.
```

#### Fix Log Format

Every auto-fix MUST be logged:

```
[{finding-id}] FIXED: {one-line description}
  {new text added/modified}
  {source/evidence}
```

The fix log lets users review silent changes and trace causes if fixes introduce new issues.

---

### Phase 3: CONVERGE — Re-Check and Loop

After Phase 2 auto-fixes, the convergence loop determines whether further progress is possible.

#### Convergence Procedure

1. **Record issue count** after Phase 2 as `count_previous`.
2. **Re-run all checks** against updated document. Note new total as `count_current`.
3. **Compare:**
   - `count_current < count_previous`: progress made. Go to Phase 2, apply new auto-fixes, return here.
   - `count_current == count_previous`: no progress. Remaining issues need user input. Proceed to Phase 4.
   - `count_current > count_previous`: fixes introduced new issues. Log warning, proceed to Phase 4.
4. **Repeat** until no progress. No arbitrary cap — "no progress" is the termination condition.

#### Cascading Fixes

A fix in one pass can make a previously non-auto-fixable finding become auto-fixable. Examples:

Spec-mode cascades:

- **S4 enables S3:** S4 creates Assumptions section; S3 can now append obvious assumptions.
- **S2 enables S7:** S2 adds criterion; S7 can sharpen it using Technical Design context.
- **S4 enables S4:** First error case establishes local convention; related operations can follow it.

Plan-mode cascades:

- **P1 enables P3:** New task added; P3 detects undeclared dependencies on it.
- **P1 enables P4:** New task creates type file; P4 reorders consumers after it.
- **P2 enables P5:** Explicit verification step now mitigates a previously unmatched risk.

Cascading fixes are why the loop re-runs ALL checks, not just those that produced auto-fixable findings.

#### Worked Example: Spec-Mode Two-Pass Convergence

```
Pass 1 (initial):
  S1: 0 | S2: 1 (auto-fix) | S3: 2 (1 auto-fix, 1 user) | S4: 1 (auto-fix)
  S5: 0 | S6: 0 | S7: 1 (auto-fix)
  Total: 5 (4 auto-fixable, 1 user). count_previous = 5

Phase 2: Apply 4 fixes.
  [S2-001] Added criterion #11 for 'offline mode'.
  [S3-001] Added Node.js runtime assumption.
  [S4-001] Added ENOENT error case.
  [S7-001] Replaced 'fast' with 'under 30 seconds on CI'.

Pass 2:
  S2: 0 | S3: 1 CASCADING (UTF-8 assumption now appendable) + 1 user unchanged
  S4: 0 | S7: 0
  Total: 2 (1 auto-fixable, 1 user). count_current=2 < 5. Continue.

Phase 2: Apply 1 fix. [S3-003] Added UTF-8 assumption.

Pass 3: Total: 1 (0 auto-fixable, 1 user). count_current=1 < 2. Continue.
Phase 2: 0 fixes.

Pass 4: Total: 1. count_current=1 = count_previous=1. Converged.
  → Phase 4 with 1 remaining issue.
```

#### Worked Example: Plan-Mode Two-Pass Convergence

```
Pass 1 (initial):
  P1: 1 (auto-fix) | P2: 1 (auto-fix) | P3: 0 | P4: 0
  P5: 1 (user) | P6: 0 | P7: 1 (user)
  Total: 4 (2 auto-fixable, 2 user). count_previous = 4

Phase 2: Apply 2 fixes.
  [P1-001] Added Task 9 for criterion #6 (error logging).
  [P2-001] Added verification to Task 4.

Pass 2:
  P1: 0 | P2: 0 | P3: 1 CASCADING (Task 6 needs 'Depends on: Task 9')
  P5: 1 user | P7: 1 user
  Total: 3 (1 auto-fixable, 2 user). count_current=3 < 4. Continue.

Phase 2: [P3-001] Added 'Depends on: Task 9' to Task 6.

Pass 3: Total: 2 (0 auto-fixable). count_current=2 < 3. Continue.
Phase 2: 0 fixes.

Pass 4: Total: 2. count_current=2 = count_previous=2. Converged.
  → Phase 4 with 2 remaining issues.
```

#### Termination Guarantee

The loop terminates because:

1. Auto-fixable findings are finite (bounded by document size).
2. Each fix modifies the document, so the same finding cannot be fixed twice.
3. Zero auto-fixable findings = zero fixes = same count = "no progress" exit.
4. Cascading fixes are finite — each adds content, and checks eventually find nothing missing.

---

### Phase 4: SURFACE — Present Remaining Issues

When findings remain after convergence, present them. If no `needs-user-input` findings remain, skip to Clean Exit.

#### Step 1: Group and Prioritize

1. Present `error` findings before `warning` findings. Errors block sign-off.
2. Within severity, order by check ID (S1 before S2; P1 before P2).
3. Announce: `N remaining issues need your input (X errors, Y warnings).`

#### Step 2: Present Each Finding

For each finding, present three sections:

**What is wrong:**

```
[{id}] {title} ({severity})
{detail}
Evidence: {evidence[0]}, {evidence[1]}, ...
```

**Why it matters:**

- `error`: "Blocks sign-off. Must be resolved."
- `warning`: "Advisory. May dismiss with reason (logged)."

**Suggested resolution:**

- **Option A (recommended):** The suggested fix.
- **Option B:** Alternative if apparent.
- **Option C (warnings only):** "Dismiss with reason."

#### Step 3: User Interaction

Accepted responses:

1. **Resolve:** User makes the change. Mark `resolved`.
2. **Dismiss with reason (warnings only):** Log `[{id}] DISMISSED: {reason}`. Not re-surfaced.
3. **Clarify:** Provide more context. Wait for resolve/dismiss.

Error findings cannot be dismissed.

#### Step 4: Track Resolution

```
Surfaced findings: N total
  Resolved: X | Dismissed: Y | Pending: Z
```

Update after each response. When all addressed, proceed to Step 5.

#### Step 5: Re-Check After Resolution

1. Loop back to Phase 1 to verify user resolutions and catch cascading issues.
2. Dismissed findings excluded from re-check.
3. New findings trigger full convergence loop again.
4. Zero findings → Clean Exit.

#### Clean Exit

All of the following must be true:

- All checks pass with zero findings (excluding dismissed warnings).
- No `error` findings pending or dismissed.
- Convergence loop terminated.

On clean exit:

1. Announce: `CLEAN EXIT — all checks pass. Returning control to {parent skill} for sign-off.`
2. If warnings dismissed, summarize: `Note: {N} warnings dismissed. See log.`
3. Return control to parent skill.

---

### Codebase and Graph Integration

| Check | Without graph                        | With graph                                                                   |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------- |
| S5    | Grep/glob for referenced patterns    | `query_graph` + `get_relationships` for dependency/architecture verification |
| S3    | Infer from codebase conventions      | `find_context_for` for related design decisions                              |
| P1    | Text matching criteria to tasks      | Graph traceability edges                                                     |
| P3    | Static analysis of task descriptions | `get_impact` for dependency completeness                                     |
| P4    | Parse file paths, detect conflicts   | Graph file ownership for accurate conflict detection                         |

All checks work from document analysis and codebase reads alone. Graph adds precision but is never required.

## Harness Integration

- **`harness validate`** — Run by parent skill before/after soundness review. This skill does not invoke validate directly.
- **Parent skill invocation** — harness-brainstorming invokes `--mode spec`; harness-planning invokes `--mode plan`.
- **No new user commands** — Users invoke brainstorming/planning as before. Soundness review is invisible until it surfaces an issue.
- **Graph queries** — When `.harness/graph/` exists, use `query_graph` and `get_impact` for enhanced checks. Fall back to file-based reads otherwise.

## Success Criteria

1. The skill.yaml passes schema validation with all required fields
2. The SKILL.md contains all required sections and passes structure tests
3. Both platform copies (claude-code, gemini-cli) are byte-identical and pass parity tests
4. Both modes (spec, plan) defined with check tables (S1-S7, P1-P7)
5. The `SoundnessFinding` schema is defined in SKILL.md
6. The convergence loop structure (CHECK, FIX, CONVERGE, SURFACE, CLEAN EXIT) is documented
7. `harness validate` passes after all files are written
8. The skill test suite passes (structure, schema, platform-parity, references)

## Red Flags

| Flag | Corrective Action |
| ---- | ----------------- |
| "The spec looks internally consistent at a high level" | STOP. S1 requires checking each decision against Technical Design line by line. "High level" consistency misses contradictions in the details. |
| "This assumption is obvious and doesn't need to be stated" | STOP. S3 exists because unstated assumptions cause the most damage when wrong. If it's obvious, writing it down costs nothing. Skipping it costs debugging time later. |
| "The finding is minor so I'll auto-fix it without surfacing to the user" | STOP. Only inferrable fixes are auto-fixed. If the fix involves a design choice — even one you think is obvious — surface it. You are not the designer. |
| `// TODO: add traceability` or `// spec gap — fill later` in spec/plan files | STOP. TODOs in specs are unfinished review. The spec is not converged. Fix the gap or surface it as a finding — do not defer it. |

**Review-never-fixes:** Soundness review identifies structural issues in specs and plans. It applies inferrable fixes (formatting, missing links, obvious gaps) but NEVER makes design decisions. If a finding requires judgment, surface it to the user — even if the "right" answer seems obvious. A reviewer who makes design decisions has stopped reviewing and started designing without the authority to do so.

## Uncertainty Surfacing

When a check produces ambiguous results, classify the ambiguity immediately:

- **Blocking:** Cannot determine severity without user input (e.g., S1 finds a potential contradiction that might be intentional). Surface as a finding with `autoFixable: false`.
- **Assumption:** Can classify if assumption is stated (e.g., "the spec uses 'fast' to mean sub-second, not sub-minute"). Apply the assumption, log it, and continue. If wrong, the convergence loop will catch it.
- **Deferrable:** Ambiguity does not affect sign-off (e.g., unclear whether a non-goal is worth stating). Note as a suggestion-severity finding.

Do not auto-fix ambiguous findings. Ambiguity means you lack context — applying a "fix" without context is guessing.

## Rubric Compression

Soundness check rubrics used internally MUST use compressed single-line format. Each check is one line with pipe-delimited fields:

```
mode|check-id|severity|criterion
```

**Example (Spec Mode rubric):**

```
spec|S1|error|No contradictions between decisions, technical design, and success criteria
spec|S2|warning|Every goal has at least one success criterion; no orphan criteria
spec|S3|warning|All implicit assumptions documented in Assumptions section
spec|S4|warning|Error/edge cases covered; EARS unwanted-behavior gaps filled
spec|S5|error|No references to nonexistent codebase capabilities or incompatible patterns
spec|S6|error|No speculative features without requirement traceability
spec|S7|warning|All success criteria are observable and measurable with concrete thresholds
```

**Why:** Verbose check descriptions inflate review context without improving check accuracy. Dense single-line rubrics give the same signal in fewer tokens, leaving more budget for actual document analysis.

**Rules:**

- Mode prefix must be `spec` or `plan`
- Check ID must match the defined check IDs (S1-S7, P1-P7)
- Severity must be `error` or `warning`
- Maximum 80 characters per criterion text

## Rationalizations to Reject

| Rationalization                                                                                          | Reality                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "The spec looks coherent to me, so I can skip running the S1 internal coherence check"                   | Every check in the mode must run. S1 detects contradictions that human review frequently misses.                                              |
| "This unstated assumption is obvious, so documenting it would be pedantic"                               | S3 exists because "obvious" assumptions cause the most damage when wrong. Cheapest to document, most expensive to miss.                       |
| "The success criterion is somewhat vague but the team will know what it means"                           | S7 flags vague criteria like "should be fast" because they are untestable. Vague criteria survive brainstorming only to fail at verification. |
| "This auto-fixable finding is minor, so I will just note it rather than applying the fix"                | Auto-fixable findings should be applied silently — that is the design intent. Skipping them ships known inferrable gaps.                      |
| "The feasibility check found a signature mismatch but the code can probably be adapted during execution" | S5 red flags are always severity "error" and always surfaced. A spec referencing nonexistent modules produces a broken plan.                  |
| "The convergence loop is taking too long, so I will skip the re-check and declare converged"             | Convergence requires the issue count to stop decreasing. Declaring convergence without a re-check is falsifying the exit condition.            |
| "This spec is well-written enough that a soundness review would not find anything"                       | Every spec gets a soundness review. Well-written specs still have unstated assumptions (S3) and vague criteria (S7). The review is not optional. |

## Examples

### Example: Spec Mode Invocation

**Context:** harness-brainstorming has drafted a spec and is about to sign off.

```
Invoking harness-soundness-review --mode spec...

Phase 1: CHECK
  S1 (internal coherence)... 0 findings
  S2 (goal-criteria traceability)... 1 finding (auto-fixable)
  S3 (unstated assumptions)... 2 findings (2 need user input)
  S4 (requirement completeness)... 1 finding (auto-fixable)
  S5 (feasibility red flags)... 0 findings
  S6 (YAGNI re-scan)... 0 findings
  S7 (testability)... 1 finding (auto-fixable)
  5 findings total: 3 auto-fixable, 2 need user input.

Phase 2: FIX
  [S2-001] FIXED: Added success criterion for 'Support offline mode' goal.
  [S4-001] FIXED: Added ENOENT error case for config file read.
  [S7-001] FIXED: Replaced 'build should be fast' with 'completes in under 30 seconds on CI'.
  3 auto-fixes applied.

Phase 3: CONVERGE
  Re-running checks...
  S3-001 now auto-fixable (S4-001 created Assumptions section).
  [S3-001] FIXED: Added Node.js runtime assumption.
  1 additional fix. Re-checking...
  Issue count: 1 (was 2). Decreased — continuing.
  Re-checking... Issue count: 1 (unchanged). Converged.

Phase 4: SURFACE
  1 remaining issue:

  [S3-002] Ambiguous concurrency model (warning)
  Technical Design describes background job processor without specifying
  in-process, worker thread, or separate process.
  → Add decision to Decisions table.

  User resolves → adds decision: "in-process event loop"
  Re-running checks... 0 findings.

CLEAN EXIT — returning control to harness-brainstorming for sign-off.
```

### Example: Plan Mode Invocation

**Context:** harness-planning has drafted a plan and is about to sign off.

```
Invoking harness-soundness-review --mode plan...

Phase 1: CHECK
  P1 (spec-plan coverage)... 1 finding (auto-fixable)
  P2 (task completeness)... 2 findings (auto-fixable)
  P3 (dependency correctness)... 1 finding (auto-fixable)
  P4 (ordering sanity)... 0 findings
  P5 (risk coverage)... 1 finding (needs user input)
  P6 (scope drift)... 0 findings
  P7 (task-level feasibility)... 1 finding (needs user input)
  6 findings total: 4 auto-fixable, 2 need user input.

Phase 2: FIX
  [P1-001] FIXED: Added Task 9 covering criterion #5 (error logging).
  [P2-001] FIXED: Added verification step to Task 3.
  [P2-002] FIXED: Added outputs to Task 6.
  [P3-001] FIXED: Added 'Depends on: Task 2' to Task 5.
  4 auto-fixes applied.

Phase 3: CONVERGE
  Re-checking... Issue count: 2 (was 6). Decreased — continuing.
  Re-checking... Issue count: 2 (unchanged). Converged.

Phase 4: SURFACE
  2 remaining issues:

  [P5-001] Spec risk 'performance vs correctness' has no mitigation (warning)
  → Add performance benchmark task, relax validation, or accept risk.

  [P7-001] Task 7 depends on undecided caching strategy (error)
  → Make caching decision in spec, then update Task 7.

  User resolves P5-001 → adds Task 10 for performance benchmark.
  User resolves P7-001 → adds LRU cache decision, updates Task 7.
  Re-running checks... 0 findings.

CLEAN EXIT — returning control to harness-planning for sign-off.
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No sign-off without convergence.** The soundness review must reach a clean exit (zero findings) before the parent skill proceeds to write the spec or plan. If issues remain, the user must resolve them.
- **No silent resolution of design decisions.** Contradictions (S1), feasibility concerns (S5), YAGNI violations (S6), scope drift (P6), and task-level feasibility (P7) are NEVER auto-fixed. The user must always decide.
- **No auto-fix without logging.** Every auto-fix must be logged with what changed and why. Silent, unlogged mutations are not allowed.
- **Convergence must terminate.** The loop stops when issue count stops decreasing. There is no retry cap — but "no progress" is the hard stop.

## Escalation

- **When the spec or plan is too large for a single pass:** Break the document into sections and run checks section by section. Present findings grouped by section.
- **When a check produces false positives:** Log the false positive and skip it. Do not block sign-off on a finding that the user has explicitly dismissed.
- **When the convergence loop makes no progress on the first iteration:** All remaining findings need user input. Skip directly to Phase 4 (SURFACE) without looping.
- **When graph queries are unavailable:** Fall back to document analysis and codebase reads. All checks are designed to work without graph. Do not block or warn about missing graph — just use the fallback path.
- **When codebase files referenced in the spec cannot be read:** Skip the feasibility sub-check for that file. Log the skip and continue. Do not block the review on inaccessible files.
- **When user resolutions repeatedly introduce new errors:** After 2 consecutive resolution attempts that each introduce a new error-severity finding, suggest pausing the soundness review to revisit the spec design holistically rather than fixing issues one at a time.
