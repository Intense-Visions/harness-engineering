# Test Component React

> Test React components with Testing Library using user-centric queries and async utilities

## When to Use

- Testing React component rendering, interaction, and state changes
- Verifying that components display the correct content
- Simulating user interactions (clicks, typing, form submission)
- Testing async components that fetch data or show loading states

## Instructions

1. **Render and query** — use `render` and `screen`:

```typescript
import { render, screen } from '@testing-library/react';
import { UserCard } from './user-card';

it('displays the user name', () => {
  render(<UserCard user={{ name: 'Alice', email: 'alice@test.com' }} />);

  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.getByText('alice@test.com')).toBeInTheDocument();
});
```

2. **Use accessible queries** in priority order:
   - `getByRole` — buttons, links, headings, form elements
   - `getByLabelText` — form inputs by label
   - `getByPlaceholderText` — inputs by placeholder
   - `getByText` — visible text content
   - `getByTestId` — last resort, for elements without accessible names

```typescript
it('renders a submit button', () => {
  render(<LoginForm />);

  expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
});
```

3. **Simulate user interactions** with `userEvent`:

```typescript
import userEvent from '@testing-library/user-event';

it('submits the form with entered data', async () => {
  const onSubmit = vi.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Email'), 'alice@test.com');
  await user.type(screen.getByLabelText('Password'), 'secret123');
  await user.click(screen.getByRole('button', { name: 'Log in' }));

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'alice@test.com',
    password: 'secret123',
  });
});
```

4. **Test async behavior** with `waitFor` and `findBy`:

```typescript
it('shows user data after loading', async () => {
  render(<UserProfile userId="123" />);

  expect(screen.getByText('Loading...')).toBeInTheDocument();

  // findBy waits for the element to appear (default 1000ms timeout)
  expect(await screen.findByText('Alice')).toBeInTheDocument();
  expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
});
```

5. **Test conditional rendering:**

```typescript
it('shows error message for invalid input', async () => {
  render(<EmailInput />);

  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'not-an-email');
  await user.tab(); // Trigger blur validation

  expect(screen.getByText('Please enter a valid email')).toBeInTheDocument();
});
```

6. **Verify absence** with `queryBy` (returns null instead of throwing):

```typescript
it('does not show admin panel for regular users', () => {
  render(<Dashboard user={{ role: 'user' }} />);

  expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
});
```

7. **Test with context providers:**

```typescript
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider theme={defaultTheme}>
      <AuthProvider value={mockAuth}>
        {ui}
      </AuthProvider>
    </ThemeProvider>
  );
}

it('uses theme colors', () => {
  renderWithProviders(<Button>Click me</Button>);
  expect(screen.getByRole('button')).toHaveStyle({ color: 'blue' });
});
```

8. **Prefer `userEvent` over `fireEvent`** — `userEvent` simulates real browser behavior (focus, keyboard events, click sequence):

```typescript
// Good — fires focus, keydown, keypress, input, keyup for each character
await user.type(input, 'hello');

// Less realistic — fires only the change event
fireEvent.change(input, { target: { value: 'hello' } });
```

## Details

Testing Library's philosophy is "test the way users interact with your app." Tests should not know about component internals (state, props, hooks) — they should only interact through the rendered DOM.

**Query types:**

- `getBy` — returns element or throws. Use when the element must be present
- `queryBy` — returns element or null. Use when asserting absence
- `findBy` — returns a Promise. Use for elements that appear asynchronously
- All have `AllBy` variants that return arrays

**`userEvent.setup()`:** Always call `userEvent.setup()` before interactions. This creates a user session with proper event sequencing. Do not use the older `userEvent.click()` static methods.

**jsdom limitations:** Testing Library runs in jsdom, which does not implement layout. `getComputedStyle`, `getBoundingClientRect`, and scroll behavior do not work. Use Playwright for visual and layout testing.

**Trade-offs:**

- User-centric testing avoids testing implementation details — but some internal states are hard to observe through the DOM
- `getByRole` encourages accessible markup — but can be frustrating when role names are not obvious
- `userEvent` is realistic — but slower than `fireEvent`. Use `fireEvent` for simple cases in large test suites
- `waitFor` and `findBy` handle async — but can mask slow components. Set explicit timeouts in CI

## Source

https://testing-library.com/docs/react-testing-library/intro/
