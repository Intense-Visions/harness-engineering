# Harness Diagnostics

> Cognitive mode: **diagnostic-investigator**. Classify errors into taxonomy categories and route to deterministic resolution strategies. Evidence first, classification second, action third.

## When to Use
- When an error occurs and the root cause category is unclear
- When a bug fix attempt failed and you need a structured re-approach
- When `on_bug_fix` triggers fire and the error does not match a known pattern
- When you need to decide whether to fix locally or escalate
- NOT for obvious typos or syntax errors with clear fixes (just fix them)
- NOT for feature development (use harness-tdd instead)
- NOT for deep multi-phase debugging (use harness-debugging instead — this skill classifies and routes)

## Error Taxonomy

Every error falls into one of 7 categories. Each category has distinct signals and a distinct resolution strategy. Misclassification leads to wasted effort — a Logic error treated as Syntax will never be fixed by reading the compiler output.

### Category 1: Syntax/Type

**Signals:** Compilation failures, type errors, parse errors, import resolution failures, "cannot find name", "expected X but got Y" from the compiler or type checker.

**Resolution strategy:** Read the error message. It tells you exactly what is wrong and where. Fix mechanically — match the type, fix the import, correct the syntax. No investigation needed. Run the type checker to confirm.

**Time budget:** Under 5 minutes. If it takes longer, you have misclassified.

### Category 2: Logic

**Signals:** Tests fail with wrong output values, unexpected behavior at runtime, "expected X but received Y" from test assertions, correct types but incorrect results.

**Resolution strategy:** Write a failing test FIRST that isolates the incorrect behavior. Then trace the data flow from input to incorrect output. Find the exact line where the actual value diverges from the expected value. Fix that line. Run the test to confirm.

**Time budget:** 5-30 minutes. If it takes longer, consider reclassifying as Design.

### Category 3: Design

**Signals:** Multiple related failures, fixes that break other things, circular dependencies, "everything is tangled", you cannot write a clean test because the code is not testable, the fix requires changing many files.

**Resolution strategy:** STOP. Do not attempt to fix locally. This is an architectural issue that requires human judgment. Document the symptoms, the attempted fixes, and the structural problem. Escalate to the human architect with a clear summary and 2-3 options.

**Time budget:** 15 minutes maximum for classification and documentation. Do not spend time attempting fixes.

### Category 4: Performance

**Signals:** Slow responses, timeouts, high memory usage, "heap out of memory", operations that used to be fast are now slow, N+1 query patterns.

**Resolution strategy:** Profile FIRST. Do not guess at the bottleneck. Use the appropriate profiling tool for the runtime (browser devtools, `node --prof`, `py-spy`, database `EXPLAIN`). Identify the actual hotspot. Optimize only that hotspot. Measure again to confirm improvement.

**Time budget:** 15-60 minutes. Profiling takes time but prevents optimizing the wrong thing.

### Category 5: Security

**Signals:** Vulnerability scanner findings, injection possibilities, authentication/authorization failures, exposed secrets, CORS issues, unsafe deserialization.

**Resolution strategy:** Check OWASP Top 10 for the vulnerability class. Apply the minimal fix that closes the vulnerability without changing unrelated behavior. Do not refactor surrounding code during a security fix — minimize the blast radius. Verify with a test that the vulnerability is closed.

**Time budget:** Variable, but the fix itself should be minimal. If the fix requires large changes, reclassify as Design and escalate.

### Category 6: Environment

**Signals:** "Module not found" at runtime (not compile time), version mismatch errors, "connection refused", works on one machine but not another, Docker/CI failures that pass locally, missing environment variables.

**Resolution strategy:** Check versions first — runtime, dependencies, OS. Compare the failing environment to a working environment. Look at: Node/Python/Java version, dependency lock file freshness, environment variables, file permissions, network connectivity. Fix the environment, not the code.

**Time budget:** 5-30 minutes. Environment issues are usually fast once you compare configurations.

### Category 7: Flaky

**Signals:** Test passes sometimes and fails sometimes, "works on retry", timing-dependent failures, failures that disappear when you add logging, race conditions, order-dependent test results.

