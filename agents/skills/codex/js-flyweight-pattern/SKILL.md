# JS Flyweight Pattern

> Share common state across many fine-grained objects to reduce memory usage

## When to Use

- You have a very large number of similar objects (thousands+) and memory usage is a concern
- Objects share most of their state (intrinsic) and only differ in a small extrinsic portion
- Creating new objects per item is prohibitively expensive

## Instructions

1. Separate **intrinsic state** (shared, immutable) from **extrinsic state** (unique per instance).
2. Store intrinsic state in a factory/cache indexed by a key.
3. Pass extrinsic state as parameters to methods rather than storing it on the flyweight.
4. Use a `FlyweightFactory` with a `Map` to return cached instances.

```javascript
class BookFlyweight {
  constructor(title, author) {
    this.title = title; // intrinsic — shared
    this.author = author; // intrinsic — shared
  }
}

class BookFactory {
  constructor() {
    this._books = new Map();
  }

  getBook(title, author) {
    const key = `${title}-${author}`;
    if (!this._books.has(key)) {
      this._books.set(key, new BookFlyweight(title, author));
    }
    return this._books.get(key);
  }
}

const factory = new BookFactory();
const b1 = factory.getBook('JS Patterns', 'Stoyan');
const b2 = factory.getBook('JS Patterns', 'Stoyan');
console.log(b1 === b2); // true — same instance
```

## Details

The Flyweight pattern is a structural memory optimization. It trades CPU time (factory lookup) for memory savings by sharing object instances. JavaScript's garbage collector normally handles short-lived objects efficiently, so Flyweight is only necessary at extreme scale.

**Trade-offs:**

- Increases code complexity — factory and separation of state
- Thread-safety concerns in worker-based environments if the cache is mutated
- Only beneficial when the number of objects is very large (thousands to millions)

**When NOT to use:**

- For typical web UI objects — the browser's memory management handles them fine
- When objects differ significantly from each other — flyweight savings are minimal

## Source

https://patterns.dev/javascript/flyweight-pattern

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
