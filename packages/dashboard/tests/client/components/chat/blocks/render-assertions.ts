import { expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { Matcher } from '@testing-library/react';

/**
 * Shared assertions for the chat-block render suites.
 *
 * These exist because `expect(screen.getByText(x)).toBeDefined()` cannot fail:
 * `getByText` throws when nothing matches and otherwise returns an element,
 * which is always defined — the query does all the work and the matcher adds
 * nothing (test-craft TEST-R002). Asserting cardinality instead gives a matcher
 * that can genuinely fail, catches accidental duplicate rendering, and carries
 * a failure message that names the expected text (TEST-R008).
 */

function queries(scope?: HTMLElement) {
  return scope ? within(scope) : screen;
}

/** Asserts exactly one node matching `text` is rendered, and returns it. */
export function expectRenderedOnce(text: Matcher, scope?: HTMLElement): HTMLElement {
  const matches = queries(scope).queryAllByText(text);
  expect(matches, `expected exactly one rendered node matching ${String(text)}`).toHaveLength(1);
  return matches[0] as HTMLElement;
}

/** Asserts nothing matching `text` is rendered. */
export function expectNotRendered(text: Matcher, scope?: HTMLElement): void {
  const matches = queries(scope).queryAllByText(text);
  expect(matches, `expected no rendered node matching ${String(text)}`).toHaveLength(0);
}
