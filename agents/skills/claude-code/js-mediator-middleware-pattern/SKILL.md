# JS Mediator / Middleware Pattern

> Route component interactions through a central mediator to reduce direct coupling

## When to Use

- Multiple components need to communicate without knowing about each other
- You want to add cross-cutting concerns (logging, auth, validation) to a request pipeline
- Implementing middleware chains (Express-style `next()` pipelines)

## Instructions

1. **Mediator:** Create a central object that components register with. Components send messages to the mediator, not to each other.
2. **Middleware:** Define a chain of functions that each receive `(req, res, next)` (or equivalent) and call `next()` to pass control.
3. Keep the mediator/middleware functions pure — no shared mutable state between middleware steps.
4. Provide a way to skip remaining middleware (`next('skip')` or returning early).

```javascript
// Middleware pipeline
class Pipeline {
  constructor() {
    this.middlewares = [];
  }

  use(fn) {
    this.middlewares.push(fn);
    return this;
  }

  execute(context) {
    let index = 0;
    const next = () => {
      const fn = this.middlewares[index++];
      if (fn) fn(context, next);
    };
    next();
  }
}

const pipeline = new Pipeline();
pipeline
  .use((ctx, next) => {
    ctx.log = [];
    next();
  })
  .use((ctx, next) => {
    ctx.log.push('step1');
    next();
  })
  .use((ctx) => {
    ctx.log.push('step2');
  });

const ctx = {};
pipeline.execute(ctx);
console.log(ctx.log); // ['step1', 'step2']
```

## Details

The Mediator pattern (GoF) centralizes communication. The Middleware pattern (popularized by Express.js) is a sequential pipeline variant. Both reduce point-to-point coupling by routing interactions through a shared hub or chain.

**Trade-offs:**

- The mediator becomes a bottleneck and a single point of failure if overloaded
- Middleware chains are hard to debug — add logging middleware during development
- Order of middleware registration matters and can cause subtle bugs

**When NOT to use:**

- For simple two-component communication — a direct callback or event is simpler
- When the pipeline steps need full knowledge of each other — mediator will not help

## Source

https://patterns.dev/javascript/mediator-middleware-pattern

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
