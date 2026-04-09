# Vue Component Events

> Communicate from child to parent components using emits and defineEmits

## When to Use

- A child component needs to notify its parent of user actions or state changes
- Implementing form inputs, buttons, or interactive components that report values upward
- Building reusable components with a clear input/output contract (props down, events up)

## Instructions

1. Declare events with `defineEmits<{ eventName: [payload: Type] }>()` in `<script setup>`.
2. Emit events with `emit('eventName', payload)`.
3. The parent listens with `@event-name="handler"` (kebab-case in template).
4. Always type your emit payloads for compile-time safety.

```vue
<!-- ChildButton.vue -->
<script setup lang="ts">
const emit = defineEmits<{
  click: [id: number];
  update: [value: string];
}>();
</script>

<template>
  <button @click="emit('click', 42)">Click</button>
</template>

<!-- Parent.vue -->
<ChildButton @click="handleClick" @update="handleUpdate" />
```

5. Use `v-model` as syntactic sugar for an `update:modelValue` event pattern.
6. Validate emits at runtime by passing a validation function to `defineEmits`.

## Details

Vue's event system follows a "props down, events up" pattern. Parents pass data to children via props; children notify parents via emitted events. This creates a clear, unidirectional data flow that is easy to trace and debug.

**Trade-offs:**

- Events only travel one level up — for deeply nested communication, use `provide`/`inject` or a store
- Untyped emits (array syntax) provide no compile-time safety — always use the typed syntax
- Event names are strings — typos are caught at runtime, not compile time (unless using TypeScript with `defineEmits`)

**When NOT to use:**

- For deeply nested parent-child communication — use `provide`/`inject` or Pinia
- For sibling component communication — use a shared store or event bus (though event buses are discouraged in Vue 3)
- When the parent does not need to know about the event — side effects belong in the child

## Source

https://patterns.dev/vue/component-events

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
