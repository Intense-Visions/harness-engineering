# Harness E2E

> End-to-end browser testing with Playwright, Cypress, or Selenium. Covers page object scaffolding, critical-path test implementation, and systematic flakiness remediation.

## When to Use

- Writing browser-level tests for critical user flows (login, checkout, onboarding)
- Adding E2E coverage for a new feature that touches the UI
- Diagnosing and remediating flaky E2E tests that block CI pipelines
- NOT when testing API-only behavior with no UI (use harness-integration-test instead)
- NOT when testing individual component rendering in isolation (use unit tests or harness-tdd instead)
- NOT when performing visual screenshot comparison (use harness-visual-regression instead)

## Process

### Phase 1: DETECT -- Identify Framework and Application Structure

1. **Scan for E2E configuration.** Search for `playwright.config.ts`, `playwright.config.js`, `cypress.config.ts`, `cypress.config.js`, `wdio.conf.js`, or `selenium` directories. If multiple frameworks are present, prefer the one with the most existing tests.

2. **Catalog existing E2E tests.** Glob for `*.spec.ts`, `*.e2e.ts`, `*.cy.ts`, `*.test.ts` within E2E directories. Count tests per file and identify patterns: naming conventions, folder structure, shared utilities.

3. **Map application entry points.** Identify the base URL, authentication flow, and route structure. Check for:
   - Environment configuration (`.env.test`, `playwright.config.ts` baseURL)
   - Authentication fixtures (stored auth state, login helpers)
   - Route definitions (Next.js pages, React Router config, Express routes)

4. **Identify the test execution environment.** Determine whether tests run against a dev server, a preview deployment, or a Docker Compose stack. Check `package.json` scripts for `e2e`, `test:e2e`, or `playwright test` commands.

5. **Report findings.** Summarize: framework detected, number of existing tests, coverage gaps relative to application routes, and any configuration issues (missing base URL, no auth setup).

### Phase 2: SCAFFOLD -- Generate Page Objects and Test Infrastructure

1. **Create the page object directory.** Follow the project's existing conventions. If no convention exists, use `e2e/pages/` for Playwright or `cypress/pages/` for Cypress.

2. **Generate page objects for target flows.** Each page object encapsulates:
   - Locator definitions using stable selectors (`data-testid`, `role`, `aria-label`) -- never CSS classes or XPath positional selectors
   - Action methods (click, fill, navigate) that return the next page object for chaining
   - Assertion helpers that verify page state without exposing DOM internals

3. **Create shared fixtures and helpers.** Generate:
   - Authentication fixture that stores and reuses auth state across tests
   - Test data factory integration (API calls or database seeds for prerequisite data)
   - Custom assertions for domain-specific validations

4. **Configure test parallelization.** Set up:
   - Worker count based on CI environment capabilities
   - Test isolation (each test gets its own browser context)
   - Retry configuration (1 retry for CI, 0 for local development)
   - Screenshot and trace capture on failure

5. **Verify scaffold compiles.** Run the test command with `--list` or `--dry-run` to confirm all imports resolve and page objects instantiate without errors.

### Phase 3: IMPLEMENT -- Write E2E Tests for Critical Paths

1. **Prioritize user flows by business impact.** Order test implementation:
   - Smoke tests: application loads, critical pages render
   - Authentication: login, logout, session persistence
   - Primary flows: the 3-5 flows that represent 80% of user value
   - Error paths: form validation, 404 handling, permission denied

2. **Write each test following the Arrange-Act-Assert pattern.**
   - Arrange: set up test data via API calls or fixtures (never through the UI for setup)
   - Act: perform the user flow through page object methods
   - Assert: verify the expected outcome using page object assertion helpers

3. **Use explicit waits, never arbitrary timeouts.** Where the framework provides an auto-waiting mechanism (Playwright `expect` with auto-retry, Cypress implicit waits), rely on it. Where explicit waits are needed, wait for specific network responses, DOM mutations, or URL changes -- never `page.waitForTimeout()`.

