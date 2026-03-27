# Harness Property Test

> Property-based and generative testing with fast-check, hypothesis, and automatic shrinking. Discovers edge cases that example-based tests miss by generating thousands of random inputs and verifying invariants hold for all of them.

## When to Use

- Testing functions with large input spaces (parsers, serializers, encoders, validators)
- Verifying mathematical or algebraic properties (commutativity, associativity, round-trip encoding)
- Finding edge cases in data transformation, sorting, or filtering logic
- NOT when testing UI rendering or visual output (use harness-visual-regression instead)
- NOT when testing simple CRUD operations with well-defined inputs (use harness-tdd instead)
- NOT when testing external service integrations (use harness-integration-test instead)

## Process

### Phase 1: IDENTIFY -- Discover Testable Properties and Invariants

1. **Catalog candidate functions.** Search for functions that exhibit testable properties:
   - **Pure functions** with deterministic output for given input
   - **Serializers/deserializers** where `decode(encode(x)) === x` (round-trip property)
   - **Sorting/filtering** where output maintains invariants (sorted order, subset relationship)
   - **Validators** where valid input always passes and specific invalid inputs always fail
   - **Mathematical functions** with known algebraic properties

2. **Identify properties for each candidate.** Common property categories:
   - **Round-trip:** `deserialize(serialize(x)) === x` for any valid `x`
   - **Idempotence:** `f(f(x)) === f(x)` (applying the function twice gives the same result)
   - **Invariant preservation:** output always satisfies a postcondition regardless of input
   - **Commutativity:** `f(a, b) === f(b, a)` for operations where order should not matter
   - **No-crash (robustness):** function does not throw for any input in the domain
   - **Monotonicity:** if `a <= b`, then `f(a) <= f(b)` for order-preserving functions
   - **Equivalence:** `fastImpl(x) === referenceImpl(x)` for optimized implementations

3. **Define input domains.** For each property, specify:
   - The type and range of valid inputs
   - Constraints that inputs must satisfy (e.g., non-empty arrays, positive integers)
   - Edge cases that the generator should emphasize (empty strings, zero, max int, Unicode)

4. **Prioritize by risk.** Focus property tests on:
   - Functions where bugs have high business impact
   - Functions with complex branching logic
   - Functions that have had historical bugs or regression issues

5. **Report findings.** List candidate functions, their properties, and the expected generator configuration.

### Phase 2: DEFINE -- Write Property Specifications and Custom Generators

1. **Select the property testing framework.** Based on the project's language:
   - **TypeScript/JavaScript:** fast-check
   - **Python:** hypothesis
   - **Rust:** proptest or quickcheck
   - **Scala:** ScalaCheck
   - **Haskell:** QuickCheck
   - **Java/Kotlin:** jqwik

2. **Define custom generators (arbitraries) for domain types.** For each domain model:
   - Build a generator that produces valid instances with realistic field values
   - Add constraints matching the model's validation rules
   - Compose generators for nested structures using `map`, `flatMap`, and `filter`

3. **Write property test specifications.** For each property identified in Phase 1:
   - State the property as a universally quantified assertion: "For all inputs X satisfying constraint C, property P holds"
   - Use the framework's property definition syntax
   - Configure iteration count (default: 100 iterations for fast properties, 1000 for critical properties)

4. **Configure shrinking.** Ensure the framework's automatic shrinking is enabled:
   - Shrinking reduces failing inputs to the minimal counterexample
   - Custom generators should support shrinking (use `map` over `filter` where possible, since `filter` breaks shrinking)
   - Set a shrink limit to prevent infinite shrinking on complex inputs

5. **Write seed values for reproducibility.** Configure:
   - A fixed seed for CI to ensure deterministic reruns
   - Seed logging so that any failure can be reproduced exactly
   - Replay capability: failed seeds are stored and replayed on subsequent runs

### Phase 3: EXECUTE -- Run Property Tests and Collect Counterexamples

1. **Run property tests with verbose output.** Execute the test suite and observe:
   - Number of test cases generated per property
   - Any counterexamples found (failing inputs)
   - Shrinking progress (how the framework reduces counterexamples)

