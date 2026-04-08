# Vue Provide / Inject

> Share data across a component tree without prop-drilling using provide/inject

## When to Use

- A parent component needs to share data with deeply nested descendants
- You want to avoid passing props through intermediate components that do not use them
- Implementing theme, locale, or configuration providers at the app level

## Instructions

1. In the ancestor component, call `provide(key, value)` inside `<script setup>`.
2. In any descendant, call `const value = inject(key)` to receive the provided value.
3. Use `InjectionKey<T>` for type-safe provide/inject in TypeScript.
4. Provide reactive values (`ref` or `reactive`) so descendants receive live updates.
5. Always provide a default value or document that `inject()` may return `undefined`.

```typescript
// Parent — provides theme
import { provide, ref } from 'vue';
const theme = ref('light');
provide('theme', theme);

// Deep child — injects theme
import { inject } from 'vue';
const theme = inject('theme', ref('light'));
```

6. Use Symbol keys to avoid naming collisions between providers.

## Details

Vue's `provide`/`inject` is a dependency injection mechanism scoped to the component tree. A provider makes a value available to all its descendants, regardless of depth. Unlike props, the intermediate components do not need to know about or forward the value.

**Trade-offs:**

- Implicit dependencies — it is not obvious from a component's props what injected values it depends on
- Debugging is harder — there is no props panel in DevTools for injected values (though Vue DevTools does show provide/inject)
- Overuse leads to "spooky action at a distance" — changes in a provider affect distant descendants

**When NOT to use:**

- When only one level of nesting exists — just pass a prop
- For application-wide global state — use Pinia stores instead
- When multiple providers might conflict — the closest ancestor's provide wins, which can be confusing

## Source

https://patterns.dev/vue/provide-inject
