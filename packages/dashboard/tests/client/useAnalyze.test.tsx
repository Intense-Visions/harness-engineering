import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAnalyze } from '../../src/client/components/analyze/useAnalyze';
import {
  streamAnalyze,
  type AnalyzeCallbacks,
} from '../../src/client/components/analyze/streamAnalyze';
import { appendToRoadmap } from '../../src/client/utils/appendToRoadmap';
import { buildSpecMarkdown } from '../../src/client/components/analyze/buildSpecMarkdown';
import type { SELResult, CMLResult, PESLResult } from '../../src/client/components/analyze/types';

// ── Collaborators are mocked so the hook is exercised in isolation: no real
//    /api/analyze SSE stream, no /api/roadmap/append, no spec-markdown build.
vi.mock('../../src/client/components/analyze/streamAnalyze', () => ({
  streamAnalyze: vi.fn(),
}));
vi.mock('../../src/client/utils/appendToRoadmap', () => ({
  appendToRoadmap: vi.fn(),
}));
vi.mock('../../src/client/components/analyze/buildSpecMarkdown', () => ({
  buildSpecMarkdown: vi.fn(),
}));

const mockStreamAnalyze = vi.mocked(streamAnalyze);
const mockAppendToRoadmap = vi.mocked(appendToRoadmap);
const mockBuildSpecMarkdown = vi.mocked(buildSpecMarkdown);

// Mirrors the 3s settle delay in useAutoResetAction (source constant).
const AUTO_RESET_MS = 3000;

const selFixture: SELResult = {
  intent: 'Add login',
  summary: 'Adds a login flow',
  affectedSystems: [
    {
      name: 'auth',
      graphNodeId: 'n1',
      confidence: 0.9,
      transitiveDeps: [],
      testCoverage: 0.5,
      owner: null,
    },
  ],
  unknowns: ['u1'],
  ambiguities: ['a1'],
  riskSignals: ['r1'],
};

const cmlFixture: CMLResult = {
  overall: 0.4,
  riskLevel: 'medium',
  confidence: 0.8,
  blastRadius: { services: 1, modules: 2, filesEstimated: 3, testFilesAffected: 1 },
  dimensions: { structural: 0.3, semantic: 0.4, historical: 0.2 },
  reasoning: ['because'],
  recommendedRoute: 'human',
};

