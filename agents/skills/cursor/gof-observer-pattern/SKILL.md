# GOF Observer Pattern

> Implement push-based notification between Subject and Observer with typed subscriptions.

## When to Use

- An object (Subject) needs to notify multiple dependents when its state changes
- You want loose coupling between the event source and its handlers
- You're implementing event systems, reactive data bindings, or pub/sub within a process
- You need typed, named events with specific payloads

## Instructions

**Typed Subject with generic observer interface:**

```typescript
type Observer<T> = (event: T) => void | Promise<void>;

class Subject<T> {
  private observers = new Set<Observer<T>>();

  subscribe(observer: Observer<T>): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer); // unsubscribe function
  }

  async notify(event: T): Promise<void> {
    await Promise.all([...this.observers].map((obs) => obs(event)));
  }
}

// Typed usage
interface PriceChanged {
  ticker: string;
  oldPrice: number;
  newPrice: number;
  timestamp: Date;
}

class StockTicker {
  private priceSubject = new Subject<PriceChanged>();
  private prices = new Map<string, number>();

  onPriceChange(observer: Observer<PriceChanged>): () => void {
    return this.priceSubject.subscribe(observer);
  }

  async updatePrice(ticker: string, newPrice: number): Promise<void> {
    const oldPrice = this.prices.get(ticker) ?? newPrice;
    this.prices.set(ticker, newPrice);
    if (oldPrice !== newPrice) {
      await this.priceSubject.notify({ ticker, oldPrice, newPrice, timestamp: new Date() });
    }
  }
}

// Usage
const ticker = new StockTicker();

const unsubDashboard = ticker.onPriceChange(async ({ ticker: t, newPrice }) => {
  console.log(`Dashboard: ${t} is now $${newPrice}`);
});

ticker.onPriceChange(async ({ ticker: t, oldPrice, newPrice }) => {
  if (newPrice < oldPrice * 0.9) {
    console.log(`Alert: ${t} dropped more than 10%!`);
  }
});

await ticker.updatePrice('AAPL', 185.5);
await ticker.updatePrice('AAPL', 165.0); // triggers alert

unsubDashboard(); // unsubscribe when done
```

**Multi-event typed observer (event emitter pattern):**

```typescript
type EventMap = { [K: string]: unknown };

class TypedEventEmitter<Events extends EventMap> {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();

  on<K extends keyof Events & string>(event: K, handler: (payload: Events[K]) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler as (p: unknown) => void);
    return () => this.handlers.get(event)?.delete(handler as (p: unknown) => void);
  }

  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}

interface UserEvents {
  created: { id: string; email: string };
  deleted: { id: string };
  emailChanged: { id: string; oldEmail: string; newEmail: string };
}

class UserService extends TypedEventEmitter<UserEvents> {
  async createUser(email: string): Promise<string> {
    const id = crypto.randomUUID();
    // ... persist to db
    this.emit('created', { id, email });
    return id;
  }
}
```

**WeakRef for automatic cleanup (memory-safe subscriptions):**

```typescript
class WeakSubject<T> {
  private observers = new Set<WeakRef<Observer<T>>>();

  subscribe(observer: Observer<T>): void {
    this.observers.add(new WeakRef(observer));
  }

  notify(event: T): void {
    for (const ref of this.observers) {
      const observer = ref.deref();
      if (observer) {
        observer(event);
      } else {
        this.observers.delete(ref); // clean up dead references
      }
    }
  }
}
```

## Details

**Memory leaks from forgotten subscriptions:** The most common Observer bug in Node.js. Always:

1. Return an unsubscribe function from `subscribe()`
2. Call it in cleanup/teardown
3. Or use WeakRef so GC handles it

**Observer vs. Mediator:** Observer: subject notifies observers directly; subject knows it has observers. Mediator: components notify the mediator which routes to others; components don't know who else is listening. Use Observer for 1:N relationships. Use Mediator for N:M relationships.

**Synchronous vs. asynchronous notification:**

- Synchronous: simpler, predictable, but blocks until all observers complete
- Async: use `Promise.all()` for parallel execution, or `for...of await` for sequential

**Anti-patterns:**

- Observers that modify the subject during notification — can cause infinite loops or inconsistent state
- Forgetting to unsubscribe on component unmount/service teardown
- Subject notifying during construction — no observers have subscribed yet

**RxJS alternative:** For complex reactive chains (debounce, filter, combine), RxJS Observables are a more powerful implementation of the Observer pattern. Use plain Observer for simple cases; RxJS for complex composition.

## Source

refactoring.guru/design-patterns/observer

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
