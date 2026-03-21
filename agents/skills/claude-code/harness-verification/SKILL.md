# Harness Verification

> 3-level evidence-based verification. No completion claims without fresh evidence. "Should work" is not evidence.

## When to Use

- After completing any implementation task (before claiming "done")
- After executing a plan or spec (verify all deliverables)
- When validating work done by another agent or in a previous session
- When resuming work after a context reset (re-verify before continuing)
- When `on_commit` or `on_pr` triggers fire and verification is needed
- NOT as a replacement for tests (verification checks that tests exist and pass, not that logic is correct)
- NOT for in-progress work (verify at completion boundaries, not mid-stream)

### Verification Tiers

Harness uses a two-tier verification model:

| Tier           | Skill                             | When                       | What                                               |
| -------------- | --------------------------------- | -------------------------- | -------------------------------------------------- |
| **Quick gate** | harness-execution (built-in)      | After every task           | test + lint + typecheck + build + harness validate |
| **Deep audit** | harness-verification (this skill) | Milestones, PRs, on-demand | EXISTS → SUBSTANTIVE → WIRED                       |

Use this skill (deep audit) for milestone boundaries, before creating PRs, or when the quick gate passes but something feels wrong. Do NOT invoke this skill after every individual task — that is what the quick gate handles.

## Process

### Iron Law

**No completion claim may be made without fresh verification evidence collected in THIS session.**

Cached results, remembered outcomes, and "it worked last time" are not evidence. Run the checks. Read the output. Report what you observed.

The words "should", "probably", "seems to", and "I believe" are forbidden in verification reports. Replace with "verified: [evidence]" or "not verified: [what is missing]."

---

### Level 1: EXISTS — The Artifact Is Present

For every artifact that was supposed to be created or modified:

1. **Check that the file exists on disk.** Use `ls`, `stat`, or read the file. Do not assume it exists because you wrote it — file writes can fail silently.

2. **Check that the file has content.** An empty file is not an artifact. Read the file and confirm it has non-trivial content.

3. **Check the file is in the right location.** Compare the actual path against the spec or plan. A file in the wrong directory is not "present."

4. **Record the result.** For each expected artifact:
   ```
   [EXISTS: PASS] path/to/file.ts (247 lines)
   [EXISTS: FAIL] path/to/missing-file.ts — file not found
   ```

Do not proceed to Level 2 until all Level 1 checks pass. Missing files must be created first.

---

### Level 2: SUBSTANTIVE — Not a Stub

For every artifact that passed Level 1:

1. **Read the file content.** Do not skim — read it thoroughly.

2. **Scan for anti-patterns** that indicate stub or placeholder implementations:
   - `TODO` or `FIXME` comments (especially `TODO: implement`)
   - `throw new Error('not implemented')`
   - `() => {}` (empty arrow functions)
   - `return null`, `return undefined`, `return {}` as the only logic
   - `pass` (Python placeholder)
   - `placeholder`, `stub`, `mock` in non-test code
   - Functions with only a comment describing what they should do
   - Interfaces or types defined but never implemented

3. **Verify real implementation exists.** The file must contain actual logic that performs the described behavior. A function that only returns a hardcoded value is a stub unless that is the correct behavior.

4. **Check for completeness against the spec.** If the spec says "handles errors X, Y, Z," verify all three are handled, not just X.

5. **Record the result.** For each artifact:
   ```
   [SUBSTANTIVE: PASS] path/to/file.ts — real implementation, no stubs
   [SUBSTANTIVE: FAIL] path/to/file.ts — contains TODO on line 34, empty handler on line 67
   ```

Do not proceed to Level 3 until all Level 2 checks pass. Stubs must be replaced with real implementations first.

---

### Level 3: WIRED — Connected to the System

For every artifact that passed Level 2:

1. **Verify the artifact is imported/required** by at least one other file in the system (unless it is an entry point).

2. **Verify the artifact is called/used.** An import that is never called is dead code. Trace the usage:
   - Functions: called from at least one other function or test
   - Components: rendered in at least one parent or route
   - Types: used in at least one function signature or variable declaration
   - Configuration: loaded and applied by the system
   - Tests: executed by the test runner

3. **Verify the artifact is tested.** There must be at least one test that exercises the artifact's behavior. Check:
   - Test file exists
   - Test imports or references the artifact
   - Test makes assertions about the artifact's behavior
   - Test actually runs (not skipped with `.skip` or `xit`)

