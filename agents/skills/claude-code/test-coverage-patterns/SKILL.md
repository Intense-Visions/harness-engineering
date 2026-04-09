# Test Coverage Patterns

> Configure and interpret test coverage thresholds for meaningful quality signals

## When to Use

- Setting up coverage reporting in a project
- Defining coverage thresholds for CI quality gates
- Interpreting coverage reports to find undertested code
- Deciding which coverage metrics matter for your project

## Instructions

1. **Enable coverage in Vitest:**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // or 'istanbul'
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/index.ts'],
    },
  },
});
```

Run with: `vitest --coverage`

2. **Set coverage thresholds:**

```typescript
coverage: {
  thresholds: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
},
```

CI fails if coverage drops below these thresholds.

3. **Per-file thresholds** for critical paths:

```typescript
coverage: {
  thresholds: {
    'src/services/**': { branches: 90, functions: 90, lines: 90, statements: 90 },
    'src/utils/**': { branches: 70, functions: 70, lines: 70, statements: 70 },
  },
},
```

4. **Coverage metrics explained:**
   - **Lines** — percentage of executable lines that ran during tests
   - **Branches** — percentage of `if/else`, `switch`, `ternary` paths taken
   - **Functions** — percentage of functions that were called
   - **Statements** — percentage of individual statements executed

Branch coverage is the most meaningful metric. A file can have 100% line coverage but miss error-handling branches.

5. **Exclude generated and boilerplate code:**

```typescript
coverage: {
  exclude: [
    'src/**/*.test.ts',
    'src/**/*.stories.ts',
    'src/generated/**',
    'src/**/index.ts',     // barrel files
    'src/**/*.d.ts',
    'src/main.ts',         // entry point
  ],
},
```

6. **Use `/* v8 ignore next */` or `/* istanbul ignore next */`** sparingly for code that cannot be tested:

```typescript
/* v8 ignore next 3 */
if (process.env.NODE_ENV === 'development') {
  enableDevTools();
}
```

7. **View the HTML report** for detailed analysis:

```bash
vitest --coverage
open coverage/index.html
```

The HTML report highlights uncovered lines in red and shows branch coverage inline.

8. **Ratcheting strategy** — only increase thresholds, never decrease:

```typescript
// Start low, increase as coverage improves
coverage: {
  thresholds: {
    lines: 60,    // Current: 62% — ratchet up as tests are added
    branches: 50, // Current: 53%
  },
},
```

## Details

Code coverage measures which lines, branches, and functions your tests exercise. It is a negative indicator — low coverage definitively means undertested code. High coverage does NOT mean well-tested code.

**V8 vs Istanbul providers:**

- **V8** — uses V8's built-in coverage instrumentation. Faster, no code transformation, works with native ESM. Slightly less accurate branch coverage
- **Istanbul** — instruments the source code before execution. Slower but produces more accurate branch counts. Required if V8 coverage is not available

**Coverage anti-patterns:**

- Chasing 100% — the last 10% of coverage requires disproportionate effort for diminishing returns
- Testing getters/setters just for coverage — waste of effort
- Ignoring branch coverage — a function with 100% line coverage may miss all error paths
- Not excluding generated code — inflates or deflates metrics unfairly

**Meaningful thresholds by code type:**

- Business logic (services, domain): 85-95% branches
- Utility functions: 90%+ (easy to test exhaustively)
- API handlers: 70-80% (hard to test all error paths)
- UI components: 60-70% (visual behavior is hard to assert)

**Coverage in CI:**

- Run coverage on every PR
- Block merges when coverage drops below thresholds
- Use `lcov` reporter for SonarQube, Codecov, or Coveralls integration
- Display the coverage badge in README for visibility

**Trade-offs:**

- Coverage thresholds prevent regression — but can incentivize low-value tests
- HTML reports reveal gaps clearly — but require manual analysis
- Per-file thresholds enable nuanced rules — but increase configuration complexity

## Source

https://vitest.dev/guide/coverage.html

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
