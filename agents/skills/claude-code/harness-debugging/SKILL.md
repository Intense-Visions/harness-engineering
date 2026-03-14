# Harness Debugging

> 4-phase systematic debugging with entropy analysis and persistent sessions. Phase 1 before ANY fix. "It's probably X" is not a diagnosis.

## When to Use
- When a test fails and the cause is not immediately obvious
- When a feature works in one context but fails in another
- When an error message does not clearly indicate the root cause
- When `on_bug_fix` triggers fire
- When a previous fix attempt did not resolve the issue
- NOT for known issues with documented solutions (apply the solution directly)
- NOT for typos, syntax errors, or other obvious fixes (just fix them)
- NOT for feature development (use harness-tdd instead)

## Process

### Prerequisite: Start a Debug Session

Before beginning, create a persistent debug session. This survives context resets and tracks state across multiple attempts.

```
.harness/debug/active/<session-id>.md
```

Session file format:
```markdown
# Debug Session: <brief-description>
Status: gathering
Started: <timestamp>
Error: <the error message or symptom>

## Investigation Log
(append entries as you go)

## Hypotheses
(track what you have tried)

## Resolution
(filled in when resolved)
```

**Status transitions:** `gathering` -> `investigating` -> `fixing` -> `verifying` -> `resolved`

---

### Phase 1: INVESTIGATE — Understand Before Acting

**You must complete Phase 1 before writing ANY fix code. No exceptions.**

#### Step 1: Run Entropy Analysis

```bash
harness cleanup
```

Review the output. Entropy analysis reveals:
- Dead code and unused imports near the failure
- Pattern violations that may be contributing
- Documentation drift that may have caused incorrect usage
- Dependency issues that could affect behavior

Record relevant findings in the session log.

#### Step 2: Read the Error Carefully

Read the COMPLETE error message. Not just the first line — the entire stack trace, every warning, every note. Errors often contain the answer.

Ask yourself:
- What exactly failed? (Not "it broke" — what specific operation?)
- Where did it fail? (File, line, function)
- What was the input that caused the failure?
- What was the expected behavior vs actual behavior?

Record the answers in the session log.

#### Step 3: Reproduce Consistently

Run the failing scenario multiple times. Confirm it fails every time with the same error. If it is intermittent, record:
- How often it fails (1 in 3? 1 in 10?)
- Whether the failure mode changes
- Environmental factors (timing, ordering, state)

If you cannot reproduce the failure, you cannot debug it. Escalate.

#### Step 4: Check Recent Changes

```bash
git log --oneline -20
git diff HEAD~5
```

What changed recently? Many bugs are caused by the most recent change. Compare the failing state to the last known working state.

#### Step 5: Trace Data Flow Backward

Start at the error location and trace backward:
1. What function threw the error?
2. What called that function? With what arguments?
3. Where did those arguments come from?
4. Continue until you find where the actual value diverges from the expected value.

Read each function in the call chain completely. Do not skim.

Update the session status to `investigating`.

---

### Phase 2: ANALYZE — Find the Pattern

#### Step 1: Find Working Examples

Search the codebase for similar functionality that WORKS. There is almost always a working example of what you are trying to do.

```
Look for:
- Other calls to the same function/API that succeed
- Similar features that work correctly
- Test fixtures that exercise the same code path
- Documentation or comments that describe expected behavior
```

#### Step 2: Read Reference Implementations Completely

When you find a working example, read it in its entirety. Do not cherry-pick lines. Understand:
- How it sets up the context
- What arguments it passes
- How it handles errors
- What it does differently from the failing code

#### Step 3: Identify Differences

Compare the working example to the failing code line by line. The bug is in the differences. Common categories:

- **Missing setup:** Working code initializes something the failing code skips
- **Wrong arguments:** Type mismatch, wrong order, missing optional parameter
- **State dependency:** Working code runs after some prerequisite; failing code does not
- **Environment:** Working code runs in a different context (different config, different permissions)
- **Timing:** Working code awaits something the failing code does not

