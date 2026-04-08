# Next.js Testing Patterns

> Test App Router components, Server Actions, and Route Handlers with Jest, Vitest, and MSW

## When to Use

- Writing unit tests for Server Components and Client Components in the App Router
- Testing Server Actions with mocked database calls
- Integration testing Route Handlers with simulated HTTP requests
- Setting up Mock Service Worker (MSW) for fetch interception in tests
- Configuring Jest or Vitest for Next.js with proper module resolution

## Instructions

1. Use `@testing-library/react` for rendering Client Components — import from `@testing-library/react` as usual.
2. Test Server Components by calling them as plain async functions — they are just async functions that return JSX.
3. Mock `next/navigation` (`useRouter`, `usePathname`, `useSearchParams`) with `jest.mock()` or `vi.mock()` — these hooks are not available in tests.
4. Mock `next/headers` (`cookies`, `headers`) for Server Components that read request headers or cookies.
5. Use MSW (`msw`) to intercept `fetch()` calls in integration tests — set up a server with `setupServer()` and start/stop per test suite.
6. Test Route Handlers by constructing a `NextRequest` and calling the handler directly — no HTTP server needed.
7. Test Server Actions by calling them directly as async functions and asserting the return value.
8. Use `next-router-mock` as a drop-in `useRouter` mock that supports assertions on navigation calls.

```typescript
// __tests__/server-component.test.tsx — testing a Server Component
import { render, screen } from '@testing-library/react';
import { PostList } from '@/components/post-list'; // Server Component

// Mock data access module
vi.mock('@/lib/posts', () => ({
  getPosts: vi.fn().mockResolvedValue([
    { id: '1', title: 'Hello World', slug: 'hello-world' },
  ]),
}));

test('renders post titles', async () => {
  const component = await PostList(); // call as async function
  render(component);
  expect(screen.getByText('Hello World')).toBeInTheDocument();
});

// __tests__/client-component.test.tsx — Client Component with router mock
import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { NavButton } from '@/components/nav-button';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

test('navigates on click', () => {
  const push = vi.fn();
  vi.mocked(useRouter).mockReturnValue({ push } as any);
  render(<NavButton href="/dashboard">Go to Dashboard</NavButton>);
  fireEvent.click(screen.getByText('Go to Dashboard'));
  expect(push).toHaveBeenCalledWith('/dashboard');
});

// __tests__/route-handler.test.ts — Route Handler unit test
import { GET } from '@/app/api/posts/route';
import { NextRequest } from 'next/server';

test('returns posts as JSON', async () => {
  const request = new NextRequest('http://localhost/api/posts');
  const response = await GET(request);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(Array.isArray(data)).toBe(true);
});
```

## Details

Testing Next.js App Router applications requires different strategies for Server Components, Client Components, and server-side functions — they run in different environments.

**Server Component testing:** Server Components are async functions — call them directly and render the result. The key is mocking their dependencies (database calls, fetch, `next/headers`) rather than trying to render them in a browser environment.

**next/navigation mocking:** `useRouter`, `usePathname`, `useSearchParams`, and `redirect` are not available in the test environment. Always mock `next/navigation`. For complex navigation testing, use the `next-router-mock` package which provides a mock router with state tracking.

**MSW integration:** MSW intercepts `fetch()` at the network layer — no need to mock `fetch` globally. Set up `server.listen()` in `beforeAll`, `server.resetHandlers()` in `afterEach`, and `server.close()` in `afterAll`. Use `server.use()` within a test to override handlers for specific scenarios.

**Vitest vs Jest:** Vitest is faster and has native ESM support — preferred for new Next.js projects. Configure `vitest.config.ts` with `@vitejs/plugin-react` and alias `next/navigation` to a mock. Jest requires `next/jest` transform configuration for App Router compatibility.

**`next/cache` in tests:** `revalidatePath` and `revalidateTag` throw errors in test environments. Mock `next/cache` module entirely: `vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))`.

**E2E testing:** For full integration tests including navigation and streaming, use Playwright with `next dev` or `next start`. Playwright can test App Router features (streaming, client navigation) that JSDOM-based unit tests cannot.

## Source

https://nextjs.org/docs/app/building-your-application/testing
