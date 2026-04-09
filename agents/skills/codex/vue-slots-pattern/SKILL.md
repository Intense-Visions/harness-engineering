# Vue Slots Pattern

> Use named, scoped, and dynamic slots to build flexible, composable component APIs

## When to Use

- Building layout components (Card, Modal, Page) where the consumer controls the content
- Creating data-driven components (tables, lists) where the consumer controls how each item renders
- Designing component libraries with maximum flexibility

## Instructions

1. Use `<slot>` for the default slot, `<slot name="header">` for named slots.
2. Pass data to the consumer via scoped slots: `<slot :item="item">`.
3. The consumer accesses scoped data with `<template #slotName="{ item }">`.
4. Provide fallback content inside `<slot>` tags for when the consumer does not fill the slot.

```vue
<!-- Card.vue -->
<template>
  <div class="card">
    <div class="header"><slot name="header">Default Header</slot></div>
    <div class="body"><slot /></div>
    <div class="footer"><slot name="footer" /></div>
  </div>
</template>

<!-- Consumer -->
<Card>
  <template #header><h2>Custom Title</h2></template>
  <p>Body content goes in the default slot</p>
</Card>
```

5. Use `$slots` to check if a slot was provided: `v-if="$slots.header"`.
6. Dynamic slot names: `<template #[dynamicSlotName]>` for runtime-determined slots.

## Details

Slots are Vue's content distribution mechanism, equivalent to React's `children` and render props. They allow parent components to inject content into child component templates. Named slots organize multiple content areas, and scoped slots pass data back to the parent for custom rendering.

**Trade-offs:**

- Slot-heavy components can be verbose in usage — many `<template #name>` blocks
- Scoped slots add complexity — the data flow (child-to-parent via slot props) is the reverse of props
- TypeScript support for slot props is improving but still requires explicit typing via `defineSlots()`

**When NOT to use:**

- When the component always renders the same structure — just use props for data
- When only a string or simple value varies — a prop is simpler than a slot
- For behavior sharing — use composables instead of renderless components with scoped slots

## Source

https://patterns.dev/vue/slots-pattern

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
