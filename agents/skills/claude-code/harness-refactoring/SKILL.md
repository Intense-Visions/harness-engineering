# Harness Refactoring

> Safe refactoring with constraint verification at every step. Change structure without changing behavior, with harness checks as your safety net.

## When to Use

- When improving code structure, readability, or maintainability without changing behavior
- When reducing duplication (DRY refactoring)
- When moving code to the correct architectural layer
- When splitting large files or functions into smaller, focused ones
- When renaming for clarity across the codebase
- After completing a feature (post-TDD cleanup beyond single-cycle refactoring)
- NOT when adding new behavior (use harness-tdd instead)
- NOT when fixing bugs (use harness-tdd — write a failing test first)
- NOT when the test suite is already failing — fix the tests before refactoring

## Process

### Iron Rule

**All tests must pass BEFORE you start refactoring and AFTER every single change.**

If tests are not green before you start, you are not refactoring — you are debugging. Fix the tests first. If tests break during refactoring, undo the last change immediately. Do not try to fix forward.

### Phase 1: Prepare — Verify Starting State

1. **Run the full test suite.** Every test must pass. Record the count of passing tests — this number must not decrease at any point.

2. **Run `harness validate`** and **`harness check-deps`**. Both must pass. You are establishing a clean baseline. If either reports issues, fix those first (that is a separate task, not part of this refactoring).

3. **Identify the refactoring target.** Be specific: which file, function, class, or module? What is wrong with the current structure? What will be better after refactoring?

4. **Plan the steps.** Break the refactoring into the smallest possible individual changes. Each step should be independently committable and verifiable. If you cannot describe a step in one sentence, it is too large.

### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate context:

- `get_impact` — precise impact analysis: "if I move this function, what breaks?"
- `query_graph` — find all transitive consumers, not just direct importers

Catches indirect consumers that grep misses. Fall back to file-based commands if no graph is available.

### Phase 2: Execute — One Small Change at a Time

For EACH step in the plan:

1. **Make ONE small change.** Examples of "one small change":
   - Rename one variable or function
   - Extract one function from a larger function
   - Move one function to a different file
   - Inline one unnecessary abstraction
   - Replace one conditional with polymorphism
   - Remove one instance of duplication

2. **Run the full test suite.** All tests must pass. If any test fails:
   - **STOP immediately.**
   - **Undo the change** (git checkout the file or revert manually).
   - **Analyze why it broke.** Either the change was not purely structural (it changed behavior) or the tests are coupled to implementation details.
   - **Try a smaller step** or a different approach.

3. **Run `harness validate` and `harness check-deps`.** Both must pass. A refactoring that fixes code structure but violates architectural constraints is not safe.

4. **Commit the step.** Each step gets its own commit. The commit message describes the structural change: "extract validateInput from processOrder" or "move UserRepository to data-access layer."

5. **Repeat** for the next step in the plan.

### Phase 3: Verify — Confirm the Refactoring is Complete

1. **Run the full test suite one final time.** Same number of passing tests as Phase 1.

2. **Run `harness validate` and `harness check-deps` one final time.** Clean output.

3. **Review the cumulative diff.** Does the final state match the intended improvement? Is the code genuinely better, or just different?

4. **If the refactoring introduced no improvement,** revert the entire sequence. Refactoring for its own sake is churn.

## Common Refactoring Patterns

### Extract Function

**When:** A function is doing too many things, or a block of code is reused in multiple places.
**How:** Identify the block. Ensure all variables it uses are either parameters or local. Cut the block into a new function with a descriptive name. Replace the original block with a call to the new function.
**Harness guidance:** If the extracted function belongs in a different layer, move it there AND update the import. Run `harness check-deps` to verify the new import respects layer boundaries.

### Move to Layer

**When:** Code is in the wrong architectural layer (e.g., business logic in a UI component, database queries in a service).
**How:** Create the function in the correct layer. Update all callers to import from the new location. Delete the old function. Run `harness check-deps` after each step.
**Harness guidance:** This is where `harness check-deps` is most valuable. Moving code between layers changes the dependency graph. The tool will tell you immediately if the move created a violation.

