# Vue Pinia Pattern

> Manage shared application state with Pinia stores in the Options or Setup style

## When to Use

- Multiple components across different parts of the app need to share and mutate the same state
- You need DevTools integration for state inspection, time-travel debugging, and hot-module replacement
- Replacing Vuex in a Vue 3 application

## Instructions

1. Define a store with `defineStore('id', { state, getters, actions })` or the Setup syntax.
2. Prefer the Setup syntax for composable-style stores: `defineStore('id', () => { ... })`.
3. Use `storeToRefs()` when destructuring reactive state from a store.
4. Keep stores focused — one store per domain concept, not one global store.

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0);
  const doubled = computed(() => count.value * 2);
  function increment() {
    count.value++;
  }
  return { count, doubled, increment };
});
```

5. Access stores in components: `const store = useCounterStore()`.
6. Use `store.$reset()` (Options API stores only) to reset state to initial values.

## Details

Pinia is the official state management library for Vue 3. It replaces Vuex with a simpler, type-safe API. Pinia stores are reactive — components that use store state automatically re-render when it changes. Stores are lazy-loaded on first use.

**Trade-offs:**

- Adds a dependency — for simple apps, `provide`/`inject` or composables may suffice
- Setup-style stores cannot use `$reset()` — you must implement reset logic manually
- Stores are singletons by default — in SSR, each request needs its own Pinia instance to avoid cross-request state pollution

**When NOT to use:**

- For component-local state — use `ref()` or `reactive()` in `<script setup>`
- For parent-child communication — use props and emits
- When the state is only shared between a parent and its direct children — use `provide`/`inject`

## Source

https://patterns.dev/vue/pinia-pattern
