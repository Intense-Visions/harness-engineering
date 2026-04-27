# Harness Planning

> Implementation planning with atomic tasks, goal-backward must-haves, and complete executable instructions. Every task fits in one context window.

## When to Use

- After a design spec is approved (output of harness-brainstorming) and implementation needs planning
- When starting a new feature or project needing structured task decomposition
- When `on_new_feature` or `on_project_init` triggers fire and the work is non-trivial
- When resuming a stalled project that needs a fresh plan
- NOT for small tasks (under 15 minutes, single file — just do it)
- NOT for problem exploration (use harness-brainstorming)
- NOT when a plan exists and needs execution (use harness-execution)

## Process

### Iron Law

**Every task in the plan must be completable in one context window (2-5 minutes). If a task is larger, split it.**

A plan with vague tasks like "add validation" or "implement the service" is not a plan — it is a wish list. Every task must contain exact file paths, exact commands, and complete code snippets.

---

### Rigor Levels

The `rigorLevel` is passed by autopilot (or set via `--fast`/`--thorough` flags). Default is `standard`.

| Phase     | `fast`                                             | `standard` (default)                       | `thorough`                                          |
| --------- | -------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| SCOPE     | No change.                                         | No change.                                 | No change.                                          |
| KNOWLEDGE | Skip entirely.                                     | Run detect; fix if gaps found.             | Run detect; fix if gaps found.                      |
| DECOMPOSE | Skip skeleton. Full tasks directly after file map. | Skeleton if tasks >= 8; full tasks if < 8. | Always skeleton. Require approval before expanding. |
| SEQUENCE  | No change.                                         | No change.                                 | No change.                                          |
| VALIDATE  | No change.                                         | No change.                                 | No change.                                          |

The skeleton pass is the primary rigor lever. Fast mode goes straight to full detail. Thorough mode validates direction before investing tokens in expansion.

---

### Argument Resolution

When invoked by autopilot (or with explicit arguments), resolve paths before starting:

1. **Session slug:** If `session-slug` argument provided, set `{sessionDir} = .harness/sessions/<session-slug>/`. Pass to `gather_context({ session: "<session-slug>", include: ["state", "learnings", "handoff", "graph", "businessKnowledge", "sessions", "validation"] })`. All handoff writes go to `{sessionDir}/handoff.json`.
2. **Spec path:** If `spec-path` argument provided, read spec from that path. Otherwise, discover from `{sessionDir}/handoff.json` (read upstream brainstorming output) or prompt the user.
3. **Rigor level:** If `fast`/`thorough` argument provided, use it. Otherwise default to `standard`.

When no arguments are provided (standalone invocation), discover spec from context or prompt. Global `.harness/` paths used as fallback.

---

### Phase 1: SCOPE — Derive Must-Haves from Goals

Work backward from the goal. Start with "what must be true when we are done?"

1. **State the goal.** One sentence. What does the system do when this plan is complete?

1b. **Load skill recommendations.** After loading the spec, check for skill recommendations:

- If `docs/changes/<feature>/SKILLS.md` exists alongside the spec: parse the Apply and Reference tiers. These inform task annotation in Phase 2.
- If SKILLS.md is missing but a spec exists: run the advisor inline using `advise_skills` MCP tool to generate SKILLS.md.
- If neither SKILLS.md nor a spec exists: emit a one-line note:

  ```
  Note: No skill recommendations found. Run the advisor to discover
  relevant design, framework, and knowledge skills:
    harness advise-skills --spec-path <path>
  ```

Store the parsed skill list for use in Phase 2 task annotation.

2. **Review prior decisions.** Check `decisions` from the prior brainstorming session (loaded via `sessions` in gather_context). Do not re-decide what was already decided — build on those choices.

3. **Derive observable truths.** What can be observed (running a command, opening a browser, reading a file) that proves the goal is met? Be specific:
   - BAD: "The API handles errors"
   - GOOD: "GET /api/users/nonexistent returns 404 with `{ error: 'User not found' }` body"
