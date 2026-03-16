# Harness Code Review

> Full code review lifecycle — request, perform, respond — with automated harness checks and technical rigor over social performance.

## When to Use

- When requesting a review of your completed work (before merge)
- When performing a review of someone else's code (human or agent)
- When responding to review feedback on your own code
- When `on_review` or `on_pr` triggers fire
- NOT for in-progress work (complete the feature first)
- NOT for rubber-stamping (if you cannot find issues, look harder or state confidence level)
- NOT for style-only feedback (leave that to linters)

## Context Assembly

Before beginning any review phase, assemble context proportional to the change size.

### 1:1 Context Ratio Rule

For every N lines of diff, gather approximately N lines of surrounding context. This ensures the reviewer understands the ecosystem around the change, not just the change itself.

- **Small diffs (<20 lines):** Gather proportionally more context — aim for 3:1 context-to-diff. Small changes often have outsized impact and need more surrounding understanding.
- **Medium diffs (20-200 lines):** Target 1:1 ratio. Read the full files containing changes, plus immediate dependencies.
- **Large diffs (>200 lines):** 1:1 ratio is the floor, but prioritize ruthlessly using the priority order below. Flag large diffs as a review concern — they are harder to review correctly.

### Context Gathering Priority Order

Gather context in this order until the ratio is met:

1. **Files directly imported/referenced by changed files** — read the modules that the changed code calls or depends on. Without this, you cannot evaluate correctness.
2. **Corresponding test files** — find tests for the changed code. If tests exist, read them to understand expected behavior. If tests are missing, note this as a finding.
3. **Spec/design docs mentioning changed components** — search `docs/specs/`, `docs/design-docs/`, and `docs/plans/` for references to the changed files or features. The spec defines "correct."
4. **Type definitions used by changed code** — read interfaces, types, and schemas that the changed code consumes or produces. Type mismatches are high-severity bugs.
5. **Recent commits touching the same files** — see Commit History below.

### Context Assembly Commands

```bash
# 1. Get the diff and measure its size
git diff --stat HEAD~1          # or the relevant commit range
git diff HEAD~1 -- <file>       # per-file diff

# 2. Find imports/references in changed files
grep -n "import\|require\|from " <changed-file>

# 3. Find corresponding test files
find . -name "*<module-name>*test*" -o -name "*<module-name>*spec*"

# 4. Search for spec/design references
grep -rl "<component-name>" docs/specs/ docs/design-docs/ docs/plans/

# 5. Find type definitions
grep -rn "interface\|type\|schema" <changed-file> | head -20
```

### Commit History Context

