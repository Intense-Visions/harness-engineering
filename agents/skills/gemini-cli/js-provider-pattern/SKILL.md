# JS Provider Pattern

> Make shared data available to multiple consumers without prop-drilling

## When to Use

- Multiple components or modules need the same data (theme, locale, current user, feature flags)
- You want to avoid threading a value through every function parameter or component prop
- You need to swap implementations (e.g., test vs production) by replacing the provider

## Instructions

1. Create a context object or module-level store that holds the shared data.
2. Expose a `provide(value)` function to register the data and a `consume()` / `inject()` function to retrieve it.
3. Scope the provider — a module-level variable is global; a closure-based provider can be scoped to a subtree or request.
4. Document what the provider exposes — callers should not need to inspect internals to use it.

```javascript
// Simple module-level provider
let _theme = 'light';

export function provideTheme(theme) {
  _theme = theme;
}

export function useTheme() {
  return _theme;
}
```

5. In framework code (React/Vue), use the framework's native context API — do not re-implement it.
6. Keep providers focused — one provider per concern (theme, auth, i18n), not one mega-provider.

## Details

The Provider pattern is the plain-JavaScript equivalent of what React Context and Vue's provide/inject formalize. The core idea: establish a value at one level and make it available to any consumer below that level without explicit passing.

**Trade-offs:**

- Module-level providers are singletons — hard to reset in tests
- Implicit dependencies — consumers do not declare that they depend on the provider in their signature
- No automatic re-rendering — plain JS providers do not trigger UI updates when the value changes (use a framework's reactive context for that)

**When NOT to use:**

- When only 1–2 levels of nesting exist — passing props directly is clearer
- When the data changes frequently and consumers need to react — use a reactive state management solution

## Source

https://patterns.dev/javascript/provider-pattern

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
