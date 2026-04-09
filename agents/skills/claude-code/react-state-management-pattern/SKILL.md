# React State Management Pattern

> Choose the right state management approach for your React application scale

## When to Use

- You are deciding how to manage state in a new React application
- Local component state is no longer sufficient (multiple components need the same data)
- Context re-render performance is becoming a problem
- You need derived state, selectors, or middleware (Redux DevTools, undo/redo)

## Instructions

**Decision tree:**

1. **Local state first:** Start with `useState` / `useReducer`. Do not reach for global state until you have a specific problem.
2. **Shared low-frequency state:** Use React Context + `useContext` for data that rarely changes (theme, auth, locale).
3. **Shared high-frequency state (small apps):** Use Zustand for minimal boilerplate, selector-based subscriptions, and devtools support.
4. **Complex domain state (large apps):** Use Redux Toolkit for predictable state machines, time-travel debugging, and team consistency.
5. **Server state:** Use React Query or SWR — not client state management — for data that comes from an API.

```typescript
// Zustand: minimal setup
import { create } from 'zustand';
interface BearStore {
  count: number;
  increment: () => void;
}
const useBearStore = create<BearStore>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}));
```

## Details

**State categories:**

- **UI state:** Open/closed, selected tab, scroll position — local state or URL params
- **Server state:** API data — React Query, SWR, RTK Query
- **Global app state:** User session, theme, cart — Context or Zustand
- **Complex domain state:** Multi-entity updates, undo/redo, optimistic updates — Redux Toolkit

**Library comparison (2024):**
| Library | Bundle | Boilerplate | DevTools | Selectors |
|---------|--------|-------------|----------|-----------|
| Context | 0KB | Low | No | No |
| Zustand | ~1KB | Very low | Yes | Yes |
| Jotai | ~3KB | Low | Yes | Atoms |
| Redux Toolkit | ~12KB | Medium | Excellent | Yes |

**React 19 note:** With the React compiler, many manual performance optimizations in Zustand/Redux become less necessary as React auto-memoizes.

## Source

https://patterns.dev/react/state-management

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