Record all differences in the session log.

---

### Phase 3: HYPOTHESIZE — One Variable at a Time

#### Step 1: Form a Single Falsifiable Hypothesis

Based on your investigation and analysis, state a specific hypothesis:

```
"The failure occurs because [specific cause].
If this hypothesis is correct, then [observable prediction].
I can test this by [specific action]."
```

A good hypothesis is falsifiable — there is a concrete test that would disprove it. "Something is wrong with the configuration" is not a hypothesis. "The database connection string is missing the port number, causing connection timeout" is a hypothesis.

#### Step 2: Test ONE Variable

Change exactly ONE thing to test your hypothesis. If you change multiple things, you cannot determine which one had the effect.

- Add a single log statement to check a value
- Change one argument to match the working example
- Add one missing setup step

#### Step 3: Observe the Result

Run the failing scenario. Did the behavior change?

- **Hypothesis confirmed:** The change fixed it (or changed the error in the predicted way). Proceed to Phase 4.
- **Hypothesis rejected:** Revert the change. Form a new hypothesis based on what you learned. The rejection itself is valuable data — record it.

#### Step 4: Create Minimal Reproduction

If the bug is in a complex system, extract a minimal reproduction:
- Smallest possible code that exhibits the bug
- Fewest dependencies
- Simplest configuration

This serves two purposes: it confirms your understanding of the root cause, and it becomes the basis for a regression test.

Update the session status to `fixing`.

---

### Phase 4: FIX — Root Cause, Not Symptoms

#### Step 1: Write the Regression Test

Before writing the fix, write a test that:
- Reproduces the exact failure scenario
- Asserts the correct behavior
- Currently FAILS (proving it catches the bug)

This follows harness-tdd discipline. The fix is driven by a failing test.

#### Step 2: Implement the Fix

Write a SINGLE fix that addresses the ROOT CAUSE identified in Phase 3. Not a workaround. Not a symptom suppression. The root cause.

Characteristics of a good fix:
- Changes as little code as possible
- Addresses why the bug happened, not just what the bug did
- Does not introduce new complexity
- Would be obvious to someone reading the code later

Characteristics of a bad fix (revert immediately):
- Adds a special case or `if` branch for the specific failing input
- Wraps the failure in a try-catch that swallows the error
- Adds a retry loop or delay to "work around" a timing issue
- Changes a type to `any` or removes a type check

#### Step 3: Verify the Fix

1. Run the regression test — must PASS
2. Run the full test suite — all tests must PASS
3. Run `harness validate` — must PASS
4. Run `harness check-deps` — must PASS
5. Manually verify the original failing scenario works

#### Step 4: Verify the Test Catches the Bug

Apply the regression test verification protocol:
1. Temporarily revert the fix
2. Run the regression test — must FAIL
3. Restore the fix
4. Run the regression test — must PASS

If the test passes without the fix, the test does not catch the bug. Rewrite the test.

#### Step 5: Close the Session

Update the debug session:
```markdown
Status: resolved
Resolved: <timestamp>

## Resolution
Root cause: <what actually caused the bug>
Fix: <what was changed and why>
Regression test: <path to test file>
Learnings: <what to remember for next time>
```

Move the session file:
```bash
mv .harness/debug/active/<session-id>.md .harness/debug/resolved/
```

Append learnings to `.harness/learnings.md` if the bug revealed a pattern that should be remembered.

Update the session status to `resolved`.

## Harness Integration

- **`harness cleanup`** — Run in Phase 1 INVESTIGATE for entropy analysis. Reveals dead code, pattern violations, and drift near the failure site.
- **`harness validate`** — Run in Phase 4 VERIFY after applying the fix. Confirms the fix does not break project-wide constraints.
- **`harness check-deps`** — Run in Phase 4 VERIFY. Confirms the fix does not introduce dependency violations.
- **`harness state learn`** — Run after resolution to capture learnings for future sessions.
- **Debug session files** — Stored in `.harness/debug/active/` (in progress) and `.harness/debug/resolved/` (completed). These persist across context resets.