4. **Run the tests.** Execute the test suite and verify tests pass. Do not trust "they passed earlier" — run them now.

5. **Run harness checks.** Execute `harness validate` and verify the artifact integrates correctly with the project's constraints.

6. **Record the result.** For each artifact:
   ```
   [WIRED: PASS] path/to/file.ts — imported by 3 files, tested in file.test.ts (4 tests, all pass)
   [WIRED: FAIL] path/to/file.ts — exported but not imported by any other file
   ```

---

### Anti-Pattern Scan

Run this scan across all changed files as a final check:

```
Scan targets: TODO, FIXME, XXX, HACK, PLACEHOLDER, NOT_IMPLEMENTED
Code patterns: () => {}, return null (as sole body), pass, raise NotImplementedError
Test patterns: .skip, xit, xdescribe, @pytest.mark.skip, pending
```

Any match is a verification failure. Either fix it or explicitly document why it is acceptable (e.g., "TODO is tracked in issue #123 and out of scope for this task").

---

### Gap Identification

After running all three levels, produce a structured gap report:

```
## Verification Report

### Level 1: EXISTS
- [PASS] path/to/file-a.ts (120 lines)
- [PASS] path/to/file-b.ts (85 lines)
- [FAIL] path/to/file-c.ts — not found

### Level 2: SUBSTANTIVE
- [PASS] path/to/file-a.ts — real implementation
- [FAIL] path/to/file-b.ts — TODO on line 22

### Level 3: WIRED
- [PASS] path/to/file-a.ts — imported, tested, harness passes
- [NOT CHECKED] path/to/file-b.ts — blocked by Level 2 failure

### Anti-Pattern Scan
- path/to/file-b.ts:22 — TODO: implement validation

### Gaps
1. path/to/file-c.ts must be created
2. path/to/file-b.ts:22 must be implemented (not stub)

### Verdict: INCOMPLETE — 2 gaps must be resolved
```

The verification report uses conventional markdown patterns for structured output:

```
**[CRITICAL]** path/to/file.ts:22 — TODO: implement validation (anti-pattern)
**[IMPORTANT]** path/to/file.ts — exported but not imported by any other file
```

### Verification Sign-Off

After producing the verification report, request acceptance:

```json
emit_interaction({
  path: "<project-root>",
  type: "confirmation",
  confirmation: {
    text: "Verification report: <VERDICT>. Accept and proceed?",
    context: "<summary: N artifacts checked, N gaps found>"
  }
})
```

### Handoff and Transition

After producing the verification report, write the handoff and conditionally transition:

Write `.harness/handoff.json`:

```json
{
  "fromSkill": "harness-verification",
  "phase": "COMPLETE",
  "summary": "<verdict summary>",
  "artifacts": ["<verified file paths>"],
  "verdict": "pass | fail",
  "gaps": ["<gap descriptions if any>"]
}
```

**If verdict is PASS (all levels passed, no gaps):**

Call `emit_interaction`:

```json
{
  "type": "transition",
  "transition": {
    "completedPhase": "verification",
    "suggestedNext": "review",
    "reason": "Verification passed at all 3 levels",
    "artifacts": ["<verified file paths>"],
    "requiresConfirmation": false,
    "summary": "Verification passed: <N> artifacts checked. EXISTS, SUBSTANTIVE, WIRED all passed."
  }
}
```

The response will include `nextAction: "Invoke harness-code-review skill now"`.
Immediately invoke harness-code-review without waiting for user input.

**If verdict is FAIL or INCOMPLETE:**

Do NOT emit a transition. Surface gaps to the user for resolution. The handoff is written with the gaps recorded for future reference.

---

### Regression Test Verification

When verifying a bug fix, apply this extended protocol:

1. **Write** the regression test that reproduces the bug
2. **Run** the test — it must PASS (proving the fix works)
3. **Revert** the fix (temporarily): `git stash` or comment out the fix
4. **Run** the test — it must FAIL (proving the test actually catches the bug)
5. **Restore** the fix: `git stash pop` or uncomment
6. **Run** the test — it must PASS again (proving the fix is the reason)

If step 4 passes (test does not fail without the fix), the test is not a valid regression test. It does not catch the bug. Rewrite it.

## Harness Integration