4. **Derive required artifacts.** For each truth, what files must exist? What functions? What tests pass? List exact file paths.
5. **Identify key links.** How do artifacts connect? What imports what? What calls what?
6. **Apply YAGNI.** For every artifact: "Is this required for an observable truth?" If not, cut it.

7. **Surface uncertainties.** Before proceeding to Phase 2, explicitly list what you do NOT know. For each uncertainty, classify it:
   - **Blocking:** Cannot decompose tasks without resolving this. Escalate to user.
   - **Assumption:** Can proceed with a stated assumption. Document it. If wrong, specific tasks will need revision.
   - **Deferrable:** Does not affect task decomposition. Note for execution phase.

   Format:

   ```
   ## Uncertainties
   - [BLOCKING] How should the API handle partial failures? (Spec does not define.)
   - [ASSUMPTION] Database supports transactions. (If not, Task 3 needs redesign.)
   - [DEFERRABLE] Exact error message wording. (Can be finalized during implementation.)
   ```

   **Read-only constraint:** Steps 1-6 above are research and analysis. Do not propose task structure, file organization, or implementation approaches during SCOPE. Record what must be true (observable truths) and what you do not know (uncertainties). Solutions belong in DECOMPOSE.

   When scope is ambiguous, use `emit_interaction`:

   ```json
   emit_interaction({
     path: "<project-root>",
     type: "question",
     question: {
       text: "The spec mentions X but does not define behavior for Y. Should we:",
       options: [
         {
           label: "A) Include Y in this plan",
           pros: ["Complete feature in one pass", "No follow-up coordination"],
           cons: ["Increases scope and time", "May delay delivery"],
           risk: "medium",
           effort: "high"
         },
         {
           label: "B) Defer Y to a follow-up plan",
           pros: ["Keeps current plan focused", "Ship sooner"],
           cons: ["Y remains unhandled", "May need rework when Y is added"],
           risk: "low",
           effort: "low"
         },
         {
           label: "C) Update the spec first",
           pros: ["Design is complete before planning", "No surprises during execution"],
           cons: ["Blocks planning until spec is updated", "Extra round-trip"],
           risk: "low",
           effort: "medium"
         }
       ],
       recommendation: {
         optionIndex: 1,
         reason: "Keeping the current plan focused reduces risk. Y can be addressed in a follow-up.",
         confidence: "medium"
       }
     }
   })
   ```

#### EARS Requirement Patterns

Use EARS (Easy Approach to Requirements Syntax) when writing observable truths. These patterns eliminate ambiguity via consistent grammatical structure.

| Pattern          | Template                                                 | Use When                        |
| ---------------- | -------------------------------------------------------- | ------------------------------- |
| **Ubiquitous**   | The system shall [behavior].                             | Always applies, unconditionally |
| **Event-driven** | When [trigger], the system shall [response].             | Triggered by a specific event   |
| **State-driven** | While [state], the system shall [behavior].              | Only during a certain state     |
| **Optional**     | Where [feature is enabled], the system shall [behavior]. | Gated by config or feature flag |
| **Unwanted**     | If [condition], then the system shall not [behavior].    | Preventing undesirable behavior |

**Worked Examples:**

1. **Ubiquitous:** "The system shall return JSON responses with `Content-Type: application/json` header."
2. **Event-driven:** "When a user submits an invalid form, the system shall display field-level error messages within 200ms."
3. **State-driven:** "While the database connection is unavailable, the system shall serve cached responses and log reconnection attempts."
4. **Optional:** "Where rate limiting is enabled, the system shall reject requests exceeding 100/minute per API key with HTTP 429."
5. **Unwanted:** "If the request body exceeds 10MB, then the system shall not attempt to parse it — return HTTP 413 immediately."

Apply EARS for behavioral requirements, not structural checks (e.g., file existence does not need EARS framing).

### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster context:

- `query_graph` — discover module dependencies for realistic task decomposition
- `get_impact` — estimate which modules a feature touches
- `compute_blast_radius` — simulate failure propagation from target files to understand scope
- `predict_failures` — forecast which architectural constraints are at risk from planned changes, informing where extra test coverage or smaller tasks are needed
- `detect_anomalies` — identify structural irregularities in the affected area before planning tasks around them

