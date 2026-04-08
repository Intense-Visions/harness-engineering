# Test E2E Strategy

> Choose the right test layer (unit/integration/E2E) and prevent flaky tests in CI

## When to Use

- Designing a test strategy for a new project or feature
- Deciding which test layer to write for a specific behavior
- Reducing test suite flakiness in CI
- Balancing test coverage with execution speed

## Instructions

1. **Apply the test trophy** (not pyramid) — prioritize integration tests:

```
          /  E2E  \        — Few: critical user journeys
         / Integration \    — Many: service + database tests
        /    Unit Tests  \  — Some: pure logic, algorithms
       / Static Analysis  \ — Always: TypeScript, ESLint
```

2. **Choose the right layer:**
   - **Static analysis** — type errors, lint rules, formatting. Runs on every save
   - **Unit tests** — pure functions, calculations, data transforms. No I/O
   - **Integration tests** — service + database, API endpoints, module composition
   - **E2E tests** — critical user journeys through the full stack

3. **Write E2E tests for critical paths only:**

```typescript
// Good E2E candidates:
// - User registration and login
// - Checkout and payment flow
// - Core feature happy path

// Bad E2E candidates:
// - Input validation (unit test)
// - API error handling (integration test)
// - Conditional rendering (component test)
```

4. **Prevent flakiness** with deterministic test design:

```typescript
// Bad: depends on timing
await page.click('#submit');
await new Promise((r) => setTimeout(r, 2000));
expect(page.getByText('Success')).toBeVisible();

// Good: waits for specific condition
await page.click('#submit');
await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
```

5. **Isolate test data** — each test creates its own data:

```typescript
test('user can update their profile', async ({ page }) => {
  // Create unique test user — no shared state with other tests
  const user = await createTestUser();
  await loginAs(page, user);
  // ... test continues
});
```

6. **Structure CI test runs** by speed:

```yaml
# .github/workflows/test.yml
jobs:
  static:
    steps: [typecheck, lint] # 30 seconds
  unit:
    steps: [vitest --run] # 1-2 minutes
  integration:
    steps: [vitest --config vitest.integration.ts] # 2-5 minutes
  e2e:
    steps: [playwright test] # 5-15 minutes
```

7. **Handle flaky tests:**
   - First: fix the root cause (race condition, shared state, timing)
   - Temporary: add `retries: 2` in CI config
   - Track: annotate with `test.fixme()` or a tracking issue
   - Never: delete the test or ignore it indefinitely

8. **Coverage targets by layer:**
   - Unit: 80%+ branch coverage on business logic
   - Integration: cover all API endpoints and error paths
   - E2E: cover 3-5 critical user journeys
   - Total: 70-85% combined coverage

## Details

A test strategy defines which behaviors are tested at which layer. The goal is maximum confidence with minimum execution time.

**Test trophy vs test pyramid:** The traditional test pyramid (many unit, few integration, fewer E2E) optimizes for speed but misses integration bugs. The test trophy (coined by Kent C. Dodds) prioritizes integration tests because they catch the most bugs per test.

**Cost of flaky tests:**

- Developers lose trust in the test suite and ignore failures
- CI becomes unreliable — teams retry instead of investigating
- Flaky tests waste CI compute time
- Undetected flakes can mask real failures

**Common flakiness causes:**

- Shared mutable state between tests (global variables, database state)
- Race conditions (testing async behavior with timeouts instead of conditions)
- Time dependency (tests that break at midnight or on leap days)
- Network dependency (tests that call real external APIs)
- Order dependency (test A must run before test B)

**Flakiness detection:**

- Run the test suite 10x with `--repeat=10` to find intermittent failures
- Use `--bail=1` to stop at the first failure and investigate
- Track flaky test rates with a CI dashboard

**Trade-offs:**

- More E2E tests catch more real bugs — but are slow and expensive to maintain
- Integration tests have the best ROI — but require test databases and setup
- Unit tests are fast — but can pass while the system is broken
- Strict CI rules (no flakes allowed) maintain quality — but can slow development

## Source

https://testing-library.com/docs/guiding-principles
