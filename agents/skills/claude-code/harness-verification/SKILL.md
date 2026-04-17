# Harness Verification

> 3-level evidence-based verification. No completion claims without fresh evidence. "Should work" is not evidence.

## When to Use

- After completing any implementation task (before claiming "done")
- After executing a plan or spec (verify all deliverables)
- When validating work done by another agent or in a previous session
- When resuming after a context reset (re-verify before continuing)
- When `on_commit` or `on_pr` triggers fire and verification is needed
- NOT as a replacement for tests (verification checks tests exist and pass, not that logic is correct)
- NOT for in-progress work (verify at completion boundaries, not mid-stream)

### Verification Tiers

| Tier           | Skill                        | When                       | What                                               |
| -------------- | ---------------------------- | -------------------------- | -------------------------------------------------- |
| **Quick gate** | harness-execution (built-in) | After every task           | test + lint + typecheck + build + harness validate |
| **Deep audit** | harness-verification (this)  | Milestones, PRs, on-demand | EXISTS -> SUBSTANTIVE -> WIRED                     |

Use deep audit for milestone boundaries, before PRs, or when the quick gate passes but something feels wrong. Do NOT invoke after every individual task.

## Process

### Iron Law

**No completion claim may be made without fresh verification evidence collected in THIS session.**

Cached results, remembered outcomes, and "it worked last time" are not evidence. Run the checks. Read the output. Report what you observed.

The words "should", "probably", "seems to", and "I believe" are forbidden in verification reports. Replace with "verified: [evidence]" or "not verified: [what is missing]."

---

### Argument Resolution

When invoked by autopilot (or with explicit arguments), resolve paths before starting:

1. **Session slug:** If `session-slug` argument provided, set `{sessionDir} = .harness/sessions/<session-slug>/`. Pass to `gather_context({ session: "<session-slug>" })`. All handoff writes go to `{sessionDir}/handoff.json`.

When no arguments are provided (standalone invocation), session slug is unknown — omit from `gather_context`, fall back to global `.harness/` paths.

---

### Context Loading

Before running verification levels, load session context:

```json
gather_context({
  path: "<project-root>",
  intent: "Verify phase deliverables",
  skill: "harness-verification",
  session: "<session-slug-if-provided>",
  include: ["state", "learnings", "validation"]
})
```

If a session slug is known, include the `session` parameter to scope reads to `.harness/sessions/<slug>/`. Otherwise omit it to fall back to `.harness/`. Use returned learnings to check for known failures relevant to artifacts being verified.

---

### Level 1: EXISTS -- The Artifact Is Present

For every artifact that was supposed to be created or modified:

1. **Check the file exists on disk.** Use `ls`, `stat`, or read. Do not assume it exists because you wrote it -- writes can fail silently.
2. **Check it has content.** An empty file is not an artifact.
3. **Check it is in the right location.** Compare actual path against spec/plan.
4. **Record the result:**
   ```
   [EXISTS: PASS] path/to/file.ts (247 lines)
   [EXISTS: FAIL] path/to/missing-file.ts -- file not found
   ```

Do not proceed to Level 2 until all Level 1 checks pass. Missing files must be created first.

---

### Level 2: SUBSTANTIVE -- Not a Stub

For every artifact that passed Level 1:

1. **Read the file content thoroughly** -- do not skim.
2. **Scan for stub anti-patterns:** `TODO`/`FIXME` comments, `throw new Error('not implemented')`, `() => {}`, `return null`/`undefined`/`{}` as sole logic, `pass` (Python), `placeholder`/`stub`/`mock` in non-test code, functions with only a descriptive comment, interfaces defined but never implemented.
3. **Verify real implementation exists.** A function returning only a hardcoded value is a stub unless that is correct behavior.
4. **Check completeness against spec.** If spec says "handles errors X, Y, Z," verify all three, not just X.
5. **Record the result:**
   ```
   [SUBSTANTIVE: PASS] path/to/file.ts -- real implementation, no stubs
   [SUBSTANTIVE: FAIL] path/to/file.ts -- TODO on line 34, empty handler on line 67
   ```

