# Harness Planning

> Implementation planning with atomic tasks, goal-backward must-haves, and complete executable instructions. Every task fits in one context window.

## When to Use

- After a design spec is approved (output of harness-brainstorming) and implementation needs to be planned
- When starting a new feature or project that needs structured task decomposition
- When `on_new_feature` or `on_project_init` triggers fire and the work is non-trivial
- When resuming a stalled project that needs a fresh plan
- NOT when the task is small enough to implement directly (under 15 minutes, single file — just do it)
- NOT when you need to explore the problem space first (use harness-brainstorming)
- NOT when a plan already exists and needs execution (use harness-execution)

## Process

### Iron Law

**Every task in the plan must be completable in one context window (2-5 minutes). If a task is larger, split it.**

A plan with vague tasks like "add validation" or "implement the service" is not a plan — it is a wish list. Every task must contain exact file paths, exact commands, and complete code snippets.

---

### Phase 1: SCOPE — Derive Must-Haves from Goals

Work backward from the goal. Do not start with "what should we build?" Start with "what must be true when we are done?"

1. **State the goal.** One sentence. What does the system do when this plan is complete?

2. **Derive observable truths.** What can be observed (by running a command, opening a browser, reading a file) that proves the goal is met? These are your acceptance criteria. Be specific:
   - BAD: "The API handles errors"
   - GOOD: "GET /api/users/nonexistent returns 404 with `{ error: 'User not found' }` body"

3. **Derive required artifacts.** For each observable truth, what files must exist? What functions must be implemented? What tests must pass? List exact file paths.

4. **Identify key links.** How do the artifacts connect? What imports what? What calls what? What data flows where? Draw the dependency graph mentally.

5. **Apply YAGNI.** For every artifact, ask: "Is this required for an observable truth?" If not, cut it.

#### EARS Requirement Patterns

When writing observable truths and acceptance criteria, use EARS (Easy Approach to Requirements Syntax) sentence patterns. These patterns eliminate ambiguity by forcing a consistent grammatical structure.

| Pattern          | Template                                                 | Use When                                          |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------- |
| **Ubiquitous**   | The system shall [behavior].                             | Behavior that always applies, unconditionally     |
| **Event-driven** | When [trigger], the system shall [response].             | Behavior triggered by a specific event            |
| **State-driven** | While [state], the system shall [behavior].              | Behavior that applies only during a certain state |
| **Optional**     | Where [feature is enabled], the system shall [behavior]. | Behavior gated by a configuration or feature flag |
| **Unwanted**     | If [condition], then the system shall not [behavior].    | Explicitly preventing undesirable behavior        |

**Worked Examples:**

1. **Ubiquitous:** "The system shall return JSON responses with `Content-Type: application/json` header."
2. **Event-driven:** "When a user submits an invalid form, the system shall display field-level error messages within 200ms."
3. **State-driven:** "While the database connection is unavailable, the system shall serve cached responses and log reconnection attempts."
4. **Optional:** "Where rate limiting is enabled, the system shall reject requests exceeding 100/minute per API key with HTTP 429."
5. **Unwanted:** "If the request body exceeds 10MB, then the system shall not attempt to parse it — return HTTP 413 immediately."

**When to use EARS:** Apply these patterns when writing observable truths in Phase 1. Not every criterion needs an EARS pattern — use them when the requirement is behavioral (not structural). File existence checks ("src/types/user.ts exists with User interface") do not need EARS framing.

---

### Phase 2: DECOMPOSE — Map File Structure and Create Tasks

1. **Map the file structure first.** Before writing any tasks, list every file that will be created or modified. This is where decomposition decisions are locked. Example:

   ```
   CREATE src/services/notification-service.ts
   CREATE src/services/notification-service.test.ts
   MODIFY src/services/index.ts (add export)
   CREATE src/types/notification.ts
   MODIFY src/api/routes/users.ts (add notification trigger)
   ```

2. **Decompose into atomic tasks.** Each task must:
   - Be completable in 2-5 minutes
   - Fit in a single context window
   - Have a clear, testable outcome
   - Follow TDD: write test, fail, implement, pass, commit
   - Produce one atomic commit