Fall back to file-based commands if no graph is available.

### Intelligence Signals (when orchestrator is available)

If the orchestrator is running, request intelligence analysis via `POST /api/analyze` with the feature title/description before decomposing. The pipeline returns:

- **SEL** (Spec Enrichment) — affected systems and blast radius derived from the graph
- **CML** (Complexity Modeling) — structural, semantic, and historical complexity scores. Use `structuralComplexity > 0.7` to flag areas needing smaller, more cautious tasks.
- **PESL** (Pre-Execution Simulation) — simulated risk score. Use `riskScore > 0.6` to add extra checkpoints or split risky tasks further.

If no orchestrator, `predict_failures` and `compute_blast_radius` MCP tools provide equivalent directional signals.

---

### Phase 1.5: KNOWLEDGE BASELINE — Materialize Domain Knowledge

Before decomposing into tasks, ensure domain knowledge from PRDs and specs is documented. **Skip this phase** when no PRDs, specs, or business domain documents exist in the project, or when rigor level is `fast`.

1. **Run knowledge pipeline in detect mode.** Execute `harness knowledge-pipeline --domain <feature-domain>` to produce a differential gap report comparing extracted business rules against documented knowledge in `docs/knowledge/`.

2. **If gaps exist and `--fix` is appropriate,** run `harness knowledge-pipeline --fix --domain <feature-domain>` to materialize `docs/knowledge/{domain}/*.md` files from extracted findings. This creates the knowledge baseline from PRDs before any tasks are written.

3. **Cross-check uncertainties against materialized knowledge** (from `businessKnowledge` loaded in gather_context and freshly materialized docs):
   - Remove "assumptions" from the uncertainty list that are now documented facts in `docs/knowledge/`
   - Escalate if contradictions exist between PRDs and existing knowledge docs
   - Use `business_fact` nodes from the graph context to validate domain assumptions

4. **Reference materialized knowledge in Phase 2 task decomposition.** Tasks should reference specific knowledge docs they implement. Observable truths should map back to documented business rules. Use the `businessKnowledge` context (domains, tags, documented facts) loaded in Phase 1 to ground task instructions in verified domain knowledge rather than assumptions.

---

### Phase 2: DECOMPOSE — Map File Structure and Create Tasks

Report progress: `**[Phase 2/4]** DECOMPOSE — mapping file structure and creating tasks`

1. **Map the file structure first.** List every file to create or modify before writing tasks:

   ```
   CREATE src/services/notification-service.ts
   CREATE src/services/notification-service.test.ts
   MODIFY src/services/index.ts (add export)
   CREATE src/types/notification.ts
   MODIFY src/api/routes/users.ts (add notification trigger)
   ```

2. **Skeleton pass (rigor-gated).** Lightweight skeleton (~200 tokens) validates direction before full expansion. Gating per Rigor Levels table.

   **Format:** Numbered logical groups with task count and time. No file paths, code, or details.

   ```
   1. Foundation types and interfaces (~3 tasks, ~10 min)
   2. Core scoring module with TDD (~2 tasks, ~8 min)
   3. CLI integration and flag parsing (~4 tasks, ~15 min)
   **Estimated total:** 8 tasks, ~33 minutes
   ```

   **Approval gate:** Present via `emit_interaction` (type: `confirmation`, text: "Approve skeleton direction?"). If approved, proceed to step 3. If rejected, revise and re-present.

3. **Decompose into atomic tasks.** Each task must:
   - Be completable in 2-5 minutes, fit in a single context window
   - Have a clear, testable outcome
   - Follow TDD: write test, fail, implement, pass, commit
   - Produce one atomic commit

4. **Write complete instructions for each task.** Not summaries — complete executable instructions:
   - **Exact file paths** to create or modify
   - **Exact code** to write (not "add validation logic" — write the actual code)
   - **Exact test commands** (e.g., `npx vitest run src/services/notification-service.test.ts`)
   - **Exact commit message**
   - **`harness validate`** as the final step

