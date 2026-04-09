# Astro Multi-Framework

> Run React, Vue, Svelte, Solid, and Preact side-by-side in one Astro project with full framework isolation and shared reactive state via nanostores.

## When to Use

- You are migrating from one framework to another and want to run both during the transition period
- Your team has component libraries in multiple frameworks and you want to compose them in one site
- You need a specialized component (a React data-grid, a Vue date-picker) alongside your primary framework
- You want to share state between framework components on the same page without a global store library tied to one framework
- You are evaluating different frameworks for different sections of a large site

## Instructions

1. Install the official integration for each framework you need. Each integration adds the renderer and Vite transform:

```bash
npx astro add react vue svelte solid
```

This updates `astro.config.mjs` automatically:

```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vue from '@astrojs/vue';
import svelte from '@astrojs/svelte';
import solid from '@astrojs/solid-js';

export default defineConfig({
  integrations: [react(), vue(), svelte(), solid()],
});
```

2. Import and use components from any framework in a `.astro` file. Apply `client:*` directives as normal:

```astro
---
import ReactCounter from './ReactCounter.jsx';
import VueDatePicker from './VueDatePicker.vue';
import SvelteModal from './SvelteModal.svelte';
---

<!-- Each island hydrates independently -->
<ReactCounter client:load initialCount={0} />
<VueDatePicker client:idle />
<SvelteModal client:visible triggerText="Open" />
```

3. Framework components are fully isolated. A React component cannot import a Vue component directly. Cross-framework composition must happen at the `.astro` level — use `.astro` as the orchestration layer.

4. Share reactive state between framework components using nanostores. Install framework-specific adapters:

```bash
npm install nanostores @nanostores/react @nanostores/vue
```

```typescript
// src/stores/cart.ts
import { atom, computed } from 'nanostores';

export const cartItems = atom<CartItem[]>([]);
export const cartCount = computed(cartItems, (items) => items.length);

export function addToCart(item: CartItem) {
  cartItems.set([...cartItems.get(), item]);
}
```

5. Use the framework-specific adapter to read and subscribe to nanostores in each component:

```jsx
// React: src/components/CartBadge.jsx
import { useStore } from '@nanostores/react';
import { cartCount } from '../stores/cart';

export function CartBadge() {
  const count = useStore(cartCount);
  return <span className="badge">{count}</span>;
}
```

```vue
<!-- Vue: src/components/CartBadge.vue -->
<script setup>
import { useStore } from '@nanostores/vue';
import { cartCount } from '../stores/cart';
const count = useStore(cartCount);
</script>
<template>
  <span class="badge">{{ count }}</span>
</template>
```

```svelte
<!-- Svelte: src/components/CartBadge.svelte -->
<script>
import { cartItems } from '../stores/cart';
</script>
<span class="badge">{$cartItems.length}</span>
```

6. For state that does not need reactivity, use `localStorage` or URL params as a simple shared medium between islands. For complex cross-island workflows, prefer nanostores over custom events.

7. When mixing React and Solid, disambiguate JSX transforms in `tsconfig.json` using `include`/`exclude` or separate tsconfig files per framework directory. Both use JSX but with different transforms.

8. Use `client:only="react"` (or the relevant framework) for components that rely heavily on browser APIs and should not attempt SSR from the wrong framework context.

## Details

Astro's multi-framework support is powered by its renderer abstraction. Each framework integration (`@astrojs/react`, etc.) registers a renderer that tells Astro's build system how to SSR and hydrate components of that type. The renderers are completely independent — React's `useState` and Vue's `ref` never conflict because they hydrate in separate DOM trees.

**Why nanostores?**

Nanostores is framework-agnostic by design. Each atom is a tiny observable that any framework adapter can subscribe to. When a nanostore value changes, only the components subscribed to that specific atom re-render — regardless of which framework they use. This is exactly the right primitive for cross-island communication.

Alternatives and their trade-offs:

- Redux / Zustand — React-specific; cannot be used in Vue or Svelte components without wrapper hacks
- Pinia — Vue-specific
- Custom events (`window.dispatchEvent`) — works everywhere but requires manual subscription management and is not reactive in the framework sense
- URL params — works but requires navigation or `history.pushState` to trigger re-renders

**JSX disambiguation:**

When React and Solid coexist, both use JSX syntax but with different runtime imports. Astro uses the file extension to determine which renderer to use (`.jsx`/`.tsx` for React, `.jsx`/`.tsx` in a `/solid/` directory for Solid). Configure `jsxImportSource` per directory in `tsconfig.json` if you have both React and Solid `.tsx` files:

```json
// tsconfig.json (for React default)
{ "compilerOptions": { "jsxImportSource": "react" } }
```

Use `/** @jsxImportSource solid-js */` pragma at the top of Solid files when in a mixed project.

**Bundle implications:**

Each framework ships its own runtime bundle. Having React + Vue + Svelte + Solid on the same page means shipping all four runtimes to the client (when using `client:*` directives from all four). Be strategic: prefer one primary framework for most interactive islands, and use secondary frameworks only for specific components that justify the added bytes.

**Migration pattern:**

Multi-framework support is ideal for incremental migrations. Start with your legacy framework (Vue 2, say), add the new framework (`@astrojs/react`), and rewrite components one at a time. Both frameworks work in production throughout the migration.

## Source

https://docs.astro.build/en/guides/framework-components

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
