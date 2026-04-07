# Harness Mutation Test

> Test quality validation through mutation testing. Introduces deliberate code mutations to verify that the test suite catches real bugs, exposing weak assertions, missing edge cases, and dead test code.

## When to Use

- Evaluating test suite quality after reaching a coverage threshold (e.g., 80% line coverage)
- Validating that tests for critical business logic actually catch bugs, not just execute code
- Identifying which parts of the codebase have weak or superficial test coverage
- NOT when test coverage is below 60% (write more tests first with harness-tdd)
- NOT when optimizing test execution speed (mutation testing is inherently slow)
- NOT when the codebase has no existing tests (establish a test foundation first)

## Process

### Phase 1: CONFIGURE -- Set Up Mutation Testing Framework

1. **Detect the project's language and test framework.** Mutation testing tools are language-specific:
   - **TypeScript/JavaScript:** Stryker Mutator with Vitest, Jest, or Mocha runner
   - **Python:** mutmut or cosmic-ray with pytest
   - **Java/Kotlin:** PIT (pitest) with JUnit or TestNG
   - **C#:** Stryker.NET with NUnit, xUnit, or MSTest
   - **Rust:** cargo-mutants

2. **Install and configure the mutation framework.** Generate the configuration file:
   - Target source directories (exclude generated code, vendor, node_modules)
   - Test command and timeout multiplier (mutations may cause infinite loops)
   - Mutant operators to enable (arithmetic, conditional, string, logical)
   - Reporters (HTML for local review, JSON for CI integration)

3. **Define the scope.** Mutation testing is expensive. Scope it:
   - **Targeted run:** specific files or directories with high business value
   - **Incremental run:** only files changed since the last mutation run
   - **Full run:** entire codebase (reserve for milestones or nightly CI)

4. **Set the mutation score threshold.** Define the minimum acceptable score:
   - 80% for business-critical modules (payment, auth, data processing)
   - 60% for general application code
   - No threshold for infrastructure/glue code (routers, middleware wiring)

5. **Verify the test suite passes before mutating.** Run the full test suite. All tests must pass. Mutation testing against a failing suite produces meaningless results.

### Phase 2: GENERATE -- Create Mutants

1. **Run mutant generation in dry-run mode.** List the mutations that will be applied without executing tests. Review:
   - Total mutant count (hundreds to thousands depending on codebase size)
   - Mutant distribution across files
   - Types of mutations generated (arithmetic, conditional boundary, return value, etc.)

2. **Review the mutant operators.** Ensure the configured operators are relevant:
   - **Arithmetic:** `+` to `-`, `*` to `/` -- tests mathematical correctness
   - **Conditional boundary:** `<` to `<=`, `>` to `>=` -- tests off-by-one handling
   - **Negate conditional:** `==` to `!=`, `true` to `false` -- tests branch coverage
   - **Return value:** return empty string, zero, null, empty array -- tests output validation
   - **String mutation:** `"hello"` to `""` -- tests string handling
   - **Remove call:** delete a method call entirely -- tests that side effects are verified

3. **Estimate execution time.** Calculate:
   - Number of mutants times average test suite duration divided by parallelism factor
   - If estimated time exceeds 30 minutes, reduce scope or increase parallelism

4. **Filter out equivalent mutants (where possible).** Some mutations produce functionally identical code (e.g., changing the order of commutative operations). Configure the framework to skip known equivalent patterns to reduce noise.

### Phase 3: EXECUTE -- Run Tests Against Mutants

1. **Execute the mutation test run.** Start the framework with the configured scope:

   ```
   npx stryker run --concurrency 4
   ```

   or

   ```
   pitest:mutationCoverage
   ```

2. **Monitor progress.** Track:
   - Mutants tested vs. total
   - Kill rate as it progresses
   - Timeouts (mutants that cause infinite loops -- these count as killed)
   - Errors (mutants that cause compilation failures -- these are stillborn, not counted)

