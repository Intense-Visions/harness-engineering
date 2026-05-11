import { CONFLICT_PULSE_MS } from './conflict-pulse-config';

/**
 * Locates a FeatureRow by its data-external-id attribute, smooth-scrolls
 * it into view, focuses it, and applies a `data-conflict-highlight`
 * attribute (for `CONFLICT_PULSE_MS` milliseconds) that CSS animates as a
 * pulse ring.
 *
 * Returns true if the row was found, false otherwise (degraded fallback —
 * the toast remains visible, no error thrown).
 */
export function scrollToFeatureRow(externalId: string): boolean {
  if (typeof document === 'undefined') return false;
  // Escape quotes; externalIds contain ":" "#" "/" which are valid in CSS attribute selectors.
  const selector = `[data-external-id="${externalId.replace(/"/g, '\\"')}"]`;
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try {
    el.focus({ preventScroll: true } as FocusOptions);
  } catch {
    el.focus();
  }
  el.setAttribute('data-conflict-highlight', 'true');
  setTimeout(() => {
    el.removeAttribute('data-conflict-highlight');
  }, CONFLICT_PULSE_MS);
  return true;
}
