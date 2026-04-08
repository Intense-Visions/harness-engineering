# Mobile Network Patterns

> Handle network requests, offline support, caching, and connectivity monitoring in React Native

## When to Use

- Setting up API communication in a React Native app
- Implementing offline-first or offline-tolerant behavior
- Caching API responses for instant loading
- Monitoring network connectivity and adapting UI
- Implementing retry logic and optimistic updates

## Instructions

1. **Use TanStack Query (React Query) for server state management.** It handles caching, background refetching, retry logic, and offline support out of the box.

```bash
npm install @tanstack/react-query
```

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Navigation />
    </QueryClientProvider>
  );
}
```

2. **Create typed API hooks with TanStack Query.**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async (): Promise<Order[]> => {
      const response = await fetch(`${API_URL}/orders`);
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
  });
}

function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const response = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('Failed to create order');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
```

3. **Monitor network connectivity with `@react-native-community/netinfo`.**

```bash
npx expo install @react-native-community/netinfo
```

```typescript
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// Integrate with TanStack Query — pauses queries when offline
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

// Use in components
function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsConnected(!!state.isConnected);
    });
  }, []);

  return isConnected;
}
```

4. **Persist query cache for offline-first behavior.**

```typescript
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'REACT_QUERY_CACHE',
});

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      <Navigation />
    </PersistQueryClientProvider>
  );
}
```

5. **Implement optimistic updates for responsive mutations.**

```typescript
function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (productId: string) =>
      fetch(`${API_URL}/favorites/${productId}`, { method: 'POST' }),
    onMutate: async (productId) => {
      await queryClient.cancelQueries({ queryKey: ['product', productId] });
      const previous = queryClient.getQueryData<Product>(['product', productId]);

      queryClient.setQueryData<Product>(['product', productId], (old) =>
        old ? { ...old, isFavorite: !old.isFavorite } : old
      );

      return { previous };
    },
    onError: (_err, productId, context) => {
      queryClient.setQueryData(['product', productId], context?.previous);
    },
    onSettled: (_data, _err, productId) => {
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}
```

6. **Build an API client with interceptors for auth and error handling.**

```typescript
class ApiClient {
  private baseUrl: string;
  private getToken: () => Promise<string | null>;

  constructor(baseUrl: string, getToken: () => Promise<string | null>) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Trigger token refresh or logout
      throw new AuthError('Session expired');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ApiError(response.status, error.message ?? 'Request failed');
    }

    return response.json();
  }
}
```

7. **Show connectivity status in the UI.**

```tsx
function OfflineBanner() {
  const isConnected = useNetworkStatus();

  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>You are offline. Some features may be limited.</Text>
    </View>
  );
}
```

8. **Implement request timeout for mobile networks.** Mobile connections can hang without failing. Add explicit timeouts.

```typescript
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
```

## Details

**Offline strategy spectrum:**

- **Online-only:** Show error when offline. Simplest, appropriate for real-time apps.
- **Cache-then-network:** Show cached data immediately, fetch fresh data in background. Good for content apps.
- **Offline-first:** Full local database with sync. Complex but provides the best UX for productivity apps.

**TanStack Query network modes:**

- `online` (default): Queries pause when offline, resume when online
- `always`: Queries run regardless of connectivity (for local data sources)
- `offlineFirst`: Try cache first, then network

**Retry strategies:** Use exponential backoff with jitter for retries. Mobile networks are unreliable — aggressive retrying wastes battery and data. Default to 3 retries with `1s, 2s, 4s` delays.

**Common mistakes:**

- Not handling network errors (fetch does not throw on 4xx/5xx — check `response.ok`)
- Not setting request timeouts (default is infinite on React Native)
- Caching user-specific data without clearing on logout
- Not debouncing search/autocomplete requests (each keystroke fires a request)

## Source

https://tanstack.com/query/latest
