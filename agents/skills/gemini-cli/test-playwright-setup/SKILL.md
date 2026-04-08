# Test Playwright Setup

> Configure Playwright test runner with fixtures, reporters, and browser contexts

## When to Use

- Setting up Playwright for end-to-end testing in a web project
- Configuring multiple browsers, reporters, and test environments
- Setting up authentication state sharing across tests
- Configuring CI-specific Playwright settings

## Instructions

1. **Install Playwright:**

```bash
npm init playwright@latest
# or
npm install -D @playwright/test
npx playwright install
```

2. **Configure `playwright.config.ts`:**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

3. **Auto-start the dev server** with `webServer` config — Playwright starts and waits for the server automatically.

4. **Set up authenticated state** with global setup:

```typescript
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@test.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Dashboard')).toBeVisible();

  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
```

```typescript
// playwright.config.ts — add setup project
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      storageState: 'e2e/.auth/user.json',
    },
    dependencies: ['setup'],
  },
],
```

5. **Custom fixtures** for reusable test helpers:

```typescript
// e2e/fixtures.ts
import { test as base } from '@playwright/test';

type Fixtures = {
  todoPage: TodoPage;
};

export const test = base.extend<Fixtures>({
  todoPage: async ({ page }, use) => {
    const todoPage = new TodoPage(page);
    await todoPage.goto();
    await use(todoPage);
  },
});

export { expect } from '@playwright/test';
```

6. **Configure reporters:**

```typescript
reporter: [
  ['html', { open: 'never' }],
  ['junit', { outputFile: 'test-results/junit.xml' }],
  ['list'],
],
```

7. **Trace viewer** for debugging failed tests:

```typescript
use: {
  trace: 'on-first-retry', // Records trace on first retry of failed tests
},
```

View with: `npx playwright show-trace test-results/trace.zip`

8. **Add to `.gitignore`:**

```
test-results/
playwright-report/
e2e/.auth/
```

## Details

Playwright runs tests across real browsers (Chromium, Firefox, WebKit) with full automation capabilities. Each test gets a fresh browser context by default, providing natural test isolation.

**Browser contexts:** Each test runs in an isolated browser context (like an incognito window). Cookies, localStorage, and session state do not leak between tests. This is more isolated than sharing a single browser instance.

**`webServer` configuration:** Playwright can start your dev/preview server automatically before running tests. Set `reuseExistingServer: true` for development (uses an already-running server) and `false` for CI (starts a fresh server).

**Storage state:** Authentication state (cookies, localStorage) can be saved and reused across tests. This avoids logging in for every test, significantly speeding up the suite.

**Parallelism:** `fullyParallel: true` runs tests in the same file in parallel. Each test gets its own worker process. Set `workers: 1` in CI if your app cannot handle concurrent users.

**Trade-offs:**

- Multi-browser testing catches browser-specific bugs — but triples test execution time
- `webServer` auto-start is convenient — but can mask server startup issues
- Storage state sharing speeds up tests — but tests may fail if the auth state expires
- Trace viewer is invaluable for debugging — but traces consume significant disk space

## Source

https://playwright.dev/docs/intro