5. **Skill annotations.** If skill recommendations were loaded in Phase 1, annotate each task with relevant skills from the Apply and Reference tiers:

   ```
   ### Task 3: Implement dark mode toggle
   **Skills:** `design-dark-mode` (apply), `a11y-color-contrast` (reference)
   ```

   Match skills to tasks based on keyword and domain overlap between the task description and the skill's purpose/keywords. Only annotate when the match is relevant to the specific task.

6. **Include checkpoints.** Mark tasks requiring human input:
   - `[checkpoint:human-verify]` — Pause, show result, wait for confirmation
   - `[checkpoint:decision]` — Pause, present options, wait for choice
   - `[checkpoint:human-action]` — Pause, instruct human on required action

7. **Derive integration tasks from the spec's Integration Points section.** If the spec contains an Integration Points section, create tasks for each non-empty integration point. Skip subsections marked "None" — do not derive tasks from them. Integration tasks are normal plan tasks but tagged with `category: "integration"` in their description. They appear at the end of the task list, after all implementation tasks.

   For each subsection of Integration Points, derive tasks:

   | Integration Point                               | Example Derived Task                                                       |
   | ----------------------------------------------- | -------------------------------------------------------------------------- |
   | Entry Points: "New CLI command"                 | "Regenerate barrel exports. Verify new command appears in `_registry.ts`." |
   | Registrations Required: "Skill at tier 2"       | "Add skill to tier list in `AGENTS.md`. Generate slash commands."          |
   | Documentation Updates: "AGENTS.md capabilities" | "Update AGENTS.md to describe the feature."                                |
   | Architectural Decisions: "ADR for approach X"   | "Write ADR `docs/knowledge/decisions/NNNN-<slug>.md`."                     |
   | Knowledge Impact: "Domain concept Y"            | "Enrich knowledge graph with concept node."                                |

   Integration tasks follow the same atomic task rules (2-5 minutes, exact file paths, exact code). Use the `**Category:** integration` tag in the task header, e.g.:

   ```
   ### Task N: Update AGENTS.md with new feature description

   **Depends on:** Task N-1 | **Files:** `AGENTS.md` | **Category:** integration
   ```

   If the spec has no Integration Points section, skip this step.

---

### Phase 3: SEQUENCE — Order Tasks and Identify Dependencies

1. **Order by dependency.** Types before implementations. Implementations before integrations. Integration tasks (tagged `category: "integration"`) after all implementation tasks. Tests alongside implementations (same task, TDD style).
2. **Identify parallel opportunities.** Tasks touching different subsystems with no shared state can be marked parallelizable.
3. **Number tasks sequentially.** Use `Task 1`, `Task 2`, etc. Dependencies reference task numbers.
4. **Estimate total time.** Sum 2-5 minutes per task. If total exceeds available time, identify a milestone boundary for pausing.

---

### Phase 4: VALIDATE — Review and Finalize the Plan

1. **Verify completeness.** Every observable truth from Phase 1 must trace to specific task(s) that deliver it.
2. **Verify task sizing.** Could an agent complete each task in one context window without exploring or deciding? If not, split it.
3. **Verify TDD compliance.** Every code-producing task must include a test step. No "write tests later."
4. **Run `harness validate`** to verify project health before writing the plan.
5. **Check failures log.** Read `.harness/failures.md`. If planned approaches match known failures, flag them.
6. **Run soundness review.** Invoke `harness-soundness-review --mode plan` against the draft. Do not proceed until the review converges with no remaining issues.
7. **Write the plan to `docs/plans/`.** Naming: `YYYY-MM-DD-<feature-name>-plan.md`. Create directory if needed.
8. **Write handoff.** Write to the session-scoped path when session slug is known, otherwise fall back to global path:
   - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
   - Global (fallback, **deprecated**): `.harness/handoff.json`

   > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always use `.harness/sessions/<slug>/handoff.json` to prevent cross-session contamination.

   Fields: `fromSkill`, `phase`, `summary`, `completed`, `pending`, `concerns`, `decisions`, `contextKeywords`.

