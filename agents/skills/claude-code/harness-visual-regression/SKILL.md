# Harness Visual Regression

> Screenshot comparison, visual diff detection, and baseline management. Catches unintended CSS regressions, layout shifts, and rendering inconsistencies before they reach production.

## When to Use

- Adding visual regression coverage for UI components or pages
- Reviewing visual changes in a pull request before merge
- Updating baselines after intentional design changes
- NOT when testing interactive user flows (use harness-e2e instead)
- NOT when testing component behavior or state (use unit tests or harness-tdd instead)
- NOT when auditing accessibility compliance (use harness-accessibility instead)

## Process

### Phase 1: DETECT -- Identify UI Components and Rendering Infrastructure

1. **Scan for existing visual test infrastructure.** Search for:
   - Storybook configuration (`.storybook/`, `*.stories.tsx`, `*.stories.ts`)
   - Visual testing tools (Chromatic config, `percy.yml`, Playwright screenshot tests)
   - Existing baseline directories (`screenshots/`, `__image_snapshots__/`, `visual-tests/`)

2. **Catalog testable components.** Identify UI surfaces that benefit from visual testing:
   - Shared design system components (buttons, forms, modals, navigation)
   - Page-level layouts (dashboard, settings, landing page)
   - Responsive breakpoints (mobile, tablet, desktop)
   - Theme variants (light mode, dark mode)
   - States (loading, empty, error, populated)

3. **Determine the rendering strategy.** Choose how screenshots are captured:
   - **Storybook + Chromatic/Percy:** best for component libraries with existing stories
   - **Playwright screenshots:** best for full-page and integration-level visual tests
   - **Jest + jest-image-snapshot:** best for lightweight component rendering with jsdom or happy-dom
   - **Cypress + Percy plugin:** best when Cypress is already the E2E framework

4. **Identify viewport and theme matrix.** Define the combinations to test:
   - Viewports: 375px (mobile), 768px (tablet), 1280px (desktop), 1920px (wide)
   - Themes: light, dark (if supported)
   - Locales: LTR, RTL (if internationalized)

5. **Report findings.** Summarize: components to cover, rendering strategy, viewport matrix, and estimated baseline count.

### Phase 2: BASELINE -- Capture Reference Screenshots

1. **Configure the visual testing tool.** Set up:
   - Screenshot output directory with `.gitkeep` or add to `.gitignore` as appropriate
   - Threshold for pixel-level diff tolerance (recommended: 0.1% for component tests, 0.5% for full-page tests)
   - Anti-aliasing handling to avoid false positives across different rendering engines
   - Font loading: wait for web fonts to load before capture, or use a system font fallback in test mode

2. **Stabilize rendering for deterministic screenshots.** Address common sources of non-determinism:
   - Disable CSS animations and transitions in test mode
   - Mock dates and times to prevent timestamp-based changes
   - Replace dynamic content (avatars, ads, user-generated content) with stable placeholders
   - Set a fixed random seed for any randomized UI elements

3. **Capture baseline screenshots.** For each component in the test matrix:
   - Render the component in each viewport and theme combination
   - Wait for fonts, images, and lazy-loaded content to fully render
   - Capture and save the screenshot to the baseline directory

4. **Review baselines manually.** Before committing, visually inspect every baseline screenshot. Confirm:
   - The component renders correctly at each viewport
   - No rendering artifacts (clipped text, missing icons, broken layouts)
   - The screenshot captures the full component without excessive whitespace

5. **Commit baselines.** Add baseline screenshots to version control with a descriptive commit message. These baselines become the source of truth for future comparisons.

### Phase 3: COMPARE -- Run Visual Diffs Against Baselines

1. **Execute visual comparison.** Run the visual test suite, which:
   - Renders each component in the same viewport/theme matrix
   - Captures a new screenshot for each combination
   - Compares the new screenshot against the stored baseline pixel-by-pixel
   - Reports differences that exceed the configured threshold

2. **Classify each diff.** For every screenshot that exceeds the threshold:
   - **Intentional change:** the diff corresponds to a deliberate design update in the current PR. Mark for baseline update.
   - **Regression:** the diff is unintended and represents a visual bug. Flag for investigation.
   - **Environmental noise:** the diff is caused by rendering differences (sub-pixel anti-aliasing, font hinting). Increase threshold or stabilize rendering.

