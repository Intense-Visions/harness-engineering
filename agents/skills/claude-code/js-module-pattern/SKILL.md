# JS Module Pattern

> Encapsulate private state and expose a public API using closures or ES modules

## When to Use

- You need private variables that are not accessible from outside a module
- You want a clean public API with implementation details hidden
- You are working in a pre-ESM environment where IIFE-based modules were the norm

## Instructions

1. In modern code (ESM), declare module-level variables as private by not exporting them. Export only the public API.
2. In legacy or bundled code, use an IIFE to create a closure scope.
3. Freeze exported objects if they should be immutable.
4. Keep modules focused — one module per concern.

```javascript
// Modern ESM module pattern
let _count = 0; // private — not exported

export function increment() {
  _count++;
}

export function getCount() {
  return _count;
}

// Legacy IIFE module pattern
const counter = (() => {
  let _count = 0;
  return {
    increment: () => _count++,
    getCount: () => _count,
  };
})();
```

5. Prefer ESM named exports over default exports for better tree-shaking.

## Details

The Module pattern predates ES modules. In the browser, there was no built-in module system, so developers used IIFEs (Immediately Invoked Function Expressions) to create private scopes. Today, ES modules (`.mjs`, `type="module"`) provide native module semantics — each file gets its own scope.

**Trade-offs:**

- Module-level state is shared across all importers in the same process — it is a singleton
- IIFE modules are not tree-shakeable by bundlers; prefer named ESM exports
- Circular module dependencies can cause initialization order issues

**When NOT to use:**

- When you need per-instance private state — use classes with private fields (`#field`)
- When the module has no state — just export pure functions directly

## Source

https://patterns.dev/javascript/module-pattern
