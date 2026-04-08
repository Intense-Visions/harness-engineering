# Vue Teleport Pattern

> Render a component's HTML at a different location in the DOM using Vue's Teleport

## When to Use

- Rendering modals, tooltips, toasts, or dropdowns that need to escape parent CSS overflow or z-index constraints
- Placing UI elements at the end of `<body>` while keeping them logically owned by a child component
- Avoiding CSS stacking context issues with positioned elements

## Instructions

1. Wrap the content to be teleported in `<Teleport to="selector">`.
2. The `to` prop is a CSS selector (e.g., `#modals`, `body`).
3. The teleported content remains in the component's logical tree for props, events, and provide/inject.
4. Use `<Teleport disabled>` to conditionally render in-place.

```vue
<template>
  <button @click="showModal = true">Open</button>
  <Teleport to="#modal-container">
    <div v-if="showModal" class="modal">
      <p>Modal content</p>
      <button @click="showModal = false">Close</button>
    </div>
  </Teleport>
</template>
```

5. Ensure the target element exists in the DOM before the Teleport renders.

## Details

Vue's `<Teleport>` (Vue 3 built-in) moves rendered DOM nodes to a different location in the document while maintaining the Vue component hierarchy. Events still bubble through the Vue tree (not the DOM tree), and provide/inject still works across the teleport boundary.

**Trade-offs:**

- The target element must exist when the Teleport mounts — SSR requires careful handling
- Multiple Teleports to the same target append in order — can cause unexpected stacking
- Testing is harder — the rendered content is not in the component's DOM subtree

**When NOT to use:**

- When CSS can solve the positioning problem (e.g., `position: fixed` with proper z-index)
- For SSR-only content — Teleport behavior differs between client and server
- When the teleported content does not need to escape its parent — keep it in-place for simplicity

## Source

https://patterns.dev/vue/teleport-pattern
