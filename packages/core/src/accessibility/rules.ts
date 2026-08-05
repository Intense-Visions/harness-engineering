import type { AriaRule } from './types';

/**
 * ARIA rules — the mechanical, load-bearing subset of the `a11y-aria-patterns`
 * domain skill.
 *
 * Only two of the skill's assertions are decidable from a single element with
 * near-zero false positives; those are enforced here. The rest of the skill
 * (accessible-name presence, role-appropriate keyboard handlers, live-region
 * semantics) stays advisory prose because a pattern match cannot decide them
 * without data-flow, and a noisy accessibility gate is worse than an advisory.
 *
 * Both rules deliberately fire only on statically-true attribute values:
 *   - `aria-hidden` dynamic bindings (`aria-hidden={isHidden}`) are NOT flagged
 *     because they may resolve to false at runtime.
 *   - `tabIndex={0}` / `tabIndex={-1}` are NOT flagged — only positive indices
 *     disrupt the natural tab order.
 */

// `aria-hidden` set to a literal true, OR the JSX bare-attribute shorthand
// (`aria-hidden` with no `=`, which means true). A dynamic binding such as
// `aria-hidden={isHidden}` is excluded by the negative lookahead on `=`.
const ARIA_HIDDEN_TRUE = String.raw`aria-hidden(?:\s*=\s*(?:["']true["']|\{\s*true\s*\})|(?!\s*=))`;

export const ariaRules: AriaRule[] = [
  {
    // ARIA rule #4: never put aria-hidden="true" on a focusable element — it
    // creates a control that receives keyboard focus while being invisible to
    // assistive technology. Restricted to natively-focusable tags (and <a> only
    // when it carries href) so non-interactive decorative elements never match.
    id: 'A11Y-014',
    name: 'aria-hidden on focusable element',
    severity: 'error',
    confidence: 'high',
    patterns: [
      new RegExp(String.raw`<(?:button|input|select|textarea)\b[^>]*?\b${ARIA_HIDDEN_TRUE}`),
      new RegExp(String.raw`<a\b(?=[^>]*?\bhref\b)[^>]*?\b${ARIA_HIDDEN_TRUE}`),
    ],
    message:
      'aria-hidden="true" on a focusable element — the element stays keyboard-focusable but is removed from the accessibility tree, stranding assistive-technology users on an invisible control',
    remediation:
      'Remove aria-hidden from the focusable element. To hide it from everyone, also remove it from the tab order (e.g. disable it or render it conditionally).',
    references: ['WCAG 4.1.2', 'ARIA rule #4'],
  },
  {
    // Positive tabindex overrides the DOM order and produces an unpredictable
    // focus sequence. tabIndex={0} (in natural order) and tabIndex={-1}
    // (programmatically focusable) are both fine and are not matched.
    id: 'A11Y-042',
    name: 'positive tabindex',
    severity: 'warning',
    confidence: 'high',
    patterns: [/\btabindex\s*=\s*["'][1-9]\d*["']/i, /\btabindex\s*=\s*\{\s*[1-9]\d*\s*\}/i],
    message:
      'Positive tabindex disrupts the natural tab order — focus jumps out of DOM sequence and becomes unpredictable for keyboard users',
    remediation:
      'Use tabIndex={0} to include an element in the natural tab order, or tabIndex={-1} to make it programmatically focusable only. Order the DOM to match the intended focus flow.',
    references: ['WCAG 2.4.3'],
  },
];