**Resolution strategy:** Isolate the timing dependency. Run the failing test in isolation — does it still flake? Run it 20 times in a loop — what is the failure rate? Look for: shared mutable state between tests, missing `await` on async operations, time-dependent assertions (`setTimeout`, `Date.now()`), external service dependencies without mocking. Fix the non-determinism, do not add retries.

**Time budget:** 15-60 minutes. Flaky tests are deceptively hard. If you cannot isolate the timing dependency in 60 minutes, escalate.

## Process

### Phase 1: CLASSIFY — Collect Evidence and Categorize

**This phase must complete before any fix is attempted.**

#### Step 1: Run Deterministic Checks (Baseline)

Capture the current state before any changes:

```bash
# Run type checker (adapt to project language)
npx tsc --noEmit 2>&1 | tail -50

# Run test suite
npm test 2>&1 | tail -100

# Record results
echo "Baseline captured at $(date)" >> .harness/diagnostics/current.md
```

Record exact counts: how many type errors, how many test failures, which tests fail.

#### Step 2: Read the Complete Error

Read the ENTIRE error output. Not the first line. Not the summary. The complete message including:
- Error type/code
- Stack trace (every frame)
- Warnings that preceded the error
- Context about what operation was being attempted

#### Step 3: Match Signals to Category

Compare the error signals against the 7 categories above. Ask:
- Is this a compile-time or runtime error? (Compile-time -> likely Syntax/Type)
- Is the code syntactically valid but producing wrong results? (-> Logic)
- Does the error involve multiple components or layers? (-> Design)
- Is it about speed or resource consumption? (-> Performance)
- Is it about unauthorized access or unsafe data handling? (-> Security)
- Does it work in one environment but not another? (-> Environment)
- Does it fail intermittently? (-> Flaky)

#### Step 4: State the Classification Explicitly

```
CLASSIFICATION: [Category Name]
CONFIDENCE: [High/Medium/Low]
SIGNALS: [List the specific signals that led to this classification]
ALTERNATIVE: [If confidence is Medium or Low, what other category could it be?]
```

**Gate: Classification must be explicit and written down before proceeding. "I think it's a type error" is not sufficient. State the category, confidence, and signals.**

---

### Phase 2: ROUTE — Apply Category-Specific Strategy

Follow the resolution strategy for the classified category exactly. Do not mix strategies. Each category has a specific approach because each category has a specific failure mode.

If the category is **Design**, STOP HERE. Do not proceed to Phase 3. Document and escalate.

For all other categories, execute the resolution strategy as described in the taxonomy above.

---

### Phase 3: RESOLVE — Execute and Verify

#### Step 1: Apply the Fix

Implement the fix according to the resolution strategy for the classified category.

#### Step 2: Run Deterministic Checks (Verification)

Run the same checks from Phase 1 Step 1:

```bash
# Run type checker
npx tsc --noEmit 2>&1 | tail -50

# Run test suite
npm test 2>&1 | tail -100
```

Compare results to the baseline:
- Type errors: must be equal or fewer than baseline
- Test failures: the target failure must be resolved, no new failures introduced
- If new failures appeared, the fix is wrong. Revert and re-examine.

#### Step 3: Confirm Resolution

The error is resolved when:
1. The original error no longer occurs
2. No new errors were introduced
3. The type checker count is equal or better than baseline
4. The test suite count is equal or better than baseline

---

### Phase 4: RECORD — Capture Anti-Patterns (Optional)

This phase triggers only when the initial classification was wrong or the first fix attempt failed.

#### Step 1: Document What Went Wrong

```markdown
# Diagnostic Record: <brief description>
Date: <timestamp>
Initial Classification: <what you thought it was>
Actual Classification: <what it turned out to be>
Misclassification Reason: <why the signals were misleading>
Resolution: <what actually fixed it>
Anti-Pattern: <what to watch for next time>
```

#### Step 2: Save to Anti-Pattern Log

```bash
# Append to diagnostics log
cat >> .harness/diagnostics/anti-patterns.md << 'ENTRY'
<the record from Step 1>
ENTRY
```

This log accumulates over time and helps improve future classifications.

## Gates