- **`harness validate`** — Run in Level 3 WIRED check. Verifies project-wide health and constraint compliance.
- **`harness check-deps`** — Run in Level 3 to verify new artifacts respect dependency boundaries.
- **`harness check-docs`** — Run to verify documentation is updated for new artifacts. Missing docs for new public APIs is a gap.
- **Test runner** — Must be run fresh (not cached) during Level 3. Read actual output, check exit codes.

All commands must be run fresh in the current session. Do not rely on results from a previous session or a previous run in the same session if code has changed since.

- **`emit_interaction`** -- Call after verification passes to auto-transition to harness-code-review. Only emitted on PASS verdict. Uses auto-transition (proceeds immediately).

## Success Criteria

- Every claimed deliverable has been verified at all 3 levels
- No anti-patterns remain in delivered code
- Verification report uses the structured format with PASS/FAIL per artifact per level
- All verification evidence was collected fresh in the current session
- No forbidden language ("should", "probably", "seems to") appears in the report
- All gaps are explicitly identified with specific remediation steps
- Regression tests (for bug fixes) pass the 5-step revert check

## Non-Determinism Tolerance

For mechanical checks (tests pass, lint clean, types check), results are binary — pass or fail. No tolerance.

For behavioral verification (did the agent follow a convention, did the output match a style guide), accept threshold-based results:

- Run the check multiple times if needed
- "Agent followed the constraint in 4/5 runs" = pass
- "Agent followed the constraint in 2/5 runs" = fail — the convention is poorly written, not the agent

If a behavioral convention fails more than 40% of the time, the convention needs rewriting. Blame the instruction, not the executor.

## Examples

### Example: Verifying a New Service Module

Task: "Create UserService with create, read, update, delete operations."

```
## Verification Report

### Level 1: EXISTS
- [PASS] src/services/user-service.ts (189 lines)
- [PASS] src/services/user-service.test.ts (245 lines)
- [PASS] src/services/index.ts (updated — exports UserService)

### Level 2: SUBSTANTIVE
- [PASS] src/services/user-service.ts — all 4 CRUD methods implemented with
         validation, error handling, and database calls
- [PASS] src/services/user-service.test.ts — 12 tests covering happy paths,
         error cases, and edge cases (no skipped tests)

### Level 3: WIRED
- [PASS] src/services/user-service.ts — imported by src/api/routes/users.ts,
         tested in user-service.test.ts (12 tests, all pass)
- [PASS] harness validate — passes
- [PASS] harness check-deps — no boundary violations

### Anti-Pattern Scan
- No matches found

### Gaps
(none)

### Verdict: COMPLETE — all artifacts verified at all levels
```

## Gates

- **No completion without evidence.** You may not say "done," "complete," "finished," or "implemented" without a verification report showing PASS at all 3 levels for all deliverables.
- **No stale evidence.** Evidence must be from the current session. "I checked earlier" is not evidence. Run it again.
- **No forbidden language.** "Should work," "probably fine," "seems correct," and "I believe it works" are not verification statements. Replace with observed evidence or state "not verified."
- **No skipping levels.** Level 1 before Level 2. Level 2 before Level 3. Each level depends on the previous.
- **No satisfaction before evidence.** The natural inclination after writing code is to feel done. Resist it. Feeling done is not being done. Evidence is being done.

## Escalation

- **When an artifact cannot pass Level 3 (WIRED) because the system it connects to does not exist yet:** Document the gap explicitly. State what integration is missing and what must be built. Do not mark it as PASS.
- **When anti-pattern scan finds TODOs that are intentional:** Each must be justified with a tracked issue number. "TODO: implement" with no issue reference is not acceptable. "TODO(#123): add rate limiting after infrastructure is ready" is acceptable.
- **When tests pass but you suspect they are not testing real behavior:** Read the test assertions carefully. If tests only check "does not throw" or assert on mock return values without verifying real behavior, flag them as SUBSTANTIVE failures.
- **When verification reveals the spec itself is incomplete:** Do not fill in the gaps yourself. Escalate to the human: "Verification found that the spec does not define behavior for [scenario]. How should this be handled?"
- **When you cannot run harness checks:** If `harness validate` or `harness check-deps` cannot be run (missing configuration, broken tooling), this is a blocking issue. Do not skip verification — fix the tooling or escalate.

After verification completes, append a tagged learning:

- **YYYY-MM-DD [skill:harness-verification] [outcome:pass/fail]:** Verified [feature]. [Brief note on what was found or confirmed.]
