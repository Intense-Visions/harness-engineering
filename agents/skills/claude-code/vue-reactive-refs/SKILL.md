# Vue Reactive Refs

> Create and manage reactive primitive values and objects using ref and reactive

## When to Use

- You need reactive state in a Vue 3 component using the Composition API
- Building composables that return reactive values
- Managing form inputs, counters, flags, or any mutable component state

## Instructions

1. Use `ref()` for primitives (strings, numbers, booleans) — access via `.value`.
2. Use `reactive()` for objects — access properties directly (no `.value`).
3. Use `computed()` for derived values that should auto-update.
4. Never destructure a `reactive()` object — it breaks reactivity. Use `toRefs()` if needed.

```typescript
import { ref, reactive, computed, toRefs } from 'vue';

const count = ref(0); // ref for primitive
const user = reactive({ name: 'Alice', age: 30 }); // reactive for object
const greeting = computed(() => `Hello, ${user.name}!`);

count.value++; // ref needs .value
user.age = 31; // reactive — direct access
```

5. In templates, refs are auto-unwrapped — use `{{ count }}` not `{{ count.value }}`.
6. Use `shallowRef()` or `shallowReactive()` for large objects where deep reactivity is not needed.

## Details

Vue 3's reactivity system is built on ES6 Proxy. `ref()` wraps a value in a reactive container with a `.value` property. `reactive()` wraps an entire object, making all properties reactive. `computed()` creates a cached, read-only reactive value derived from other reactive sources.

**Trade-offs:**

- `ref` requires `.value` in JavaScript (not in templates) — a common source of bugs for new Vue developers
- `reactive()` loses reactivity when destructured — use `toRefs()` to safely destructure
- Deep reactivity on large objects can be expensive — use `shallowRef`/`shallowReactive` for performance
- Replacing a `reactive()` object entirely (`state = newObj`) does not trigger updates — mutate properties instead

**When NOT to use:**

- For non-reactive constants — just use `const` without wrapping
- For data that never changes after initialization — no need for reactivity overhead
- For large datasets rendered in lists — consider `shallowRef` with manual trigger via `triggerRef()`

## Source

https://patterns.dev/vue/reactive-refs
