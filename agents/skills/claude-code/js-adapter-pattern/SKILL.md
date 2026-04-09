# JS Adapter Pattern

> Convert the interface of a class into another interface that clients expect

## When to Use

- You need to integrate a third-party library or legacy API whose interface does not match your codebase
- Migrating between API versions where method signatures have changed
- Normalizing data from different sources into a uniform shape

## Instructions

1. Identify the incompatible interface — e.g., a legacy API returning XML when your code expects JSON.
2. Create an adapter class or function that wraps the incompatible object.
3. The adapter translates calls from the expected interface to the wrapped object's interface.
4. The client code interacts only with the adapter, never with the adapted object directly.

```javascript
// Legacy API returns { firstName, lastName }
class LegacyUser {
  constructor(data) {
    this.firstName = data.firstName;
    this.lastName = data.lastName;
  }
}

// Modern code expects { name, email }
class UserAdapter {
  constructor(legacyUser) {
    this.legacyUser = legacyUser;
  }
  get name() {
    return `${this.legacyUser.firstName} ${this.legacyUser.lastName}`;
  }
  get email() {
    return '';
  } // field not available in legacy
}
```

5. For functional adapters, write a transform function: `const adapt = (legacy) => ({ name: legacy.firstName + ' ' + legacy.lastName })`.

## Details

The Adapter pattern (also called Wrapper) lets classes with incompatible interfaces work together. In JavaScript, this often takes the form of a thin translation layer between an external API and your internal types.

**Trade-offs:**

- Adds an indirection layer — one more thing to maintain and debug
- If the adapted interface changes, the adapter must be updated
- Can mask underlying complexity — callers may not realize they are using a legacy system

**When NOT to use:**

- When the interfaces are already compatible — do not add an adapter for consistency's sake
- When a simple data mapping function would suffice — a full adapter class may be overkill
- When you control both interfaces and can change one to match the other

## Source

https://patterns.dev/javascript/adapter-pattern

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