9. **Write session summary (if session is known).** Call `writeSessionSummary` with skill, status, plan path, keyContext, nextStep. Skip if no session slug.

10. **Request plan sign-off:** Use `emit_interaction` (type: `confirmation`) with plan path, task count, and time estimate.

11. **Suggest transition to execution.** After approval, call `emit_interaction` with type: `transition`, `completedPhase: "planning"`, `suggestedNext: "execution"`, `requiresConfirmation: true`. Include `qualityGate` with checks: plan-written, harness-validate, observable-truths-traced, human-approved. If confirmed: invoke harness-execution. If declined: stop (handoff already written).

---

### Plan Document Structure

```markdown
# Plan: <Feature Name>

**Date:** YYYY-MM-DD | **Spec:** (if applicable) | **Tasks:** N | **Time:** N min | **Integration Tier:** small | medium | large

## Goal

One sentence.

## Observable Truths (Acceptance Criteria)

1. [observable truth]

## File Map

- CREATE path/to/file.ts
- MODIFY path/to/other-file.ts

## Skeleton (if produced)

1. <group name> (~N tasks, ~N min)
   _Skeleton approved: yes/no._

## Tasks

### Task 1: <descriptive name>

**Depends on:** none | **Files:** path/to/file.ts, path/to/file.test.ts

1. Create test file with exact test code
2. Run test — observe failure
3. Create implementation with exact code
4. Run test — observe pass
5. Run: `harness validate`
6. Commit: `feat(scope): descriptive message`

### Task 2: <descriptive name>

[checkpoint:human-verify] ...
```

### Integration Tier Heuristics

When a spec contains an **Integration Points** section, set the plan's `integrationTier` field based on scope:

| Tier       | Signal                                                               | Integration Requirements                                                 |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **small**  | Bug fix, config change, < 3 files, no new exports                    | Wiring checks only (defaults always run)                                 |
| **medium** | New feature within existing package, new exports, 3-15 files         | Wiring + project updates (roadmap, changelog, graph enrichment)          |
| **large**  | New package, new skill, new public API surface, architectural change | Wiring + project updates + knowledge materialization (ADRs, doc updates) |

If the spec has no Integration Points section, omit the `integrationTier` field from the plan header.

## Session State

| Section       | Read | Write | Purpose                                                           |
| ------------- | ---- | ----- | ----------------------------------------------------------------- |
| terminology   | yes  | no    | Consistent language in plan                                       |
| decisions     | yes  | yes   | Brainstorming decisions; planning-phase decisions                 |
| constraints   | yes  | yes   | Existing constraints; constraints discovered during decomposition |
| risks         | yes  | yes   | Existing risks; implementation risks from task design             |
| openQuestions | yes  | yes   | Unresolved questions; new questions; resolve answered ones        |
| evidence      | yes  | yes   | Prior evidence; file:line citations for task specs                |

**When to write:** Phase 1 — constraints and risks. Phase 2 — decisions about task structure. Phase 4 — resolve questions.

**When to read:** Start of Phase 1 via `gather_context` with `include: ["state", "learnings", "handoff", "graph", "businessKnowledge", "sessions", "validation"]` to inherit brainstorming context and load documented business knowledge.

## Evidence Requirements

When referencing existing code in task specs, cite evidence using `file:line` format, code pattern references, or test output. Write to `evidence` session section via `manage_state`.

**When to cite:** Phase 1 (existing files), Phase 2 (file paths and patterns), file map (existing files for modification).

**Uncited claims:** Prefix with `[UNVERIFIED]`.

## Harness Integration

