# Jotai Atoms

> Build bottom-up atomic state with Jotai for granular, composable React state management

## When to Use

- Managing state that is naturally composed of small independent pieces (form fields, toggles, filters)
- Needing derived/computed state that automatically updates when dependencies change (like Recoil selectors)
- Wanting React Context-like convenience without re-render performance problems
- Building components that each need a small piece of global state without subscribing to everything

## Instructions

1. Create primitive atoms with `atom(initialValue)`. These are the smallest units of state.
2. Create derived (read-only) atoms with `atom((get) => computation)`. They auto-update when dependencies change.
3. Create writable derived atoms with `atom(readFn, writeFn)` for computed state with custom setters.
4. Use `useAtom` in components — it returns `[value, setValue]` like `useState`.
5. Use `useAtomValue` for read-only access and `useSetAtom` for write-only access to minimize subscriptions.
6. Group related atoms in a file per domain (`atoms/auth.ts`, `atoms/cart.ts`).
7. No Provider needed for basic usage — Jotai uses a default store. Add `<Provider>` only for scoped state or testing.

```typescript
// atoms/cart.ts
import { atom } from 'jotai';

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

// Primitive atoms
export const cartItemsAtom = atom<CartItem[]>([]);
export const couponCodeAtom = atom<string | null>(null);

// Derived atom (read-only) — auto-updates when cartItemsAtom changes
export const cartTotalAtom = atom((get) => {
  const items = get(cartItemsAtom);
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
});

export const cartCountAtom = atom((get) => {
  return get(cartItemsAtom).reduce((sum, item) => sum + item.qty, 0);
});

// Derived atom with discount applied
export const discountedTotalAtom = atom((get) => {
  const total = get(cartTotalAtom);
  const coupon = get(couponCodeAtom);
  return coupon ? total * 0.9 : total;
});

// Writable derived atom — custom setter
export const addToCartAtom = atom(
  null, // read value (null = write-only)
  (get, set, newItem: Omit<CartItem, 'qty'>) => {
    const items = get(cartItemsAtom);
    const existing = items.find((i) => i.id === newItem.id);
    if (existing) {
      set(
        cartItemsAtom,
        items.map((i) => (i.id === newItem.id ? { ...i, qty: i.qty + 1 } : i))
      );
    } else {
      set(cartItemsAtom, [...items, { ...newItem, qty: 1 }]);
    }
  }
);
```

```typescript
// Component usage
import { useAtomValue, useSetAtom } from 'jotai';

function CartSummary() {
  const total = useAtomValue(discountedTotalAtom); // Read-only, re-renders only when total changes
  const count = useAtomValue(cartCountAtom);
  return <div>{count} items - ${total.toFixed(2)}</div>;
}

function AddButton({ product }: { product: { id: string; name: string; price: number } }) {
  const addToCart = useSetAtom(addToCartAtom); // Write-only, never re-renders from this atom
  return <button onClick={() => addToCart(product)}>Add to Cart</button>;
}
```

## Details

**Atom dependency graph:** Derived atoms automatically track which atoms they read via `get()`. When any dependency changes, the derived atom recomputes. This is reactive — no manual subscription management.

**Async atoms:** Atoms can return promises. Jotai integrates with React Suspense:

```typescript
const userAtom = atom(async () => {
  const res = await fetch('/api/user');
  return res.json();
});

// Component suspends until data loads
function User() {
  const user = useAtomValue(userAtom); // Suspends, then returns data
  return <div>{user.name}</div>;
}
```

**atomWithStorage:** Persist atoms to localStorage:

```typescript
import { atomWithStorage } from 'jotai/utils';

const themeAtom = atomWithStorage('theme', 'light');
// Automatically reads from and writes to localStorage
```

**Jotai vs Zustand:** Jotai is bottom-up (compose small atoms into larger state). Zustand is top-down (define a store, select slices). Choose Jotai when state is naturally fragmented across many components. Choose Zustand when state is a cohesive domain object.

**Jotai vs React Context:** Both are Provider-based. But Context re-renders all consumers when any value changes. Jotai only re-renders consumers of the specific atom that changed.

**Testing:** Use `<Provider>` in tests to create isolated atom scopes:

```typescript
import { Provider, createStore } from 'jotai';

const store = createStore();
store.set(cartItemsAtom, mockItems);

render(
  <Provider store={store}>
    <CartSummary />
  </Provider>
);
```

## Source

https://jotai.org/docs/introduction

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
