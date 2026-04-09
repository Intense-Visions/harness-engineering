# Redux Testing Patterns

> Test Redux slices, thunks, selectors, and connected components with focused, maintainable test strategies

## When to Use

- Writing unit tests for reducers, selectors, and thunks
- Integration testing components that read from or dispatch to the store
- Setting up a `renderWithProviders` utility for Redux-connected component tests
- Testing RTK Query endpoints with MSW or manual mocking

## Instructions

1. **Test reducers directly** by calling `slice.reducer(initialState, action)`. No store needed.
2. **Test selectors as pure functions** by passing mock `RootState` objects.
3. **Test thunks** by creating a real store with `configureStore` and dispatching the thunk. Assert on the resulting state, not on dispatched actions.
4. **Test components** using a `renderWithProviders` wrapper that creates a real store with preloaded state. Prefer this over mock stores.
5. **Test RTK Query** endpoints with MSW (Mock Service Worker) to intercept network requests. Let RTK Query hooks run against a real store.
6. Never test Redux internals — test behavior. "When I dispatch addTodo, the list contains the new todo."

```typescript
// test-utils.tsx — renderWithProviders
import { render, RenderOptions } from '@testing-library/react';
import { configureStore, PreloadedState } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { RootState } from './store';
import todosReducer from './features/todos/todos.slice';

function setupStore(preloadedState?: PreloadedState<RootState>) {
  return configureStore({
    reducer: { todos: todosReducer },
    preloadedState,
  });
}

type AppStore = ReturnType<typeof setupStore>;

interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: PreloadedState<RootState>;
  store?: AppStore;
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    preloadedState,
    store = setupStore(preloadedState),
    ...renderOptions
  }: ExtendedRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
```

```typescript
// features/todos/todos.slice.test.ts
import todosReducer, { addTodo, toggleTodo } from './todos.slice';

describe('todosSlice', () => {
  it('adds a todo', () => {
    const state = todosReducer(undefined, addTodo('Write tests'));
    expect(state.items).toHaveLength(1);
    expect(state.items[0].title).toBe('Write tests');
    expect(state.items[0].completed).toBe(false);
  });

  it('toggles a todo', () => {
    const initial = todosReducer(undefined, addTodo('Write tests'));
    const id = initial.items[0].id;
    const state = todosReducer(initial, toggleTodo(id));
    expect(state.items[0].completed).toBe(true);
  });
});
```

## Details

**Reducer tests** are the simplest — they are pure functions. Pass state and action, assert on the returned state. No mocking needed.

**Selector tests:** Create minimal `RootState` objects. Only populate the fields the selector reads:

```typescript
it('filters active todos', () => {
  const state = {
    todos: { items: [{ id: '1', title: 'A', completed: false }], filter: 'active' },
  } as RootState;
  expect(selectFilteredTodos(state)).toHaveLength(1);
});
```

**Thunk tests:** Use a real store, not `redux-mock-store`. Dispatch the thunk and assert on the resulting state:

```typescript
it('fetches users', async () => {
  // MSW intercepts the /api/users request
  const store = setupStore();
  await store.dispatch(fetchUsers());
  expect(selectAllUsers(store.getState())).toHaveLength(3);
});
```

**RTK Query tests:** Use MSW to intercept requests. Render the component that uses the query hook with `renderWithProviders`. Wait for the loading state to resolve:

```typescript
it('displays users from API', async () => {
  const { getByText } = renderWithProviders(<UserList />);
  expect(await screen.findByText('Alice')).toBeInTheDocument();
});
```

**Anti-patterns:**

- Using `redux-mock-store` — it cannot run reducers, so you cannot assert on state
- Testing action types or action creators in isolation — test behavior through reducers instead
- Snapshot testing Redux state — brittle and provides no semantic assertions

## Source

https://redux.js.org/usage/writing-tests

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
