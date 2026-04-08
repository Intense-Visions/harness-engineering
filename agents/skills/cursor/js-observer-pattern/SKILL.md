# JS Observer Pattern

> Notify subscribers automatically when an observable object's state changes

## When to Use

- Multiple parts of the app need to react to the same event without coupling the emitter to its consumers
- Implementing event systems, reactive UI updates, or real-time data feeds
- Decoupling data sources from their consumers

## Instructions

1. Create an observable with an `observers` array and `subscribe` / `unsubscribe` / `notify` methods.
2. Call `notify(data)` whenever the observable's state changes — it invokes all subscribed callbacks.
3. Always provide `unsubscribe` — failing to unsubscribe causes memory leaks in long-lived apps.
4. In browser environments, prefer native `EventTarget` or `EventEmitter` (Node.js) over hand-rolled implementations.

```javascript
class Observable {
  constructor() {
    this.observers = [];
  }

  subscribe(fn) {
    this.observers.push(fn);
    return () => this.unsubscribe(fn); // return cleanup function
  }

  unsubscribe(fn) {
    this.observers = this.observers.filter((obs) => obs !== fn);
  }

  notify(data) {
    this.observers.forEach((fn) => fn(data));
  }
}

const store = new Observable();
const cleanup = store.subscribe((data) => console.log('Received:', data));
store.notify({ type: 'UPDATE', payload: 42 });
cleanup(); // unsubscribe
```

5. Return a cleanup/unsubscribe function from `subscribe` — consumers call it to remove the handler.

## Details

The Observer pattern (also called pub/sub) separates the emitter (subject/observable) from its consumers (observers/subscribers). This decoupling is fundamental to event-driven architectures, reactive state systems, and streams.

**Trade-offs:**

- If observers are not unsubscribed, the observable holds references to them — memory leak risk in SPAs
- Cascade updates — one observable notifying many observers can cause complex update chains that are hard to trace
- No guaranteed delivery order unless explicitly enforced
- Debugging is harder than direct calls — add logging in `notify()` during development

**When NOT to use:**

- When only one consumer exists — a direct callback is simpler
- When the update sequence matters and subscribers need to be ordered — use a queue or middleware chain instead
- For synchronous, predictable data flow — use signals or reducers

## Source

https://patterns.dev/javascript/observer-pattern
