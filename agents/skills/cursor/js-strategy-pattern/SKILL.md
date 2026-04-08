# JS Strategy Pattern

> Define a family of algorithms and make them interchangeable without altering the client

## When to Use

- You have multiple algorithms for the same task and need to switch between them at runtime
- You want to avoid large if/else or switch blocks that select behavior based on a type
- The algorithm should be selected by configuration, user preference, or runtime conditions

## Instructions

1. Define a strategy interface — each strategy is a function or object with a common method signature.
2. The context accepts a strategy and delegates the varying behavior to it.
3. Swap strategies at runtime by passing a different function/object.
4. Prefer plain functions as strategies in JavaScript — no need for class hierarchies.

```javascript
// Strategies as plain functions
const strategies = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
};

function calculate(strategy, a, b) {
  if (!strategies[strategy]) throw new Error(`Unknown strategy: ${strategy}`);
  return strategies[strategy](a, b);
}

calculate('add', 5, 3); // 8
calculate('multiply', 5, 3); // 15
```

5. Store strategies in a Map or object for O(1) lookup.

## Details

The Strategy pattern separates the "what" from the "how." The context knows what operation to perform but delegates the implementation to an interchangeable strategy. In JavaScript, first-class functions make this pattern lightweight — a strategy is just a function.

**Trade-offs:**

- Clients must know about available strategies to select one
- Adding a new strategy is easy (open/closed principle), but changing the strategy interface affects all implementations
- For trivial cases, a direct function call is simpler than the strategy indirection

**When NOT to use:**

- When there is only one algorithm that will never change
- When the algorithm selection is known at build time — just import the right function
- For very simple branching — an if/else is clearer than a strategy registry

## Source

https://patterns.dev/javascript/strategy-pattern