Do not proceed to Level 3 until all Level 2 checks pass. Stubs must be replaced with real implementations first.

---

### Level 3: WIRED -- Connected to the System

For every artifact that passed Level 2:

1. **Verify imported/required** by at least one other file (unless it is an entry point).
2. **Verify called/used.** An unused import is dead code. Trace usage: functions called, components rendered, types used in signatures, config loaded, tests executed.
3. **Verify tested.** At least one test exercises the artifact's behavior: test file exists, imports the artifact, makes behavior assertions, actually runs (not `.skip`/`xit`).
4. **Run the tests.** Execute the suite now -- do not trust "they passed earlier."
5. **Run harness checks.** Execute `harness validate` and verify integration with project constraints.
6. **Record the result:**
   ```
   [WIRED: PASS] path/to/file.ts -- imported by 3 files, tested in file.test.ts (4 tests, all pass)
   [WIRED: FAIL] path/to/file.ts -- exported but not imported by any other file
   ```

---

### Anti-Pattern Scan

Run across all changed files as a final check:

```
Markers: TODO, FIXME, XXX, HACK, PLACEHOLDER, NOT_IMPLEMENTED
Code: () => {}, return null (sole body), pass, raise NotImplementedError
Tests: .skip, xit, xdescribe, @pytest.mark.skip, pending
```

Any match is a verification failure. Fix it or document why it is acceptable (e.g., "TODO tracked in issue #123, out of scope").

---

### Gap Identification

After all three levels, produce a structured gap report:

```
## Verification Report

### Level 1: EXISTS
- [PASS] path/to/file-a.ts (120 lines)
- [FAIL] path/to/file-c.ts -- not found

### Level 2: SUBSTANTIVE
- [PASS] path/to/file-a.ts -- real implementation
- [FAIL] path/to/file-b.ts -- TODO on line 22

### Level 3: WIRED
- [PASS] path/to/file-a.ts -- imported, tested, harness passes
- [NOT CHECKED] path/to/file-b.ts -- blocked by Level 2 failure

### Anti-Pattern Scan
- path/to/file-b.ts:22 -- TODO: implement validation

### Gaps
1. path/to/file-c.ts must be created
2. path/to/file-b.ts:22 must be implemented (not stub)

### Verdict: INCOMPLETE -- 2 gaps must be resolved
```

Use severity markers for critical findings: `**[CRITICAL]**` for blocking issues, `**[IMPORTANT]**` for non-blocking concerns.

### Verification Sign-Off

After producing the report, request acceptance:

```json
emit_interaction({
  path: "<project-root>",
  type: "confirmation",
  confirmation: {
    text: "Verification report: <VERDICT>. Accept and proceed?",
    context: "<N artifacts checked, N gaps found>",
    impact: "Accepting proceeds to code review. Declining requires gap resolution.",
    risk: "<low if PASS, high if gaps remain>"
  }
})
```

### Handoff and Transition

Write handoff to the session-scoped path when session slug is known, otherwise fall back to global:

- Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
- Global (fallback, **deprecated**): `.harness/handoff.json`

> **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always write to `.harness/sessions/<slug>/handoff.json` to prevent cross-session contamination.

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

**Session summary (if session known):** Update via `writeSessionSummary` with skill, status (`Verification <PASS|FAIL|INCOMPLETE>. <N> artifacts, <N> gaps.`), keyContext, and nextStep.

**If verdict is PASS:** Call `emit_interaction`:

