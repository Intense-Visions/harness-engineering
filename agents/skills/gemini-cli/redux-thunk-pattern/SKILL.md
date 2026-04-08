# Redux Thunk Pattern

> Handle async operations with createAsyncThunk for structured pending/fulfilled/rejected lifecycle management

## When to Use

- Fetching data from an API and storing it in Redux state
- Performing async operations that need loading/error state tracking
- Dispatching multiple actions in sequence (fetch then transform)
- When RTK Query is overkill (simple one-off fetches, non-REST operations)

## Instructions

1. Define thunks with `createAsyncThunk` using a descriptive action type prefix: `'<slice>/<operation>'`.
2. The payload creator receives two arguments: the single argument passed to `dispatch(thunk(arg))`, and `thunkAPI` which provides `dispatch`, `getState`, `rejectWithValue`, and `signal`.
3. Always use `rejectWithValue` for known error shapes — it gives the reducer a typed payload instead of a serialized error.
4. Handle all three lifecycle actions (`pending`, `fulfilled`, `rejected`) in the slice's `extraReducers`.
5. Track loading state with an enum (`'idle' | 'loading' | 'succeeded' | 'failed'`) rather than separate booleans.
6. Use `condition` to prevent duplicate fetches — return `false` to skip execution.
7. Use `thunkAPI.signal` to support cancellation via `AbortController`.

```typescript
// features/users/users.thunks.ts
import { createAsyncThunk } from '@reduxjs/toolkit';
import { RootState } from '../../store';

interface User {
  id: string;
  name: string;
  email: string;
}

export const fetchUsers = createAsyncThunk<
  User[], // Return type
  void, // Argument type
  { state: RootState; rejectValue: string }
>(
  'users/fetchAll',
  async (_, { rejectWithValue, signal }) => {
    const response = await fetch('/api/users', { signal });
    if (!response.ok) {
      return rejectWithValue(`Failed: ${response.status}`);
    }
    return response.json();
  },
  {
    condition: (_, { getState }) => {
      const { status } = getState().users;
      // Don't fetch if already loading or loaded
      return status === 'idle' || status === 'failed';
    },
  }
);
```

```typescript
// features/users/users.slice.ts — extraReducers
extraReducers: (builder) => {
  builder
    .addCase(fetchUsers.pending, (state) => {
      state.status = 'loading';
      state.error = null;
    })
    .addCase(fetchUsers.fulfilled, (state, action) => {
      state.status = 'succeeded';
      state.items = action.payload;
    })
    .addCase(fetchUsers.rejected, (state, action) => {
      state.status = 'failed';
      state.error = action.payload ?? action.error.message ?? 'Unknown error';
    });
},
```

## Details

**Thunk lifecycle:** Dispatching a thunk returns a promise. The thunk dispatches `pending` immediately, then `fulfilled` or `rejected` when the async work completes. The returned promise resolves with the action object in all cases (even rejection).

**Unwrapping results:** Use `.unwrap()` to get the payload directly or throw on rejection — useful in component handlers:

```typescript
try {
  const users = await dispatch(fetchUsers()).unwrap();
  showSuccess(`Loaded ${users.length} users`);
} catch (err) {
  showError(err as string);
}
```

**Cancellation:** When the component unmounts, abort the thunk:

```typescript
useEffect(() => {
  const promise = dispatch(fetchUsers());
  return () => promise.abort();
}, [dispatch]);
```

**When to use RTK Query instead:** If you have a REST/GraphQL API with standard CRUD, caching, polling, or optimistic updates, RTK Query handles all of this automatically. Use `createAsyncThunk` for non-standard async work (WebSocket messages, file uploads, multi-step workflows).

## Source

https://redux-toolkit.js.org/api/createAsyncThunk