3. **Write complete instructions for each task.** Not summaries — complete executable instructions:
   - **Exact file paths** to create or modify
   - **Exact code** to write (not "add validation logic" — write the actual validation code)
   - **Exact test commands** to run (e.g., `npx vitest run src/services/notification-service.test.ts`)
   - **Exact commit message** to use
   - **`harness validate`** as the final step

4. **Include checkpoints.** Mark tasks that require human verification, decisions, or actions:
   - `[checkpoint:human-verify]` — Pause, show result, wait for confirmation
   - `[checkpoint:decision]` — Pause, present options, wait for choice
   - `[checkpoint:human-action]` — Pause, instruct human on what they need to do

---

### Phase 3: SEQUENCE — Order Tasks and Identify Dependencies

1. **Order by dependency.** Types before implementations. Implementations before integrations. Tests alongside their implementations (same task, TDD style).

2. **Identify parallel opportunities.** Tasks that touch different subsystems with no shared state can be marked as parallelizable (for harness-parallel-agents).

3. **Number tasks sequentially.** Use `Task 1`, `Task 2`, etc. Dependencies reference task numbers: "Depends on: Task 3."

4. **Estimate total time.** Each task is 2-5 minutes. Sum them. If the total exceeds the available time, identify a milestone boundary where the plan can be paused with a working system.

---

### Phase 4: VALIDATE — Review and Finalize the Plan

1. **Verify completeness.** Every observable truth from Phase 1 must be achievable by completing the tasks. Trace each truth to the specific task(s) that deliver it.

2. **Verify task sizing.** Read each task. Could an agent complete it in one context window without needing to explore or make decisions? If not, split it.

3. **Verify TDD compliance.** Every task that produces code must include a test step. No task should say "write tests later."

4. **Run `harness validate`** to verify project health before writing the plan.

5. **Check failures log.** Read `.harness/failures.md` before finalizing. If planned approaches match known failures, flag them with warnings.

6. **Write the plan to `docs/plans/`.** Use naming convention: `YYYY-MM-DD-<feature-name>-plan.md`. If the directory does not exist, create it.

7. **Write handoff.** Save `.harness/handoff.json` with the following structure:

   ```json
   {
     "fromSkill": "harness-planning",
     "phase": "VALIDATE",
     "summary": "<one-sentence description of what was planned>",
     "completed": [],
     "pending": ["<task 1>", "<task 2>", "..."],
     "concerns": ["<any concerns or risks identified>"],
     "decisions": ["<key decisions made during planning>"],
     "contextKeywords": ["<domain-relevant keywords>"]
   }
   ```

8. **Present the plan to the human for review.** Walk through the task list, the estimated timeline, and any checkpoints that require human input.

---

### Plan Document Structure

````markdown
# Plan: <Feature Name>

**Date:** YYYY-MM-DD
**Spec:** docs/specs/<spec-file>.md (if applicable)
**Estimated tasks:** N
**Estimated time:** N minutes

## Goal

One sentence.

## Observable Truths (Acceptance Criteria)

1. [observable truth]
2. [observable truth]

## File Map

- CREATE path/to/file.ts
- MODIFY path/to/other-file.ts

## Tasks

### Task 1: <descriptive name>

**Depends on:** none
**Files:** path/to/file.ts, path/to/file.test.ts

1. Create test file `path/to/file.test.ts`:
   ```typescript
   // exact test code
   ```
````

2. Run test: `npx vitest run path/to/file.test.ts`
3. Observe failure: [expected failure message]
4. Create implementation `path/to/file.ts`:
   ```typescript
   // exact implementation code
   ```
5. Run test: `npx vitest run path/to/file.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `feat(scope): descriptive message`

### Task 2: <descriptive name>

[checkpoint:human-verify]
...

````

## Harness Integration

- **`harness validate`** — Run during Phase 4 (before writing the plan) and included as a step in every task.
- **`harness check-deps`** — Referenced in tasks that add imports or create new modules. Ensures dependency boundaries are respected.
- **Plan location** — Plans go to `docs/plans/`. Follow the naming convention: `YYYY-MM-DD-<feature-name>-plan.md`.
- **Handoff to harness-execution** — Once the plan is approved, invoke harness-execution to begin task-by-task implementation.
- **Task commands** — Every task includes exact harness CLI commands to run (e.g., `harness validate`, `harness check-deps`).

## Change Specifications

When planning changes to existing functionality (not greenfield), express requirements as deltas from the current documented behavior. Use these markers:

- **[ADDED]** — New behavior that does not exist today
- **[MODIFIED]** — Existing behavior that changes
- **[REMOVED]** — Existing behavior that goes away

**Example:**
```markdown
## Changes to User Authentication

