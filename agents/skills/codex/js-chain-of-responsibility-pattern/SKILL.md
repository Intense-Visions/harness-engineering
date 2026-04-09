# JS Chain of Responsibility Pattern

> Pass a request along a chain of handlers until one handles it

## When to Use

- Multiple handlers might process a request, but you do not know which one at compile time
- You want to decouple the sender from the receiver of a request
- Building validation chains, auth pipelines, or event bubbling systems

## Instructions

1. Define a handler interface with a `handle(request)` method and a `setNext(handler)` reference.
2. Each handler decides to process the request or pass it to the next handler in the chain.
3. Build the chain by linking handlers: `h1.setNext(h2).setNext(h3)`.
4. The client sends the request to the first handler — it does not know which handler will process it.

```javascript
class Handler {
  setNext(handler) {
    this.next = handler;
    return handler;
  }
  handle(request) {
    if (this.next) return this.next.handle(request);
    return null;
  }
}

class AuthHandler extends Handler {
  handle(req) {
    if (!req.token) return { error: 'Unauthorized' };
    return super.handle(req);
  }
}

class RateLimitHandler extends Handler {
  handle(req) {
    if (req.rateLimited) return { error: 'Too many requests' };
    return super.handle(req);
  }
}
```

5. Return a result from the handler that processes the request, or a default/null if no handler matches.

## Details

The Chain of Responsibility pattern decouples senders from receivers by giving multiple objects a chance to handle a request. The request travels along the chain until a handler processes it or it reaches the end. Express.js middleware is a functional variant of this pattern.

**Trade-offs:**

- No guarantee that any handler will process the request — you need a fallback
- Debugging can be difficult — the request passes through multiple handlers invisibly
- Long chains add latency and make the flow harder to trace

**When NOT to use:**

- When there is always exactly one handler — route directly to it
- When all handlers must process the request (not just the first match) — use Observer pattern instead
- For simple conditional logic — an if/else is more explicit

## Source

https://patterns.dev/javascript/chain-of-responsibility-pattern

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
