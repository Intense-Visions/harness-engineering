# GOF Chain of Responsibility

> Pass requests along a handler chain with short-circuit and async chain support.

## When to Use

- Multiple objects might handle a request and the handler isn't known until runtime
- You want to decouple senders from receivers of a request
- You need a middleware-style pipeline (e.g., HTTP middleware, validation pipeline, event handling)
- Handlers should be composable and reorderable without changing callers

## Instructions

**Linked handler chain:**

```typescript
interface Handler<T> {
  setNext(handler: Handler<T>): Handler<T>;
  handle(request: T): T | null;
}

abstract class AbstractHandler<T> implements Handler<T> {
  private nextHandler: Handler<T> | null = null;

  setNext(handler: Handler<T>): Handler<T> {
    this.nextHandler = handler;
    return handler; // enables chaining: a.setNext(b).setNext(c)
  }

  handle(request: T): T | null {
    if (this.nextHandler) return this.nextHandler.handle(request);
    return null;
  }
}

// Concrete handlers
interface SupportTicket {
  level: 'basic' | 'advanced' | 'expert';
  description: string;
}

class BasicSupportHandler extends AbstractHandler<SupportTicket> {
  handle(ticket: SupportTicket): SupportTicket | null {
    if (ticket.level === 'basic') {
      console.log(`BasicSupport handling: ${ticket.description}`);
      return ticket;
    }
    return super.handle(ticket); // pass to next
  }
}

class AdvancedSupportHandler extends AbstractHandler<SupportTicket> {
  handle(ticket: SupportTicket): SupportTicket | null {
    if (ticket.level === 'advanced') {
      console.log(`AdvancedSupport handling: ${ticket.description}`);
      return ticket;
    }
    return super.handle(ticket);
  }
}

class ExpertSupportHandler extends AbstractHandler<SupportTicket> {
  handle(ticket: SupportTicket): SupportTicket | null {
    console.log(`ExpertSupport handling: ${ticket.description}`);
    return ticket; // always handles — final in chain
  }
}

// Build the chain
const basic = new BasicSupportHandler();
const advanced = new AdvancedSupportHandler();
const expert = new ExpertSupportHandler();

basic.setNext(advanced).setNext(expert);

// Route tickets
basic.handle({ level: 'advanced', description: 'DB crash' });
// → AdvancedSupport handling: DB crash
```

**Async middleware chain (Express-style):**

```typescript
type Middleware<T> = (ctx: T, next: () => Promise<void>) => Promise<void>;

class Pipeline<T> {
  private middlewares: Middleware<T>[] = [];

  use(middleware: Middleware<T>): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(ctx: T): Promise<void> {
    const run = async (index: number): Promise<void> => {
      if (index >= this.middlewares.length) return;
      await this.middlewares[index](ctx, () => run(index + 1));
    };
    await run(0);
  }
}

// Usage
interface RequestContext {
  userId?: string;
  body: unknown;
  response?: unknown;
  errors: string[];
}

const pipeline = new Pipeline<RequestContext>()
  .use(async (ctx, next) => {
    // Auth middleware
    ctx.userId = 'user-123'; // decode JWT in reality
    if (!ctx.userId) {
      ctx.errors.push('Unauthorized');
      return;
    } // short-circuit
    await next();
  })
  .use(async (ctx, next) => {
    // Validation middleware
    if (!ctx.body) {
      ctx.errors.push('Body required');
      return;
    } // short-circuit
    await next();
  })
  .use(async (ctx, next) => {
    // Handler middleware
    ctx.response = { message: 'OK', userId: ctx.userId };
    await next();
  })
  .use(async (ctx, _next) => {
    // Logging middleware — always runs
    console.log(`Request by ${ctx.userId}, errors: ${ctx.errors.length}`);
  });

const ctx: RequestContext = { body: { name: 'test' }, errors: [] };
await pipeline.execute(ctx);
```

## Details

**Short-circuiting:** Handlers can stop the chain by not calling `next()` or returning without calling `super.handle()`. This is the key advantage over Decorator — the chain can terminate early based on conditions.

**Difference from Decorator:** Decorator always delegates to the wrapped object. Chain of Responsibility can stop delegation. If all handlers must run, use Decorator. If any handler might absorb the request, use Chain.

**Anti-patterns:**

- Chains so long that debugging a missed request is painful — log which handler received and passed/rejected each request
- Mutating the request object across handlers in unexpected ways — define a clear contract for what handlers may modify
- Hardcoded chain construction — prefer a factory or builder that assembles the chain from config

**Request logging for debuggability:**

```typescript
abstract class LoggingHandler<T> extends AbstractHandler<T> {
  private readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  handle(request: T): T | null {
    console.log(`[${this.name}] Received request`);
    const result = this.handleRequest(request);
    if (result !== null) {
      console.log(`[${this.name}] Handled request`);
      return result;
    }
    console.log(`[${this.name}] Passing to next`);
    return super.handle(request);
  }

  protected abstract handleRequest(request: T): T | null;
}
```

## Source

refactoring.guru/design-patterns/chain-of-responsibility

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
