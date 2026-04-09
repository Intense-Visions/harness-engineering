# Server-Client State Sync

> Separate server state from client state and synchronize them with TanStack Query and local stores

## When to Use

- Managing data fetched from APIs alongside local UI state
- Needing stale-while-revalidate caching for server data
- Avoiding duplicating server data into Redux/Zustand stores
- Handling optimistic updates that reconcile with server responses

## Instructions

1. **Separate concerns:** Server state (data from APIs) belongs in TanStack Query (React Query). Client state (UI preferences, form drafts, local selections) belongs in Zustand, Jotai, or Context.
2. Use `useQuery` for read operations. The query key uniquely identifies the data.
3. Use `useMutation` for write operations. Invalidate related queries on success.
4. Do NOT copy server data into a client store. Query the cache directly or use the query hook.
5. When server state and client state must combine (e.g., a list from the API filtered by a local search term), keep them in their respective systems and compose in the component.
6. Use `queryClient.setQueryData` for optimistic updates. Roll back with `onError`.

```typescript
// hooks/use-todos.ts — server state via TanStack Query
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export function useTodos() {
  return useQuery({
    queryKey: ['todos'],
    queryFn: async (): Promise<Todo[]> => {
      const res = await fetch('/api/todos');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
  });
}

export function useToggleTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
      return res.json();
    },
    // Optimistic update
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });
      const previous = queryClient.getQueryData<Todo[]>(['todos']);
      queryClient.setQueryData<Todo[]>(['todos'], (old) =>
        old?.map((t) => (t.id === id ? { ...t, completed } : t))
      );
      return { previous };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(['todos'], context?.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });
}
```

```typescript
// stores/ui-store.ts — client state via Zustand
import { create } from 'zustand';

interface UIStore {
  searchTerm: string;
  filterCompleted: boolean | null;
  setSearchTerm: (term: string) => void;
  setFilterCompleted: (filter: boolean | null) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  searchTerm: '',
  filterCompleted: null,
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  setFilterCompleted: (filterCompleted) => set({ filterCompleted }),
}));
```

```typescript
// Component — composing server + client state
function TodoList() {
  const { data: todos = [], isLoading } = useTodos();
  const searchTerm = useUIStore((s) => s.searchTerm);
  const filterCompleted = useUIStore((s) => s.filterCompleted);

  const filtered = useMemo(() => {
    let result = todos;
    if (searchTerm) result = result.filter((t) => t.title.includes(searchTerm));
    if (filterCompleted !== null) result = result.filter((t) => t.completed === filterCompleted);
    return result;
  }, [todos, searchTerm, filterCompleted]);

  if (isLoading) return <Spinner />;
  return filtered.map((todo) => <TodoItem key={todo.id} todo={todo} />);
}
```

## Details

**The separation principle:** Server state is async, cached, shared, and can become stale. Client state is synchronous, local, and always fresh. Mixing them (copying API data into Redux) creates synchronization bugs. Let TanStack Query own server state; let your client store own UI state.

**When you need both together:** Compose in the component layer. The component reads from both sources and combines them. This keeps each system simple and avoids double-caching.

**Query invalidation strategy:**

- `invalidateQueries({ queryKey: ['todos'] })` — mark as stale, refetch if mounted
- `queryClient.setQueryData` — update cache directly (optimistic updates)
- `refetchQueries` — force immediate refetch regardless of staleness

**Background refetching:** TanStack Query refetches stale data on window focus, on reconnect, and on interval (configurable). This keeps server state fresh without manual polling.

**Anti-patterns:**

- Storing fetched data in Zustand/Redux and using it instead of the query cache
- Using `useEffect` + `useState` for data fetching (TanStack Query replaces this)
- Invalidating every query after every mutation (be surgical with query keys)

## Source

https://tanstack.com/query/latest/docs/framework/react/overview

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
