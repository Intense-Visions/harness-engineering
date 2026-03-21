# Harness Perf TDD

> Red-Green-Refactor with performance assertions. Every feature gets a correctness test AND a benchmark. No optimization without measurement.

## When to Use

- Implementing performance-critical features
- When the spec includes performance requirements (e.g., "must respond in < 100ms")
- When modifying `@perf-critical` annotated code
- When adding hot-path logic (parsers, serializers, query resolvers, middleware)
- NOT for non-performance-sensitive code (use harness-tdd instead)
- NOT for refactoring existing code that already has benchmarks (use harness-refactoring + harness-perf)

## Process

### Iron Law

**No production code exists without both a failing test AND a failing benchmark that demanded its creation.**

If you find yourself writing production code before both the test and the benchmark exist, STOP. Write the test. Write the benchmark. Then implement.

---

### Phase 1: RED — Write Failing Test + Benchmark

1. **Write the correctness test** following the same process as harness-tdd Phase 1 (RED):
   - Identify the smallest behavior to test
   - Write ONE minimal test with a clear assertion
   - Follow the project's test conventions

2. **Write a `.bench.ts` benchmark file** alongside the test file:
   - Co-locate with source: `handler.ts` -> `handler.bench.ts`
   - Use Vitest bench syntax for benchmark definitions
   - Set a performance assertion if the spec includes one

   ```typescript
   import { bench, describe } from 'vitest';
   import { processData } from './handler';

   describe('processData benchmarks', () => {
     bench('processData with small input', () => {
       processData(smallInput);
     });

     bench('processData with large input', () => {
       processData(largeInput);
     });
   });
   ```

3. **Run the test** — observe failure. The function is not implemented yet, so the test should fail with "not defined" or "not a function."

4. **Run the benchmark** — observe failure or no baseline. This establishes that the benchmark exists and will track performance once the implementation lands.

---

### Phase 2: GREEN — Pass Test and Benchmark

1. **Write the minimum implementation** to make the correctness test pass. Do not optimize yet. The goal is correctness first.

2. **Run the test** — observe pass. If it fails, fix the implementation until it passes.

3. **Run the benchmark** -- capture initial results and apply thresholds:

   **When the spec defines a performance requirement** (e.g., "< 50ms"):
   - Use the spec requirement as the benchmark assertion threshold
   - Verify it passes; if not, see step 4

   **When the spec is vague or silent on performance:**
   - Fall back to harness-perf tier thresholds:
     - Critical path functions (annotated `@perf-critical` or high fan-in): must not regress >5% from baseline (Tier 1)
     - Non-critical functions: must not regress >10% from baseline (Tier 2)
     - Structural complexity: must stay under Tier 2 thresholds (cyclomatic <=15, nesting <=4, function length <=50 lines, params <=5)
   - These thresholds give developers concrete targets even when the spec does not specify performance requirements

   **When no baseline exists (new code):**
   - This run captures the initial baseline
   - No regression comparison on first run
   - VALIDATE phase (Phase 4) ensures the captured baseline is committed via `harness perf baselines update`

4. **If the performance assertion fails,** you have two options:
   - The implementation approach is fundamentally wrong (e.g., O(n^2) when O(n) is needed) — revise the algorithm
   - The assertion is too aggressive for a first pass — note it and defer to REFACTOR phase

---

### Phase 3: REFACTOR — Optimize While Green

This phase is optional. Enter it when:

- The benchmark shows room for improvement against the performance requirement
- Profiling reveals an obvious bottleneck
- The code can be simplified while maintaining or improving performance

1. **Profile the implementation** if the benchmark result is far from the requirement. Use the benchmark output to identify the bottleneck.

2. **Refactor for performance** — consider:
   - Algorithm improvements (sort, search, data structure choice)
   - Caching or memoization for repeated computations
   - Reducing allocations (object pooling, buffer reuse)
   - Eliminating unnecessary work (early returns, lazy evaluation)

3. **After each change,** run both checks:
   - **Test:** Still passing? If not, the refactor broke correctness. Revert.
   - **Benchmark:** Improved? If not, the refactor was not effective. Consider reverting.

4. **Stop when** the benchmark meets the performance requirement, or when further optimization yields diminishing returns (< 1% improvement per change).

5. **Do not gold-plate.** If the requirement is "< 100ms" and you are at 40ms, stop. Move on.

---

