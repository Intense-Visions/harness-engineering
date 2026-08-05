/**
 * Accessibility (ARIA) scanning module.
 *
 * Provides the mechanical, low-false-positive checks promoted from the
 * `a11y-aria-patterns` domain skill and invoked by `harness-accessibility`.
 */

export { AriaScanner } from './scanner';
export { ariaRules } from './rules';
export { ARIA_SCANNABLE_EXTENSIONS } from './types';
export type { AriaRule, AriaFinding, AriaScanResult, AriaSeverity, AriaConfidence } from './types';
