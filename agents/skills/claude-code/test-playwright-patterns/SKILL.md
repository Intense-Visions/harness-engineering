# Test Playwright Patterns

> Write maintainable Playwright tests using page objects, fixtures, and parallel execution

## When to Use

- Writing E2E tests that remain maintainable as the application grows
- Abstracting page interactions into reusable page objects
- Testing complex user flows (multi-step forms, navigation, authentication)
- Debugging flaky tests and improving test reliability

## Instructions

1. **Page Object Model** — encapsulate page interactions:

```typescript
// e2e/pages/login-page.ts
import { Page, Locator, expect } from '@playwright/test';

export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(private page: Page) {
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Log in' });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}
```

2. **Use locators** — prefer accessible selectors:

```typescript
// Best — accessible
page.getByRole('button', { name: 'Submit' });
page.getByLabel('Email address');
page.getByText('Welcome back');
page.getByPlaceholder('Search...');

// Acceptable — test IDs
page.getByTestId('user-avatar');

// Avoid — brittle
page.locator('.btn-primary');
page.locator('#submit-form');
page.locator('div > span:nth-child(2)');
```

3. **Test user flows**, not individual elements:

```typescript
import { test, expect } from '@playwright/test';

test('user can create and publish a post', async ({ page }) => {
  await page.goto('/posts/new');

  await page.getByLabel('Title').fill('My First Post');
  await page.getByLabel('Content').fill('Hello, world!');
  await page.getByRole('button', { name: 'Save draft' }).click();

  await expect(page.getByText('Draft saved')).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();

  await expect(page).toHaveURL(/\/posts\/[\w-]+$/);
  await expect(page.getByRole('heading', { name: 'My First Post' })).toBeVisible();
});
```

4. **Wait for network and state** — use auto-waiting:

```typescript
// Playwright auto-waits for elements to be actionable
await page.getByRole('button', { name: 'Submit' }).click(); // Waits for button to be enabled

// Wait for navigation
await Promise.all([
  page.waitForURL('/dashboard'),
  page.getByRole('button', { name: 'Log in' }).click(),
]);

// Wait for API response
const responsePromise = page.waitForResponse('/api/users');
await page.getByRole('button', { name: 'Load users' }).click();
const response = await responsePromise;
expect(response.status()).toBe(200);
```

5. **Handle dialogs and popups:**

```typescript
page.on('dialog', (dialog) => dialog.accept());

await page.getByRole('button', { name: 'Delete' }).click();
await expect(page.getByText('Item deleted')).toBeVisible();
```

6. **Visual regression with screenshots:**

```typescript
test('homepage matches snapshot', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixels: 100,
  });
});
```

7. **Parallel test isolation:**

```typescript
// Each test gets its own browser context
test('user A sees their data', async ({ page }) => {
  /* ... */
});
test('user B sees their data', async ({ page }) => {
  /* ... */
});
// These run in parallel without interference
```

8. **Tag and filter tests:**

```typescript
test('critical: checkout flow', { tag: '@critical' }, async ({ page }) => {
  // ...
});

// Run only critical tests
// npx playwright test --grep @critical
```

## Details

Playwright tests run against real browsers with full DOM, network, and JavaScript execution. They are the closest thing to manual testing that can be automated.

**Auto-waiting:** Playwright automatically waits for elements to be visible, enabled, and stable before interacting. This eliminates most explicit waits and reduces flakiness compared to Selenium or Cypress.

**Locator best practices:**

1. `getByRole` — always first choice. Forces accessible markup
2. `getByLabel` — for form inputs, anchored to their label
3. `getByText` — for visible text content
4. `getByTestId` — when no accessible name exists. Add `data-testid` attributes
5. CSS/XPath — last resort, only for complex DOM structures

**Debugging tools:**

- `npx playwright test --ui` — interactive test runner with time-travel debugging
- `npx playwright test --debug` — step through with browser DevTools
- `npx playwright show-trace trace.zip` — replay recorded traces

**Handling flakiness:**

- Use locators (auto-waiting) instead of explicit waits
- Wait for specific conditions, not arbitrary timeouts
- Ensure test data isolation (each test creates its own data)
- Use `retries: 2` in CI as a safety net, but investigate repeated flakes

**Trade-offs:**

- Page objects improve maintainability — but add abstraction layers
- Parallel execution speeds up suites — but requires data isolation between tests
- Visual regression catches CSS bugs — but screenshot diffs are sensitive to rendering differences across environments
- Multi-browser testing improves confidence — but triples CI time

## Source

https://playwright.dev/docs/test-patterns
