# Test TDD Workflow

> Drive design through tests using red-green-refactor cycle and test-first discipline

## When to Use

- Implementing new features or fixing bugs with test-first approach
- Designing APIs by starting from the consumer's perspective
- Building confidence in code correctness before shipping
- Refactoring with a safety net of comprehensive tests

## Instructions

1. **Red** — Write a failing test that describes the desired behavior:

```typescript
describe('PasswordValidator', () => {
  it('rejects passwords shorter than 8 characters', () => {
    const result = validatePassword('short');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 8 characters');
  });
});
```

Run the test — it should fail (function does not exist or returns wrong value).

2. **Green** — Write the minimum code to make the test pass:

```typescript
function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  return { valid: errors.length === 0, errors };
}
```

Run the test — it should pass.

3. **Refactor** — Improve the code while keeping tests green:

```typescript
// Extract rules into a composable structure
const rules: PasswordRule[] = [
  { test: (p) => p.length >= 8, message: 'Password must be at least 8 characters' },
  { test: (p) => /[A-Z]/.test(p), message: 'Password must contain an uppercase letter' },
];

function validatePassword(password: string): ValidationResult {
  const errors = rules.filter((r) => !r.test(password)).map((r) => r.message);
  return { valid: errors.length === 0, errors };
}
```

Run all tests — everything should still pass.

4. **Add the next test** and repeat:

```typescript
it('rejects passwords without uppercase letters', () => {
  const result = validatePassword('lowercase123');
  expect(result.valid).toBe(false);
  expect(result.errors).toContain('Password must contain an uppercase letter');
});

it('accepts valid passwords', () => {
  const result = validatePassword('ValidPass123!');
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
});
```

5. **Use watch mode** for instant feedback:

```bash
vitest --watch
```

Tests re-run on every file save, showing red/green status immediately.

6. **Start from the outside** — test the public API first, then drill into internals:

```typescript
// First: test the public function
it('creates an order with total', async () => {
  const order = await createOrder({ items: [{ sku: 'A', qty: 2, price: 10 }] });
  expect(order.total).toBe(20);
});

// Then: test edge cases
it('applies bulk discount for qty > 10', async () => {
  /* ... */
});
it('throws for empty items array', async () => {
  /* ... */
});
```

7. **Write the test name as a specification:**

```typescript
// Tests serve as living documentation
describe('ShippingCalculator', () => {
  it('charges flat $5 for orders under $50', () => {
    /* ... */
  });
  it('provides free shipping for orders over $50', () => {
    /* ... */
  });
  it('uses express rate when expedited shipping is selected', () => {
    /* ... */
  });
  it('throws for negative order totals', () => {
    /* ... */
  });
});
```

8. **Do not refactor red tests.** If a test is failing, make it pass first. Never change code structure while tests are red.

## Details

TDD is a design technique that uses tests to drive the shape of the code. The core discipline is: never write production code without a failing test that demands it.

**The three rules of TDD:**

1. Write no production code except to pass a failing test
2. Write only enough test to demonstrate a failure
3. Write only enough production code to pass the test

**Benefits of TDD:**

- **Design feedback** — if code is hard to test, it is hard to use. TDD surfaces design problems early
- **Regression safety** — every behavior has a test before the code exists
- **Documentation** — test names describe what the code does
- **Confidence** — refactoring is safe because the test suite catches regressions

**When TDD works best:**

- Pure functions and business logic
- Service layer operations with clear input/output
- Data validation and transformation
- Algorithm implementation

**When TDD is harder:**

- UI rendering (use visual tests instead)
- Integration with external systems (mock the boundary, test integration separately)
- Performance optimization (write tests first, then optimize)

**Common TDD mistakes:**

- Writing too many tests before any code — leads to over-design
- Writing production code before the test — breaks the feedback loop
- Not refactoring after green — accumulates technical debt
- Testing implementation details — breaks on refactoring

**Trade-offs:**

- TDD produces well-tested code — but takes longer initially
- Small steps feel slow — but prevent debugging sessions
- Test-first drives better API design — but requires discipline to maintain
- Watch mode gives instant feedback — but can be distracting in complex debugging scenarios

## Source

https://vitest.dev/guide/

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
