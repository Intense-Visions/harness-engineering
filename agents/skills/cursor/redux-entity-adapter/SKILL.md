# Redux Entity Adapter

> Normalize entity collections with createEntityAdapter for O(1) lookups and pre-built CRUD reducers

## When to Use

- Managing a collection of items with unique IDs (users, products, messages)
- Needing O(1) lookup by ID instead of array scanning
- Wanting pre-built `addOne`, `updateOne`, `removeOne` reducers without writing them manually
- Keeping collections sorted without re-sorting on every render

## Instructions

1. Create the adapter with `createEntityAdapter<Entity>()`. Provide `selectId` if the ID field is not `id`, and `sortComparer` if the collection should be kept sorted.
2. Use `adapter.getInitialState()` to generate the initial `{ ids: [], entities: {} }` shape. Pass additional state fields as an argument.
3. Use adapter CRUD methods directly as case reducers in `createSlice`, or call them inside reducer functions.
4. Use `adapter.getSelectors()` to generate `selectAll`, `selectById`, `selectIds`, `selectEntities`, and `selectTotal`.
5. Prefer `upsertMany` for bulk operations (API responses) — it adds new entities and updates existing ones.

```typescript
// features/users/users.slice.ts
import { createSlice, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../store';
import { fetchUsers } from './users.thunks';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
}

const usersAdapter = createEntityAdapter<User>({
  sortComparer: (a, b) => a.name.localeCompare(b.name),
});

interface UsersExtraState {
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState = usersAdapter.getInitialState<UsersExtraState>({
  status: 'idle',
  error: null,
});

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    userAdded: usersAdapter.addOne,
    userUpdated: usersAdapter.updateOne,
    userRemoved: usersAdapter.removeOne,
    usersCleared: usersAdapter.removeAll,
  },
  extraReducers: (builder) => {
    builder.addCase(fetchUsers.fulfilled, (state, action) => {
      usersAdapter.upsertMany(state, action.payload);
      state.status = 'succeeded';
    });
  },
});

export const { userAdded, userUpdated, userRemoved, usersCleared } = usersSlice.actions;
export default usersSlice.reducer;

// Selectors — pass the slice state selector to scope them
export const {
  selectAll: selectAllUsers,
  selectById: selectUserById,
  selectIds: selectUserIds,
  selectTotal: selectTotalUsers,
} = usersAdapter.getSelectors<RootState>((state) => state.users);
```

## Details

**Normalized shape:** The adapter stores `{ ids: string[], entities: Record<string, Entity> }`. The `ids` array controls display order; `entities` provides O(1) lookup. This is the same normalization pattern from the `normalizr` library.

**CRUD methods:** Each method has single and batch variants:

- `addOne` / `addMany` — insert if not present, no-op if ID exists
- `setOne` / `setMany` / `setAll` — replace entirely (add or overwrite)
- `upsertOne` / `upsertMany` — add or shallow merge
- `updateOne` / `updateMany` — apply a partial update to an existing entity (uses `{ id, changes }`)
- `removeOne` / `removeMany` / `removeAll`

**updateOne shape:** Pass `{ id: string, changes: Partial<Entity> }`, not the full entity:

```typescript
dispatch(userUpdated({ id: '1', changes: { name: 'New Name' } }));
```

**Custom ID field:** If your entity uses `_id` or `uuid` instead of `id`:

```typescript
const adapter = createEntityAdapter<Entity>({ selectId: (entity) => entity._id });
```

**Sorting:** `sortComparer` keeps `ids` sorted after every CRUD operation. Omit it if sort order does not matter — unsorted is faster for large collections.

## Source

https://redux-toolkit.js.org/api/createEntityAdapter

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
