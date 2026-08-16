/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthorIntentForm } from '../../../../src/client/components/roadmap/AuthorIntentForm';
import { useToastStore } from '../../../../src/client/stores/toastStore';

/**
 * Component-level acceptance coverage for the author-intent form.
 * Phase 1 of the spec → AC2 (append body), AC4 (empty-title guard),
 * AC5 (409 conflict preserves inputs), plus the success-clears half of AC3.
 * The form is exercised in isolation with a mocked `fetch`; no real
 * `POST /api/roadmap/append` is issued.
 */

function successResponse(body: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 201,
    json: async () => ({ ok: true, featureName: 'X', externalId: 'github:o/r#7', ...body }),
  };
}

function conflictResponse() {
  return {
    ok: false,
    status: 409,
    json: async () => ({
      error: 'conflict',
      code: 'TRACKER_CONFLICT',
      externalId: 'github:o/r#42',
      conflictedWith: '@alice',
      refreshHint: 'reload-roadmap',
    }),
  };
}

beforeEach(() => {
  useToastStore.getState().clear();
  useToastStore.getState().clearSuccess();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthorIntentForm', () => {
  it('renders a Title input and a Description textarea (AC1 fields)', () => {
    render(<AuthorIntentForm />);
    expect(screen.getByLabelText(/what do you want built/i)).toBeDefined();
    expect(screen.getByLabelText(/any detail/i)).toBeDefined();
  });

  it('AC2: submitting posts exactly one /api/roadmap/append with {title, summary}', async () => {
    const fetchSpy = vi.fn(async () => successResponse());
    vi.stubGlobal('fetch', fetchSpy);
    const onCreated = vi.fn();
    render(<AuthorIntentForm onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText(/what do you want built/i), {
      target: { value: '  A weekly digest  ' },
    });
    fireEvent.change(screen.getByLabelText(/any detail/i), {
      target: { value: '  send it every friday  ' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to roadmap/i }));
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/roadmap/append');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'A weekly digest',
      summary: 'send it every friday',
    });
    expect(onCreated).toHaveBeenCalledWith('github:o/r#7');
  });

  it('AC2: omits summary when the Description is empty', async () => {
    const fetchSpy = vi.fn(async () => successResponse());
    vi.stubGlobal('fetch', fetchSpy);
    render(<AuthorIntentForm />);

    fireEvent.change(screen.getByLabelText(/what do you want built/i), {
      target: { value: 'Just a title' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to roadmap/i }));
    });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Just a title' });
  });

  it('AC3 (success half): clears fields and pushes a success toast on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => successResponse({ featureName: 'A weekly digest' }))
    );
    render(<AuthorIntentForm />);

    const title = screen.getByLabelText(/what do you want built/i) as HTMLInputElement;
    const desc = screen.getByLabelText(/any detail/i) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: 'A weekly digest' } });
    fireEvent.change(desc, { target: { value: 'detail' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to roadmap/i }));
    });

    await waitFor(() => expect(title.value).toBe(''));
    expect(desc.value).toBe('');
    expect(useToastStore.getState().success?.kind).toBe('success');
    expect(useToastStore.getState().success?.message).toContain('A weekly digest');
    expect(screen.getByTestId('author-intent-success')).toBeDefined();
  });

  it('AC4: an empty/whitespace title disables submit and issues no fetch', async () => {
    const fetchSpy = vi.fn(async () => successResponse());
    vi.stubGlobal('fetch', fetchSpy);
    render(<AuthorIntentForm />);

    const button = screen.getByRole('button', { name: /add to roadmap/i }) as HTMLButtonElement;
    // Empty by default.
    expect(button.disabled).toBe(true);
    // Whitespace-only stays disabled.
    fireEvent.change(screen.getByLabelText(/what do you want built/i), {
      target: { value: '   ' },
    });
    expect(button.disabled).toBe(true);
    // Even a forced form submit is guarded → no network call.
    await act(async () => {
      fireEvent.submit(button.closest('form') as HTMLFormElement);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('AC5: a 409 conflict surfaces the conflict toast and preserves inputs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => conflictResponse())
    );
    const onCreated = vi.fn();
    render(<AuthorIntentForm onCreated={onCreated} />);

    const title = screen.getByLabelText(/what do you want built/i) as HTMLInputElement;
    const desc = screen.getByLabelText(/any detail/i) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: 'Contested item' } });
    fireEvent.change(desc, { target: { value: 'keep me' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to roadmap/i }));
    });

    await waitFor(() => expect(useToastStore.getState().current?.externalId).toBe('github:o/r#42'));
    expect(useToastStore.getState().current?.conflictedWith).toBe('@alice');
    // Inputs preserved for retry; no success, no onCreated.
    expect(title.value).toBe('Contested item');
    expect(desc.value).toBe('keep me');
    expect(useToastStore.getState().success).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