4. **Isolate tests from each other.** Each test must:
   - Create its own test data (no shared mutable state between tests)
   - Clean up after itself or rely on test isolation (separate browser context)
   - Pass when run individually and when run in any order

5. **Tag tests by scope.** Apply tags or annotations:
   - `@smoke` for tests that must pass on every deployment
   - `@critical-path` for primary business flow coverage
   - `@slow` for tests that exceed 30 seconds

6. **Run the full E2E suite.** Verify all tests pass locally before proceeding to validation.

### Phase 4: VALIDATE -- Execute, Detect Flakiness, and Remediate

1. **Run the suite 3 times consecutively.** Track pass/fail per test across runs. Any test that fails in at least one run but passes in another is flagged as flaky.

2. **Classify flaky tests by root cause.** Common categories:
   - **Race condition:** test asserts before async operation completes. Fix: add explicit wait for the specific condition.
   - **Shared state:** test depends on data from a previous test. Fix: make test data independent.
   - **Animation/transition:** assertion fires during CSS transition. Fix: wait for animation to complete or disable animations in test mode.
   - **Network timing:** API response arrives before or after expected. Fix: intercept and mock the network request, or wait for the specific response.

3. **Apply remediation for each flaky test.** Do not simply add retries -- fix the root cause. Retries mask problems. After remediation, rerun the previously-flaky test 5 times to confirm stability.

4. **Run `harness validate`.** Confirm the project passes all harness checks with the new E2E tests in place.

5. **Generate a coverage summary.** Report:
   - Number of user flows covered vs. total identified
   - Flaky tests found and remediated
   - Remaining coverage gaps with recommended next steps

### Graph Refresh

If a knowledge graph exists at `.harness/graph/`, refresh it after code changes to keep graph queries accurate:

```
harness scan [path]
```

## Harness Integration

- **`harness validate`** -- Run in VALIDATE phase after all tests are implemented. Confirms project health including new E2E infrastructure.
- **`harness check-deps`** -- Run after SCAFFOLD phase to verify E2E test dependencies do not introduce forbidden imports into production code.
- **`emit_interaction`** -- Used at checkpoints to present flakiness findings and remediation options to the human for approval.
- **Glob** -- Used in DETECT phase to catalog existing test files and page objects.
- **Grep** -- Used to search for selector patterns, wait strategies, and anti-patterns in existing tests.

## Success Criteria

- Every critical user flow identified in DETECT has a corresponding E2E test
- All E2E tests pass on 3 consecutive local runs with zero flaky failures
- Page objects use stable selectors (`data-testid`, ARIA roles) -- no CSS class selectors or XPath positional selectors
- No test uses arbitrary timeouts (`waitForTimeout`, `cy.wait(N)`, `Thread.sleep`)
- Test data is created via API or fixtures, not through UI interactions during setup
- Each test is independent and passes when run in isolation
- `harness validate` passes after the full suite is in place

## Examples

### Example: Playwright E2E for a SaaS Dashboard

**DETECT output:**

```
Framework: Playwright 1.42 (playwright.config.ts found)
Existing tests: 12 specs in e2e/tests/
Base URL: http://localhost:3000
Auth: Cookie-based, no stored auth state found
Coverage gaps: settings page, billing flow, team invitation
```

**SCAFFOLD -- Page object for dashboard:**

```typescript
// e2e/pages/dashboard.page.ts
import { type Page, type Locator, expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly projectList: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.projectList = page.getByTestId('project-list');
    this.createButton = page.getByRole('button', { name: 'New Project' });
  }

  async goto() {
    await this.page.goto('/dashboard');
    await expect(this.heading).toBeVisible();
  }

  async createProject(name: string) {
    await this.createButton.click();
    await this.page.getByLabel('Project name').fill(name);
    await this.page.getByRole('button', { name: 'Create' }).click();
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async expectProjectCount(count: number) {
    await expect(this.projectList.getByRole('listitem')).toHaveCount(count);
  }
}
```

**IMPLEMENT -- Critical path test:**

