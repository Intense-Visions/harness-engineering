# Svelte State Management

> Choose the right state scope in SvelteKit: component-local runes, context API for subtree isolation, and module-level state for true singletons

## When to Use

- You need to decide whether state belongs in a component, a context, or a module-level singleton
- You are hitting SSR data leakage bugs caused by shared module-level state between requests
- You need to share state across a component subtree without prop-drilling or global stores
- You are implementing a typed context pattern (ContextKey) for large applications

## Instructions

**Layer 1 — component-local state (runes):**

1. For state used only within a single component, use `$state` directly. This is always the starting point:

```svelte
<script lang="ts">
  let count = $state(0)
  let open = $state(false)
</script>
```

**Layer 2 — reactive class / .svelte.ts for shared reactive logic:**

2. Extract shared logic into a `.svelte.ts` file using `$state` and `$derived`. This works in Svelte 5 and is preferred over Svelte 4 stores:

```typescript
// lib/counter.svelte.ts
export class Counter {
  count = $state(0);
  doubled = $derived(this.count * 2);

  increment() {
    this.count++;
  }
  reset() {
    this.count = 0;
  }
}

// Singleton (app-wide):
export const counter = new Counter();

// Or factory (per-use):
export function createCounter() {
  return new Counter();
}
```

**Layer 3 — context API for subtree isolation:**

3. Use `setContext`/`getContext` to share state within a component tree without prop-drilling. Context is scoped to the component that calls `setContext` and all its descendants:

```svelte
<!-- FormRoot.svelte — sets context -->
<script lang="ts">
  import { setContext } from 'svelte'

  const form = $state({ values: {}, errors: {} })
  setContext('form', form)
</script>
<slot />
```

```svelte
<!-- FormField.svelte — reads context -->
<script lang="ts">
  import { getContext } from 'svelte'
  const form = getContext<FormState>('form')
</script>
```

4. Use a typed symbol key (ContextKey pattern) to prevent key collisions in large apps:

```typescript
// lib/form-context.ts
import { getContext, setContext } from 'svelte';

const FORM_KEY = Symbol('form');

export function setFormContext(state: FormState) {
  setContext(FORM_KEY, state);
}

export function getFormContext(): FormState {
  const ctx = getContext<FormState>(FORM_KEY);
  if (!ctx) throw new Error('getFormContext must be called inside a FormRoot component');
  return ctx;
}
```

**Layer 4 — module-level singletons (client-only):**

5. Module-level state (outside any function or class) persists for the lifetime of the browser tab — useful for truly global singletons like auth state or feature flags:

```typescript
// lib/auth.svelte.ts
let user = $state<User | null>(null);

export function getUser() {
  return user;
}
export function setUser(u: User | null) {
  user = u;
}
```

6. NEVER use module-level state for per-user or per-request data in SSR — it leaks between requests on the server:

```typescript
// WRONG — server-side singleton shared between ALL users:
let currentUser = $state<User | null>(null); // data leak!

// CORRECT — use locals (set in hooks.server.ts) for per-request server state
// CORRECT — use context API for per-component-tree state
```

**SvelteKit page data as state source:**

7. Page data from load functions is the canonical source for server-fetched state. Do not duplicate it into local stores:

```svelte
<script lang="ts">
  import type { PageData } from './$types'
  let { data }: { data: PageData } = $props()

  // data.user is already reactive — no need to copy to $state
  // Just use data.user directly in the template
</script>
```

## Details

**State management decision tree:**

```
Is the state used in only one component?
  → Yes → $state (rune)

Does it need to be shared across a component subtree?
  → Yes → Context API (setContext/getContext)

Does it need to be shared app-wide (no component boundary)?
  → Client-only? → Module-level $state in .svelte.ts
  → SSR-safe?   → Server: locals / load data; Client: stores or context

Does it come from the server?
  → Use load functions + page data (not stores)
```

**Why stores cause SSR issues:**

Svelte stores are module-level singletons. In Node.js, modules are shared across all simultaneous requests. If a user's data is written to a store on request A, it can be visible to request B's render if B starts before A finishes. The fix: use `event.locals` in `hooks.server.ts`, passed through load functions.

**Context API and SSR:**

Context is per-render-tree on the server (each SSR request creates a fresh component tree), so it is SSR-safe. This makes it the right choice for per-request data in layouts and pages.

**Derived state from page data:**

If you need computed values based on page data, use `$derived` rather than storing derived values:

```svelte
<script lang="ts">
  let { data } = $props()
  const totalPrice = $derived(
    data.cartItems.reduce((sum, item) => sum + item.price, 0)
  )
</script>
```

**Persisting state across navigations:**

SvelteKit re-runs load functions on navigation, replacing `data`. For client-side persistence across navigations, use module-level state or the browser's `sessionStorage`/`localStorage`.

## Source

https://kit.svelte.dev/docs/state-management
