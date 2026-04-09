# JS Constructor Pattern

> Use constructor functions or ES6 classes to create and initialize objects

## When to Use

- You need to create multiple instances of the same type with shared methods
- Object initialization has meaningful logic (validation, default values, derived properties)
- You want to use `instanceof` for type checking

## Instructions

1. Use ES6 `class` syntax over function constructors for readability.
2. Put per-instance data in the constructor (`this.x = ...`).
3. Put shared methods on the class body (they go on the prototype automatically).
4. Use private class fields (`#field`) for data that should not be accessible externally.

```javascript
class Rectangle {
  #area = null;

  constructor(width, height) {
    if (width <= 0 || height <= 0) throw new RangeError('Dimensions must be positive');
    this.width = width;
    this.height = height;
  }

  getArea() {
    if (this.#area === null) {
      this.#area = this.width * this.height; // memoize
    }
    return this.#area;
  }

  toString() {
    return `Rectangle(${this.width}x${this.height})`;
  }
}

const r = new Rectangle(4, 5);
console.log(r.getArea()); // 20
console.log(r instanceof Rectangle); // true
```

## Details

The Constructor pattern is the foundation of object-oriented JavaScript. ES6 classes are syntactic sugar over prototype-based inheritance — `class` bodies define methods on `ClassName.prototype`, exactly like the older `function Constructor() {}` approach.

**Trade-offs:**

- Classes encourage mutation via `this` — prefer immutable value objects for data
- `this` binding issues arise when class methods are passed as callbacks — use arrow functions or `.bind()`
- Private fields (`#field`) are not accessible in subclasses without getters

**When NOT to use:**

- For simple data bags with no behavior — plain object literals are lighter
- When functional composition (factory functions + closures) better fits the architecture

## Source

https://patterns.dev/javascript/constructor-pattern

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
