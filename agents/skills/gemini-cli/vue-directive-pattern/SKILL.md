# Vue Directive Pattern

> Create custom Vue directives for low-level DOM manipulation and reusable DOM behavior

## When to Use

- You need reusable DOM manipulation logic (auto-focus, click-outside, intersection observer, tooltips)
- The behavior is purely DOM-level and does not involve component state or rendering
- Integrating third-party libraries that need direct DOM access

## Instructions

1. Define a directive as an object with lifecycle hooks (`mounted`, `updated`, `unmounted`).
2. Register globally via `app.directive('name', directiveObj)` or locally in `<script setup>` with `vName` convention.
3. Access the element as the first argument and binding value as the second.
4. Use directives only for DOM manipulation — for logic, prefer composables.

```typescript
// v-focus directive — auto-focuses an input on mount
const vFocus = {
  mounted(el: HTMLElement) {
    el.focus();
  },
};

// Usage in template: <input v-focus />
```

5. Clean up event listeners and observers in the `unmounted` hook to prevent memory leaks.
6. Use `binding.value` to pass dynamic data: `<div v-tooltip="'Hello'">`.

## Details

Custom directives give you low-level access to DOM elements. They run at specific lifecycle points (created, beforeMount, mounted, beforeUpdate, updated, beforeUnmount, unmounted) and receive the element and binding information. Vue's built-in directives (`v-if`, `v-show`, `v-model`) are implemented the same way.

**Trade-offs:**

- Directives are harder to test than composables — they require a real or mocked DOM
- No reactive return value — directives modify the DOM imperatively, not declaratively
- Overusing directives leads to "jQuery-style" code that bypasses Vue's reactivity

**When NOT to use:**

- When a composable can achieve the same result — composables are easier to test and compose
- For complex component behavior — use a component, not a directive
- When the DOM manipulation is a one-time setup — inline it in `onMounted`

## Source

https://patterns.dev/vue/directive-pattern

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