3. **Investigate regressions.** For each regression:
   - Identify the CSS or component change that caused the visual shift
   - Determine if the change is localized (one component) or cascading (layout shift affecting multiple components)
   - Check if the change is caused by a dependency update (CSS framework, icon library)

4. **Update baselines for intentional changes.** When a visual change is confirmed intentional:
   - Re-capture the baseline for affected screenshots
   - Review the updated baseline to confirm it matches the design intent
   - Commit updated baselines alongside the code change

5. **Generate a diff report.** Produce a summary showing:
   - Total screenshots compared
   - Screenshots unchanged (passed)
   - Screenshots with intentional changes (baselines updated)
   - Screenshots with regressions (flagged for fix)

### Phase 4: REPORT -- Generate Visual Diff Report and Approval Workflow

1. **Create a visual diff summary for PR review.** Include:
   - Side-by-side comparison images for each changed screenshot
   - Diff overlay highlighting the pixels that changed
   - Percentage of pixels changed per screenshot
   - Grouped by component and viewport

2. **Integrate with CI pipeline.** Configure the visual test suite to:
   - Run automatically on every pull request
   - Block merge when unapproved visual changes are detected
   - Provide a link to the visual diff report in the PR status check

3. **Define the approval workflow.** Establish:
   - Who can approve visual changes (design team, frontend lead)
   - How approvals are recorded (PR comment, Chromatic approval, Percy review)
   - What constitutes an "auto-approve" (changes below threshold, test-only files)

4. **Run `harness validate`.** Confirm the project passes all harness checks with visual testing infrastructure in place.

5. **Document the visual testing workflow.** Record:
   - How to run visual tests locally
   - How to update baselines after intentional changes
   - How to add visual tests for new components
   - Where to find the diff report in CI

### Graph Refresh

If a knowledge graph exists at `.harness/graph/`, refresh it after code changes to keep graph queries accurate:

```
harness scan [path]
```

## Harness Integration

- **`harness validate`** -- Run in REPORT phase after visual testing infrastructure is complete. Confirms project health.
- **`harness check-deps`** -- Run after BASELINE phase to verify visual testing dependencies are in devDependencies.
- **`emit_interaction`** -- Used to present visual diff results and request human approval for baseline updates.
- **Glob** -- Used in DETECT phase to find Storybook stories, existing screenshots, and component files.
- **Grep** -- Used to search for CSS animation properties, dynamic content patterns, and non-deterministic rendering.

## Success Criteria

- Every shared design system component has visual baselines for at least mobile and desktop viewports
- Visual diffs are deterministic: running the same code produces the same screenshots every time
- No false positives: environmental noise (font rendering, anti-aliasing) does not trigger diff failures
- Intentional changes are distinguished from regressions in the diff report
- Baselines are committed to version control and updated alongside code changes
- CI blocks merge when unapproved visual changes are detected
- `harness validate` passes with visual testing infrastructure in place

## Examples

### Example: Playwright Visual Regression for a React App

**BASELINE -- Capture component screenshots:**

```typescript
// visual-tests/components.spec.ts
import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 720 },
];

for (const viewport of viewports) {
  test.describe(`${viewport.name} viewport`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dashboard renders correctly', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      // Disable animations for deterministic screenshots
      await page.addStyleTag({
        content:
          '*, *::before, *::after { animation: none !important; transition: none !important; }',
      });
      await expect(page).toHaveScreenshot(`dashboard-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.005,
        fullPage: true,
      });
    });

    test('settings page renders correctly', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      await page.addStyleTag({
        content:
          '*, *::before, *::after { animation: none !important; transition: none !important; }',
      });
      await expect(page).toHaveScreenshot(`settings-${viewport.name}.png`, {
        maxDiffPixelRatio: 0.005,
      });
    });
  });
}
```

### Example: Storybook with Chromatic

**DETECT output:**

```
Storybook: v7.6 detected (.storybook/main.ts)
Stories: 47 stories across 23 components
Chromatic: not configured
Existing baselines: none
Components without stories: Modal, Toast, DatePicker (3 gaps)
```

**BASELINE -- Configure Chromatic and run first build:**

```json
// package.json (relevant scripts)
{
  "scripts": {
    "chromatic": "chromatic --project-token=${CHROMATIC_PROJECT_TOKEN}",
    "chromatic:ci": "chromatic --project-token=${CHROMATIC_PROJECT_TOKEN} --exit-zero-on-changes --auto-accept-changes main"
  }
}
```

```typescript
// .storybook/preview.ts -- stabilize rendering
import { Preview } from '@storybook/react';