const peslFixture: PESLResult = {
  simulatedPlan: ['step'],
  predictedFailures: [],
  riskHotspots: [],
  missingSteps: [],
  testGaps: [],
  executionConfidence: 0.7,
  recommendedChanges: [],
  abort: false,
  tier: 'graph-only',
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAnalyze', () => {
  it('starts idle with empty inputs and no results', () => {
    const { result } = renderHook(() => useAnalyze());
    expect(result.current.title).toBe('');
    expect(result.current.description).toBe('');
    expect(result.current.labels).toBe('');
    expect(result.current.streaming).toBe(false);
    expect(result.current.actionState).toBe('idle');
    expect(result.current.hasResults).toBe(false);
    expect(result.current.isDone).toBe(false);
  });

  it('ignores submit when the title is blank', async () => {
    const { result } = renderHook(() => useAnalyze());
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(mockStreamAnalyze).not.toHaveBeenCalled();
    expect(result.current.streaming).toBe(false);
  });

  it('submits a trimmed body with parsed labels and omits empty description', async () => {
    mockStreamAnalyze.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAnalyze());
    act(() => {
      result.current.setTitle('  Add login  ');
      result.current.setLabels('auth, , security');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(mockStreamAnalyze).toHaveBeenCalledTimes(1);
    const [body] = mockStreamAnalyze.mock.calls[0]!;
    expect(body).toEqual({ title: 'Add login', labels: ['auth', 'security'] });
  });

  it('applies streamed SEL results and settles to done on stream completion', async () => {
    mockStreamAnalyze.mockImplementation(async (_body, callbacks: AnalyzeCallbacks) => {
      callbacks.onStatus('Analyzing…');
      callbacks.onSEL(selFixture);
      callbacks.onDone();
    });
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setTitle('Add login'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.selResult).toEqual(selFixture);
    expect(result.current.status).toBeNull();
    expect(result.current.streaming).toBe(false);
    expect(result.current.hasResults).toBe(true);
    expect(result.current.isDone).toBe(true);
  });

  it('surfaces a stream error and stops streaming', async () => {
    mockStreamAnalyze.mockImplementation(async (_body, callbacks: AnalyzeCallbacks) => {
      callbacks.onError('stream boom');
    });
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setTitle('Add login'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.error).toBe('stream boom');
    expect(result.current.streaming).toBe(false);
  });

  it('aborts the in-flight stream and clears streaming on cancel', async () => {
    let capturedSignal: AbortSignal | undefined;
    // Resolve without onDone so streaming stays true (models an in-flight stream).
    mockStreamAnalyze.mockImplementation(async (_body, _callbacks, signal: AbortSignal) => {
      capturedSignal = signal;
    });
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setTitle('Add login'));
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.streaming).toBe(true);
    act(() => result.current.handleCancel());
    expect(capturedSignal?.aborted).toBe(true);
    expect(result.current.streaming).toBe(false);
  });

  it('moves to roadmap-done when the append succeeds', async () => {
    mockAppendToRoadmap.mockResolvedValue({ ok: true, featureName: 'Add login' });
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setTitle('  Add login  '));
    await act(async () => {
      await result.current.handleAddToRoadmap();
    });
    expect(mockAppendToRoadmap).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Add login' })
    );
    expect(result.current.actionState).toBe('roadmap-done');
    expect(result.current.actionError).toBeNull();
  });

  it('reports the append error and returns to idle on failure', async () => {
    mockAppendToRoadmap.mockResolvedValue({ ok: false, error: 'conflict' });
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setTitle('Add login'));
    await act(async () => {
      await result.current.handleAddToRoadmap();
    });
    expect(result.current.actionState).toBe('idle');
    expect(result.current.actionError).toBe('conflict');
  });

  it('auto-resets a settled action back to idle after the delay', async () => {
    vi.useFakeTimers();
    try {
      mockAppendToRoadmap.mockResolvedValue({ ok: true, featureName: 'Add login' });
      const { result } = renderHook(() => useAnalyze());
      act(() => result.current.setTitle('Add login'));
      await act(async () => {
        await result.current.handleAddToRoadmap();
      });
      expect(result.current.actionState).toBe('roadmap-done');
      act(() => {
        vi.advanceTimersByTime(AUTO_RESET_MS);
      });
      expect(result.current.actionState).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('POSTs a parsed dispatch body and reaches dispatch-done', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const { result } = renderHook(() => useAnalyze());
    act(() => {
      result.current.setTitle(' Add login ');
      result.current.setDescription(' do it ');
      result.current.setLabels('auth, security');
    });
    await act(async () => {
      await result.current.handleDispatchNow();
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/dispatch/adhoc', expect.any(Object));
    const requestBody = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(requestBody).toEqual({
      title: 'Add login',
      description: 'do it',
      labels: ['auth', 'security'],
    });
    expect(result.current.actionState).toBe('dispatch-done');
    expect(result.current.actionError).toBeNull();
  });

  it('surfaces the dispatch error and returns to idle on a non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'dispatch failed' }), { status: 500 })
    );
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setTitle('Add login'));
    await act(async () => {
      await result.current.handleDispatchNow();
    });
    expect(result.current.actionState).toBe('idle');
    expect(result.current.actionError).toBe('dispatch failed');
  });

  it('refines the description from SEL clarifications and clears results', async () => {
    const focusTarget = document.createElement('textarea');
    focusTarget.id = 'analyze-description';
    document.body.appendChild(focusTarget);
    const focusSpy = vi.spyOn(focusTarget, 'focus');

    mockStreamAnalyze.mockImplementation(async (_body, callbacks: AnalyzeCallbacks) => {
      callbacks.onSEL(selFixture);
      callbacks.onDone();
    });
    const { result } = renderHook(() => useAnalyze());
    act(() => {
      result.current.setTitle('Add login');
      result.current.setDescription('original');
    });
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(result.current.hasResults).toBe(true);

    act(() => result.current.handleRefine());

    expect(result.current.description).toBe(
      [
        'original',
        '',
        '---',
        'Suggested clarifications from analysis:',
        '- Unknown: u1',
        '- Ambiguity: a1',
      ].join('\n')
    );
    expect(result.current.selResult).toBeNull();
    expect(result.current.hasResults).toBe(false);
    expect(result.current.actionState).toBe('idle');
    expect(focusSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(focusTarget);
  });

  it('does nothing on refine when there is no SEL result', () => {
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setDescription('unchanged'));
    act(() => result.current.handleRefine());
    expect(result.current.description).toBe('unchanged');
  });

  it('exports a spec download named from the title slug and current date', async () => {
    mockBuildSpecMarkdown.mockReturnValue('# spec');
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    let downloadAttr: string | null = null;
    const clickSpy = vi.fn(function (this: HTMLAnchorElement) {
      downloadAttr = this.download;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickSpy);

    mockStreamAnalyze.mockImplementation(async (_body, callbacks: AnalyzeCallbacks) => {
      callbacks.onSEL(selFixture);
      callbacks.onCML(cmlFixture);
      callbacks.onPESL(peslFixture);
      callbacks.onDone();
    });
    const { result } = renderHook(() => useAnalyze());
    act(() => result.current.setTitle('  Add Login  '));
    await act(async () => {
      await result.current.handleSubmit();
    });

    act(() => result.current.handleExportSpec());

    expect(mockBuildSpecMarkdown).toHaveBeenCalledWith(
      'Add Login',
      selFixture,
      cmlFixture,
      peslFixture
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    expect(downloadAttr).toMatch(/^spec-add-login-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
