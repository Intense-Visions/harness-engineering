# Vue Renderless Components

> Extract behavior into components that render nothing, delegating all rendering to the consumer via slots

## When to Use

- You want to share complex behavior (toggle, fetch, form validation) without dictating the UI
- Building a component library where consumers control all markup and styling
- Porting Vue 2 patterns where composables were not available

## Instructions

1. Create a component that manages state and behavior but renders nothing itself.
2. Use `<slot v-bind="slotProps">` to pass data and actions to the parent via scoped slots.
3. The consumer provides all markup via the default slot, receiving behavior via slot props.
4. Prefer composables for new code — renderless components are the Vue 2 equivalent.

```vue
<!-- RenderlessToggle.vue -->
<script setup>
import { ref } from 'vue';
const isOpen = ref(false);
const toggle = () => {
  isOpen.value = !isOpen.value;
};
</script>

<template>
  <slot :isOpen="isOpen" :toggle="toggle" />
</template>
```

5. Use in the consumer: `<RenderlessToggle v-slot="{ isOpen, toggle }">`.

## Details

Renderless (headless) components separate behavior from presentation. The component owns the logic (state, side effects, event handling) and exposes it via scoped slots. The consumer owns the template. This is the Vue equivalent of React's render props pattern.

**Trade-offs:**

- Scoped slot syntax is more verbose than calling a composable function
- Harder to compose — nesting multiple renderless components leads to "slot callback hell"
- In Vue 3, composables achieve the same goal with simpler syntax

**When NOT to use:**

- In new Vue 3 projects — use composables instead, which are simpler and more composable
- When the behavior is trivial — a `ref` inline in `<script setup>` is clearer
- When the component needs specific DOM structure — it is not truly renderless

## Source

https://patterns.dev/vue/renderless-components

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
