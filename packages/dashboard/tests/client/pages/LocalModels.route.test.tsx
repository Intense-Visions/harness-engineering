import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router';
import { LocalModels } from '../../../src/client/pages/LocalModels';
import { SYSTEM_PAGES } from '../../../src/client/types/thread';

describe('LocalModels — route registration (Truth 9)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        // Minimal 200s so every card mounts without throwing.
        new Response('[]', { status: 200 })
    );
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

  it('SYSTEM_PAGES registers a local-models entry at /s/local-models', () => {
    const entry = SYSTEM_PAGES.find((p) => p.page === 'local-models');
    expect(entry).toBeDefined();
    expect(entry?.route).toBe('/s/local-models');
  });

  it('resolves /local-models → /s/local-models via legacy redirect and mounts the panel', async () => {
    render(
      <MemoryRouter initialEntries={['/local-models']}>
        <Routes>
          <Route path="/s/local-models" element={<LocalModels />} />
          <Route path="/local-models" element={<Navigate to="/s/local-models" replace />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('local-models-page')).toBeDefined());
  });

  it('mounts LocalModels directly at /s/local-models', async () => {
    render(
      <MemoryRouter initialEntries={['/s/local-models']}>
        <Routes>
          <Route path="/s/local-models" element={<LocalModels />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('local-models-page')).toBeDefined());
  });
});
