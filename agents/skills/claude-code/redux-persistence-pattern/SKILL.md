# Redux Persistence Pattern

> Persist and rehydrate Redux state across browser sessions with redux-persist or manual localStorage strategies

## When to Use

- Preserving user preferences, cart items, or draft content across page reloads
- Implementing offline-first features that need state survival
- Selectively persisting some slices while keeping others ephemeral
- Migrating persisted state when the schema changes between app versions

## Instructions

1. Choose between `redux-persist` (full library) or manual persistence (listener middleware + localStorage). Use `redux-persist` for complex needs (transforms, migrations, multiple storage engines). Use manual for simple cases.
2. **With redux-persist:** Wrap the root reducer with `persistReducer`, create a `persistor`, and wrap the app with `PersistGate`.
3. Use a `whitelist` or `blacklist` to control which slices are persisted. Default to whitelist (explicit opt-in).
4. Add `FLUSH`, `REHYDRATE`, `PAUSE`, `PERSIST`, `PURGE`, `REGISTER` to the serializable check ignore list — these are internal redux-persist actions.
5. Use `createMigrate` when the persisted state schema changes between versions.
6. **Manual approach:** Use the listener middleware to write specific state to localStorage on change, and `preloadedState` in `configureStore` to rehydrate on startup.

```typescript
// redux-persist approach
import { configureStore } from '@reduxjs/toolkit';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from '@reduxjs/toolkit';
import todosReducer from './features/todos/todos.slice';
import uiReducer from './features/ui/ui.slice';

const persistConfig = {
  key: 'root',
  version: 1,
  storage,
  whitelist: ['todos'], // Only persist todos, not UI state
};

const rootReducer = combineReducers({
  todos: todosReducer,
  ui: uiReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);
```

```typescript
// App entry
import { PersistGate } from 'redux-persist/integration/react';
import { persistor, store } from './store';

function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={<Spinner />} persistor={persistor}>
        <Root />
      </PersistGate>
    </Provider>
  );
}
```

## Details

**Manual persistence** (simpler, no extra dependency):

```typescript
// Rehydrate on startup
const preloadedTodos = JSON.parse(localStorage.getItem('todos') ?? 'null');
const store = configureStore({
  reducer: { todos: todosReducer },
  preloadedState: preloadedTodos ? { todos: preloadedTodos } : undefined,
});

// Persist on change via listener middleware
listenerMiddleware.startListening({
  predicate: (action, currentState, previousState) => currentState.todos !== previousState.todos,
  effect: (action, listenerApi) => {
    localStorage.setItem('todos', JSON.stringify((listenerApi.getState() as RootState).todos));
  },
});
```

**State migrations:** When adding or renaming fields between app versions:

```typescript
const migrations = {
  1: (state: any) => ({ ...state, newField: 'default' }),
  2: (state: any) => {
    const { removedField, ...rest } = state;
    return rest;
  },
};

const persistConfig = {
  key: 'root',
  version: 2,
  storage,
  migrate: createMigrate(migrations),
};
```

**Storage engines:** `redux-persist/lib/storage` uses localStorage. For React Native, use `@react-native-async-storage/async-storage`. For session-only persistence, use `redux-persist/lib/storage/session`.

**What NOT to persist:** Loading states, error messages, ephemeral UI state (modals, tooltips), data that should be fresh from the server.

## Source

https://github.com/rt2zz/redux-persist
