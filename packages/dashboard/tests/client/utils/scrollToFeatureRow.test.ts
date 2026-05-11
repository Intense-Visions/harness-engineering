/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scrollToFeatureRow } from '../../../src/client/utils/scrollToFeatureRow';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('scrollToFeatureRow', () => {
  it('returns false when no element matches the externalId', () => {
    expect(scrollToFeatureRow('github:o/r#missing')).toBe(false);
  });

  it('calls scrollIntoView + focus on the matching element and sets the highlight attr', () => {
    const el = document.createElement('div');
    el.setAttribute('data-external-id', 'github:o/r#42');
    el.tabIndex = -1;
    const scrollSpy = vi.fn();
    const focusSpy = vi.spyOn(el, 'focus');
    el.scrollIntoView = scrollSpy as unknown as typeof el.scrollIntoView;
    document.body.appendChild(el);

    const ok = scrollToFeatureRow('github:o/r#42');

    expect(ok).toBe(true);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(focusSpy).toHaveBeenCalled();
    expect(el.getAttribute('data-conflict-highlight')).toBe('true');
  });

  it('clears the highlight attribute after the timeout', async () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    el.setAttribute('data-external-id', 'github:o/r#7');
    el.tabIndex = -1;
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    scrollToFeatureRow('github:o/r#7');
    expect(el.getAttribute('data-conflict-highlight')).toBe('true');
    vi.advanceTimersByTime(2100);
    expect(el.hasAttribute('data-conflict-highlight')).toBe(false);
    vi.useRealTimers();
  });
});