3. **Handle long-running mutations.** If a single mutant takes longer than 3x the normal test timeout:
   - The mutation likely introduced an infinite loop
   - The framework should kill it automatically (timeout = killed)
   - If the framework hangs, check the timeout multiplier configuration

4. **Collect results.** After completion, the framework produces:
   - Mutation score: (killed + timeout) / (total - stillborn - ignored)
   - Per-file mutation scores
   - List of survived mutants with their locations and mutation descriptions

### Phase 4: ANALYZE -- Interpret Results and Improve Tests

1. **Review the overall mutation score.** Compare against the threshold:
   - Above threshold: test quality is acceptable. Review survived mutants for targeted improvements.
   - Below threshold: significant test gaps exist. Prioritize fixes by file criticality.

2. **Examine survived mutants.** For each survived mutant, determine why the test suite did not catch it:
   - **Missing assertion:** the test executes the code but does not assert on the affected output. Fix: add a specific assertion.
   - **Missing test case:** no test covers the mutated branch. Fix: write a new test for that path.
   - **Weak assertion:** the test asserts but too loosely (e.g., `toBeTruthy()` instead of `toBe(42)`). Fix: strengthen the assertion.
   - **Equivalent mutant:** the mutation does not change observable behavior. Mark as ignored.

3. **Prioritize improvements by business impact.** Focus on survived mutants in:
   - Authentication and authorization logic
   - Payment and billing calculations
   - Data validation and sanitization
   - Core domain algorithms

4. **Write targeted tests for the highest-priority survived mutants.** For each:
   - Write a test that fails against the mutated code but passes against the original
   - Verify the test is meaningful (not just mutation-hunting -- it should test real behavior)
   - Run the mutation test again on the affected file to confirm the mutant is now killed

5. **Generate an improvement report.** Summarize:
   - Starting mutation score vs. ending mutation score
   - Number of survived mutants addressed
   - Tests added or strengthened
   - Remaining gaps with recommendations

6. **Run `harness validate`.** Confirm the project passes all harness checks after test improvements.

### Graph Refresh

If a knowledge graph exists at `.harness/graph/`, refresh it after code changes to keep graph queries accurate:

```
harness scan [path]
```

## Harness Integration

- **`harness validate`** -- Run in ANALYZE phase after tests are improved. Confirms project health with strengthened tests.
- **`harness check-deps`** -- Run after CONFIGURE phase to verify mutation testing framework is in devDependencies.
- **`emit_interaction`** -- Used to present mutation score results and survived mutant analysis to the human for prioritization decisions.
- **Grep** -- Used in ANALYZE phase to find weak assertions (`toBeTruthy`, `toBeDefined`, `!= null`) and missing assertion patterns.
- **Glob** -- Used to identify test files corresponding to source files with survived mutants.

## Success Criteria

- Mutation score meets or exceeds the defined threshold for targeted modules
- Every survived mutant in critical business logic has been addressed or explicitly justified
- New tests written for survived mutants test real behavior, not just mutation-specific code paths
- Weak assertions (`toBeTruthy`, `toBeDefined`, `expect(result)` without matcher) are replaced with specific assertions
- The mutation test configuration is committed and can run in CI
- `harness validate` passes after test improvements

## Examples

### Example: Stryker Mutation Testing for a TypeScript Billing Module

**CONFIGURE -- Stryker configuration:**

```javascript
// stryker.config.mjs
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: ['src/billing/**/*.ts', '!src/billing/**/*.test.ts'],
  testRunner: 'vitest',
  reporters: ['html', 'clear-text', 'progress'],
  coverageAnalysis: 'perTest',
  timeoutMS: 30000,
  concurrency: 4,
  thresholds: {
    high: 90,
    low: 80,
    break: 75,
  },
};
```

**ANALYZE -- Survived mutant investigation:**

```
Mutant #47: src/billing/calculate-discount.ts:23
  Original:  if (quantity >= 10) { discount = 0.15; }
  Mutation:   if (quantity > 10)  { discount = 0.15; }
  Status:    SURVIVED

Analysis: No test checks the boundary condition where quantity is exactly 10.
The existing test uses quantity=20 (well above threshold) and quantity=5 (below).
```

