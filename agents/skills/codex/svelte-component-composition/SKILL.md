# Svelte Component Composition

> Build flexible components in Svelte 5 using snippets, {@render}, typed children props, and named content areas

## When to Use

- You are building a layout component (Card, Modal, Dialog) that renders caller-provided content
- You need multiple named content areas in a single component (header, body, footer slots)
- You are migrating Svelte 4 `<slot>` patterns to Svelte 5 snippets
- You want to pass render functions as props for renderless/headless component patterns

## Instructions

**Svelte 5 snippets — defining reusable template blocks:**

1. Define snippets with `{#snippet name(params)}` and render them with `{@render name()}`:

```svelte
{#snippet greeting(name: string)}
  <p>Hello, <strong>{name}</strong>!</p>
{/snippet}

{@render greeting('Alice')}
{@render greeting('Bob')}
```

**Children prop — default content slot:**

2. Accept default content from a parent using the `children` prop (typed as `Snippet`):

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()
</script>

<div class="card">
  {@render children()}
</div>
```

```svelte
<!-- Usage -->
<Card>
  <p>This content is passed as children.</p>
</Card>
```

3. Make children optional with a fallback:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'

  let { children }: { children?: Snippet } = $props()
</script>

{#if children}
  {@render children()}
{:else}
  <p>No content provided.</p>
{/if}
```

**Named snippets — multiple content areas:**

4. Accept named snippet props for multiple content areas:

```svelte
<!-- Dialog.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    title,
    children,
    footer
  }: {
    title: Snippet
    children: Snippet
    footer?: Snippet
  } = $props()
</script>

<dialog>
  <header>{@render title()}</header>
  <main>{@render children()}</main>
  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</dialog>
```

```svelte
<!-- Usage -->
<Dialog>
  {#snippet title()}
    <h2>Confirm Delete</h2>
  {/snippet}

  <p>Are you sure you want to delete this item?</p>

  {#snippet footer()}
    <button onclick={cancel}>Cancel</button>
    <button onclick={confirm}>Delete</button>
  {/snippet}
</Dialog>
```

**Snippets with parameters — render prop pattern:**

5. Pass parameters through snippets to implement render prop / headless patterns:

```svelte
<!-- List.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    items,
    renderItem
  }: {
    items: Item[]
    renderItem: Snippet<[Item, number]>
  } = $props()
</script>

<ul>
  {#each items as item, index}
    <li>{@render renderItem(item, index)}</li>
  {/each}
</ul>
```

```svelte
<!-- Usage -->
<List {items}>
  {#snippet renderItem(item, index)}
    <span>{index + 1}. {item.name}</span>
  {/snippet}
</List>
```

**Svelte 4 migration — slots to snippets:**

6. Replace `<slot>` with `{@render children()}` and named slots with named snippet props:

| Svelte 4                          | Svelte 5                     |
| --------------------------------- | ---------------------------- |
| `<slot />`                        | `{@render children()}`       |
| `<slot name="header" />`          | `{@render header()}`         |
| `<slot {item} />`                 | `{@render renderItem(item)}` |
| `<svelte:fragment slot="header">` | `{#snippet header()}`        |

**Passing snippets programmatically:**

7. Use `renderSnippet` from `svelte` when you need to render a snippet in a non-template context (e.g., passing to a library):

```typescript
import { renderSnippet } from 'svelte';

const rendered = renderSnippet(mySnippet, args);
```

## Details

**Snippets vs. components:**

Snippets are template fragments — they share the reactive scope of their defining component. Components are isolated scopes with their own lifecycle. Use snippets when you need to inject templating into a parent component; use child components when you need encapsulation.

**Snippet type signatures:**

```typescript
import type { Snippet } from 'svelte';

Snippet; // no params
Snippet<[]>; // explicit no params
Snippet<[string]>; // one string param
Snippet<[Item, number]>; // two params
```

**{@render} with null safety:**

`{@render}` will throw if passed `undefined`. Always check optionality:

```svelte
{#if footer}
  {@render footer()}
{/if}
```

Or use the `??` pattern with a fallback snippet.

**Svelte 4 backward compatibility:**

`<slot>` still works in Svelte 5 but is deprecated. The `children` snippet prop is backward-compatible — components using `{@render children()}` can receive content from both Svelte 5 snippet syntax and legacy `<slot>` fallback in child components.

**Composing deeply nested layouts:**

For deeply nested layouts (e.g., shell > sidebar > content), pass snippet props down or use the context API to avoid prop threading. The context API allows any descendant to read values without passing through intermediate components.

## Source

https://svelte.dev/docs/svelte/snippet

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