### Split File

**When:** A file has grown too large or contains unrelated responsibilities.
**How:** Identify the cohesive groups within the file. Create new files, one per group. Move functions/classes to their new files. Update the original file to re-export from the new files (for backward compatibility) or update all callers.
**Harness guidance:** Run `harness validate` after splitting to ensure the new files follow naming conventions and are properly structured. Run `harness check-deps` to verify no new boundary violations.

### Inline Abstraction

**When:** An abstraction (class, interface, wrapper function) adds complexity without value. It has only one implementation, is never extended, and obscures what the code actually does.
**How:** Replace uses of the abstraction with the concrete implementation. Delete the abstraction. Run tests.
**Harness guidance:** Removing an abstraction may expose a layer violation that the abstraction was hiding. Run `harness check-deps` to check.

### Rename for Clarity

**When:** A name is misleading, ambiguous, or no longer reflects what the code does.
**How:** Use your editor's rename/refactor tool to change the name everywhere it appears. If the name is part of a public API, check for external consumers first.
**Harness guidance:** Run `harness check-docs` after renaming to detect documentation that still uses the old name. AGENTS.md, inline comments, and doc pages may all need updating.

## Harness Integration

- **`harness validate`** — Run before starting, after each step, and at the end. Catches structural issues, naming violations, and configuration drift.
- **`harness check-deps`** — Run after each step, especially when moving code between files or layers. Catches dependency violations introduced by structural changes.
- **`harness check-docs`** — Run after renaming or moving public APIs. Catches documentation that references old names or locations.
- **`harness cleanup`** — Run after completing a refactoring sequence. Detects dead code that the refactoring may have created (unused exports, orphaned files).

## Success Criteria

- All tests pass before, during, and after refactoring (same count, same results)
- `harness validate` passes at every step
- `harness check-deps` passes at every step
- Each step is an atomic commit with a clear structural description
- The code is measurably better after refactoring (clearer names, less duplication, correct layering, smaller functions)
- No behavioral changes were introduced (the test suite is the proof)
- No dead code was left behind (run `harness cleanup` to verify)

## Examples

### Example: Moving business logic out of a UI component

**Target:** `src/components/OrderSummary.tsx` contains a `calculateDiscount()` function with complex business rules. This logic belongs in the service layer.

**Step 1:** Create `src/services/discount-service.ts` with the `calculateDiscount` function copied from the component.

- Run tests: pass
- Run `harness check-deps`: pass (new file, no violations)
- Commit: "extract calculateDiscount to discount-service"

**Step 2:** Update `OrderSummary.tsx` to import `calculateDiscount` from `discount-service` instead of using the local function.

- Run tests: pass
- Run `harness check-deps`: pass (UI importing from service is allowed)
- Commit: "update OrderSummary to use discount-service"

**Step 3:** Delete the original `calculateDiscount` function from `OrderSummary.tsx`.

- Run tests: pass
- Run `harness check-deps`: pass
- Run `harness cleanup`: no dead code detected
- Commit: "remove duplicate calculateDiscount from OrderSummary"

**Final verification:** 3 steps, 3 commits, all tests green throughout, all harness checks passing. The business logic is now in the correct layer.

## Escalation

- **When tests fail during refactoring and you cannot figure out why:** Revert to the last green commit. The test failure means the change was not purely structural. Analyze the test to understand what behavioral assumption it depends on, then plan a different approach.
- **When `harness check-deps` fails after a move:** The code you moved may have dependencies that are not allowed in its new layer. You may need to refactor the moved code itself (remove forbidden imports) before it can live in the new layer.
- **When a refactoring requires changing tests:** This is a warning sign. If the tests need to change, the refactoring may be changing behavior. The only valid reason to change tests during refactoring is if the tests were testing implementation details (not behavior) — and in that case, fix the tests first as a separate step before refactoring.
- **When the refactoring scope keeps growing:** Stop. Commit what you have (if it is clean). Re-plan with a smaller scope. Large refactorings should be broken into multiple sessions, each leaving the code in a better state.
