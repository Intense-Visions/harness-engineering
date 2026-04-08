# State Selection Patterns

> Select and derive state efficiently to minimize component re-renders across any state management library

## When to Use

- Components re-render too frequently due to subscribing to more state than they need
- Computing derived data (filtered lists, aggregations) from raw state
- Memoizing expensive computations that depend on state
- Building a consistent selector strategy across Zustand, Redux, Jotai, or Context

## Instructions

1. **Select the minimum:** Subscribe only to the exact fields a component needs. Never subscribe to the entire store.
2. **Keep selectors pure:** A selector is a function from state to derived value. No side effects.
3. **Stabilize references:** Selectors that return new objects/arrays on every call defeat memoization. Use memoized selectors or shallow comparison.
4. **Colocate simple selectors with the store.** Complex derived selectors go in a dedicated selectors file.
5. **Compose selectors:** Build complex selectors by combining simpler ones.
6. **Test selectors as pure functions** — pass state in, assert output.

```typescript
// Pattern 1: Zustand — inline selector
const userName = useStore((s) => s.user.name);
// Only re-renders when user.name changes (reference equality)

// Pattern 2: Zustand — multiple fields with useShallow
import { useShallow } from 'zustand/react/shallow';
const { name, email } = useStore(useShallow((s) => ({ name: s.user.name, email: s.user.email })));

// Pattern 3: Redux — createSelector for derived data
import { createSelector } from '@reduxjs/toolkit';

const selectTodos = (state: RootState) => state.todos.items;
const selectFilter = (state: RootState) => state.todos.filter;

const selectVisibleTodos = createSelector(
  [selectTodos, selectFilter],
  (todos, filter) => {
    if (filter === 'all') return todos;
    return todos.filter((t) => (filter === 'completed' ? t.completed : !t.completed));
  }
);

// Pattern 4: Jotai — derived atoms
const visibleTodosAtom = atom((get) => {
  const todos = get(todosAtom);
  const filter = get(filterAtom);
  return filter === 'all' ? todos : todos.filter((t) => t.completed === (filter === 'completed'));
});

// Pattern 5: useMemo for component-level derivations
function FilteredList({ filter }: { filter: string }) {
  const items = useStore((s) => s.items);
  const filtered = useMemo(
    () => items.filter((i) => i.category === filter),
    [items, filter]
  );
  return <List items={filtered} />;
}
```

## Details

**Why reference equality matters:** React and state libraries use `Object.is` (reference equality) to decide if a component should re-render. If your selector returns `todos.filter(...)`, it creates a new array on every call, even if the contents are identical. The component re-renders every time.

**Memoization strategies by library:**

| Library | Strategy              | Tool                        |
| ------- | --------------------- | --------------------------- |
| Redux   | Input memoization     | `createSelector` (Reselect) |
| Zustand | Shallow equality      | `useShallow`                |
| Jotai   | Atom dependency graph | Derived atoms               |
| React   | Component-level memo  | `useMemo`                   |

**Selector composition pattern:**

```typescript
// Base selectors (simple accessors)
const selectUsers = (state: RootState) => state.users.items;
const selectCurrentUserId = (state: RootState) => state.auth.userId;

// Composed selector (derived from base selectors)
const selectCurrentUser = createSelector([selectUsers, selectCurrentUserId], (users, userId) =>
  users.find((u) => u.id === userId)
);

// Further composition
const selectCurrentUserPosts = createSelector([selectCurrentUser, selectPosts], (user, posts) =>
  user ? posts.filter((p) => p.authorId === user.id) : []
);
```

**When NOT to memoize:** Primitive values (numbers, strings, booleans) are compared by value. `useStore((s) => s.count)` never creates a new reference — no memoization needed. Only memoize when the selector returns objects, arrays, or computes derived data.

**Performance debugging:** Use React DevTools Profiler to identify components that re-render unnecessarily. Check what selector results change between renders. Use `why-did-you-render` for automated detection.

## Source

https://react.dev/reference/react/useMemo
