# Vue Watchers Pattern

> React to data changes with watch and watchEffect for side effects and async operations

## When to Use

- You need to perform side effects (API calls, localStorage writes, analytics) when reactive data changes
- Implementing debounced search, auto-save, or data synchronization
- Watching route params or store state for navigation-driven updates

## Instructions

1. Use `watch(source, callback)` when you need the old and new values.
2. Use `watchEffect(callback)` when you want automatic dependency tracking.
3. Pass `{ deep: true }` to watch nested object mutations.
4. Always clean up side effects in the `onCleanup` callback to prevent leaks.

```typescript
import { ref, watch, watchEffect } from 'vue';

const query = ref('');

// Explicit source — gives old and new
watch(query, (newVal, oldVal) => {
  console.log(`Query changed: ${oldVal} → ${newVal}`);
});

// Auto-tracked dependencies
watchEffect((onCleanup) => {
  const controller = new AbortController();
  fetch(`/api/search?q=${query.value}`, { signal: controller.signal });
  onCleanup(() => controller.abort());
});
```

5. Use `{ immediate: true }` with `watch` to run the callback immediately on setup.
6. Watch multiple sources: `watch([ref1, ref2], ([new1, new2], [old1, old2]) => { ... })`.

## Details

Vue provides two watcher APIs. `watch()` is explicit — you declare what to watch and get old/new values. `watchEffect()` is implicit — it automatically tracks any reactive dependency accessed during execution. Both return a stop function to cancel the watcher.

**Trade-offs:**

- `watchEffect` can trigger unexpectedly if it accesses reactive data you did not intend to track
- Deep watching large objects is expensive — Vue must traverse the entire object tree
- Watchers run asynchronously by default (after DOM updates) — use `{ flush: 'sync' }` if you need synchronous execution (rare)

**When NOT to use:**

- For derived/computed values — use `computed()` instead, which caches the result
- For template-reactive data — just use `ref`/`reactive` directly; Vue re-renders automatically
- When a simple event handler would suffice — do not use a watcher to react to user clicks

## Source

https://patterns.dev/vue/watchers-pattern

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
