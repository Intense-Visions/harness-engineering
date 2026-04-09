# Accessibility Testing Automation

> Automate accessibility testing with axe-core, jest-axe, Playwright, and CI pipeline integration

## When to Use

- Setting up automated accessibility testing for a project
- Adding a11y checks to existing unit or integration tests
- Catching accessibility regressions in CI before they reach production
- Complementing manual screen reader testing with automated scans
- Enforcing accessibility standards across a team

## Instructions

1. **Add axe-core to component tests with jest-axe.** This catches common violations (missing labels, invalid ARIA, contrast issues) in rendered components.

```bash
npm install -D jest-axe @types/jest-axe
```

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('LoginForm', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<LoginForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have no violations in error state', async () => {
    const { container } = render(<LoginForm errors={{ email: 'Required' }} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

2. **Test all component states.** Accessibility violations often appear in specific states — error states, loading states, empty states, expanded states. Test each variation.

```typescript
const states = [
  { name: 'default', props: {} },
  { name: 'loading', props: { isLoading: true } },
  { name: 'error', props: { error: 'Something went wrong' } },
  { name: 'empty', props: { items: [] } },
];

states.forEach(({ name, props }) => {
  it(`should have no a11y violations in ${name} state`, async () => {
    const { container } = render(<DataTable {...props} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

3. **Add axe to Playwright for full-page accessibility testing.**

```bash
npm install -D @axe-core/playwright
```

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage should have no a11y violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});

test('checkout flow should have no a11y violations', async ({ page }) => {
  await page.goto('/checkout');
  // Fill form to trigger validation states
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]');

  const results = await new AxeBuilder({ page })
    .exclude('.third-party-widget') // Exclude content you do not control
    .analyze();

  expect(results.violations).toEqual([]);
});
```

4. **Use eslint-plugin-jsx-a11y for static analysis in React projects.** This catches violations at authoring time, before tests run.

```bash
npm install -D eslint-plugin-jsx-a11y
```

```json
{
  "extends": ["plugin:jsx-a11y/recommended"],
  "plugins": ["jsx-a11y"]
}
```

Key rules this enables:

- `alt-text` — images must have `alt`
- `anchor-is-valid` — `<a>` must have `href`
- `click-events-have-key-events` — `onClick` must have `onKeyDown`/`onKeyUp`
- `label-has-associated-control` — labels must be linked to inputs
- `no-noninteractive-element-interactions` — no click handlers on divs

5. **Use Testing Library's accessible queries by default.** Queries like `getByRole`, `getByLabelText`, and `getByAltText` verify accessibility as a side effect of writing tests.

```typescript
import { render, screen } from '@testing-library/react';

// These queries fail if accessibility is broken
const submitButton = screen.getByRole('button', { name: 'Submit' });
const emailInput = screen.getByLabelText('Email address');
const logo = screen.getByAltText('Company Logo');
const nav = screen.getByRole('navigation', { name: 'Main' });
const alert = screen.getByRole('alert');
```

6. **Run accessibility checks in CI as a required gate.** Fail the build on new violations.

```yaml
# GitHub Actions
- name: Run a11y tests
  run: npx playwright test --grep @a11y

- name: Run component a11y tests
  run: npx vitest run --grep "accessibility"
```

7. **Configure axe to match your target WCAG level.** Focus on WCAG 2.1 AA for most projects. Filter by tags to avoid noise from rules you are not targeting.

```typescript
const results = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
  .disableRules(['color-contrast']) // Disable if you have a separate contrast testing workflow
  .analyze();
```

8. **Generate accessibility reports for tracking progress.**

```typescript
import { createHtmlReport } from 'axe-html-reporter';

const results = await new AxeBuilder({ page }).analyze();
createHtmlReport({
  results,
  options: { outputDir: 'a11y-reports', reportFileName: 'homepage.html' },
});
```

## Details

**What automated testing catches (~30-40% of issues):**

- Missing alt text, labels, and accessible names
- Invalid ARIA (wrong roles, missing required attributes)
- Color contrast violations (for static content)
- Duplicate IDs
- Missing document language
- Missing form field associations

**What automated testing misses (~60-70% of issues):**

- Logical heading hierarchy (tools detect missing headings, not poor hierarchy)
- Meaningful alt text (tools check presence, not quality)
- Focus management in dynamic content
- Keyboard interaction patterns for custom widgets
- Screen reader announcement quality and timing
- Touch target size on mobile

**Testing pyramid for accessibility:**

1. **Linting (eslint-plugin-jsx-a11y):** Instant feedback, catches ~15% of issues
2. **Component tests (jest-axe):** Fast, catches ~25% of issues per component state
3. **Integration tests (Playwright + axe):** Full page context, catches ~35% of issues
4. **Manual testing (screen reader + keyboard):** Catches the remaining ~60-70%

**Handling existing violations:** When adding axe to an existing project, you may find hundreds of violations. Use `disableRules` or `exclude` selectively to establish a baseline, then fix violations incrementally and remove exclusions over time.

## Source

https://github.com/dequelabs/axe-core

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