```json
{
  "type": "transition",
  "transition": {
    "completedPhase": "verification",
    "suggestedNext": "review",
    "reason": "Verification passed at all 3 levels",
    "artifacts": ["<verified file paths>"],
    "requiresConfirmation": false,
    "summary": "Verification passed: <N> artifacts. EXISTS, SUBSTANTIVE, WIRED all passed.",
    "qualityGate": {
      "checks": [
        { "name": "level1-exists", "passed": true },
        { "name": "level2-substantive", "passed": true },
        { "name": "level3-wired", "passed": true },
        { "name": "anti-pattern-scan", "passed": true },
        { "name": "harness-validate", "passed": true }
      ],
      "allPassed": true
    }
  }
}
```

Immediately invoke harness-code-review without waiting for user input.

**If verdict is FAIL or INCOMPLETE:** Do NOT emit a transition. Surface gaps for resolution. Handoff records gaps for future reference.

---

### Regression Test Verification

When verifying a bug fix:

1. **Write** the regression test reproducing the bug
2. **Run** the test -- must PASS (proving fix works)
3. **Revert** the fix temporarily (`git stash` or comment out)
4. **Run** the test -- must FAIL (proving test catches the bug)
5. **Restore** the fix (`git stash pop` or uncomment)
6. **Run** the test -- must PASS again (proving fix is the reason)

If step 4 passes (test does not fail without fix), the test is invalid. Rewrite it.

## Evidence Requirements

Every pass/fail assertion in the verification report MUST include concrete evidence. "Should", "probably", "seems to" are forbidden by the Iron Law -- this defines HOW to cite.

Every verification claim MUST use one of:

1. **File reference:** `file:line` with observed content (e.g., `src/services/user-service.ts:42` -- "create method validates email")
2. **Test output:** Actual command and complete output
3. **Harness output:** Full `harness validate` and `harness check-deps` output
4. **Anti-pattern scan output:** Actual search command and results
5. **Import chain evidence:** Actual import statements found for WIRED level
6. **Session evidence:** Write to `evidence` session section per level via `manage_state`

**When to cite:** At every level. L1 cites file reads. L2 cites specific line content. L3 cites imports, test output, harness output. Each `[PASS]`/`[FAIL]` marker must be accompanied by producing evidence.

**Uncited claims:** Any verification assertion without direct evidence is a verification failure. This skill does not use `[UNVERIFIED]` -- if evidence cannot be produced, verdict is FAIL or INCOMPLETE.

## Rubric Compression

Verification checklists passed to subagents or used internally MUST use compressed single-line format. Each check is one line with pipe-delimited fields:

```
level|check-name|pass-criterion
```

**Example (Level 2 SUBSTANTIVE rubric):**

```
L2|no-stubs|No TODO/FIXME/throw-not-implemented in production code
L2|no-empty-bodies|No empty function bodies, () => {}, or return null as sole logic
L2|spec-complete|All behaviors specified in spec have corresponding implementation
L2|real-logic|Functions contain meaningful logic, not just hardcoded returns
```

**Why:** Verbose checklist prose inflates verification context without improving accuracy. Dense single-line rubrics give the same signal in fewer tokens, leaving more budget for reading and analyzing actual file content.

**Rules:**

- Level prefix must be L1 (EXISTS), L2 (SUBSTANTIVE), or L3 (WIRED)
- Maximum 80 characters per criterion text
- Rubric entries are guidance — the verification levels define the authoritative checks

## Non-Determinism Tolerance

Mechanical checks (tests, lint, types) are binary pass/fail. No tolerance.

For behavioral verification (convention adherence, style guides), accept threshold-based results: 4/5 runs = pass, 2/5 runs = fail. If a convention fails >40% of the time, the convention needs rewriting -- blame the instruction, not the executor.

## Rationalizations to Reject

| Rationalization                                            | Reality                                                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| "Tests passed earlier, no need to re-run"                  | Iron Law forbids cached results. All evidence must be fresh in THIS session.                                                   |
| "File exists and has code, skip thorough read for Level 2" | Level 2 requires thorough reading. Scanning for TODO, throw Error, empty functions catches stubs that look real.               |
| "Artifact is imported by a test file, so passes Level 3"   | Import is necessary but not sufficient. Test must assert on behavior and not be skipped.                                       |
| "Verification report probably looks fine from memory"      | "Should", "probably", "seems to", "I believe" are forbidden. Replace with "verified: [evidence]" or "not verified: [missing]." |

