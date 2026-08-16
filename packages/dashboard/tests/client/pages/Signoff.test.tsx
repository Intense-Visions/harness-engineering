import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Signoff } from '../../../src/client/pages/Signoff';
import { SYSTEM_PAGES } from '../../../src/client/types/thread';

const TWO_ITEM_BASIS = {
  slug: 'acme',
  basisSection: 'Success Criteria' as const,
  items: [
    { id: 'SC1', text: 'First criterion.' },
    { id: 'SC2', text: 'Second criterion.' },
  ],
};

function mockFetch(basis: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/signoff/')) {
      return new Response(JSON.stringify({ data: basis, timestamp: 'now' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
}

function setSlug(slug: string): void {
  window.history.pushState({}, '', `/s/signoff?slug=${slug}`);
}

describe('Signoff — SYSTEM_PAGES wiring (#710 AC-1)', () => {
  it('registers a signoff entry at /s/signoff', () => {
    const entry = SYSTEM_PAGES.find((p) => p.page === 'signoff');
    expect(entry).toBeDefined();
    expect(entry?.route).toBe('/s/signoff');
    expect(entry?.label).toBe('Sign-off');
  });
});

describe('Signoff page — gated submit (#710 AC-7)', () => {
  beforeEach(() => {
    setSlug('acme');
    mockFetch(TWO_ITEM_BASIS);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('disables submit until every item is ruled, an overall verdict is chosen, and a signer is typed', async () => {
    render(<Signoff />);
    await waitFor(() => expect(screen.getByTestId('signoff-item-SC1')).toBeDefined());

    const submit = () => screen.getByTestId('signoff-submit') as HTMLButtonElement;
    // Nothing ruled yet.
    expect(submit().disabled).toBe(true);

    // Rule both items.
    fireEvent.click(screen.getByTestId('disp-SC1-ACCEPT'));
    fireEvent.click(screen.getByTestId('disp-SC2-ACCEPT'));
    expect(submit().disabled).toBe(true); // still no verdict / signer

    // Pick an overall verdict.
    fireEvent.click(screen.getByTestId('decision-ACCEPTED'));
    expect(submit().disabled).toBe(true); // still no signer

    // Type a signer.
    fireEvent.change(screen.getByTestId('signoff-signer'), { target: { value: 'Dana' } });
    expect(submit().disabled).toBe(false);
  });

  it('keeps submit disabled when only some items are ruled', async () => {
    render(<Signoff />);
    await waitFor(() => expect(screen.getByTestId('signoff-item-SC1')).toBeDefined());
    fireEvent.click(screen.getByTestId('disp-SC1-ACCEPT'));
    fireEvent.click(screen.getByTestId('decision-ACCEPTED'));
    fireEvent.change(screen.getByTestId('signoff-signer'), { target: { value: 'Dana' } });
    // SC2 is still unruled → submit stays disabled.
    expect((screen.getByTestId('signoff-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Signoff page — already-signed read-only render (#710 AC-8)', () => {
  beforeEach(() => {
    setSlug('acme');
    mockFetch({
      ...TWO_ITEM_BASIS,
      existing: {
        slug: 'acme',
        decision: 'ACCEPTED',
        signedOffBy: 'Dana',
        signedAt: '2026-08-16T00:00:00.000Z',
        items: [{ id: 'SC1', disposition: 'ACCEPT' }],
        signoffPath: 'docs/changes/acme/signoff.md',
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('renders the prior decision read-only with a "record a new sign-off" affordance', async () => {
    render(<Signoff />);
    await waitFor(() => expect(screen.getByTestId('signoff-existing')).toBeDefined());
    // The checklist / submit is NOT shown while the prior decision stands.
    expect(screen.queryByTestId('signoff-submit')).toBeNull();
    // The affordance to record a new one is present.
    expect(screen.getByTestId('signoff-record-new')).toBeDefined();

    // Clicking it reveals the fresh checklist.
    fireEvent.click(screen.getByTestId('signoff-record-new'));
    await waitFor(() => expect(screen.getByTestId('signoff-submit')).toBeDefined());
  });
});
