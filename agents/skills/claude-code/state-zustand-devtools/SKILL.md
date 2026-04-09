# Zustand DevTools

> Debug Zustand stores with Redux DevTools integration for time-travel debugging and action inspection

## When to Use

- Debugging state changes in development — seeing what changed and when
- Tracing which action caused an unexpected state update
- Time-travel debugging to replay state transitions
- Inspecting store state without adding console.log statements

## Instructions

1. Wrap the store creator with the `devtools` middleware from `zustand/middleware`.
2. Pass a `name` option to identify the store in the DevTools panel (especially when using multiple stores).
3. Name your actions by passing a string as the third argument to `set()` — this shows descriptive action names instead of "anonymous".
4. When combining with other middleware, `devtools` should be the outermost wrapper.
5. Disable in production with a conditional or rely on the middleware's built-in `enabled` option.

```typescript
// stores/todo-store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface TodoStore {
  todos: Array<{ id: string; text: string; done: boolean }>;
  addTodo: (text: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
}

export const useTodoStore = create<TodoStore>()(
  devtools(
    (set) => ({
      todos: [],
      addTodo: (text) =>
        set(
          (state) => ({
            todos: [...state.todos, { id: crypto.randomUUID(), text, done: false }],
          }),
          false, // replace: false (default merge behavior)
          'todos/addTodo' // Action name shown in DevTools
        ),
      toggleTodo: (id) =>
        set(
          (state) => ({
            todos: state.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
          }),
          false,
          'todos/toggleTodo'
        ),
      removeTodo: (id) =>
        set(
          (state) => ({ todos: state.todos.filter((t) => t.id !== id) }),
          false,
          'todos/removeTodo'
        ),
    }),
    { name: 'TodoStore', enabled: process.env.NODE_ENV === 'development' }
  )
);
```

## Details

**Middleware stacking order:** When combining multiple middlewares, order matters. The outermost middleware wraps everything:

```typescript
// Correct order: devtools > persist > immer (outermost to innermost)
create<Store>()(
  devtools(
    persist(
      immer((set) => ({
        /* ... */
      })),
      { name: 'storage-key' }
    ),
    { name: 'StoreName' }
  )
);
```

**Named actions:** The third argument to `set(state, replace, actionName)` appears in the Redux DevTools action log. Without it, every action shows as "anonymous" which makes debugging difficult. Use a `slice/action` naming convention.

**Multiple stores:** Each store with `devtools` appears as a separate instance in the Redux DevTools dropdown. Use distinct `name` values.

**Time-travel debugging:** Redux DevTools supports jumping to any previous state. This works with Zustand's devtools middleware — clicking a past action restores the store to that point.

**Production safety:** Either use `enabled: false` in production or strip the middleware entirely:

```typescript
const middlewares = (f: StateCreator<Store>) =>
  process.env.NODE_ENV === 'development' ? devtools(f, { name: 'Store' }) : f;

export const useStore = create<Store>()(
  middlewares((set) => ({
    /* ... */
  }))
);
```

## Source

https://zustand.docs.pmnd.rs/middlewares/devtools

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