- **`harness validate`** — Run in Phase 4 (before writing plan) and included in every task.
- **`harness check-deps`** — Referenced in tasks adding imports or creating modules.
- **Plan location** — `docs/plans/YYYY-MM-DD-<feature-name>-plan.md`.
- **Handoff** — Once approved, invoke harness-execution for task-by-task implementation.
- **Session directory** — Session-scoped writes go to `.harness/sessions/<slug>/`. Structure: `handoff.json`, `state.json`, `artifacts.json` (registry of spec/plan paths and produced file lists). Global `.harness/handoff.json` is deprecated for session-aware invocations.
- **`emit_interaction`** — Call at end of Phase 4 to suggest transitioning to execution (confirmed transition).
- **Rigor levels** — `--fast`/`--thorough` control skeleton pass. See Rigor Levels table.
- **Two-pass planning** — Skeleton (~200 tokens) before full expansion. Catches directional errors early.

## Change Specifications

When planning changes to existing functionality (not greenfield), express requirements as deltas:

- **[ADDED]** — New behavior that does not exist today
- **[MODIFIED]** — Existing behavior that changes
- **[REMOVED]** — Existing behavior that goes away

**Example:**

```markdown
## Changes to User Authentication

- [ADDED] OAuth2 refresh tokens with 7-day expiry
- [MODIFIED] Login endpoint returns `refreshToken` alongside `accessToken`
- [MODIFIED] Token validation accepts both JWT and OAuth2 tokens
- [REMOVED] Legacy API key authentication (deprecated in v2.1)
```

Only apply when modifying existing documented behavior. When `docs/changes/` exists, produce `docs/changes/<feature>/delta.md` alongside the task plan.

## Success Criteria

- Plan document exists in `docs/plans/` with all required sections
- Every task completable in 2-5 minutes (one context window)
- Every task includes exact file paths, exact code, and exact commands
- Every code-producing task follows TDD: test first, fail, implement, pass
- Observable truths trace to specific tasks
- File map lists every file to create or modify
- Checkpoints marked where human input is required
- `harness validate` passes before plan is written and is in every task
- Human has reviewed and approved the plan
- Rigor level rules followed: fast skips skeleton; thorough always skeletons with approval; standard skeletons at >= 8 tasks

## Red Flags

| Flag                                                                         | Corrective Action                                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "I know the implementation well enough to skip reading the spec"             | STOP. Phase 1 SCOPE starts by reading the spec. Assumptions about spec content lead to plans that implement the wrong thing.                                  |
| "This task is self-explanatory, no need for exact file paths and commands"   | STOP. Iron Law: every task must contain exact file paths, exact commands, and complete code snippets. "Implement the service" is a wish, not a task.          |
| "I'll plan the happy path now and add error handling tasks later"            | STOP. Error handling is not optional. The spec's success criteria include error scenarios. Plan them alongside the happy path.                                |
| `// detailed steps TBD` or `// expand during execution` in task descriptions | STOP. A task that defers detail to execution is a vague task. If you cannot write the exact steps now, you do not understand the task well enough to plan it. |

## Rationalizations to Reject

| Rationalization                                                                                               | Reality                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The task is conceptually clear so I do not need to include exact code in the plan"                           | Every task must have exact file paths, exact code, and exact commands. If you cannot write the code in the plan, you do not understand the task well enough to plan it.                                     |
| "This task touches 5 files but it is logically one unit of work, so splitting it would add overhead"          | Tasks touching more than 3 files must be split. The overhead of splitting is far less than the cost of a failed oversized task.                                                                             |
| "Tests for this task can be added in a follow-up task since the implementation is straightforward"            | No skipping TDD in tasks. Every code-producing task must start with writing a test. "Add tests later" is explicitly forbidden.                                                                              |
| "The spec does not cover this edge case, but I can fill in the gap during planning"                           | When the spec is missing information, do not fill in the gaps yourself. Escalate. Filling gaps silently creates undocumented design decisions that no one reviewed.                                         |
| "I discovered we need an additional file during decomposition, but updating the file map is just bookkeeping" | The file map must be complete. Every file that will be created or modified must appear in the file map before task decomposition.                                                                           |
| "There are no real uncertainties — the spec is clear enough"                                                  | Every plan has unknowns. If you listed zero uncertainties, you skipped the step. Re-read the spec and list what is assumed but not stated.                                                                  |
| "I already know how to structure this, no need to finish scoping"                                             | Premature decomposition anchors on the first approach found. Complete SCOPE (observable truths + uncertainties) before proposing any task structure.                                                        |
| "The skeleton pass adds overhead for a plan this size — I will go straight to full tasks"                     | Rigor level rules are not optional. In thorough mode, the skeleton is always required. In standard mode, 8+ tasks require a skeleton. Skipping it risks task-level misalignment with the goal.              |
| "I will write implementation code in the plan to make the tasks more concrete"                                | Planning produces a plan document, not code. Writing code during planning violates the phase boundary — code belongs in execution. Exact snippets in task descriptions are plan content, not executed code. |

