# Redux Listener Middleware

> React to dispatched actions and state changes with createListenerMiddleware for structured side effects

## When to Use

- Running side effects in response to specific actions (analytics, logging, sync)
- Implementing "when X happens, do Y" reactive logic that does not fit in a reducer
- Replacing redux-saga or redux-observable with a simpler built-in alternative
- Coordinating cross-slice logic (when slice A changes, update slice B)

## Instructions

1. Create the listener middleware once with `createListenerMiddleware()`. Add it to the store via the `middleware` callback.
2. Use `startListening` to register listeners. Match actions with `actionCreator`, `type`, `matcher`, or `predicate`.
3. The `effect` callback receives the matched `action` and a `listenerApi` with `dispatch`, `getState`, `getOriginalState`, `condition`, `take`, `delay`, and more.
4. Use `listenerApi.condition()` to wait for a future state condition before continuing. Use `listenerApi.take()` to wait for a specific action.
5. Use `listenerApi.cancelActiveListeners()` at the start of the effect to debounce — cancels previous runs of the same listener.
6. Return or call `listenerApi.unsubscribe()` to remove the listener dynamically.

```typescript
// store/listenerMiddleware.ts
import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import { addTodo, toggleTodo } from '../features/todos/todos.slice';
import { RootState } from './index';

export const listenerMiddleware = createListenerMiddleware();

// Sync todos to localStorage whenever they change
listenerMiddleware.startListening({
  matcher: isAnyOf(addTodo, toggleTodo),
  effect: async (action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    localStorage.setItem('todos', JSON.stringify(state.todos.items));
  },
});

// Debounced search — cancel previous runs
listenerMiddleware.startListening({
  actionCreator: setSearchQuery,
  effect: async (action, listenerApi) => {
    // Cancel any in-progress instances of this listener
    listenerApi.cancelActiveListeners();
    // Debounce 300ms
    await listenerApi.delay(300);
    // If we get here, no new setSearchQuery was dispatched
    listenerApi.dispatch(fetchSearchResults(action.payload));
  },
});
```

```typescript
// store/index.ts
import { listenerMiddleware } from './listenerMiddleware';

export const store = configureStore({
  reducer: {
    /* ... */
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});
```

## Details

**Matching strategies:**

- `actionCreator` — exact action creator match (best TypeScript inference)
- `type` — string match on `action.type`
- `matcher` — any RTK matcher (`isAnyOf`, `isAllOf`, `isRejected`)
- `predicate` — `(action, currentState, previousState) => boolean` for state-based conditions

**condition and take:** These let you write multi-step async workflows:

```typescript
listenerMiddleware.startListening({
  actionCreator: startCheckout,
  effect: async (action, listenerApi) => {
    // Wait for payment to complete (or timeout after 60s)
    const [paymentAction] = await listenerApi.take(paymentCompleted.match, 60_000);
    if (paymentAction) {
      listenerApi.dispatch(finalizeOrder());
    } else {
      listenerApi.dispatch(checkoutTimedOut());
    }
  },
});
```

**Comparison with alternatives:**

- **Thunks:** Best for single async operations dispatched from components. Listeners are best for reactive "when X happens do Y" patterns.
- **Sagas:** Listeners cover most saga use cases without generators. Use sagas only if you need advanced concurrency patterns (races, forks, channels).
- **Observables:** Listeners handle serial async workflows well. Use RxJS only if you need complex stream composition.

**Prepend, not concat:** Use `.prepend(listenerMiddleware.middleware)` so listeners run before other middleware.

## Source

https://redux-toolkit.js.org/api/createListenerMiddleware