2. **Analyze counterexamples.** For each failing property:
   - Read the shrunk counterexample -- this is the minimal input that violates the property
   - Understand why this input causes a failure
   - Classify: is this a real bug, or is the property specification too strict?

3. **Reproduce counterexamples deterministically.** For each counterexample:
   - Record the failing seed value
   - Write an explicit example-based test using the shrunk counterexample as a regression test
   - This regression test serves as documentation and prevents the same bug from recurring

4. **Handle flaky property tests.** If a property test fails intermittently:
   - Increase the iteration count to reproduce more reliably
   - Check if the property is sensitive to floating-point precision
   - Verify that the generator does not produce inputs outside the valid domain

5. **Iterate on generator quality.** If the generator frequently produces uninteresting inputs:
   - Add bias toward edge cases (empty collections, boundary values)
   - Use `filter` sparingly (it discards inputs, wasting iterations)
   - Prefer `map` and `flatMap` to construct valid inputs directly

### Phase 4: ANALYZE -- Diagnose Root Causes and Harden Implementations

1. **Fix bugs exposed by counterexamples.** For each real bug found:
   - Understand the root cause using the minimal counterexample
   - Fix the implementation
   - Verify the property now holds (rerun with the same seed)
   - Keep the regression test with the explicit counterexample

2. **Strengthen property specifications.** After fixing bugs:
   - Consider whether additional properties are now testable
   - Tighten existing properties if the fix enables stricter invariants
   - Add properties for edge cases revealed by the counterexamples

3. **Measure property test effectiveness.** Evaluate:
   - Number of unique bugs found by property tests vs. example-based tests
   - Types of bugs found (off-by-one, overflow, Unicode handling, null handling)
   - Generator coverage: what percentage of the input domain is being explored

4. **Integrate property tests into CI.** Configure:
   - Property tests run on every PR with a moderate iteration count (100)
   - Nightly runs use a higher iteration count (10,000) for deeper exploration
   - Failed seeds are stored as artifacts for reproduction

5. **Run `harness validate`.** Confirm the project passes all harness checks with property tests in place.

### Graph Refresh

If a knowledge graph exists at `.harness/graph/`, refresh it after code changes to keep graph queries accurate:

```
harness scan [path]
```

## Harness Integration

- **`harness validate`** -- Run in ANALYZE phase after property tests are written and bugs are fixed. Confirms project health.
- **`harness check-deps`** -- Run after DEFINE phase to verify property testing framework is in devDependencies.
- **`emit_interaction`** -- Used to present counterexample analysis and property specification decisions to the human.
- **Grep** -- Used in IDENTIFY phase to find pure functions, serializers, validators, and mathematical operations.
- **Glob** -- Used to catalog existing property test files and domain type definitions.

## Success Criteria

- Every function with large input space has at least one property test
- Custom generators produce valid domain objects without relying heavily on `filter`
- All counterexamples are investigated: real bugs are fixed, property specs are adjusted for false positives
- Shrunk counterexamples are preserved as explicit regression tests
- Property tests are deterministic in CI (fixed seed) while still exploring randomly in local development
- `harness validate` passes with property tests in place

## Examples

### Example: fast-check for a TypeScript URL Parser

**IDENTIFY -- Properties of a URL parser:**

```
Function: parseUrl(input: string): ParsedUrl
Properties:
  1. Round-trip: formatUrl(parseUrl(url)) === url for any valid URL
  2. No-crash: parseUrl(arbitrary_string) never throws (returns Result type)
  3. Invariant: parsed.protocol is always lowercase
  4. Invariant: parsed.host never contains a trailing slash
```

**DEFINE -- Custom generator and property tests:**

```typescript
// tests/property/url-parser.prop.test.ts
import fc from 'fast-check';
import { parseUrl, formatUrl } from '../../src/url-parser';

// Custom generator for valid URLs
const urlArb = fc
  .record({
    protocol: fc.constantFrom('http', 'https', 'ftp'),
    host: fc.domain(),
    port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    path: fc
      .array(
        fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
          minLength: 1,
        })
      )
      .map((segments) => '/' + segments.join('/')),
  })
  .map(({ protocol, host, port, path }) => `${protocol}://${host}${port ? ':' + port : ''}${path}`);

