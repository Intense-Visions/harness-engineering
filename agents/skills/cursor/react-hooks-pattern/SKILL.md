# React Hooks Pattern

> Reuse stateful logic across components via custom hooks

## When to Use

- Multiple components share the same stateful logic (e.g., data fetching, form state, media queries)
- You want to extract complex logic from a component to improve readability
- You need to compose behaviors without inheritance or render props
- You are using React 16.8+ (hooks are unavailable in class components)

## Instructions

1. Identify repeated stateful logic across two or more components.
2. Extract it into a function prefixed with `use` (e.g., `useWindowSize`, `useFetch`, `useForm`).
3. The custom hook must call at least one built-in hook (`useState`, `useEffect`, `useCallback`, etc.).
4. Return only what the consumer needs — avoid over-exposing internal state.
5. Name the hook descriptively after its behavior, not its implementation (`useMediaQuery` not `useEventListener`).
6. Keep hooks pure and side-effect-free at the call site — effects belong inside `useEffect`.
7. Document the hook's return type with TypeScript interfaces.
8. Co-locate the hook file with its primary consumer or in a `hooks/` directory.

```typescript
// Good: descriptive name, typed return, minimal surface area
function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return size;
}
```

## Details

Custom hooks were introduced in React 16.8 to solve the code reuse problem that previously required higher-order components or render props. The key insight: hooks are just functions, and the `use` prefix is a convention that enables lint rules (react-hooks/rules-of-hooks) to enforce hook semantics.

**Trade-offs:**

- Hooks compose easily but debugging deep hook stacks can be harder than class-based patterns
- The `use` naming convention is enforced by ESLint, not the runtime — calling a hook outside a component or another hook will cause runtime errors, not type errors
- React DevTools shows custom hook names in the component tree when they follow the `use` prefix convention

**When NOT to use:**

- Logic that does not involve state or effects — extract as a plain utility function instead
- Logic specific to a single component that will never be reused

**Related patterns:**

- Provider Pattern — hooks often expose context via a `useXxx()` wrapper
- Compound Pattern — hooks can manage shared state for compound component groups

## Source

https://patterns.dev/react/hooks-pattern

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
