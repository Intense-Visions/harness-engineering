# Redux Slice Pattern

> Organize Redux state into self-contained slices using createSlice for co-located reducers, actions, and selectors

## When to Use

- Creating a new domain of state in a Redux Toolkit application
- Refactoring legacy Redux code that uses separate action constants, action creators, and reducers
- Adding CRUD operations for a resource (users, posts, products)
- Needing Immer-powered immutable updates without boilerplate

## Instructions

1. One slice per domain concern. Name the file `<domain>.slice.ts` and keep it in `slices/` or `features/<domain>/`.
2. Define the interface for the slice state explicitly — never rely on inference from `initialState` alone.
3. Use `createSlice` with a unique `name` that matches the store key. This name prefixes all generated action types.
4. Write reducers as mutating logic — Immer converts them to immutable updates. Never return **and** mutate in the same reducer.
5. Export the generated action creators and the reducer separately. Export selectors from the same file.
6. Use `prepare` callbacks when actions need payload transformation (adding IDs, timestamps, normalization).
7. Handle related async actions from thunks via `extraReducers` using the builder callback pattern — never the object notation (it is deprecated).

```typescript
// features/todos/todos.slice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

interface TodosState {
  items: Todo[];
  filter: 'all' | 'active' | 'completed';
}

const initialState: TodosState = {
  items: [],
  filter: 'all',
};

const todosSlice = createSlice({
  name: 'todos',
  initialState,
  reducers: {
    addTodo: {
      reducer(state, action: PayloadAction<Todo>) {
        state.items.push(action.payload);
      },
      prepare(title: string) {
        return { payload: { id: crypto.randomUUID(), title, completed: false } };
      },
    },
    toggleTodo(state, action: PayloadAction<string>) {
      const todo = state.items.find((t) => t.id === action.payload);
      if (todo) todo.completed = !todo.completed;
    },
    setFilter(state, action: PayloadAction<TodosState['filter']>) {
      state.filter = action.payload;
    },
  },
});

export const { addTodo, toggleTodo, setFilter } = todosSlice.actions;
export default todosSlice.reducer;

// Co-located selectors
export const selectTodos = (state: { todos: TodosState }) => state.todos.items;
export const selectFilter = (state: { todos: TodosState }) => state.todos.filter;
```

## Details

**Immer rules:** You can either mutate `state` directly or return a new value — never both. Returning `undefined` is not the same as not returning; if you need a no-op, just don't write a return statement.

**Naming conventions:** The `name` field in `createSlice` becomes the action type prefix (`todos/addTodo`). Keep it short, lowercase, and matching the store mount point.

**extraReducers vs reducers:** Use `reducers` for actions owned by this slice. Use `extraReducers` for actions owned elsewhere (thunks, other slices). The builder callback pattern provides full TypeScript inference:

```typescript
extraReducers: (builder) => {
  builder
    .addCase(fetchTodos.fulfilled, (state, action) => {
      state.items = action.payload;
    })
    .addCase(fetchTodos.rejected, (state, action) => {
      state.error = action.error.message ?? 'Failed';
    });
};
```

**Anti-patterns to avoid:**

- Putting derived data in state (compute it in selectors instead)
- Giant slices that own unrelated concerns (split them)
- Using the deprecated object map notation for `extraReducers`
- Forgetting to export actions (leads to silent bugs where dispatches do nothing)

## Source

https://redux-toolkit.js.org/api/createSlice
