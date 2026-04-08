# Nuxt State Management

> Share reactive state across components with SSR-safe useState and Pinia store hydration

## When to Use

- You need state that persists across navigation without re-fetching (user session, cart, theme)
- You are seeing hydration mismatch errors caused by state divergence between server and client
- You want to use Pinia stores in a Nuxt SSR context with proper server-to-client serialization
- You need to share state between unrelated components without prop-drilling

## Instructions

**useState — built-in SSR-safe state:**

1. Use `useState` instead of `ref` for any state that must be consistent between server and client renders. `useState` is keyed: the same key always returns the same reactive reference:

```typescript
// composables/useCounter.ts
export const useCounter = () => useState<number>('counter', () => 0);
```

```html
<!-- pages/index.vue -->
<script setup>
  const counter = useCounter();
</script>
<template>
  <button @click="counter++">{{ counter }}</button>
</template>
```

2. The second argument to `useState` is an initializer factory — it runs only once on the server and is never called again on the client (state is transferred via payload):

```typescript
const user = useState<User | null>('current-user', () => null);
```

3. Always provide a unique, descriptive key to avoid collisions across different composables:

```typescript
// Prefer namespaced keys for large apps
const cartItems = useState<CartItem[]>('cart:items', () => []);
const cartTotal = useState<number>('cart:total', () => 0);
```

4. Reset state on the server-per-request boundary using `clearNuxtState` — useful for user-specific data:

```typescript
// plugins/reset-state.ts
export default defineNuxtPlugin(() => {
  addRouteMiddleware(() => {
    clearNuxtState(['cart:items', 'cart:total']);
  });
});
```

**Pinia — structured stores:**

5. Install `@pinia/nuxt` and add it to `modules` in `nuxt.config.ts`:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@pinia/nuxt'],
});
```

6. Define stores using `defineStore` — they are auto-imported when placed in `stores/` (with `imports.dirs` configured):

```typescript
// stores/useAuthStore.ts
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const isAuthenticated = computed(() => !!user.value);

  async function login(credentials: Credentials) {
    user.value = await $fetch('/api/auth/login', { method: 'POST', body: credentials });
  }

  function logout() {
    user.value = null;
  }

  return { user, isAuthenticated, login, logout };
});
```

7. Hydrate Pinia stores server-side using `useAsyncData` within the store or in the page:

```typescript
// Hydrate in page
const authStore = useAuthStore();
await useAsyncData('auth', () => authStore.fetchCurrentUser());
```

8. Use `pinia.state.value` in server plugins to initialize store state from server-side sources:

```typescript
// plugins/init-state.server.ts
export default defineNuxtPlugin(async (nuxtApp) => {
  const authStore = useAuthStore(nuxtApp.$pinia);
  const sessionUser = await getSessionUser(useRequestEvent());
  authStore.user = sessionUser;
});
```

## Details

**Why `ref` causes hydration mismatches:**

A plain `ref` in a composable creates a new reactive instance per component call. During SSR, the server renders with its own instance; on the client, a fresh ref initializes to the default value — causing a mismatch. `useState` solves this by storing state in Nuxt's SSR payload and rehydrating from it on the client.

**useState vs. Pinia:**

| Concern                         | useState | Pinia          |
| ------------------------------- | -------- | -------------- |
| Simple scalar/object state      | Best fit | Overkill       |
| Complex logic, actions, getters | Awkward  | Best fit       |
| DevTools time-travel            | No       | Yes            |
| Plugin ecosystem                | None     | Rich           |
| SSR safety                      | Built-in | Requires setup |

**Serialization requirements:**

State transferred via the SSR payload must be JSON-serializable. Do not store class instances, functions, or circular references in `useState` or Pinia stores. Use plain objects and primitives.

**Pinia store persistence (client-only):**

Use `pinia-plugin-persistedstate` for localStorage sync. Mark it `client-only` to avoid SSR issues:

```typescript
// plugins/pinia-persist.client.ts
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
export default defineNuxtPlugin(({ $pinia }) => {
  $pinia.use(piniaPluginPersistedstate);
});
```

**Avoiding state pollution between requests:**

In SSR, all requests share the same module scope. Never use module-level `ref` or `reactive` for per-user state — it leaks between requests. Always use `useState` (keyed per request) or Pinia (reset via `$reset()` in server middleware).

## Source

https://nuxt.com/docs/getting-started/state-management