- **Classification must be explicit.** You must write down the category, confidence level, and signals before any fix attempt. Implicit classification ("I'll just fix this type error") skips the evidence step and leads to misclassification.
- **Design category MUST escalate.** If the error is classified as Design, you must stop and escalate to the human. Do not attempt a local fix for an architectural problem. Local fixes for architectural problems create more architectural problems.
- **Deterministic checks before AND after.** You must run the type checker and test suite both before and after the fix. Without a baseline, you cannot prove the fix helped and did not hurt.
- **No category mixing.** Follow the resolution strategy for one category. If you find yourself profiling (Performance) while also tracing data flow (Logic), you have not committed to a classification. Pick one.
- **Reclassify, do not force.** If the resolution strategy is not working, the classification is probably wrong. Go back to Phase 1 and reclassify. Do not force a Logic fix on what turns out to be an Environment issue.

## Escalation

- **Design errors:** Always escalate. Provide: symptom summary, files affected, 2-3 architectural options if you can identify them.
- **Confidence is Low:** Escalate if you cannot decide between two categories after examining all signals. Present both possibilities and let the human decide.
- **Fix introduced new failures:** Revert the fix. Re-examine. If you cannot fix without side effects after 2 attempts, escalate.
- **Flaky test not isolated in 60 minutes:** The non-determinism source may be outside the codebase (infrastructure, external service). Escalate with your findings.
- **Security vulnerability with large blast radius:** If the minimal fix requires changing more than 3 files, reclassify as Design and escalate.

## Examples

### Example 1: Type Error in API Handler

**Phase 1 — CLASSIFY:**
```
Error: src/handlers/users.ts(42,15): error TS2345:
  Argument of type 'string | undefined' is not assignable to parameter of type 'string'.

Baseline: 1 type error, 0 test failures.

CLASSIFICATION: Syntax/Type
CONFIDENCE: High
SIGNALS: Compile-time error, TypeScript error code TS2345, exact file and line provided
ALTERNATIVE: None — this is unambiguously a type error
```

**Phase 2 — ROUTE:**
Following Syntax/Type strategy: read the error, fix mechanically.

The function `getUserById(id: string)` is called with `req.params.id` which is `string | undefined`. Add a guard or use non-null assertion after validation.

**Phase 3 — RESOLVE:**
```typescript
// Fix: add guard before call
const id = req.params.id;
if (!id) {
  return res.status(400).json({ error: 'id parameter is required' });
}
const user = await getUserById(id);
```

Verification: 0 type errors (was 1), 0 test failures (unchanged). Fix confirmed.

### Example 2: Flaky Integration Test

**Phase 1 — CLASSIFY:**
```
Error: test/integration/queue.test.ts
  "should process message within timeout"
  Passes 7 out of 10 runs. Fails with: "Timeout — message not processed within 2000ms"

Baseline: 0 type errors, 1 flaky test failure (intermittent).

CLASSIFICATION: Flaky
CONFIDENCE: High
SIGNALS: Intermittent failure, timing-dependent assertion (2000ms timeout),
  passes on retry, failure rate ~30%
ALTERNATIVE: Could be Environment if CI has different resource constraints,
  but it also flakes locally
```

**Phase 2 — ROUTE:**
Following Flaky strategy: isolate the timing dependency.

Run in isolation: still flakes (not order-dependent).
Run 20 times: fails 6/20 times (~30% failure rate, consistent).
Examine the test: it publishes a message and asserts it is processed within 2000ms.
Examine the handler: processing involves a database write that sometimes takes >2000ms under load.
Root cause: the timeout is too tight for the actual processing time, and there is no mechanism to signal completion — the test polls on a timer.

**Phase 3 — RESOLVE:**
```typescript
// Before: polling with fixed timeout
await new Promise(resolve => setTimeout(resolve, 2000));
const result = await db.query('SELECT * FROM processed WHERE id = ?', [msgId]);
expect(result.rows).toHaveLength(1);

// After: event-driven wait with generous timeout
const result = await waitForCondition(
  () => db.query('SELECT * FROM processed WHERE id = ?', [msgId])
    .then(r => r.rows.length > 0),
  { timeout: 10000, interval: 100 }
);
expect(result).toBe(true);
```

Verification: 0 type errors (unchanged), 20/20 test runs pass. Fix confirmed.

**Phase 4 — RECORD:**
Not needed — initial classification was correct and first fix attempt succeeded.
