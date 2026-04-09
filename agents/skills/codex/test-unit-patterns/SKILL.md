# Test Unit Patterns

> Write focused, isolated unit tests using AAA pattern with describe/it/expect

## When to Use

- Testing individual functions, classes, or modules in isolation
- Verifying pure logic, calculations, or data transformations
- Building a fast test suite that runs in milliseconds
- Following TDD red-green-refactor workflow

## Instructions

1. **Structure tests with AAA** (Arrange, Act, Assert):

```typescript
import { describe, it, expect } from 'vitest';
import { calculateDiscount } from './pricing';

describe('calculateDiscount', () => {
  it('applies 10% discount for orders over $100', () => {
    // Arrange
    const orderTotal = 150;
    const discountRate = 0.1;

    // Act
    const result = calculateDiscount(orderTotal, discountRate);

    // Assert
    expect(result).toBe(15);
  });
});
```

2. **One assertion per test** (or one logical assertion group):

```typescript
it('returns the created user with all fields', () => {
  const user = createUser({ name: 'Alice', email: 'alice@test.com' });

  expect(user).toMatchObject({
    name: 'Alice',
    email: 'alice@test.com',
  });
  expect(user.id).toBeDefined();
  expect(user.createdAt).toBeInstanceOf(Date);
});
```

3. **Use `describe` blocks** to group related tests:

```typescript
describe('UserService', () => {
  describe('create', () => {
    it('creates a user with valid input', () => {
      /* ... */
    });
    it('throws on duplicate email', () => {
      /* ... */
    });
    it('normalizes email to lowercase', () => {
      /* ... */
    });
  });

  describe('findById', () => {
    it('returns the user when found', () => {
      /* ... */
    });
    it('returns null when not found', () => {
      /* ... */
    });
  });
});
```

4. **Test edge cases explicitly:**

```typescript
describe('parseAge', () => {
  it('parses valid integer strings', () => {
    expect(parseAge('25')).toBe(25);
  });
  it('returns null for empty string', () => {
    expect(parseAge('')).toBeNull();
  });
  it('returns null for non-numeric input', () => {
    expect(parseAge('abc')).toBeNull();
  });
  it('returns null for negative numbers', () => {
    expect(parseAge('-5')).toBeNull();
  });
  it('returns null for floating point', () => {
    expect(parseAge('25.5')).toBeNull();
  });
  it('handles zero', () => {
    expect(parseAge('0')).toBe(0);
  });
});
```

5. **Test error cases with `toThrow`:**

```typescript
it('throws on invalid email', () => {
  expect(() => validateEmail('not-an-email')).toThrow('Invalid email');
});

it('throws specific error type', () => {
  expect(() => validateEmail('')).toThrow(ValidationError);
});
```

6. **Use `beforeEach`/`afterEach` for shared setup:**

```typescript
describe('CartService', () => {
  let cart: CartService;

  beforeEach(() => {
    cart = new CartService();
  });

  it('starts empty', () => {
    expect(cart.items).toHaveLength(0);
  });
  it('adds items', () => {
    cart.add({ id: '1', qty: 2 });
    expect(cart.items).toHaveLength(1);
  });
});
```

7. **Test async functions:**

```typescript
it('resolves with user data', async () => {
  const user = await getUser('123');
  expect(user.name).toBe('Alice');
});

it('rejects with not found error', async () => {
  await expect(getUser('nonexistent')).rejects.toThrow('User not found');
});
```

8. **Name tests as behavior specifications** — describe what the code does, not how it does it:

```typescript
// Good: describes behavior
it('applies free shipping for orders over $50', () => {
  /* ... */
});

// Bad: describes implementation
it('calls calculateShipping with zero', () => {
  /* ... */
});
```

## Details

Unit tests verify individual units of code (functions, classes, modules) in isolation from external dependencies. They should be fast (< 10ms each), deterministic, and independent of execution order.

**What makes a good unit test:**

- Tests one behavior per test case
- Does not depend on other tests or external state
- Fails for exactly one reason
- Is readable as a specification of the code's behavior

**Test file organization:** Place test files next to the source file (`user.ts` → `user.test.ts`) or in a parallel `__tests__` directory. Co-location makes it easy to find tests and keeps imports short.

**`expect` matcher selection:**

- `toBe` — strict equality (`===`). Use for primitives
- `toEqual` — deep equality. Use for objects and arrays
- `toMatchObject` — partial deep equality. Object under test may have extra properties
- `toContain` — array includes element or string includes substring
- `toHaveLength` — array or string length
- `toBeGreaterThan` / `toBeLessThan` — numeric comparisons
- `toThrow` — function throws. Wrap the call in an arrow function

**Trade-offs:**

- High unit test coverage gives fast feedback — but can over-test implementation details
- Isolated tests are fast — but may miss integration issues
- AAA structure is clear — but can feel verbose for simple one-liner tests
- `toMatchObject` is flexible — but can pass when extra unexpected properties exist

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
