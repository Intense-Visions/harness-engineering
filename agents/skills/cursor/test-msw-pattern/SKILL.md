# Test MSW Pattern

> Intercept HTTP requests in tests using Mock Service Worker handlers at the network level

## When to Use

- Testing components or services that make HTTP requests
- Mocking API responses without modifying application code
- Simulating error responses, slow networks, or specific server behaviors
- Sharing mock API definitions between tests and development server

## Instructions

1. **Install and set up MSW:**

```bash
npm install -D msw
```

2. **Define request handlers:**

```typescript
// test/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'Alice', email: 'alice@test.com' },
      { id: '2', name: 'Bob', email: 'bob@test.com' },
    ]);
  }),

  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Alice',
      email: 'alice@test.com',
    });
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({ id: 'new-id', ...body }, { status: 201 });
  }),
];
```

3. **Set up the server for tests:**

```typescript
// test/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

4. **Wire into test setup:**

```typescript
// test/setup.ts
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

5. **Override handlers per test** for specific scenarios:

```typescript
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';

it('shows error state when API fails', async () => {
  server.use(
    http.get('/api/users', () => {
      return HttpResponse.json(
        { message: 'Internal server error' },
        { status: 500 },
      );
    }),
  );

  render(<UserList />);

  expect(await screen.findByText('Failed to load users')).toBeInTheDocument();
});
```

6. **Simulate network delay:**

```typescript
import { delay, http, HttpResponse } from 'msw';

server.use(
  http.get('/api/users', async () => {
    await delay(2000);
    return HttpResponse.json([]);
  })
);
```

7. **Access request details** in handlers:

```typescript
http.post('/api/users', async ({ request, params, cookies }) => {
  const body = await request.json();
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return HttpResponse.json({ id: 'new', ...body }, { status: 201 });
}),
```

8. **Verify requests were made** using handler inspection:

```typescript
it('sends correct headers', async () => {
  let capturedHeaders: Headers;

  server.use(
    http.get('/api/users', ({ request }) => {
      capturedHeaders = request.headers;
      return HttpResponse.json([]);
    })
  );

  await fetchUsers();

  expect(capturedHeaders!.get('Accept')).toBe('application/json');
});
```

## Details

MSW intercepts requests at the network level, below `fetch` and `XMLHttpRequest`. This means your application code is completely unmodified — no dependency injection, no mock modules, no test-specific code paths.

**MSW v2 (current):** Uses standard `Request`/`Response` objects from the Fetch API. Handlers use `http.get()`, `http.post()`, etc. Response construction uses `HttpResponse.json()`, `HttpResponse.text()`, etc.

**`onUnhandledRequest: 'error'`:** Causes tests to fail if the code makes an HTTP request that no handler matches. This catches missing mocks and unintended API calls.

**Handler precedence:** Handlers added with `server.use()` (per-test overrides) take priority over handlers passed to `setupServer()` (defaults). `server.resetHandlers()` removes per-test overrides, restoring defaults.

**Browser vs Node:** MSW has two modes:

- `setupServer()` — for Node.js test environments (Vitest, Jest)
- `setupWorker()` — for browser environments (development server, Storybook)

Same handlers work in both modes.

**Trade-offs:**

- Network-level interception is realistic — but cannot test request configuration (timeouts, retries) that happen at the HTTP client level
- Shared handlers between dev and test reduce duplication — but test handlers should be more deterministic than dev handlers
- `onUnhandledRequest: 'error'` catches missing mocks — but requires handlers for every request, including static assets in browser mode
- MSW does not mock WebSocket or Server-Sent Events by default — use separate tools for real-time protocol testing

## Source

https://mswjs.io/docs/
