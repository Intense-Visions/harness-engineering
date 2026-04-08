# Svelte Runes Pattern

> Declare reactive state, derived values, and side effects in Svelte 5 using the runes API ($state, $derived, $effect, $props, $bindable)

## When to Use

- You are writing Svelte 5 components and need reactive local state
- You are migrating a Svelte 4 component from `let x` declarations and `$:` reactive statements
- You need to declare component props with type safety and optional defaults
- You want to create two-way bindable props for form inputs or controlled components

## Instructions

**$state — reactive local state:**

1. Declare reactive variables with `$state`. Unlike Svelte 4's magic `let`, `$state` is explicit and works anywhere (not just `.svelte` files):

```svelte
<script lang="ts">
  let count = $state(0)
  let items = $state<string[]>([])
  let user = $state<User | null>(null)
</script>

<button onclick={() => count++}>{count}</button>
```

2. Objects and arrays declared with `$state` are deeply reactive — mutations are tracked automatically:

```svelte
<script lang="ts">
  let todos = $state([
    { id: 1, text: 'Buy milk', done: false }
  ])

  function toggle(id: number) {
    const todo = todos.find(t => t.id === id)
    if (todo) todo.done = !todo.done  // mutation tracked
  }
</script>
```

3. Use `$state.raw` for large non-reactive objects that should only update on full reassignment:

```typescript
let data = $state.raw<HeavyObject>(initialData);
// later:
data = newData; // triggers update; internal mutations do not
```

**$derived — computed values:**

4. Replace `$: computed = expr` with `$derived`:

```svelte
<script lang="ts">
  let count = $state(0)
  let doubled = $derived(count * 2)
  let isEven = $derived(count % 2 === 0)
</script>
```

5. Use `$derived.by` for multi-line derived logic:

```typescript
let filteredItems = $derived.by(() => {
  return items.filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name));
});
```

**$effect — side effects:**

6. Replace `$: { sideEffect() }` and `onMount` with `$effect`. It runs after DOM updates, re-runs when dependencies change, and cleans up on re-run or destroy:

```typescript
$effect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler); // cleanup
});
```

7. `$effect` does NOT run on the server. For SSR-compatible initialization, use `onMount` from `svelte`:

```typescript
import { onMount } from 'svelte';
onMount(() => {
  initMap();
});
```

**$props — component props:**

8. Declare props with `$props()` — it replaces `export let` declarations:

```svelte
<script lang="ts">
  interface Props {
    name: string
    age?: number
    onSelect?: (value: string) => void
  }

  let { name, age = 18, onSelect }: Props = $props()
</script>
```

9. Spread remaining props onto an element using rest destructuring:

```svelte
<script lang="ts">
  let { class: className, ...rest }: { class?: string } & Record<string, unknown> = $props()
</script>
<div class={className} {...rest} />
```

**$bindable — two-way bound props:**

10. Mark a prop as bindable to allow parent components to use `bind:propName`:

```svelte
<!-- Child: InputField.svelte -->
<script lang="ts">
  let { value = $bindable('') }: { value?: string } = $props()
</script>
<input bind:value />

<!-- Parent: -->
<InputField bind:value={searchQuery} />
```

## Details

**Runes vs. Svelte 4 reactivity:**

| Svelte 4                     | Svelte 5 Rune                          |
| ---------------------------- | -------------------------------------- |
| `let count = 0`              | `let count = $state(0)`                |
| `$: doubled = count * 2`     | `let doubled = $derived(count * 2)`    |
| `$: { effect() }`            | `$effect(() => { effect() })`          |
| `export let prop`            | `let { prop } = $props()`              |
| `export let val = $bindable` | `let { val = $bindable() } = $props()` |

**Runes work outside .svelte files:**

This is the key architectural difference from Svelte 4. `$state`, `$derived`, and `$effect` work in `.svelte.ts` and `.svelte.js` files — enabling reactive shared logic without stores:

```typescript
// lib/useCounter.svelte.ts
export function useCounter(initial = 0) {
  let count = $state(initial);
  const doubled = $derived(count * 2);
  return {
    get count() {
      return count;
    },
    get doubled() {
      return doubled;
    },
    increment: () => count++,
  };
}
```

**Getter pattern for exposing $state:**

To expose reactive state from a function, return getters (not values) so the reactive signal flows through:

```typescript
// Do this:
return {
  get count() {
    return count;
  },
};
// Not this (loses reactivity):
return { count };
```

**$effect dependency tracking:**

`$effect` automatically tracks all `$state` and `$derived` values read during its execution. You do not declare dependencies manually. If you read a value inside a conditional branch, it only becomes a dependency when that branch is reached.

## Source

https://svelte.dev/docs/svelte/what-are-runes
