# JS Prototype Pattern

> Share properties and methods across instances via the prototype chain

## When to Use

- You have many instances that should share methods without duplicating them in memory
- You need to extend built-in types or add methods to third-party objects
- You want lightweight objects where method storage is shared, not per-instance

## Instructions

1. Define shared methods on the constructor's `.prototype` object — not inside the constructor function.
2. Instance data (unique per instance) goes on `this` inside the constructor.
3. Use `Object.create(proto)` for explicit prototype assignment without a constructor.
4. Avoid modifying built-in prototypes (Array, String, Object) — it causes library conflicts.

```javascript
function Dog(name) {
  this.name = name;
}

Dog.prototype.bark = function () {
  return `${this.name} says woof!`;
};

const d1 = new Dog('Rex');
const d2 = new Dog('Spot');

// Both share the same bark function in memory
console.log(d1.bark === d2.bark); // true
```

5. Prefer ES6 `class` syntax — it uses the prototype chain under the hood but is more readable.
6. Use `hasOwnProperty()` or `Object.hasOwn()` to distinguish own vs inherited properties.

## Details

Every JavaScript object has an internal `[[Prototype]]` link. When you access a property, the engine walks the chain: own properties first, then the prototype, then the prototype's prototype, until `null`. This is the prototype chain.

**Trade-offs:**

- Shared mutable properties on the prototype are dangerous — if one instance mutates a shared array/object, all instances see the change
- The prototype chain adds one lookup level per tier — negligible for most code, but avoid very deep chains
- `class` syntax is clearer than manual `.prototype` manipulation

**When NOT to use:**

- When instances need truly private state — use closures or ES2022 private class fields (`#field`) instead
- When you need multiple inheritance — JS has single prototype chain; use mixins instead

## Source

https://patterns.dev/javascript/prototype-pattern

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
