# Zustand Store

> Create lightweight global stores with Zustand's create function for minimal-boilerplate state management

## When to Use

- Managing global state without Redux complexity (auth, preferences, UI flags)
- Sharing state between components without prop drilling or Context
- Needing a store that works outside React (in utility functions, middleware, tests)
- Projects where Redux is overkill but React Context causes performance issues

## Instructions

1. Create a store with `create` from Zustand. Define state and actions together in one function.
2. The store is a hook — call it in any component to subscribe to state changes.
3. Use a selector to pick specific state slices. Components only re-render when selected values change.
4. Actions (functions that update state) are part of the store definition. They use `set` to update state.
5. `set` shallow-merges by default. For nested updates, use the spread operator or the Immer middleware.
6. Access the store outside React with `useStore.getState()` and `useStore.setState()`.

```typescript
// stores/auth-store.ts
import { create } from 'zustand';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,

  login: (user) => set({ user, isAuthenticated: true }),

  logout: () => set({ user: null, isAuthenticated: false }),

  updateProfile: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
}));
```

```typescript
// Component usage — select only what you need
function UserGreeting() {
  const userName = useAuthStore((state) => state.user?.name);
  return <h1>Hello, {userName ?? 'Guest'}</h1>;
}

function LoginButton() {
  const { login, isAuthenticated } = useAuthStore();
  // Warning: destructuring without selector subscribes to ALL changes
  // Prefer: const login = useAuthStore((state) => state.login);
}

// Outside React
async function fetchAndSetUser() {
  const user = await fetch('/api/me').then((r) => r.json());
  useAuthStore.getState().login(user);
}
```

## Details

**Why selectors matter:** Calling `useAuthStore()` with no argument subscribes to the entire store — the component re-renders on ANY state change. Always pass a selector to subscribe to only what the component needs.

**set function behavior:** `set` shallow-merges the object you pass with the current state. It does NOT deep merge. For nested state:

```typescript
// Wrong — this replaces settings entirely
set({ settings: { theme: 'dark' } });

// Right — spread to preserve other fields
set((state) => ({ settings: { ...state.settings, theme: 'dark' } }));
```

**get for reading current state in actions:**

```typescript
const useStore = create<Store>((set, get) => ({
  items: [],
  addItem: (item) => {
    const current = get().items;
    if (current.length >= 100) return; // Read before write
    set({ items: [...current, item] });
  },
}));
```

**Store outside React:** Zustand stores are vanilla JavaScript. `useStore.getState()` reads without subscribing. `useStore.subscribe(listener)` sets up manual subscriptions. This makes Zustand usable in Node.js, tests, and non-React code.

**TypeScript pattern:** Always define the store interface explicitly. Relying on inference from the `create` callback produces less readable types and breaks IDE autocompletion for complex stores.

## Source

https://zustand.docs.pmnd.rs/getting-started/introduction

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
