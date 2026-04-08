# Redux TypeScript Patterns

> Type Redux state, actions, thunks, and hooks with full inference and minimal manual annotation

## When to Use

- Setting up TypeScript types for a Redux Toolkit project
- Fixing type errors in slices, thunks, or connected components
- Adding type safety to `useDispatch` and `useSelector`
- Typing `extraReducers`, `createAsyncThunk`, or middleware

## Instructions

1. Infer `RootState` and `AppDispatch` from the store — never define them manually.
2. Create typed hooks once (`useAppDispatch`, `useAppSelector`) and use them everywhere.
3. Use `PayloadAction<T>` for reducer parameter types. RTK infers the rest from `createSlice`.
4. Type `createAsyncThunk` with three generic arguments: `<ReturnType, ArgType, ThunkApiConfig>`.
5. In `extraReducers`, use the builder callback — it provides full type inference for each case.
6. Use `isRejectedWithValue` type guard for narrowing rejection payloads.
7. Avoid `as` type assertions in reducers — if you need them, the type definition is wrong.

```typescript
// store/index.ts — inferred types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks — use throughout the app
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

```typescript
// Typed createAsyncThunk
interface FetchError {
  message: string;
  code: number;
}

export const fetchUser = createAsyncThunk<
  User,                                    // Fulfilled return type
  string,                                  // Argument type (userId)
  { state: RootState; rejectValue: FetchError }  // ThunkAPI config
>(
  'users/fetch',
  async (userId, { rejectWithValue }) => {
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok) {
      return rejectWithValue({ message: 'Not found', code: res.status });
    }
    return res.json();
  }
);

// extraReducers with full inference
extraReducers: (builder) => {
  builder
    .addCase(fetchUser.fulfilled, (state, action) => {
      // action.payload is User (inferred)
      state.currentUser = action.payload;
    })
    .addCase(fetchUser.rejected, (state, action) => {
      if (action.payload) {
        // action.payload is FetchError (from rejectWithValue)
        state.error = action.payload.message;
      } else {
        // action.error is SerializedError (thrown exception)
        state.error = action.error.message ?? 'Unknown error';
      }
    });
},
```

## Details

**ThunkAPI config object:** Pass `{ state: RootState; rejectValue: T; dispatch: AppDispatch }` as the third generic to `createAsyncThunk`. This types `getState()`, `rejectWithValue()`, and `dispatch()` inside the payload creator.

**Middleware typing:** Custom middleware receives `MiddlewareAPI<AppDispatch, RootState>`:

```typescript
const logger: Middleware<{}, RootState> = (storeApi) => (next) => (action) => {
  console.log('dispatching', action);
  return next(action);
};
```

**Entity adapter typing:** Pass the entity type to `createEntityAdapter<User>()`. The adapter methods and selectors are fully typed from this.

**Common type errors and fixes:**

- `Property does not exist on type` in `getState()` — add `state: RootState` to the thunk config
- `Argument not assignable to PayloadAction` — check that the action creator's prepare callback return type matches
- `Type instantiation is excessively deep` — usually from circular slice imports; break the cycle with a shared types file
- `Cannot use namespace as type` — import types with `import type` to avoid circular dependencies

**RTK 2.0 changes:** `Tuple` replaces arrays for middleware. `combineSlices` provides automatic type inference for lazy-loaded slices. The `reducer` field in `configureStore` accepts a `combineSlices` result directly.

## Source

https://redux-toolkit.js.org/usage/usage-with-typescript
