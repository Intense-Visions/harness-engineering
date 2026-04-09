# Zustand Slices

> Split large Zustand stores into composable slice functions for modular, maintainable state management

## When to Use

- A single Zustand store has grown beyond 100 lines or 5+ unrelated concerns
- Multiple developers working on different features need isolated state ownership
- Wanting Redux-like slice organization without Redux complexity
- Needing to compose or reuse state logic across stores

## Instructions

1. Define each slice as a function that receives `set`, `get`, and returns a partial store interface.
2. Type each slice using `StateCreator` with the full store type as the first generic and the slice type as the second.
3. Combine slices in a single `create` call by spreading them.
4. Each slice can read and write state from other slices via `get()` — the store is unified at runtime.
5. Keep one file per slice, one index file that combines them.

```typescript
// stores/slices/auth-slice.ts
import { StateCreator } from 'zustand';
import { AppStore } from '../app-store';

export interface AuthSlice {
  user: { id: string; name: string } | null;
  isAuthenticated: boolean;
  login: (user: { id: string; name: string }) => void;
  logout: () => void;
}

export const createAuthSlice: StateCreator<AppStore, [], [], AuthSlice> = (set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
});
```

```typescript
// stores/slices/cart-slice.ts
import { StateCreator } from 'zustand';
import { AppStore } from '../app-store';

export interface CartSlice {
  items: Array<{ id: string; name: string; qty: number }>;
  addItem: (item: { id: string; name: string }) => void;
  clearCart: () => void;
}

export const createCartSlice: StateCreator<AppStore, [], [], CartSlice> = (set, get) => ({
  items: [],
  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((i) => i.id === item.id);
      if (existing) {
        return { items: state.items.map((i) => (i.id === item.id ? { ...i, qty: i.qty + 1 } : i)) };
      }
      return { items: [...state.items, { ...item, qty: 1 }] };
    }),
  clearCart: () => {
    // Cross-slice access — read auth state from cart slice
    const user = get().user;
    if (!user) return;
    set({ items: [] });
  },
});
```

```typescript
// stores/app-store.ts
import { create } from 'zustand';
import { AuthSlice, createAuthSlice } from './slices/auth-slice';
import { CartSlice, createCartSlice } from './slices/cart-slice';

export type AppStore = AuthSlice & CartSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createCartSlice(...a),
}));
```

## Details

**StateCreator generic parameters:** `StateCreator<FullStore, Middlewares, SetMiddlewares, SliceType>`. The first generic is the full combined store type so that `get()` returns the complete interface. The last generic is this slice's contribution.

**With middleware:** When using middleware (persist, immer, devtools), the middleware array generics must be threaded through:

```typescript
export const createAuthSlice: StateCreator<
  AppStore,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  AuthSlice
> = (set) => ({
  /* ... */
});
```

**Cross-slice communication:** Since all slices share one store, any slice can read any other slice's state via `get()`. This is simpler than Redux's cross-slice communication but requires discipline — avoid circular dependencies between slices.

**Testing slices independently:** Create a test store with only the slice under test plus mock values for other slices:

```typescript
const useTestStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  // Mock cart slice
  items: [],
  addItem: vi.fn(),
  clearCart: vi.fn(),
}));
```

**When to split vs keep together:** Split when a slice can be described in one sentence ("manages cart items") and has no business logic coupling with other slices. Keep together when state and actions are tightly interleaved.

## Source

https://zustand.docs.pmnd.rs/guides/slices-pattern

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
