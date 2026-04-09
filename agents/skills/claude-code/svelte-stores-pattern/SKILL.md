# Svelte Stores Pattern

> Share reactive state across any component tree using writable, readable, and derived stores with the Svelte store contract

## When to Use

- You need shared state accessible across unrelated components without prop-drilling
- You are in a Svelte 4 codebase or a Svelte 5 project that intentionally uses stores
- You need a readable store driven by an external source (WebSocket, EventSource, timer)
- You are building a custom store with encapsulated update logic

## Instructions

**writable — mutable shared state:**

1. Create a writable store with an initial value. Export it for use in any component:

```typescript
// stores/counter.ts
import { writable } from 'svelte/store';

export const count = writable(0);

// Helper methods (optional, common pattern)
export function increment() {
  count.update((n) => n + 1);
}
export function reset() {
  count.set(0);
}
```

2. Subscribe in components using the `$` auto-subscription prefix — no manual subscribe/unsubscribe needed:

```svelte
<script>
  import { count, increment } from '$lib/stores/counter'
</script>

<p>Count: {$count}</p>
<button onclick={increment}>+</button>
```

3. Two-way bind to a writable store:

```svelte
<input bind:value={$myStore} />
```

**readable — external data sources:**

4. Use `readable` for stores driven by external events. The start function runs when the first subscriber attaches; the returned stop function runs when the last subscriber detaches:

```typescript
import { readable } from 'svelte/store';

export const time = readable(new Date(), (set) => {
  const interval = setInterval(() => set(new Date()), 1000);
  return () => clearInterval(interval);
});
```

**derived — computed from other stores:**

5. Derive a store from one or more sources:

```typescript
import { derived } from 'svelte/store';
import { count } from './counter';

export const doubled = derived(count, ($count) => $count * 2);

// Multiple sources:
export const summary = derived([firstName, lastName], ([$first, $last]) => `${$first} ${$last}`);
```

6. Derived stores with async values — return a stop function and call `set` when ready:

```typescript
export const userData = derived(
  userId,
  ($id, set) => {
    fetchUser($id).then(set);
    return () => {}; // cleanup if needed
  },
  null
); // initial value while loading
```

**Custom stores — encapsulated logic:**

7. Implement the store contract (`{ subscribe, set?, update? }`) to create stores with domain-specific APIs:

```typescript
// stores/cart.ts
import { writable } from 'svelte/store';

function createCart() {
  const { subscribe, update, set } = writable<CartItem[]>([]);

  return {
    subscribe,
    addItem(item: CartItem) {
      update((items) => [...items, item]);
    },
    removeItem(id: string) {
      update((items) => items.filter((i) => i.id !== id));
    },
    clear() {
      set([]);
    },
  };
}

export const cart = createCart();
```

**Reading store values outside components:**

8. Use `get` from `svelte/store` to read a store's value synchronously without subscribing:

```typescript
import { get } from 'svelte/store';
import { count } from './counter';

const current = get(count); // one-time read, no subscription
```

## Details

**Store contract:**

Any object with a `subscribe` method that follows Svelte's store contract is auto-subscribable with `$`. The contract:

1. `subscribe(fn)` — calls `fn` immediately with current value, then on every change
2. Returns an `unsubscribe` function
3. Optionally has `set` and `update` methods

This means you can make any reactive primitive a "store" — including RxJS Observables (with an adapter).

**Svelte 4 vs. Svelte 5:**

In Svelte 5, runes (`$state`, `$derived`) are the preferred reactivity model. Stores still work and are useful for cross-component shared state, but `.svelte.ts` files with rune-based reactive classes are the emerging pattern:

```typescript
// Svelte 5 equivalent of a writable store
class Counter {
  count = $state(0);
  increment() {
    this.count++;
  }
}
export const counter = new Counter();
```

**SSR and stores:**

In SvelteKit SSR, module-level stores are shared between all requests on the server — this causes data leakage between users. Use the context API or load functions to pass per-request state instead of module-level stores for user-specific data.

**When to use stores vs. context:**

- **Stores** — global singletons, app-wide state (theme, auth token, cart)
- **Context** — subtree-scoped state, per-instance isolation (form state, modal state)

**Debugging stores:**

Subscribe in the browser console: `import { cart } from './stores/cart'; cart.subscribe(console.log)`.

## Source

https://svelte.dev/docs/svelte/stores

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
