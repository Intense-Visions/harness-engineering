# Redux Selectors Pattern

> Derive and memoize computed state with createSelector to avoid redundant calculations and unnecessary re-renders

## When to Use

- Computing derived data from Redux state (filtered lists, totals, lookups)
- Preventing re-renders caused by creating new array/object references on every selector call
- Composing complex selectors from simpler building blocks
- Parameterizing selectors (e.g., select items by category)

## Instructions

1. Co-locate simple selectors with the slice that owns the state. Export them from the slice file.
2. Use `createSelector` from `@reduxjs/toolkit` (re-exported from Reselect) for any computation that produces derived data.
3. Input selectors should be simple property accessors — no computation. Only the result function should do work.
4. Compose selectors by passing other selectors as inputs. Never reach into `state.someSlice.nested.field` from outside the slice boundary.
5. For parameterized selectors, create a factory function that returns a new selector per parameter value.
6. Keep the selector return type stable — returning a new array/object reference defeats memoization.

```typescript
// features/todos/todos.selectors.ts
import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../../store';

// Simple selectors (no memoization needed)
const selectTodosState = (state: RootState) => state.todos;
export const selectAllTodos = (state: RootState) => state.todos.items;
export const selectFilter = (state: RootState) => state.todos.filter;

// Memoized derived selector
export const selectFilteredTodos = createSelector(
  [selectAllTodos, selectFilter],
  (todos, filter) => {
    switch (filter) {
      case 'active':
        return todos.filter((t) => !t.completed);
      case 'completed':
        return todos.filter((t) => t.completed);
      default:
        return todos;
    }
  }
);

// Composed selector
export const selectTodoStats = createSelector([selectAllTodos], (todos) => ({
  total: todos.length,
  completed: todos.filter((t) => t.completed).length,
  active: todos.filter((t) => !t.completed).length,
}));

// Parameterized selector factory
export const makeSelectTodoById = (id: string) =>
  createSelector([selectAllTodos], (todos) => todos.find((t) => t.id === id));
```

## Details

**How memoization works:** `createSelector` caches the last result. If all input selectors return the same references as last time, the result function is skipped and the cached result is returned. This is reference equality, not deep equality.

**Common memoization mistakes:**

- Inline `createSelector` inside a component — creates a new selector instance on every render, defeating memoization. Move selectors outside components or use `useMemo`.
- Input selectors that do computation — the result function is skipped only when inputs are referentially equal. If an input selector creates a new object, memoization never works.
- Returning `items.filter(...)` from a simple selector (not `createSelector`) — creates a new array every time, causing re-renders.

**Per-component memoization:** When multiple component instances need the same parameterized selector with different args, use a factory with `useMemo`:

```typescript
function TodoItem({ id }: { id: string }) {
  const selectTodo = useMemo(() => makeSelectTodoById(id), [id]);
  const todo = useAppSelector(selectTodo);
  // Each TodoItem has its own memoized selector
}
```

**Reselect 5.0+ (RTK 2.0+):** Supports `createSelector` with custom equality checks and `weakMapMemoize` for multi-argument caching without factories.

**Testing selectors:** Test them as pure functions — pass in a mock `RootState` and assert the output. They are the easiest Redux code to test.

## Source

https://redux-toolkit.js.org/api/createSelector