## Examples

### Example: Verifying a New Service Module

Task: "Create UserService with CRUD operations."

```
## Verification Report

### Level 1: EXISTS
- [PASS] src/services/user-service.ts (189 lines)
- [PASS] src/services/user-service.test.ts (245 lines)
- [PASS] src/services/index.ts (updated -- exports UserService)

### Level 2: SUBSTANTIVE
- [PASS] user-service.ts -- 4 CRUD methods with validation, error handling, DB calls
- [PASS] user-service.test.ts -- 12 tests: happy paths, errors, edge cases (none skipped)

### Level 3: WIRED
- [PASS] user-service.ts -- imported by src/api/routes/users.ts, 12 tests pass
- [PASS] harness validate -- passes
- [PASS] harness check-deps -- no boundary violations

### Anti-Pattern Scan
- No matches

### Verdict: COMPLETE -- all artifacts verified at all levels
```

## Gates

- **No completion without evidence.** Do not say "done" or "complete" without a verification report showing PASS at all 3 levels for all deliverables.
- **No stale evidence.** Evidence must be from the current session. "I checked earlier" is not evidence.
- **No forbidden language.** "Should work," "probably fine," "seems correct" are not verification statements. Use observed evidence or state "not verified."
- **No skipping levels.** Level 1 before Level 2. Level 2 before Level 3. Each depends on the previous.
- **No satisfaction before evidence.** Feeling done is not being done. Evidence is being done.

## Success Criteria

- All deliverables verified at 3 levels (EXISTS, SUBSTANTIVE, WIRED)
- No anti-patterns remain in production code
- Report uses structured format with severity markers
- All evidence is fresh (gathered this session, not assumed)
- No forbidden hedging language in findings
- Gaps explicitly listed with severity
- Regression revert check confirms clean rollback

## Escalation

- **Artifact cannot pass WIRED because the connected system does not exist yet:** Document the gap explicitly. State what integration is missing. Do not mark PASS.
- **Anti-pattern scan finds intentional TODOs:** Each must have a tracked issue number. "TODO: implement" without issue ref is unacceptable. "TODO(#123): add rate limiting" is acceptable.
- **Tests pass but may not test real behavior:** If tests only check "does not throw" or assert mock return values without real behavior checks, flag as SUBSTANTIVE failure.
- **Verification reveals spec is incomplete:** Do not fill gaps yourself. Escalate: "Spec does not define behavior for [scenario]. How should this be handled?"
- **Cannot run harness checks:** If `harness validate` or `harness check-deps` cannot run, this is blocking. Do not skip -- fix tooling or escalate.

## Harness Integration

- **`gather_context`** -- Load session-scoped state, learnings, and validation before Level 1. `session` parameter scopes to session directory.
- **`harness validate`** -- Run during Level 3 (WIRED) to verify artifact integration.
- **`harness check-deps`** -- Run during Level 3 (WIRED) to verify dependency boundaries.
- **`harness check-docs`** -- Verify documentation updated for new artifacts. Missing docs for public APIs is a gap.
- **Test runner** -- Must be run fresh (not cached) during Level 3. Read actual output, check exit codes.
- **`emit_interaction`** -- Auto-transition to harness-code-review on PASS verdict only.
- **Session directory** -- `.harness/sessions/<slug>/` contains `handoff.json`, `state.json`, `artifacts.json` (spec path, plan path, file lists from execution). Do not write to global `.harness/handoff.json` when session slug is known.

All commands must be run fresh. Do not rely on results from previous sessions or runs.

After verification, append a tagged learning: `YYYY-MM-DD [skill:harness-verification] [outcome:pass/fail]: Verified [feature]. [Brief note.]`