**Fix -- Add boundary test:**

```typescript
// src/billing/calculate-discount.test.ts
it('applies 15% discount when quantity is exactly 10', () => {
  const result = calculateDiscount({ quantity: 10, unitPrice: 100 });
  expect(result.discount).toBe(0.15);
  expect(result.total).toBe(850);
});

it('does not apply discount when quantity is 9', () => {
  const result = calculateDiscount({ quantity: 9, unitPrice: 100 });
  expect(result.discount).toBe(0);
  expect(result.total).toBe(900);
});
```

### Example: PIT Mutation Testing for a Java Service

**CONFIGURE -- Maven PIT plugin:**

```xml
<!-- pom.xml -->
<plugin>
  <groupId>org.pitest</groupId>
  <artifactId>pitest-maven</artifactId>
  <version>1.15.3</version>
  <configuration>
    <targetClasses>
      <param>com.example.orders.*</param>
    </targetClasses>
    <targetTests>
      <param>com.example.orders.*Test</param>
    </targetTests>
    <mutators>
      <mutator>CONDITIONALS_BOUNDARY</mutator>
      <mutator>NEGATE_CONDITIONALS</mutator>
      <mutator>RETURN_VALS</mutator>
      <mutator>MATH</mutator>
    </mutators>
    <mutationThreshold>80</mutationThreshold>
    <timestampedReports>false</timestampedReports>
  </configuration>
</plugin>
```

**EXECUTE:**

```bash
mvn org.pitest:pitest-maven:mutationCoverage
# Report generated at target/pit-reports/index.html
```

## Rationalizations to Reject

| Rationalization                                                                                | Why It Is Wrong                                                                                                      |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| "We have 80% line coverage, so test quality is already good"                                   | Line coverage measures execution, not verification. Mutation testing reveals missing assertions and weak assertions. |
| "The survived mutants are in non-critical utility code, so we can ignore them"                 | Every survived mutant must be either addressed with a test or explicitly justified as an equivalent mutant.          |
| "I will write a test that targets the specific mutation to kill it"                            | No gaming the mutation score. Every new test must test a meaningful behavior, not just kill a specific mutant.       |
| "The test suite has some failures, but we can still run mutation testing to see what we learn" | No mutation testing against a failing test suite. Mutations against broken tests produce garbage results.            |

## Gates

- **No mutation testing against a failing test suite.** All tests must pass before mutants are generated. Running mutations against broken tests produces garbage results. Fix the tests first.
- **Survived mutants in critical modules must be addressed.** If a survived mutant is in authentication, billing, or data validation logic, it cannot be ignored. Write a test or justify why the mutation is equivalent.
- **No gaming the mutation score.** Writing tests that only target survived mutants without testing real behavior inflates the score without improving quality. Every new test must test a meaningful behavior, not just kill a specific mutant.
- **Mutation score regression blocks merge.** If the mutation score drops below the configured threshold after a code change, the change must include tests that restore the score before merging.

## Escalation

- **When mutation testing takes too long (> 1 hour for targeted run):** Reduce scope to changed files only. Use incremental mutation testing if the framework supports it. For full runs, schedule as a nightly CI job rather than blocking PRs.
- **When a high number of equivalent mutants skew the score:** Review mutant operators. Disable operators that produce mostly equivalent mutants for the codebase (e.g., string mutations in a codebase with few string operations). Document disabled operators and the rationale.
- **When the team disputes whether a survived mutant matters:** Evaluate: would a real bug in that code path cause user-visible harm? If yes, write the test. If no, document it as an accepted risk with a code comment explaining why.
- **When mutation testing reveals architectural issues (untestable code):** This is a design signal, not a testing problem. Escalate to refactoring -- the code needs dependency injection, interface extraction, or seam creation before meaningful tests can be written.