## Success Criteria

- Phase 1 INVESTIGATE was completed before any fix was attempted
- Root cause was identified and documented (not just the symptom)
- A regression test exists that fails without the fix and passes with it
- The fix addresses the root cause, not a symptom
- All harness checks pass after the fix
- Debug session file is complete with investigation log, hypotheses, and resolution
- Learnings were captured for future reference

## Examples

### Example: API Endpoint Returns 500 Instead of 400

**Phase 1 — INVESTIGATE:**
```
harness cleanup: No entropy issues near api/routes/users.ts
Error: "Cannot read properties of undefined (reading 'email')"
Stack trace points to: src/services/user-service.ts:34
Reproduces consistently with POST /users and empty body {}
Recent changes: Added input validation middleware (2 commits ago)
Data flow: request.body -> validate() -> createUser(body.email)
```

**Phase 2 — ANALYZE:**
```
Working example: POST /orders handles empty body correctly
Difference: /orders validates BEFORE destructuring; /users destructures BEFORE validating
The validation middleware runs but its result is not checked
```

**Phase 3 — HYPOTHESIZE:**
```
Hypothesis: The validation middleware sets req.validationErrors but the route
handler does not check it before accessing req.body.email.
Test: Add a log before line 34 to check req.validationErrors.
Result: Confirmed — validationErrors contains "email is required" but handler proceeds.
```

**Phase 4 — FIX:**
```typescript
// Regression test
it('returns 400 when request body is empty', async () => {
  const res = await request(app).post('/users').send({});
  expect(res.status).toBe(400);
  expect(res.body.errors).toContain('email is required');
});

// Fix: Check validation result before processing
if (req.validationErrors?.length) {
  return res.status(400).json({ errors: req.validationErrors });
}
```

Revert test: Commenting out the validation check causes the test to fail with 500. Confirmed.

## Gates

- **Phase 1 before ANY fix.** You must complete investigation before writing fix code. Skipping investigation leads to symptom-chasing, which leads to more bugs.
- **One variable at a time.** Changing multiple things simultaneously is forbidden. If you changed two things and the bug is fixed, you do not know which change fixed it (or if the other change introduced a new bug).
- **After 3 failed fix attempts, question the architecture.** If three consecutive hypotheses were wrong or three fixes did not resolve the issue, the problem is likely not where you think it is. Step back. Re-read the investigation log. Consider that the bug might be in a different layer entirely.
- **Never "quick fix now, investigate later."** There is no later. The quick fix becomes permanent. The investigation never happens. The root cause festers. Fix it right or do not fix it.
- **Regression test must fail without fix.** A test that passes whether or not the fix is present is not a regression test. It provides no protection.

## Escalation

- **Red flag: "It's probably X, let me fix that."** STOP. This is guessing, not debugging. You skipped Phase 1. Go back to investigation.
- **Red flag: "One more fix attempt" after 2 failed attempts.** STOP. You are about to hit the 3-attempt wall. Step back and question your mental model of the system. Re-read the code from scratch. Consider that your understanding of how the system works may be wrong.
- **Cannot reproduce the bug:** If you cannot make the bug happen consistently, you cannot debug it scientifically. Document exactly what you tried, what environment you tested in, and escalate. Do not guess at a fix for a bug you cannot reproduce.
- **Bug is in a dependency you do not control:** Document the bug, write a test that demonstrates it, and escalate. If a workaround is needed, clearly mark it as a workaround with a reference to the upstream issue.
- **Investigation reveals a systemic issue:** If the bug is a symptom of a larger architectural problem (e.g., widespread race conditions, fundamental type unsafety), escalate to the human. A local fix will not solve a systemic problem.
- **Debug session exceeds 60 minutes without progress:** Something is wrong with the approach. Stop. Summarize what you know in the session file. Take a break (context reset). Return with fresh eyes and re-read the session file from the beginning.