## Examples

### Example: Planning a User Notification Feature

**Goal:** Users receive email and in-app notifications when their account is modified.

**Observable Truths:**

1. `POST /api/users/:id` with changed fields triggers a notification record in the database
2. `GET /api/notifications?userId=:id` returns notification with type, message, timestamp
3. Notification email sent via existing email utility (verified by mock in test)
4. `npx vitest run src/services/notification-service.test.ts` passes with 8+ tests
5. `harness validate` passes

**File Map:**

```
CREATE src/types/notification.ts
CREATE src/services/notification-service.ts
CREATE src/services/notification-service.test.ts
MODIFY src/services/index.ts
MODIFY src/api/routes/users.ts
MODIFY src/api/routes/users.test.ts
```

**Skeleton:** _Not produced — task count (6) below threshold (8)._

**Task 1: Define notification types**

```
Files: src/types/notification.ts
1. Create src/types/notification.ts:
   export interface Notification {
     id: string;
     userId: string;
     type: 'account_modified';
     message: string;
     read: boolean;
     createdAt: Date;
     expiresAt: Date;
   }
2. Run: harness validate
3. Commit: "feat(notifications): define Notification type"
```

**Task 2 (TDD):** Write test for NotificationService.create(). Observe failure. Implement. Observe pass. Validate. Commit.

**Task 3 (TDD):** `[checkpoint:human-verify]` — Write tests for list() and isExpired(). Observe failures. Implement. Observe pass. Validate + check-deps. Commit.

### Example: Skeleton (thorough mode)

**Goal:** Add rate limiting to all API endpoints.

**Skeleton:** 1) Rate limit types (~2 tasks, ~7 min) 2) Middleware with Redis (~3 tasks, ~12 min) 3) Route integration (~4 tasks, ~15 min) 4) Integration tests (~3 tasks, ~10 min). **Total:** 12 tasks, ~44 min. Presented for approval. Approved. Expanded to full tasks.

## Gates

- **No vague tasks.** Every task must have exact file paths, exact code, and exact commands. If you cannot write the code, you do not understand the task well enough.
- **No tasks larger than one context window.** If a task requires exploring, deciding, or touching more than 3 files, split it.
- **No skipping TDD.** Every code-producing task starts with a test. "Add tests later" is not allowed.
- **No plan without observable truths.** Must start with goal-backward acceptance criteria.
- **No implementation during planning.** Write the plan, get approval, then use harness-execution.
- **File map must be complete.** Every file to create or modify must appear before task decomposition.
- **Uncertainties must be surfaced.** Phase 1 must produce an uncertainties list. Zero uncertainties means the step was skipped. Blocking uncertainties must be resolved before Phase 2.

## Escalation

- **Cannot write exact code for a task:** Design is underspecified. Return to spec or brainstorm. Do not write vague placeholders.
- **Task count exceeds 20:** Consider splitting into multiple plans with milestone boundaries.
- **Dependencies form a cycle:** Re-examine file map. Break the cycle by extracting a shared type or interface.
- **Spec is missing information:** Do not fill gaps yourself. Escalate: "The spec does not define behavior for [scenario]. This blocks Task N."
- **Estimated time exceeds available time:** Identify a milestone boundary for pausing. Propose delivering in phases, each producing a usable increment.
