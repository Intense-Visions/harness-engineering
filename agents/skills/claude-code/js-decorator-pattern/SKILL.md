# JS Decorator Pattern

> Extend object behavior dynamically without modifying its source

## When to Use

- You need to add responsibilities to objects at runtime without subclassing
- You want to compose behaviors (logging, caching, auth checks) around existing functions
- Building higher-order functions that wrap existing logic with cross-cutting concerns

## Instructions

1. Write a decorator function that accepts a target function or object and returns an enhanced version.
2. For class decorators (TC39 Stage 3): prefix the class or method declaration with `@decorator`.
3. For functional decorators: wrap the original function — `const enhanced = decorate(original)`.
4. The decorator should not modify the original — it returns a new function/object.

```javascript
// Functional decorator — adds logging
function withLogging(fn) {
  return function (...args) {
    console.log(`Calling ${fn.name} with`, args);
    const result = fn.apply(this, args);
    console.log(`${fn.name} returned`, result);
    return result;
  };
}

function add(a, b) {
  return a + b;
}
const loggedAdd = withLogging(add);
loggedAdd(2, 3); // logs call and return
```

5. Stack decorators by composing them: `const fn = withAuth(withLogging(handler))`.
6. Preserve the original function's `name` and `length` with `Object.defineProperty` if needed.

## Details

The Decorator pattern adds behavior to individual objects without affecting other objects of the same class. In JavaScript, this is most naturally expressed as higher-order functions — functions that take a function and return a new function with added behavior.

**Trade-offs:**

- Stacking many decorators makes stack traces deeper and harder to debug
- Decorated functions lose the original's `.name` and `.length` unless explicitly preserved
- Order of decoration matters — `withAuth(withLogging(fn))` logs before auth checks

**When NOT to use:**

- When the added behavior is always needed — just include it in the function directly
- When a simple wrapper function is sufficient — do not over-engineer with a formal decorator abstraction
- For complex object augmentation — consider mixins or composition instead

## Source

https://patterns.dev/javascript/decorator-pattern

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
