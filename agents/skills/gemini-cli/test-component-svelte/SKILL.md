# Test Component Svelte

> Test Svelte components with Testing Library using render, fireEvent, and waitFor

## When to Use

- Testing Svelte component rendering and user interactions
- Verifying reactive state updates in response to events
- Testing components that use Svelte stores or slots
- Writing accessible, user-centric component tests

## Instructions

1. **Setup** — install dependencies:

```bash
npm install -D @testing-library/svelte @testing-library/jest-dom vitest jsdom
```

Configure Vitest for browser environment:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: { environment: 'jsdom' },
});
```

2. **Render and query:**

```typescript
import { render, screen } from '@testing-library/svelte';
import Greeting from './Greeting.svelte';

it('displays the name', () => {
  render(Greeting, { props: { name: 'Alice' } });
  expect(screen.getByText('Hello, Alice!')).toBeInTheDocument();
});
```

3. **Simulate user interactions:**

```typescript
import { render, screen, fireEvent } from '@testing-library/svelte';
import Counter from './Counter.svelte';

it('increments count on button click', async () => {
  render(Counter);

  const button = screen.getByRole('button', { name: 'Increment' });
  expect(screen.getByText('Count: 0')).toBeInTheDocument();

  await fireEvent.click(button);

  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

4. **Test form inputs:**

```typescript
import { render, screen, fireEvent } from '@testing-library/svelte';
import SearchBox from './SearchBox.svelte';

it('updates search results on input', async () => {
  render(SearchBox);

  const input = screen.getByPlaceholderText('Search...');
  await fireEvent.input(input, { target: { value: 'hello' } });

  expect(await screen.findByText('Results for: hello')).toBeInTheDocument();
});
```

5. **Test with props updates:**

```typescript
import { render, screen } from '@testing-library/svelte';
import UserCard from './UserCard.svelte';

it('updates when props change', async () => {
  const { rerender } = render(UserCard, { props: { name: 'Alice' } });
  expect(screen.getByText('Alice')).toBeInTheDocument();

  await rerender({ name: 'Bob' });
  expect(screen.getByText('Bob')).toBeInTheDocument();
});
```

6. **Test component events:**

```typescript
import { render, screen, fireEvent } from '@testing-library/svelte';
import Button from './Button.svelte';

it('dispatches click event with payload', async () => {
  const { component } = render(Button);
  const handler = vi.fn();
  component.$on('customClick', handler);

  await fireEvent.click(screen.getByRole('button'));

  expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: { action: 'confirm' } }));
});
```

7. **Test async/loading states:**

```typescript
it('shows loading then data', async () => {
  render(UserList);

  expect(screen.getByText('Loading...')).toBeInTheDocument();
  expect(await screen.findByText('Alice')).toBeInTheDocument();
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
});
```

8. **Test with Svelte stores:**

```typescript
import { writable } from 'svelte/store';

it('reacts to store changes', async () => {
  const user = writable({ name: 'Alice' });
  render(UserDisplay, { props: { user } });

  expect(screen.getByText('Alice')).toBeInTheDocument();

  user.set({ name: 'Bob' });
  await screen.findByText('Bob');
});
```

## Details

`@testing-library/svelte` follows the same user-centric testing philosophy as the React variant. Tests interact with rendered DOM elements, not component internals.

**Svelte-specific considerations:**

- Svelte components are compiled — the test setup needs the Svelte Vite plugin to process `.svelte` files
- Reactivity is batched — after `fireEvent`, changes may not be reflected immediately. Use `await` or `tick()` from `svelte` to wait for updates
- Component events use `$on('eventName', handler)` — different from React's prop-based callbacks
- Slot testing requires wrapper components that render slots with test content

**Query priority (same as React Testing Library):**

1. `getByRole` — accessible role and name
2. `getByLabelText` — form labels
3. `getByText` — visible text
4. `getByTestId` — last resort

**Svelte 5 runes:** If using Svelte 5 with runes (`$state`, `$derived`), the testing patterns remain the same at the component level — Testing Library interacts with the DOM, which is the output of runes.

**Trade-offs:**

- Testing Library for Svelte has a smaller ecosystem than React Testing Library
- `fireEvent` in Svelte requires `await` for reactivity updates, which is easy to forget
- Component event testing with `$on` is less ergonomic than React's callback props
- Svelte's compilation step means test startup is slightly slower than plain JavaScript tests

## Source

https://testing-library.com/docs/svelte-testing-library/intro/
