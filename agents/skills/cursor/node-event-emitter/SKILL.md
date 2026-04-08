# Node.js EventEmitter

> Use Node.js EventEmitter for typed pub-sub communication with memory leak prevention

## When to Use

- Implementing decoupled communication between modules
- Building plugin systems or extensible architectures
- Replacing callback chains with event-driven patterns
- Creating typed event systems in TypeScript applications

## Instructions

1. **Basic EventEmitter usage:**

```typescript
import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();

emitter.on('user:created', (user: { id: string; name: string }) => {
  console.log(`User created: ${user.name}`);
});

emitter.emit('user:created', { id: '1', name: 'Alice' });
```

2. **Typed EventEmitter** in TypeScript:

```typescript
import { EventEmitter } from 'node:events';

interface AppEvents {
  'user:created': [user: { id: string; name: string }];
  'user:deleted': [userId: string];
  error: [error: Error];
}

class AppEmitter extends EventEmitter<AppEvents> {}

const emitter = new AppEmitter();

emitter.on('user:created', (user) => {
  // user is typed as { id: string; name: string }
  console.log(user.name);
});
```

3. **One-time listeners** with `once`:

```typescript
emitter.once('ready', () => {
  console.log('System initialized');
});
```

4. **Remove listeners** to prevent memory leaks:

```typescript
const handler = (data: string) => console.log(data);
emitter.on('data', handler);

// Later: remove the specific listener
emitter.off('data', handler);

// Or remove all listeners for an event
emitter.removeAllListeners('data');
```

5. **Set max listeners** to catch leaks early:

```typescript
emitter.setMaxListeners(20); // Default is 10

// Or globally
EventEmitter.defaultMaxListeners = 20;
```

6. **Async event handling** with `once` as a Promise:

```typescript
import { once } from 'node:events';

const [data] = await once(emitter, 'data');
console.log(data);
```

7. **Error handling** — always listen for `'error'` events:

```typescript
emitter.on('error', (err) => {
  console.error('Emitter error:', err);
});

// Without an error listener, emitting 'error' throws and crashes the process
```

8. **AbortController for cleanup:**

```typescript
const ac = new AbortController();

emitter.on('data', handler, { signal: ac.signal });

// Automatically removes the listener
ac.abort();
```

## Details

EventEmitter is Node.js's built-in pub-sub mechanism. It is synchronous by default — `emit()` calls listeners in registration order and blocks until all complete.

**Synchronous emission:** `emitter.emit('event', data)` runs all listeners synchronously in the current tick. Long-running listeners block the event loop. Use `setImmediate` or `queueMicrotask` inside listeners for async work.

**Memory leak warning:** If more than `maxListeners` are registered for a single event, Node.js prints a warning. This usually indicates listeners being added in a loop without removal.

**Event ordering:** Listeners fire in registration order. `prependListener` adds to the front of the queue.

**Trade-offs:**

- EventEmitter is built-in and zero-dependency — but is synchronous by default
- Typed events in TypeScript catch event name typos — but require maintaining a type map
- Decoupled communication is flexible — but makes control flow harder to trace
- `once` as Promise is convenient — but only captures the first emission

## Source

https://nodejs.org/api/events.html