- [ADDED] Support OAuth2 refresh tokens with 7-day expiry
- [MODIFIED] Login endpoint returns `refreshToken` field alongside existing `accessToken`
- [MODIFIED] Token validation middleware accepts both JWT and OAuth2 tokens
- [REMOVED] Legacy API key authentication (deprecated in v2.1)
````

This is not mandatory for greenfield features. Only apply when modifying existing documented behavior.

When `docs/specs/` exists in the project, produce `docs/changes/<feature>/delta.md` alongside the task plan. This keeps the change intent separate from the full spec and makes review easier.

## Success Criteria

- A plan document exists in `docs/plans/` with all required sections
- Every task is completable in 2-5 minutes (one context window)
- Every task includes exact file paths, exact code, and exact commands
- Every code-producing task follows TDD: test first, fail, implement, pass
- Observable truths trace to specific tasks that deliver them
- File map lists every file to be created or modified
- Checkpoints are marked where human input is required
- `harness validate` passes before the plan is written
- `harness validate` is included as a step in every task
- The human has reviewed and approved the plan

## Examples

### Example: Planning a User Notification Feature

**Goal:** Users receive email and in-app notifications when their account is modified.

**Observable Truths:**

1. `POST /api/users/:id` with changed fields triggers a notification record in the database
2. `GET /api/notifications?userId=:id` returns the notification with type, message, and timestamp
3. Notification email is sent via the existing email utility (verified by mock in test)
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

**Task 2: Create notification service with create method (TDD)**

```
Files: src/services/notification-service.ts, src/services/notification-service.test.ts
1. Write test: create notification returns Notification object with correct fields
2. Run test — observe: NotificationService is not defined
3. Implement: NotificationService.create() stores and returns notification
4. Run test — observe: pass
5. Run: harness validate
6. Commit: "feat(notifications): add NotificationService.create"
```

**Task 3: Add list and expiry methods (TDD)**

```
[checkpoint:human-verify] — verify Task 2 output before continuing
Files: src/services/notification-service.ts, src/services/notification-service.test.ts
1. Write tests: list by userId, filter expired
2. Run tests — observe failures
3. Implement: list() and isExpired() methods
4. Run tests — observe: pass
5. Run: harness validate, harness check-deps
6. Commit: "feat(notifications): add list and expiry to NotificationService"
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No vague tasks.** "Implement the service" is not a task. Every task must have exact file paths, exact code, and exact commands. If you cannot write the code in the plan, you do not understand the task well enough to plan it.
- **No tasks larger than one context window.** If a task requires exploring the codebase, making design decisions, or touching more than 3 files, it is too large. Split it.
- **No skipping TDD in tasks.** Every task that produces code must start with writing a test. "Add tests later" is not allowed in a plan. If tests cannot be written first, the design is unclear — go back to brainstorming.
- **No plan without observable truths.** The plan must start with goal-backward acceptance criteria. If you cannot state what is observable when the plan is complete, you do not understand the goal.
- **No implementation during planning.** The plan is a document, not code. Do not "just start Task 1 while we are here." Write the plan, get approval, then use harness-execution.
- **File map must be complete.** Every file that will be created or modified must appear in the file map. Discovering new files during execution means the plan was incomplete.

## Escalation

- **When you cannot write exact code for a task:** The design is underspecified. Go back to the spec (or brainstorm if no spec exists). Do not write a vague task as a placeholder.
- **When task count exceeds 20:** The project may be too large for a single plan. Consider splitting into multiple plans with clear milestone boundaries.
- **When dependencies form a cycle:** The decomposition is wrong. Re-examine the file map and find a way to break the cycle (usually by extracting a shared type or interface).
- **When you discover the spec is missing information during planning:** Do not fill in the gaps yourself. Escalate: "The spec does not define behavior for [scenario]. This blocks Task N. We need to update the spec before continuing the plan."
- **When estimated time exceeds available time:** Identify a milestone boundary where the plan can be paused with a working system. Propose delivering the plan in phases, each phase producing a usable increment.