As part of context assembly (priority item #5), retrieve recent commit history for every affected file:

```bash
# Recent commits touching affected files (5 per file)
git log --oneline -5 -- <affected-file>

# For all affected files at once
git log --oneline -5 -- <file1> <file2> <file3>
```

Use commit history to answer:

- **Is this a hotspot?** If the file has been changed 3+ times in the last 5 commits, it is volatile. Pay extra attention — frequent changes suggest instability or ongoing refactoring.
- **Was this recently refactored?** If recent commits include "refactor" or "restructure," check whether the current change aligns with or contradicts the refactoring direction.
- **Who has been working here?** If multiple authors touched the file recently, there may be conflicting assumptions. Look for consistency.
- **What was the last change?** The most recent commit gives context on the file's trajectory. A bugfix followed by another change to the same area is a yellow flag.

### Review Learnings Calibration

Before starting the review, check for a project-specific calibration file:

```bash
# Check if review learnings file exists
cat .harness/review-learnings.md 2>/dev/null
```

If `.harness/review-learnings.md` exists:

1. **Read the Useful Findings section.** Prioritize these categories during review — they have historically caught real issues in this project.
2. **Read the Noise / False Positives section.** De-prioritize or skip these categories — flagging them wastes the author's time and erodes trust in the review process.
3. **Read the Calibration Notes section.** Apply these project-specific overrides to your review judgment. These represent deliberate team decisions, not oversights.

If the file does not exist, proceed with default review focus areas. After completing the review, consider suggesting that the team create `.harness/review-learnings.md` if you notice patterns that would benefit from calibration.

## Change-Type Detection

After assembling context, determine the change type. This shapes which checklist to apply during review.

### Detection Method

1. **Explicit argument:** If the review was invoked with a change type (e.g., `--type feature`), use it.
2. **Commit message prefix:** Parse the most recent commit message for conventional commit prefixes:
   - `feat:` or `feature:` → **feature**
   - `fix:` or `bugfix:` → **bugfix**
   - `refactor:` → **refactor**
   - `docs:` or `doc:` → **docs**
3. **Diff pattern heuristic:** If no prefix is found, examine the diff:
   - New files added + tests added → likely **feature**
   - Small changes to existing files + test added → likely **bugfix**
   - File renames, moves, or restructuring with no behavior change → likely **refactor**
   - Only `.md` files or comments changed → likely **docs**
4. **Default:** If detection is ambiguous, treat as **feature** (the most thorough checklist).

```bash
# Parse commit message prefix
git log --oneline -1 | head -1

# Check for new files
git diff --name-status HEAD~1 | grep "^A"

# Check if only docs changed
git diff --name-only HEAD~1 | grep -v "\.md$" | wc -l  # 0 means docs-only
```

### Per-Type Review Checklists

Apply the checklist matching the detected change type. These replace the generic review — do not apply all checklists to every change.

#### Feature Checklist

- [ ] **Spec alignment:** Does the implementation match the spec/design doc? Are all specified behaviors present?
- [ ] **Edge cases:** Are boundary conditions handled (empty input, max values, null, concurrent access)?
- [ ] **Test coverage:** Are there tests for happy path, error paths, and edge cases? Is coverage meaningful, not just present?
- [ ] **API surface:** Are new public interfaces minimal and well-named? Could any new export be kept internal?
- [ ] **Backward compatibility:** Does this break existing callers? If so, is the migration path documented?

#### Bugfix Checklist

- [ ] **Root cause identified:** Does the fix address the root cause, not just the symptom? Is the original issue referenced?
- [ ] **Regression test added:** Is there a test that would have caught this bug before the fix? Does it fail without the fix and pass with it?
- [ ] **No collateral changes:** Does the fix change only what is necessary? Unrelated changes in a bugfix PR are a red flag.
- [ ] **Original issue referenced:** Does the commit or PR reference the bug report or issue number?

#### Refactor Checklist

- [ ] **Behavioral equivalence:** Do all existing tests still pass without modification? If tests changed, justify why.
- [ ] **No functionality changes:** Does the refactor introduce any new behavior, even subtly? New behavior belongs in a feature PR.
- [ ] **Performance preserved:** Could the restructuring introduce performance regressions (e.g., extra allocations, changed query patterns)?
- [ ] **Improved clarity:** Is the code demonstrably clearer after the refactor? If not, the refactor may not be justified.

#### Docs Checklist

- [ ] **Accuracy vs. current code:** Do the documented behaviors match what the code actually does? Run the examples if possible.
- [ ] **Completeness:** Are all public interfaces documented? Are there undocumented parameters, return values, or error conditions?
- [ ] **Consistency:** Does the new documentation follow the same style, terminology, and structure as existing docs?
- [ ] **Links valid:** Do all internal links resolve? Are external links still live?

## Process

This skill covers three distinct roles. Follow the section that matches your current role.

---

### Role A: Requesting a Review

When you have completed work and need it reviewed.

#### 1. Prepare the Review Context

Before requesting review, assemble the following:

- **Commit range:** The exact SHAs or branch diff that constitute the change. Use `git log --oneline base..HEAD` to confirm.
- **Description:** A concise summary of WHAT changed and WHY. Not a commit-by-commit retelling — the reviewer can read the diff. Focus on intent, tradeoffs, and anything non-obvious.
- **Plan reference:** If this work implements a plan or spec, link to it. The reviewer needs to know what "correct" looks like.
- **Test evidence:** Confirm tests pass. Include the test command and output summary. If tests were skipped, explain why.
- **Harness check results:** Run `harness validate` and `harness check-deps` before requesting review. Include results. Fix any failures before requesting.

#### 2. Dispatch the Review

- **Identify the right reviewer.** For architectural changes, request review from someone who understands the architecture. For domain logic, someone who understands the domain.
- **Provide the context package** (SHAs, description, plan reference, test evidence, harness results). Do not make the reviewer hunt for context.
- **State what kind of feedback you want.** "Full review" vs "architecture only" vs "test coverage check" — be specific.

#### 3. Wait

Do not continue modifying the code under review. If you find issues while waiting, note them but do not push fixes until the review is complete. Interleaving changes with review creates confusion.

---

### Role B: Performing a Review

When you are reviewing someone else's code.

#### 1. Understand Before Judging

- **Read the description and plan first.** Understand what the change is trying to accomplish before reading code.
- **Read the full diff.** Do not skim. Read every changed file. If the diff is large (>500 lines), note this as a concern — large diffs are harder to review correctly.
- **Check the commit history.** Are commits atomic and well-described? Or is it one giant squash with "updates"?

#### 2. Run Automated Checks

Run these commands and include results in your review:

```bash
harness validate          # Full project health check
harness check-deps        # Dependency boundary verification
harness check-docs        # Documentation drift detection
```

If any check fails, this is a **Critical** issue. The code cannot merge with failing harness checks.

#### 3. Evaluate Code Quality

Review each changed file against these criteria:

**Separation of Concerns:**

- Does each function/module do one thing?
- Are responsibilities clearly divided between files?
- Is business logic separated from infrastructure?

**Error Handling:**

- Are errors handled at the appropriate level?
- Are error messages helpful for debugging?
- Are edge cases handled (null, empty, boundary values)?
- Do errors propagate correctly (not swallowed silently)?

**DRY (Don't Repeat Yourself):**

- Is there duplicated logic that should be extracted?
- Are there copy-pasted blocks with minor variations?
- BUT: do not flag intentional duplication (sometimes two similar things should remain separate because they will diverge).

**Naming and Clarity:**

- Do names communicate intent?
- Are abbreviations explained or avoided?
- Can you understand the code without reading the implementation of every called function?

#### 4. Evaluate Architecture

**SOLID Principles:**

- Single Responsibility: Does each module have one reason to change?
- Open/Closed: Can behavior be extended without modifying existing code?
- Dependency Inversion: Do modules depend on abstractions, not concretions?

**Layer Compliance:**

- Does the code respect the project's architectural layers?
- Are imports flowing in the correct direction?
- Does `harness check-deps` confirm no boundary violations?

**Pattern Consistency:**

- Does the code follow established patterns in the codebase?
- If introducing a new pattern, is it justified and documented?

#### 5. Evaluate Testing

**Real Tests:**

- Do tests exercise real behavior, not mock implementations?
- Do tests make meaningful assertions (not just "does not throw")?
- Are tests deterministic (no flaky timing, network, or randomness)?

**Edge Cases:**

- Are boundary conditions tested (empty input, max values, null)?
- Are error paths tested (invalid input, network failures, permission errors)?

**Coverage:**

- Is every new public function/method tested?
- Are critical paths covered (not just happy paths)?

#### 6. Write the Review

Structure your review output as follows:

**Strengths:** What is done well. Be specific. "Clean separation between X and Y" is useful. "Looks good" is not.

**Issues:** Categorize each issue:

- **Critical** — Must fix before merge. Bugs, security issues, failing harness checks, broken tests, architectural violations.
- **Important** — Should fix before merge. Missing error handling, missing tests for critical paths, unclear naming that will cause confusion.
- **Suggestion** — Consider for improvement. Style preferences, minor optimizations, alternative approaches. These do not block merge.

For each issue, provide:

1. The specific location (file and line or function name)
2. What the problem is
3. Why it matters
4. A suggested fix (if you have one)

**Assessment:** One of:

- **Approve** — No critical or important issues. Ready to merge.
- **Request Changes** — Critical or important issues must be addressed. Re-review needed after fixes.
- **Comment** — Observations only, no blocking issues, but author should consider feedback.

---

### Role C: Responding to Review Feedback

When you receive feedback on your code.

#### 1. Read All Feedback First

Read every comment before responding to any. Understand the full picture. Some comments may contradict each other or be resolved by the same fix.

#### 2. Verify Before Implementing

For each piece of feedback:

- **Do you understand it?** If not, ask for clarification. Do not guess at what the reviewer means.
- **Is it correct?** Verify the reviewer's claim. Read the code they reference. Run the scenario they describe. Reviewers make mistakes too.
- **Is it actionable?** Vague feedback ("this could be better") requires clarification. Ask for specific suggestions.

#### 3. Technical Rigor Over Social Performance

- **Do NOT agree with feedback just to be agreeable.** If the feedback is wrong, say so with evidence. "I considered that approach, but it does not work because [specific reason]" is a valid response.
- **Do NOT implement every suggestion.** Apply the YAGNI check to every suggestion: Does this change serve a current, concrete need? If it is speculative ("you might need this later"), push back.
- **Do NOT make changes you do not understand.** If a reviewer suggests a change and you cannot explain why it is better, do not make it. Ask them to explain.
- **DO acknowledge when feedback is correct.** "Good catch, fixing" is appropriate when the reviewer found a real issue.
- **DO push back when feedback contradicts the plan or spec.** The plan was approved. If review feedback wants to change the plan, that is a scope discussion, not a code review issue.

#### 4. Implement Fixes

For each accepted piece of feedback:

1. Make the change
2. Run the full test suite
3. Run `harness validate` and `harness check-deps`
4. Commit with a message referencing the review feedback

#### 5. Re-request Review

After addressing all feedback, re-request review with:

- Summary of what changed
- Which feedback was addressed and which was pushed back on (with reasons)
- Fresh harness check results

## Harness Integration

- **`harness validate`** — Run before requesting review and during review performance. Must pass for approval.
- **`harness check-deps`** — Run to verify dependency boundaries. Failures are Critical issues.
- **`harness check-docs`** — Run to detect documentation drift. If code changed but docs did not, flag as Important.
- **`harness cleanup`** — Optional during review to check for entropy accumulation in the changed files.

## Success Criteria

- Every review request includes: commit range, description, plan reference, test evidence, harness results
- Every review evaluates: code quality, architecture, testing, harness checks
- Every review uses the Strengths/Issues/Assessment format
- Issues are categorized as Critical/Important/Suggestion
- No code merges with Critical issues unresolved
- No code merges with failing harness checks
- Response to feedback is verified before implementation
- Pushback on incorrect feedback is evidence-based

## Examples

### Example: Reviewing a New API Endpoint

**Strengths:**

- Clean separation between route handler and service logic
- Input validation using Zod schemas with clear error messages
- Comprehensive test coverage including error paths

**Issues:**

**Critical:**

- `harness check-deps` fails: `api/routes/users.ts` imports directly from `db/queries.ts`, bypassing the service layer. Must route through `services/user-service.ts`.

**Important:**

- `services/user-service.ts:45` — `createUser` does not handle duplicate email. The database will throw a constraint violation that surfaces as a 500 error. Should catch and return a 409.
- Missing test for concurrent creation with same email.

**Suggestion:**

- Consider extracting the pagination logic in `api/routes/users.ts:30-55` into a shared utility — the same pattern exists in `api/routes/orders.ts`.

**Assessment:** Request Changes — one critical layer violation and one important missing error handler.

## Gates

- **Never skip review.** All code that will be merged must be reviewed. No exceptions for "small changes" or "obvious fixes."
- **Never merge with failing harness checks.** `harness validate` and `harness check-deps` must pass. This is a Critical issue, always.
- **Never implement feedback without verification.** Before changing code based on review feedback, verify the feedback is correct. Run the scenario. Read the code. Do not blindly comply.
- **Never agree performatively.** "Sure, I'll change that" without understanding why is forbidden. Every change must be understood.
- **Never skip the YAGNI check.** Every suggestion must answer: "Does this serve a current, concrete need?" Speculative improvements are rejected.

## Escalation

- **When reviewers disagree:** If two reviewers give contradictory feedback, escalate to the human or tech lead. Do not try to satisfy both.
- **When review feedback changes the plan:** If feedback requires changes that alter the approved plan or spec, pause the review. The plan must be updated and re-approved first.
- **When you cannot reproduce a reported issue:** Ask the reviewer for exact reproduction steps. If they cannot provide them, the issue may not be real.
- **When review is taking more than 2 rounds:** If the same code is going through a third round of review, something is fundamentally misaligned. Stop and discuss the approach in a meeting or synchronous conversation.
- **When harness checks fail and you believe the check is wrong:** Do not override or skip the check. File an issue against the harness configuration and work around the limitation until it is resolved.