```typescript
// e2e/tests/project-creation.spec.ts
import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/dashboard.page';
import { LoginPage } from '../pages/login.page';

test.describe('Project creation', () => {
  test('user can create a project from the dashboard', async ({ page }) => {
    // Arrange: authenticate via stored state
    const loginPage = new LoginPage(page);
    await loginPage.loginAs('test-user@example.com');

    // Act: create a new project
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.createProject('My Test Project');

    // Assert: project appears in the list
    await expect(page.getByText('My Test Project')).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/[\w-]+/);
  });
});
```

### Example: Cypress E2E for an E-Commerce Checkout

**IMPLEMENT -- Checkout flow with network interception:**

```typescript
// cypress/e2e/checkout.cy.ts
describe('Checkout flow', () => {
  beforeEach(() => {
    cy.intercept('POST', '/api/orders', { fixture: 'order-success.json' }).as('createOrder');
    cy.loginByApi('customer@shop.com', 'testpass123');
  });

  it('completes checkout with valid payment', () => {
    cy.visit('/cart');
    cy.findByTestId('cart-item').should('have.length.at.least', 1);

    cy.findByRole('button', { name: 'Proceed to Checkout' }).click();
    cy.url().should('include', '/checkout');

    cy.findByLabelText('Card number').type('4242424242424242');
    cy.findByLabelText('Expiry').type('12/28');
    cy.findByLabelText('CVC').type('123');

    cy.findByRole('button', { name: 'Place Order' }).click();
    cy.wait('@createOrder');

    cy.findByRole('heading', { name: 'Order Confirmed' }).should('be.visible');
  });
});
```

## Rationalizations to Reject

| Rationalization                                                                      | Why It Is Wrong                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Using CSS class selectors is faster than adding data-testid attributes"             | No CSS class selectors in page objects. .btn-primary breaks when the design system updates class names. Use data-testid, ARIA roles, and accessible labels.        |
| "Adding a short waitForTimeout is easier than figuring out the right wait condition" | No arbitrary waits is a hard gate. waitForTimeout is a flakiness timebomb. Wait for specific conditions: network responses, DOM mutations, or URL changes.         |
| "This test creates data through the UI because the API setup is complex"             | Test data must be created via API or fixtures, not through UI interactions. UI-based setup is slow, brittle, and conflates setup failures with assertion failures. |
| "The test only fails sometimes in CI -- adding a retry will fix it"                  | Flaky tests block merge. Diagnose the root cause. Retries mask problems. After remediation, rerun 5 times to confirm stability.                                    |

## Gates

- **No CSS class selectors in page objects.** If a locator uses `.btn-primary` or `[class*="header"]`, the test is brittle. Use `data-testid`, ARIA roles, or accessible labels. Rewrite before merging.
- **No arbitrary waits.** If any test contains `waitForTimeout`, `cy.wait(number)`, or `Thread.sleep`, it is not ready. Replace with explicit condition waits.
- **No shared mutable state.** If test B depends on data created by test A, both tests are broken. Each test must create its own data. Fix before proceeding.
- **Flaky tests block merge.** Any test that fails intermittently on 3 consecutive runs must be remediated or quarantined with a tracking issue before the suite is considered complete.

## Escalation

- **When the application requires a complex auth flow (OAuth, SSO, MFA):** Do not automate the full OAuth redirect in the browser. Use API-based authentication to obtain tokens, then inject them as cookies or headers. If API auth is not available, escalate to the team to expose a test-only auth bypass.
- **When tests require infrastructure not available locally (third-party APIs, payment processors):** Mock the external dependency at the network layer using Playwright route interception or Cypress intercept. If the mock is insufficient for confidence, escalate for a staging environment with sandbox credentials.
- **When flakiness persists after 3 remediation attempts on the same test:** The test may be exposing a real race condition in the application. Escalate the finding as a potential production bug rather than continuing to patch the test.
- **When the E2E suite exceeds 10 minutes on CI:** Triage tests into smoke (must run on every commit) and full (runs on PR merge or nightly). Do not simply accept slow pipelines.
