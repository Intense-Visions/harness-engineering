# RTK Query Setup

> Configure RTK Query with createApi and fetchBaseQuery for automatic caching, deduplication, and loading state management

## When to Use

- Adding data fetching to a Redux Toolkit application
- Replacing hand-written thunks + loading/error state with a declarative API layer
- Needing automatic request deduplication, caching, and cache invalidation
- Building CRUD interfaces with REST or GraphQL backends

## Instructions

1. Create one API service per backend base URL. Place it in `services/api.ts` or `api/baseApi.ts`.
2. Use `fetchBaseQuery` as the base query — it wraps `fetch` with sensible defaults and automatic header handling.
3. Set `baseUrl` to the API root. Use `prepareHeaders` to inject auth tokens.
4. Define `tagTypes` upfront for all cacheable entity types — these drive automatic invalidation.
5. Start with an empty `endpoints` builder and inject endpoints from feature slices using `injectEndpoints`.
6. Add the API's reducer to the store under `[api.reducerPath]` and add `api.middleware` to the middleware chain.
7. Export auto-generated hooks from the API definition.

```typescript
// services/api.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1',
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) headers.set('Authorization', `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ['User', 'Post', 'Comment'],
  endpoints: () => ({}), // Injected by feature modules
});
```

```typescript
// store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { api } from '../services/api';

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    // ...other slices
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});
```

## Details

**Why one API per base URL:** RTK Query normalizes cache keys per API instance. Multiple APIs hitting the same backend fragment the cache and break invalidation. Split APIs only for genuinely different backends.

**fetchBaseQuery vs custom baseQuery:** `fetchBaseQuery` handles JSON serialization, error normalization, and timeout. For custom needs (Axios, retry logic, reauthentication), wrap it:

```typescript
const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await fetchBaseQuery({ baseUrl: '/api' })(args, api, extraOptions);
  if (result.error?.status === 401) {
    const refreshResult = await fetchBaseQuery({ baseUrl: '/api' })(
      { url: '/auth/refresh', method: 'POST' },
      api,
      extraOptions
    );
    if (refreshResult.data) {
      result = await fetchBaseQuery({ baseUrl: '/api' })(args, api, extraOptions);
    }
  }
  return result;
};
```

**Endpoint injection pattern:** Keeps the base API slim and lets features own their endpoints:

```typescript
// features/users/users.api.ts
import { api } from '../../services/api';

const usersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query({ query: () => '/users', providesTags: ['User'] }),
  }),
});

export const { useGetUsersQuery } = usersApi;
```

**Common mistakes:**

- Forgetting to add `api.middleware` (breaks polling, cache lifetime, and refetchOnFocus)
- Using a string literal for `reducerPath` that does not match the store key
- Creating multiple `createApi` instances for the same backend

## Source

https://redux-toolkit.js.org/rtk-query/overview

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
