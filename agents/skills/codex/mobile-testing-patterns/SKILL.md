# Mobile Testing Patterns

> Test React Native apps with Jest, React Native Testing Library, and Detox for unit, integration, and E2E coverage

## When to Use

- Setting up a testing strategy for a React Native project
- Writing component tests with accessible queries
- Mocking native modules, navigation, and async storage
- Running end-to-end tests on iOS and Android simulators
- Testing navigation flows, gestures, and deep links

## Instructions

1. **Use React Native Testing Library (RNTL) for component tests.** It encourages testing from the user's perspective using accessible queries.

```bash
npm install -D @testing-library/react-native @testing-library/jest-native
```

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

describe('LoginForm', () => {
  it('shows error when email is empty', async () => {
    render(<LoginForm onSubmit={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeOnTheScreen();
    });
  });

  it('calls onSubmit with credentials', async () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.com');
    fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    fireEvent.press(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'password123',
      });
    });
  });
});
```

2. **Use accessible queries in order of preference.** This mirrors how users interact with the app and validates accessibility as a side effect.

```typescript
// Best — queries that reflect accessibility
screen.getByRole('button', { name: 'Submit' });
screen.getByLabelText('Email address');
screen.getByText('Welcome back');
screen.getByPlaceholderText('Search...');

// Acceptable — test IDs for elements without accessible names
screen.getByTestId('avatar-image');
```

3. **Mock native modules that are not available in the test environment.**

```typescript
// jest.setup.ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[xxx]' }),
  setNotificationHandler: jest.fn(),
}));
```

4. **Test hooks with `renderHook`.**

```typescript
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useOrders', () => {
  it('returns orders from API', async () => {
    fetchMock.mockResponseOnce(JSON.stringify([{ id: '1', total: 99.99 }]));

    const { result } = renderHook(() => useOrders(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data![0].total).toBe(99.99);
    });
  });
});
```

5. **Test navigation flows by wrapping components with NavigationContainer.**

```typescript
import { NavigationContainer } from '@react-navigation/native';

function renderWithNavigation(component: React.ReactElement) {
  return render(
    <NavigationContainer>{component}</NavigationContainer>
  );
}

it('navigates to detail screen on item press', async () => {
  const { getByText } = renderWithNavigation(<OrderListScreen />);

  fireEvent.press(getByText('Order #123'));

  await waitFor(() => {
    expect(getByText('Order Details')).toBeOnTheScreen();
  });
});
```

6. **Use Detox for end-to-end testing on real simulators/devices.**

```bash
npm install -D detox
npx detox init
```

```typescript
// e2e/login.test.ts
describe('Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should login with valid credentials', async () => {
    await element(by.label('Email')).typeText('user@example.com');
    await element(by.label('Password')).typeText('password123');
    await element(by.label('Log In')).tap();

    await waitFor(element(by.text('Welcome back')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show error for invalid credentials', async () => {
    await element(by.label('Email')).typeText('wrong@example.com');
    await element(by.label('Password')).typeText('wrong');
    await element(by.label('Log In')).tap();

    await expect(element(by.text('Invalid credentials'))).toBeVisible();
  });
});
```

7. **Use MSW (Mock Service Worker) for API mocking in tests.**

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

const server = setupServer(
  http.get(`${API_URL}/orders`, () => {
    return HttpResponse.json([{ id: '1', total: 99.99, status: 'delivered' }]);
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

8. **Structure tests next to source files.**

```
src/
  components/
    OrderCard.tsx
    OrderCard.test.tsx
  screens/
    OrderList.tsx
    OrderList.test.tsx
  hooks/
    useOrders.ts
    useOrders.test.ts
e2e/
  login.test.ts
  checkout.test.ts
```

## Details

**Testing pyramid for React Native:**

1. **Unit tests (60%):** Pure functions, hooks, utilities — fast, no rendering
2. **Component tests (30%):** RNTL — render components, simulate user actions, check output
3. **E2E tests (10%):** Detox — full app on simulator, critical user flows only

**Mocking strategy:** Mock at the boundary (native modules, network, storage), not internal implementation. Use MSW for network mocking instead of mocking fetch directly — it works at the network level and catches integration issues.

**Snapshot testing:** Use sparingly. Snapshots for complex components become unreadable and are approved without review. Prefer specific assertions (`expect(screen.getByText('$99.99')).toBeOnTheScreen()`) over snapshot matching.

**Common mistakes:**

- Testing implementation details (checking state, spying on internal methods)
- Not wrapping components in required providers (navigation, query client, theme)
- Using `getByTestId` as the primary query (bypasses accessibility validation)
- Not awaiting async operations (`waitFor`, `findByText`)
- Mocking too deeply (mocking hooks instead of their dependencies)

## Source

https://callstack.github.io/react-native-testing-library/

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
