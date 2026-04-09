# Redux Store Setup

> Configure the Redux store with configureStore, typed hooks, middleware, and Provider wiring

## When to Use

- Initializing Redux in a new React application
- Migrating from legacy `createStore` to Redux Toolkit's `configureStore`
- Adding custom middleware (logging, persistence, API layers)
- Setting up typed `useDispatch` and `useSelector` hooks

## Instructions

1. Create `store/index.ts` as the single store configuration file. Export the store, `RootState`, `AppDispatch`, and typed hooks from here.
2. Use `configureStore` — it automatically sets up Redux DevTools, thunk middleware, and the serializable check middleware.
3. Combine slice reducers in the `reducer` field. Do not use `combineReducers` separately unless you need reducer injection.
4. Define `RootState` and `AppDispatch` types from the store itself, not manually. This keeps types in sync as slices are added.
5. Create typed hooks (`useAppDispatch`, `useAppSelector`) once and import them everywhere instead of plain `useDispatch`/`useSelector`.
6. Wrap the app root with `<Provider store={store}>`.
7. Only add custom middleware via the `middleware` callback — never replace the defaults unless you have a specific reason.

```typescript
// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import todosReducer from '../features/todos/todos.slice';
import usersReducer from '../features/users/users.slice';

export const store = configureStore({
  reducer: {
    todos: todosReducer,
    users: usersReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore specific action paths if needed (e.g., for dates or file objects)
        ignoredActions: ['persist/PERSIST'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks — use these throughout the app
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

```typescript
// app entry point
import { Provider } from 'react-redux';
import { store } from './store';

function App() {
  return (
    <Provider store={store}>
      <Root />
    </Provider>
  );
}
```

## Details

**What configureStore does automatically:** Combines reducers, adds `redux-thunk`, enables Redux DevTools Extension, adds development-only middleware (serializable check, immutability check).

**Custom middleware:** The `middleware` callback receives `getDefaultMiddleware` which returns a `Tuple`. Chain custom middleware with `.concat()` — do not spread into an array.

```typescript
middleware: (getDefaultMiddleware) =>
  getDefaultMiddleware().concat(logger, apiMiddleware),
```

**Lazy-loaded reducer injection:** For code-split apps, use `store.replaceReducer()` or RTK's `combineSlices` (RTK 2.0+) for dynamic slice injection without upfront registration.

**Common mistakes:**

- Importing `store` directly in components (use hooks + Provider instead)
- Defining `RootState` manually instead of inferring from `store.getState`
- Disabling the serializable check globally instead of allowlisting specific paths
- Creating multiple store instances (breaks React-Redux's subscription model)

## Source

https://redux-toolkit.js.org/api/configureStore

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
