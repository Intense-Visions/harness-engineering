# Test Accessibility Testing

> Automate WCAG accessibility checks using axe-core with Playwright and jest-axe

## When to Use

- Catching accessibility violations automatically in CI
- Testing keyboard navigation and screen reader compatibility
- Verifying WCAG 2.1 AA compliance in web applications
- Integrating accessibility checks into existing test suites

## Instructions

1. **Playwright + axe-core** for E2E accessibility testing:

```bash
npm install -D @axe-core/playwright
```

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage has no accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});
```

2. **Scan specific sections:**

```typescript
test('login form is accessible', async ({ page }) => {
  await page.goto('/login');

  const results = await new AxeBuilder({ page }).include('#login-form').analyze();

  expect(results.violations).toEqual([]);
});
```

3. **Exclude known issues** while working on fixes:

```typescript
const results = await new AxeBuilder({ page })
  .exclude('#legacy-widget') // Known issue, tracked in JIRA-123
  .disableRules(['color-contrast']) // Temporarily disable specific rules
  .analyze();
```

4. **jest-axe** for component tests:

```bash
npm install -D jest-axe @types/jest-axe
```

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

it('Button component has no a11y violations', async () => {
  const { container } = render(
    <Button onClick={() => {}}>Click me</Button>
  );

  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

5. **Test keyboard navigation:**

```typescript
test('tab order follows visual layout', async ({ page }) => {
  await page.goto('/form');

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Name')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Email')).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeFocused();
});
```

6. **Test keyboard interaction patterns:**

```typescript
test('dropdown opens with Enter and navigates with arrow keys', async ({ page }) => {
  await page.goto('/select');

  const select = page.getByRole('combobox', { name: 'Country' });
  await select.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('listbox')).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(select).toHaveValue('Canada');
});
```

7. **Test ARIA attributes:**

```typescript
test('error messages are associated with inputs', async ({ page }) => {
  await page.goto('/form');

  // Submit empty form to trigger validation
  await page.getByRole('button', { name: 'Submit' }).click();

  const emailInput = page.getByLabel('Email');
  const errorId = await emailInput.getAttribute('aria-describedby');
  expect(errorId).toBeTruthy();

  const errorMessage = page.locator(`#${errorId}`);
  await expect(errorMessage).toHaveText('Email is required');
  await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
});
```

8. **Run accessibility checks on all pages:**

```typescript
const pages = ['/', '/about', '/contact', '/products', '/login'];

for (const path of pages) {
  test(`${path} has no a11y violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
```

## Details

Automated accessibility testing catches approximately 30-50% of WCAG violations. The remaining violations require manual testing (screen reader behavior, cognitive load, content clarity).

**What axe-core catches:**

- Missing alt text on images
- Insufficient color contrast
- Missing form labels
- Invalid ARIA attributes
- Heading level order violations
- Missing lang attribute
- Duplicate IDs
- Keyboard traps

**What axe-core cannot catch:**

- Meaningful alt text (it checks existence, not quality)
- Logical tab order (it checks focusability, not order)
- Screen reader experience (announcement quality, context)
- Cognitive accessibility (plain language, predictable behavior)

**WCAG conformance levels:**

- **A** — minimum accessibility. Most axe rules target this level
- **AA** — standard target for most organizations and legal requirements
- **AAA** — highest level. Rarely required but good to aim for in new projects

**axe-core rule tags:** Filter by conformance level with `.withTags(['wcag2a', 'wcag2aa', 'best-practice'])`.

**Trade-offs:**

- Automated a11y tests catch regressions early — but miss many real-world accessibility issues
- Axe-core has very low false positive rates — but high false negative rates (misses ~50% of issues)
- Component-level testing catches issues early — but some violations only appear in full-page context
- Excluding rules/elements is sometimes necessary — but creates a backlog of known violations that can grow

## Source

https://playwright.dev/docs/accessibility-testing
