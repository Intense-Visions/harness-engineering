# React Concurrent UI

> Build responsive UIs using React 18 concurrent features and transitions

## When to Use

- UI becomes unresponsive during expensive state updates (search filtering, large list rendering)
- You want to show stale content while new content loads instead of a spinner
- Input feels laggy because rendering a derived list blocks the keystroke handler
- Using React 18+ with `createRoot`

## Instructions

1. Use `startTransition` to mark non-urgent state updates:
   ```typescript
   const [isPending, startTransition] = useTransition();
   startTransition(() => setQuery(input));
   ```
2. Use `useDeferredValue` to defer an expensive derived computation:
   ```typescript
   const deferredQuery = useDeferredValue(query);
   const filteredList = useMemo(() => filter(list, deferredQuery), [list, deferredQuery]);
   ```
3. Show `isPending` as a subtle loading indicator (opacity, spinner overlay) — not a full Suspense fallback.
4. Ensure the app is mounted with `createRoot` (required for concurrent features).
5. Do not use transitions for urgent updates (text input value, toggle state that affects the input itself).

## Details

Concurrent React can interrupt, pause, and resume renders. `startTransition` and `useDeferredValue` are the primary APIs for leveraging this.

**`startTransition` vs `useDeferredValue`:**

- `startTransition`: you control when the update is marked as non-urgent (around the `setState` call)
- `useDeferredValue`: you defer a derived value (useful when you cannot wrap the setter)

**What makes an update "concurrent":** React can abandon an in-progress render if a higher-priority update arrives (e.g., user keypress). This only happens for transitions.

**React 18 migration:** Opt in by replacing `ReactDOM.render` with `createRoot`. Strict Mode in React 18 mounts components twice in development to surface side effects.

## Source

https://patterns.dev/react/concurrent-pattern

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
