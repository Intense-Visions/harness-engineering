# Vue Composables Pattern

> Extract and reuse stateful logic across components using Vue composables

## When to Use

- Multiple components share the same stateful logic (e.g., window size tracking, API fetching, form validation)
- You want to extract complex logic out of a component's `<script setup>` for readability and reuse
- Replacing Vue 2 mixins with a more explicit, composable approach

## Instructions

1. Create a function prefixed with `use` (e.g., `useWindowSize`, `useFetch`).
2. Inside, use `ref`, `reactive`, `computed`, `watch`, and lifecycle hooks as needed.
3. Return only what consumers need — keep internal state private.
4. Co-locate composable files with their primary consumer or place in a `composables/` directory.

```typescript
// composables/useWindowSize.ts
import { ref, onMounted, onUnmounted } from 'vue';

export function useWindowSize() {
  const width = ref(window.innerWidth);
  const height = ref(window.innerHeight);

  function update() {
    width.value = window.innerWidth;
    height.value = window.innerHeight;
  }

  onMounted(() => window.addEventListener('resize', update));
  onUnmounted(() => window.removeEventListener('resize', update));

  return { width, height };
}
```

5. Composables can accept parameters (refs or plain values) for configuration.
6. Return cleanup functions or use lifecycle hooks to handle side-effect teardown.

## Details

Composables are the Vue 3 Composition API's answer to code reuse. They replace mixins, which suffered from namespace collisions, implicit dependencies, and unclear data sources. A composable is a plain function that uses Vue's reactivity primitives, making dependencies explicit.

**Trade-offs:**

- Composables must be called during `setup()` — they cannot be used conditionally or in loops (similar to React hooks rules)
- Deeply nested composable calls can make the dependency chain hard to trace
- Over-extracting into composables can fragment logic that is easier to understand inline

**When NOT to use:**

- For stateless utility functions — just export a plain function, no need for Vue reactivity
- When the logic is used by only one component — inline it in `<script setup>` until reuse is needed
- For global state — use Pinia stores instead of a composable with module-level state

## Source

https://patterns.dev/vue/composables-pattern

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