describe('URL parser properties', () => {
  it('round-trips valid URLs', () => {
    fc.assert(
      fc.property(urlArb, (url) => {
        const parsed = parseUrl(url);
        if (!parsed.ok) return false; // skip invalid (generator should not produce these)
        return formatUrl(parsed.value) === url;
      }),
      { numRuns: 1000, seed: 42 }
    );
  });

  it('never throws on arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseUrl(input);
        // Must return a Result, never throw
        return result.ok === true || result.ok === false;
      }),
      { numRuns: 5000 }
    );
  });

  it('always produces lowercase protocol', () => {
    fc.assert(
      fc.property(urlArb, (url) => {
        const parsed = parseUrl(url.toUpperCase());
        if (!parsed.ok) return true; // skip failures
        return parsed.value.protocol === parsed.value.protocol.toLowerCase();
      })
    );
  });
});
```

### Example: hypothesis for a Python Sorting Algorithm

**DEFINE -- Property tests with hypothesis:**

```python
# tests/property/test_sort_properties.py
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from myapp.sorting import merge_sort

@given(st.lists(st.integers()))
def test_sort_preserves_length(xs):
    """Sorted output has the same length as input."""
    assert len(merge_sort(xs)) == len(xs)

@given(st.lists(st.integers()))
def test_sort_preserves_elements(xs):
    """Sorted output contains exactly the same elements as input."""
    assert sorted(merge_sort(xs)) == sorted(xs)

@given(st.lists(st.integers(), min_size=1))
def test_sort_produces_ordered_output(xs):
    """Every element is less than or equal to the next."""
    result = merge_sort(xs)
    for i in range(len(result) - 1):
        assert result[i] <= result[i + 1]

@given(st.lists(st.integers()))
def test_sort_is_idempotent(xs):
    """Sorting an already-sorted list produces the same result."""
    once = merge_sort(xs)
    twice = merge_sort(once)
    assert once == twice

@settings(max_examples=5000)
@given(st.lists(st.floats(allow_nan=False, allow_infinity=False)))
def test_sort_handles_floats(xs):
    """Sort works correctly with floating-point numbers."""
    result = merge_sort(xs)
    for i in range(len(result) - 1):
        assert result[i] <= result[i + 1]
```

## Gates

- **No property tests without shrinking.** If the framework's automatic shrinking is disabled or the generator uses patterns that break shrinking (excessive `filter`), counterexamples will be unhelpfully large. Fix the generator to support shrinking.
- **No ignoring counterexamples.** Every counterexample produced by a property test must be investigated. If it reveals a real bug, fix it. If it is a false positive, adjust the property specification or generator. Never just increase the iteration count to make it "less likely to fail."
- **No property tests that always pass trivially.** A property that returns `true` for every input is useless. Review that properties make substantive assertions. If a property has a `return true` fallback for most inputs, the generator is producing too many invalid inputs.
- **Regression tests are mandatory for counterexamples.** Every shrunk counterexample that revealed a bug must be preserved as an explicit example-based test, even after the property test passes. The explicit test serves as documentation and prevents regression.

## Escalation

- **When the generator cannot produce valid inputs efficiently (> 50% rejection rate):** Rewrite the generator to construct valid inputs directly rather than filtering. Use `flatMap` to build constrained structures incrementally. If the domain constraints are too complex for a generator, consider whether the function's API needs simplification.
- **When a counterexample is too complex to understand even after shrinking:** The shrinking strategy may be insufficient for the data type. Write a custom shrinker that targets the specific structure. Alternatively, add intermediate logging to the property to trace which sub-property fails.
- **When property tests are too slow for CI (> 5 minutes):** Reduce the iteration count for PR runs (100 iterations). Run high-iteration tests (10,000+) as a nightly job. Consider whether some properties can be tested with smaller input ranges without losing coverage.
- **When the team debates whether a property is correct:** The property may be encoding an assumption that does not hold. Review the specification or domain requirements. If the correct behavior is ambiguous, escalate to product/domain experts before encoding the property in a test.
