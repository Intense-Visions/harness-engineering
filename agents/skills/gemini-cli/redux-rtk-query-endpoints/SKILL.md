# RTK Query Endpoints

> Define query and mutation endpoints with cache tag invalidation, response transformation, and auto-generated hooks

## When to Use

- Adding new API endpoints to an existing RTK Query service
- Implementing CRUD operations with automatic cache invalidation
- Transforming API responses before they reach components
- Setting up pagination, polling, or conditional fetching

## Instructions

1. Use `builder.query` for read operations (GET) and `builder.mutation` for write operations (POST/PUT/DELETE).
2. Provide generic type arguments: `builder.query<ReturnType, ArgType>`. Use `void` when there is no argument.
3. Use `providesTags` on queries to declare what cache entries they populate. Use both list-level and item-level tags.
4. Use `invalidatesTags` on mutations to declare what cache entries to refetch after the mutation succeeds.
5. Use `transformResponse` to reshape API responses before caching — extract nested data, normalize structures.
6. Use `injectEndpoints` from feature modules to keep endpoints co-located with their feature code.
7. Export the auto-generated hooks. Queries produce `useXQuery` and `useLazyXQuery`; mutations produce `useXMutation`.

```typescript
// features/posts/posts.api.ts
import { api } from '../../services/api';

interface Post {
  id: string;
  title: string;
  body: string;
  authorId: string;
}

const postsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getPosts: builder.query<Post[], { page: number }>({
      query: ({ page }) => `/posts?page=${page}`,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Post' as const, id })),
              { type: 'Post', id: 'LIST' },
            ]
          : [{ type: 'Post', id: 'LIST' }],
    }),

    getPost: builder.query<Post, string>({
      query: (id) => `/posts/${id}`,
      providesTags: (result, error, id) => [{ type: 'Post', id }],
    }),

    createPost: builder.mutation<Post, Omit<Post, 'id'>>({
      query: (body) => ({ url: '/posts', method: 'POST', body }),
      invalidatesTags: [{ type: 'Post', id: 'LIST' }],
    }),

    updatePost: builder.mutation<Post, Pick<Post, 'id'> & Partial<Post>>({
      query: ({ id, ...patch }) => ({ url: `/posts/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Post', id }],
    }),

    deletePost: builder.mutation<void, string>({
      query: (id) => ({ url: `/posts/${id}`, method: 'DELETE' }),
      invalidatesTags: (result, error, id) => [
        { type: 'Post', id },
        { type: 'Post', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetPostsQuery,
  useGetPostQuery,
  useCreatePostMutation,
  useUpdatePostMutation,
  useDeletePostMutation,
} = postsApi;
```

## Details

**Tag strategy:** Use a `'LIST'` sentinel ID for collection queries. Individual item queries use the actual ID. Mutations that add/remove items invalidate `'LIST'` to refetch collections. Mutations that edit items invalidate only that item's tag.

**transformResponse:** Reshape before caching:

```typescript
getUsers: builder.query<User[], void>({
  query: () => '/users',
  transformResponse: (response: { data: User[]; meta: unknown }) => response.data,
}),
```

**Polling and refetching:**

```typescript
// In component
const { data } = useGetPostsQuery({ page: 1 }, { pollingInterval: 30000 });

// Refetch on window focus — enabled globally via setupListeners(store.dispatch)
```

**Pagination pattern:** RTK Query caches each argument combination separately. For `page: 1` and `page: 2`, two cache entries exist. Use `serializeQueryArgs` + `merge` + `forceRefetch` for infinite scroll:

```typescript
getPosts: builder.query<Post[], number>({
  query: (page) => `/posts?page=${page}`,
  serializeQueryArgs: ({ endpointName }) => endpointName,
  merge: (currentCache, newItems) => { currentCache.push(...newItems); },
  forceRefetch: ({ currentArg, previousArg }) => currentArg !== previousArg,
}),
```

## Source

https://redux-toolkit.js.org/rtk-query/usage/queries
