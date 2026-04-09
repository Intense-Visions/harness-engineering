# JS Singleton Pattern

> Ensure a class has only one instance and provide a global access point

## When to Use

- You need exactly one shared instance across the entire application (e.g., a database connection, logger, or config object)
- Multiple parts of the codebase should access the same object without prop-drilling or passing references
- The instance is expensive to create and should be reused

## Instructions

1. Create a class with a private constructor and a static instance variable.
2. Add a static `getInstance()` method that returns the existing instance or creates one on first call.
3. Export only `getInstance()`, not the class itself.
4. In ESM modules, prefer a module-level variable over a class — a module is already a singleton by the loader.

```javascript
// Preferred ESM approach — module-level singleton
let instance;

class DatabaseConnection {
  constructor(url) {
    if (instance) return instance;
    this.url = url;
    this.connected = false;
    instance = this;
  }

  connect() {
    this.connected = true;
  }
}

export const getInstance = (url) => new DatabaseConnection(url);
```

5. Freeze the instance with `Object.freeze(instance)` if it should be immutable after creation.
6. Avoid singletons for anything that varies per request in server-side code.

## Details

The Singleton pattern is one of the most debated patterns in JavaScript. The classic implementation uses a class with a static instance, but ES modules provide a simpler alternative: any module-level variable is effectively a singleton because Node.js and browsers cache module exports after the first `import`.

**Trade-offs:**

- Singletons introduce global state, making code harder to test (you cannot easily create a fresh instance per test)
- Hidden dependencies — callers cannot know from the function signature that they depend on a singleton
- Mutable singletons are a source of subtle bugs in concurrent environments (avoid in server-side code handling multiple requests)

**When NOT to use:**

- When you need multiple instances with different configurations
- In unit tests — inject dependencies instead and pass a fresh instance per test
- When the "singleton" is stateless — a plain object literal or a set of pure functions is simpler

**Related patterns:**

- Module Pattern — a module-scoped variable achieves singleton semantics without a class
- Proxy Pattern — a Proxy can intercept access to a singleton to add logging or validation

## Source

https://patterns.dev/javascript/singleton-pattern

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