const preview: Preview = {
  parameters: {
    chromatic: {
      pauseAnimationAtEnd: true,
      viewports: [375, 768, 1280],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ fontFamily: 'Arial, sans-serif' }}>
        <Story />
      </div>
    ),
  ],
};

export default preview;
```

## Rationalizations to Reject

| Rationalization                                                                                                      | Reality                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The baseline screenshots are committed locally but not pushed — CI can capture its own baselines on the first run." | CI baselines captured without human review become the source of truth for a rendering state nobody verified. Every baseline must be manually inspected before committing. A CI-generated baseline for a broken layout will pass every future comparison until someone notices the visual bug manually.                                               |
| "The diff is only 0.3% of pixels — it's probably just font rendering noise, not a real regression."                  | "Probably" is not a classification. Investigate the diff to determine if it is environmental noise or a real change before dismissing it. If it is noise, fix the source (fonts, animations) and lower the threshold. If it is a real change, update the baseline with intent. Skipping investigation means regressions hide behind noise tolerance. |
| "We have 300 components — it's not practical to have baselines for all of them."                                     | Start with shared design system components (buttons, inputs, modals) and page-level layouts. Partial coverage is better than none, and it is easier to add coverage incrementally than to audit an entire codebase for visual regressions after the fact. Prioritize high-visibility, high-change-frequency surfaces first.                          |
| "The visual test suite takes 20 minutes — let's just run it manually before releases instead of in CI."              | Manual pre-release checks are skipped under deadline pressure. Visual regression is most valuable on every PR, where the author is still in context and the fix is immediate. A 20-minute suite is a signal to optimize (affected-story detection, parallelization), not to remove CI integration.                                                   |
| "The component changed intentionally — I'll just auto-accept the diff without reviewing the new screenshot."         | Auto-accepting without review permanently resets the baseline to whatever was rendered, correct or not. Every baseline update requires a human to look at the new screenshot and confirm it matches design intent. The review is not a formality — it is the entire point of the approval workflow.                                                  |

## Gates

- **No non-deterministic screenshots.** If the same code produces different screenshots on consecutive runs, the rendering is not stabilized. Fix animations, dynamic content, and font loading before capturing baselines.
- **No uncommitted baselines.** Baseline screenshots must be in version control. If baselines exist only on a developer's machine, CI cannot compare against them. Commit baselines with the code that creates them.
- **No threshold above 1%.** A pixel diff threshold above 1% hides real regressions. If environmental noise requires a higher threshold, fix the noise source (fonts, animations) rather than raising the threshold.
- **No visual tests without review workflow.** Visual tests that run but whose results are never reviewed provide false confidence. Every visual diff must have a defined approval path.

## Escalation

- **When screenshots differ between local and CI environments:** This is usually caused by different font rendering, display scaling, or browser versions. Standardize by running visual tests in Docker with a fixed browser version and system fonts. Do not try to match local and CI rendering -- pick one as the source of truth.
- **When baseline updates flood a PR with hundreds of changed screenshots:** Group changes by root cause. If a single CSS variable change cascades to 200 screenshots, approve the root cause and batch-update baselines. Consider whether the cascade indicates a design system architecture issue.
- **When dynamic content (user avatars, timestamps, ads) causes false positives:** Mock or replace dynamic content in the test environment. Use Storybook args or Playwright route interception to inject stable placeholder content.
- **When the visual test suite takes too long (> 15 minutes):** Prioritize components by change frequency. Run the full visual suite nightly, and only test changed components on each PR using affected-story detection.
