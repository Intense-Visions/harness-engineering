# Svelte Testing Patterns

> Test Svelte 5 components with Vitest and @testing-library/svelte — render, user events, store mocking, and async tick flushing

## When to Use

- You are writing unit tests for Svelte components
- You need to test reactive behavior triggered by user interactions (clicks, input, form submission)
- You need to mock Svelte stores or module imports in tests
- You are testing async behavior and need to flush the update queue with `tick()`

## Instructions

**Setup:**

1. Install dependencies and configure Vitest with the Svelte plugin:

```bash
npm install -D vitest @testing-library/svelte @testing-library/jest-dom jsdom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    globals: true,
  },
});
```

```typescript
// src/tests/setup.ts
import '@testing-library/jest-dom';
```

**Rendering components:**

2. Use `render` from `@testing-library/svelte` to mount components. Query the DOM with Testing Library queries:

```typescript
import { render, screen } from '@testing-library/svelte';
import MyButton from '$lib/components/MyButton.svelte';

test('renders with label', () => {
  render(MyButton, { props: { label: 'Click me' } });
  expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
});
```

3. Pass props using the `props` option:

```typescript
render(UserCard, {
  props: {
    user: { id: 1, name: 'Alice', email: 'alice@example.com' },
  },
});
```

**Firing events:**

4. Use `fireEvent` or the `userEvent` library for simulating interactions:

```typescript
import { render, screen, fireEvent } from '@testing-library/svelte';
import Counter from '$lib/components/Counter.svelte';

test('increments on click', async () => {
  render(Counter);
  const button = screen.getByRole('button', { name: '+' });

  await fireEvent.click(button);
  await fireEvent.click(button);

  expect(screen.getByText('2')).toBeInTheDocument();
});
```

5. Use `@testing-library/user-event` for more realistic interactions (typing, tabbing):

```typescript
import userEvent from '@testing-library/user-event';

test('types in search input', async () => {
  const user = userEvent.setup();
  render(SearchBar);

  await user.type(screen.getByRole('searchbox'), 'svelte');
  expect(screen.getByDisplayValue('svelte')).toBeInTheDocument();
});
```

**Async updates with tick:**

6. After triggering reactive updates, await `tick()` from `svelte` to flush Svelte's update queue:

```typescript
import { tick } from 'svelte';

test('shows error after failed submit', async () => {
  render(LoginForm);

  await fireEvent.submit(screen.getByRole('form'));
  await tick();

  expect(screen.getByText('Email is required')).toBeInTheDocument();
});
```

**Testing stores:**

7. Mock writable stores by importing and setting them directly:

```typescript
import { count } from '$lib/stores/counter';
import CounterDisplay from '$lib/components/CounterDisplay.svelte';

test('displays current count', () => {
  count.set(42);
  render(CounterDisplay);
  expect(screen.getByText('42')).toBeInTheDocument();
});
```

**Mocking modules:**

8. Use `vi.mock` to mock module imports in tests:

```typescript
vi.mock('$lib/services/api', () => ({
  fetchUsers: vi.fn().mockResolvedValue([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ]),
}));

test('renders fetched users', async () => {
  render(UserList);
  await tick();

  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('Bob')).toBeInTheDocument();
});
```

**Testing with context:**

9. Wrap components in a context provider using a wrapper component, or use the `context` option:

```typescript
render(MyComponent, {
  context: new Map([['theme', { primary: '#3b82f6' }]]),
});
```

## Details

**Svelte 5 vs. Svelte 4 testing differences:**

Svelte 5 with `@testing-library/svelte` v5+ uses the new component API internally. The test API (render, screen, fireEvent) is unchanged from the user's perspective. Ensure `@testing-library/svelte` v5 or later for Svelte 5 components.

**The Testing Library philosophy:**

Prefer queries that reflect how users perceive the UI:

1. `getByRole` — most semantic (button, heading, checkbox, etc.)
2. `getByLabelText` — for form fields
3. `getByPlaceholderText` — fallback for inputs
4. `getByText` — visible text content
5. `getByTestId` — last resort (add `data-testid` to elements)

Avoid testing implementation details (component state, store values) — test observable behavior.

**`act` in Svelte:**

Unlike React Testing Library, Svelte Testing Library uses `tick()` for flushing updates rather than `act()`. Most interactions already resolve automatically with `await`; `tick()` is needed when updates are triggered by direct reactive changes rather than DOM events.

**Testing SvelteKit load functions:**

Load functions are plain async functions — test them directly without mounting a component:

```typescript
import { load } from './+page.server';

test('returns user data', async () => {
  const result = await load({
    params: { id: '1' },
    locals: { user: mockUser },
    fetch: global.fetch,
  } as any);

  expect(result.user.id).toBe(1);
});
```

**Snapshot testing:**

```typescript
test('matches snapshot', () => {
  const { container } = render(MyComponent);
  expect(container).toMatchSnapshot();
});
```

Use sparingly — prefer behavior assertions over structural snapshots.

## Source

https://kit.svelte.dev/docs/testing
