import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router';
import { Routing } from '../../../src/client/pages/Routing';

describe('Routing — route registration (Truth 11)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/v1/routing/config')) {
        return new Response(
          JSON.stringify({
            routing: { default: 'a' },
            resolvedChains: {},
            backends: ['a'],
          }),
          { status: 200 }
        );
      }
      if (url.startsWith('/api/v1/routing/decisions')) {
        return new Response(JSON.stringify({ decisions: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    const StuckWS = function () {
      return {
        readyState: 0,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        close: () => undefined,
      };
    } as unknown as typeof WebSocket;
    vi.stubGlobal('WebSocket', StuckWS);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves /routing → /s/routing via legacy redirect and mounts Routing', async () => {
    render(
      <MemoryRouter initialEntries={['/routing']}>
        <Routes>
          <Route path="/s/routing" element={<Routing />} />
          <Route path="/routing" element={<Navigate to="/s/routing" replace />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('routing-card-chains')).toBeDefined());
  });

  it('mounts Routing directly at /s/routing', async () => {
    render(
      <MemoryRouter initialEntries={['/s/routing']}>
        <Routes>
          <Route path="/s/routing" element={<Routing />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('routing-card-chains')).toBeDefined());
  });
});
