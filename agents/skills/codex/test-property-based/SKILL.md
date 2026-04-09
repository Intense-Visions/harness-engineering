# Test Property-Based

> Generate exhaustive test cases automatically using fast-check property-based testing

## When to Use

- Testing functions where the set of valid inputs is large or complex
- Verifying mathematical properties (commutativity, associativity, idempotence)
- Finding edge cases that hand-written examples miss
- Testing serialization/deserialization roundtrips

## Instructions

1. **Install fast-check:**

```bash
npm install -D fast-check
```

2. **Basic property test:**

```typescript
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

describe('sort', () => {
  it('produces output with same length as input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        expect(arr.sort()).toHaveLength(arr.length);
      })
    );
  });

  it('produces sorted output', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = [...arr].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i - 1]);
        }
      })
    );
  });
});
```

3. **Common arbitraries** (data generators):

```typescript
fc.string(); // random strings
fc.integer({ min: 0, max: 100 }); // bounded integers
fc.float({ noNaN: true }); // floats without NaN
fc.boolean(); // true/false
fc.date(); // Date objects
fc.uuid(); // UUID strings
fc.emailAddress(); // valid email addresses
fc.array(fc.integer()); // arrays of integers
fc.record({ name: fc.string(), age: fc.integer({ min: 0 }) }); // objects
fc.oneof(fc.string(), fc.integer()); // union of types
```

4. **Test roundtrip properties** (encode/decode, serialize/deserialize):

```typescript
it('JSON roundtrip preserves data', () => {
  fc.assert(
    fc.property(fc.record({ name: fc.string(), age: fc.integer() }), (obj) => {
      expect(JSON.parse(JSON.stringify(obj))).toEqual(obj);
    })
  );
});
```

5. **Test idempotence:**

```typescript
it('normalizing email is idempotent', () => {
  fc.assert(
    fc.property(fc.emailAddress(), (email) => {
      const once = normalizeEmail(email);
      const twice = normalizeEmail(once);
      expect(once).toBe(twice);
    })
  );
});
```

6. **Custom arbitraries** for domain types:

```typescript
const userArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  email: fc.emailAddress(),
  age: fc.integer({ min: 0, max: 150 }),
});

it('validates all valid users', () => {
  fc.assert(
    fc.property(userArbitrary, (user) => {
      expect(validateUser(user).ok).toBe(true);
    })
  );
});
```

7. **Shrinking** — when a test fails, fast-check automatically finds the smallest failing input:

```typescript
// If sort fails on [3, 1, -5, 7, 2], fast-check shrinks to
// the minimal failing case, e.g., [1, -1]
```

8. **Configure test parameters:**

```typescript
fc.assert(
  fc.property(fc.string(), (s) => {
    /* ... */
  }),
  {
    numRuns: 1000, // Number of random inputs (default: 100)
    seed: 42, // Deterministic seed for reproducibility
    verbose: true, // Log generated values
    endOnFailure: true, // Stop at first failure
  }
);
```

## Details

Property-based testing inverts the traditional testing model: instead of specifying inputs and expected outputs, you specify properties that must hold for ALL inputs. The framework generates random inputs and checks the property, then shrinks failing cases to minimal counterexamples.

**What makes a good property:**

- **Roundtrip** — `decode(encode(x)) === x`
- **Idempotence** — `f(f(x)) === f(x)`
- **Invariant** — `sorted(x).length === x.length`
- **Oracle** — compare output against a simple but slow reference implementation
- **Negation** — `isValid(invalidInput) === false` using generated invalid inputs

**Shrinking:** When fast-check finds a failing input, it tries smaller variants to find the minimal counterexample. This is invaluable for debugging — instead of "fails on a 500-element array," you get "fails on [0, -1]."

**Integration with Vitest:** fast-check works as a library called inside `it()` blocks. No special test runner integration needed. The `fc.assert()` call throws on failure, which Vitest catches.

**Trade-offs:**

- Property tests find edge cases humans miss — but properties can be hard to formulate
- 100+ random runs per property catch more bugs — but run slower than example-based tests
- Shrinking produces minimal counterexamples — but shrinking can be slow for complex data structures
- Deterministic seeds enable reproducibility — but random runs are more valuable for catching new bugs

## Source

https://fast-check.dev/docs/

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