### Phase 4: VALIDATE — Harness Checks

1. **Run `harness check-perf`** to verify no Tier 1 or Tier 2 violations were introduced by the implementation:
   - Cyclomatic complexity within thresholds
   - Coupling metrics acceptable
   - No benchmark regressions in other modules

2. **Run `harness validate`** to verify overall project health:
   - All tests pass
   - Linter clean
   - Type checks pass

3. **Update baselines** if this is a new benchmark:

   ```bash
   harness perf baselines update
   ```

   This persists the current benchmark results so future runs can detect regressions.

4. **Commit with a descriptive message** that mentions both the feature and its performance characteristics:
   ```
   feat(parser): add streaming JSON parser (<50ms for 1MB payloads)
   ```

---

## Benchmark File Convention

Benchmark files are co-located with their source files, using the `.bench.ts` extension:

| Source File                   | Benchmark File                      |
| ----------------------------- | ----------------------------------- |
| `src/parser/handler.ts`       | `src/parser/handler.bench.ts`       |
| `src/api/resolver.ts`         | `src/api/resolver.bench.ts`         |
| `packages/core/src/engine.ts` | `packages/core/src/engine.bench.ts` |

Each benchmark file should:

- Import only from the module under test
- Define benchmarks in a `describe` block named after the module
- Include both small-input and large-input cases when applicable
- Use realistic data (not empty objects or trivial inputs)

---

## Harness Integration

- **`harness check-perf`** — Run after implementation to check for violations
- **`harness perf bench`** — Run benchmarks in isolation
- **`harness perf baselines update`** — Persist benchmark results as new baselines
- **`harness validate`** — Full project health check
- **`harness perf critical-paths`** — View critical path set to understand which benchmarks have stricter thresholds

## Success Criteria

- Every new function has both a test file (`.test.ts`) and a bench file (`.bench.ts`)
- Benchmarks run without errors
- No Tier 1 performance violations after implementation
- Baselines are updated for new benchmarks
- Commit message includes performance context when relevant

## Examples

### Example: Implementing a Performance-Critical Parser

**Phase 1: RED**

```typescript
// src/parser/json-stream.test.ts
it('parses 1MB JSON in under 50ms', () => {
  const result = parseStream(largeMbPayload);
  expect(result).toEqual(expectedOutput);
});

// src/parser/json-stream.bench.ts
bench('parseStream 1MB', () => {
  parseStream(largeMbPayload);
});
```

Run test: FAIL (parseStream not defined). Run benchmark: FAIL (no implementation).

**Phase 2: GREEN**

```typescript
// src/parser/json-stream.ts
export function parseStream(input: string): ParsedResult {
  return JSON.parse(input); // simplest correct implementation
}
```

Run test: PASS. Run benchmark: 38ms average (meets <50ms requirement).

**Phase 3: REFACTOR** — skipped (38ms already meets 50ms target).

**Phase 4: VALIDATE**

```
harness check-perf — no violations
harness validate — passes
harness perf baselines update — baseline saved
git commit -m "feat(parser): add streaming JSON parser (<50ms for 1MB payloads)"
```

### Example: Optimizing an Existing Hot Path

**Phase 1: RED** — test and benchmark already exist from initial implementation.

**Phase 3: REFACTOR**

```
Before: resolveImports 12ms (requirement: <5ms)
Change: switch from recursive descent to iterative with stack
After:  resolveImports 3.8ms
Test: still passing
```

**Phase 4: VALIDATE**

```
harness check-perf — complexity reduced from 12 to 8 (improvement)
harness perf baselines update — new baseline saved
```

## Gates

- **No code before test AND benchmark.** Both must exist before implementation begins.
- **No optimization without measurement.** Run the benchmark before and after refactoring. Gut feelings are not measurements.
- **No skipping VALIDATE.** `harness check-perf` and `harness validate` must pass after every cycle.
- **No committing without updated baselines.** New benchmarks must have baselines persisted.

## Escalation

- **When the performance requirement cannot be met:** Report the best achieved result and propose either relaxing the requirement or redesigning the approach. Include benchmark data.
- **When benchmarks are flaky:** Increase iteration count, add warmup, or isolate the benchmark from I/O. Report the variance so the team can decide on an acceptable noise margin.
- **When the test and benchmark have conflicting needs:** Correctness always wins. If a correct implementation cannot meet the performance requirement, escalate to the team for a design decision.
