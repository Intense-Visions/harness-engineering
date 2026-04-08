# Nuxt Testing Patterns

> Test Nuxt components, composables, and pages using @nuxt/test-utils with full Nuxt context including auto-imports

## When to Use

- You are writing unit or integration tests for Nuxt components or pages that use Nuxt composables
- You need to mock `useFetch`, `useRoute`, or other Nuxt auto-imports in tests
- You are testing async components that use `<Suspense>` or `useAsyncData`
- You need end-to-end tests against a running Nuxt server using Playwright

## Instructions

**Setup:**

1. Install `@nuxt/test-utils` and configure Vitest with the Nuxt environment:

```typescript
// vitest.config.ts
import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        rootDir: '.',
      },
    },
  },
});
```

**Mounting components:**

2. Use `mountSuspended` instead of `mount` for components that use `useAsyncData`, `useFetch`, or other async composables. It wraps the component in `<Suspense>` and waits for resolution:

```typescript
import { mountSuspended } from '@nuxt/test-utils/runtime';
import MyComponent from '~/components/MyComponent.vue';

it('renders user data', async () => {
  const wrapper = await mountSuspended(MyComponent, {
    props: { userId: '123' },
  });
  expect(wrapper.text()).toContain('John Doe');
});
```

3. Use `renderSuspended` for testing with `@testing-library/vue` patterns:

```typescript
import { renderSuspended } from '@nuxt/test-utils/runtime';
import { screen } from '@testing-library/vue';

it('shows the title', async () => {
  await renderSuspended(MyPage);
  expect(screen.getByRole('heading')).toHaveTextContent('Dashboard');
});
```

**Mocking Nuxt composables:**

4. Use `mockNuxtImport` to mock any auto-imported composable. Call it once at the top of the test file — it persists across the file:

```typescript
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

mockNuxtImport('useFetch', () => {
  return () => ({
    data: ref({ users: [{ id: 1, name: 'Alice' }] }),
    error: ref(null),
    pending: ref(false),
  });
});
```

5. Mock `useRoute` to simulate navigation params:

```typescript
mockNuxtImport('useRoute', () => {
  return () => ({
    params: { id: '42' },
    query: { tab: 'settings' },
    path: '/users/42',
  });
});
```

6. Use `vi.mocked` with `mockNuxtImport` for per-test overrides:

```typescript
const { useFetch } = vi.hoisted(() => ({ useFetch: vi.fn() }));

mockNuxtImport('useFetch', () => useFetch);

beforeEach(() => {
  useFetch.mockReturnValue({
    data: ref(null),
    error: ref('Network error'),
    pending: ref(false),
  });
});
```

**Testing server routes:**

7. Use `$fetch` from `@nuxt/test-utils` to make real HTTP requests against a test Nuxt server:

```typescript
import { setup, $fetch } from '@nuxt/test-utils/e2e';

describe('Server routes', async () => {
  await setup({ rootDir: '.' });

  it('returns users', async () => {
    const users = await $fetch('/api/users');
    expect(users).toHaveLength(3);
  });
});
```

**End-to-end testing with Playwright:**

8. Configure Playwright E2E tests that boot a real Nuxt dev server:

```typescript
// tests/e2e/home.spec.ts
import { setup, createPage, url } from '@nuxt/test-utils/e2e';
import { test, expect } from '@playwright/test';

await setup({ rootDir: '.', browser: true });

test('home page loads', async () => {
  const page = await createPage('/');
  await expect(page.locator('h1')).toHaveText('Welcome');
});
```

## Details

**Why not use plain Vitest + @vue/test-utils?**

Standard Vue Test Utils doesn't know about Nuxt's auto-import layer. Composables like `useNuxtApp`, `useFetch`, `useRoute` will throw "not in Nuxt context" errors. `@nuxt/test-utils` sets up a minimal Nuxt environment that makes auto-imports available in tests.

**`mountSuspended` vs. `mount`:**

- `mount` — synchronous, works for components with no async composables
- `mountSuspended` — wraps in `<Suspense>`, awaits all `useAsyncData`/`useFetch` calls, returns after data is resolved

Always prefer `mountSuspended` for page components or any component using `useAsyncData`.

**Mocking modules vs. mocking composables:**

`mockNuxtImport` mocks at the auto-import resolution layer. It's different from `vi.mock('~/composables/useMyThing')` — the latter only works for explicit imports. Use `mockNuxtImport` for anything that's auto-imported.

**Test file organization:**

```
tests/
  unit/
    components/    ← mountSuspended tests
    composables/   ← plain Vitest + vue's renderHook
  integration/
    server/        ← $fetch API tests
  e2e/             ← Playwright tests
```

**Nuxt test environment options:**

```typescript
// vitest.config.ts
environment: 'nuxt',
environmentOptions: {
  nuxt: {
    rootDir: '.',
    overrides: {
      // Override nuxt.config.ts for tests
      runtimeConfig: { public: { apiBase: 'http://localhost:3000' } }
    }
  }
}
```

## Source

https://nuxt.com/docs/getting-started/testing
