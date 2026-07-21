import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyzeActionBar } from '../../../../src/client/components/analyze/AnalyzeActionBar';
import type {
  SELResult,
  CMLResult,
  ActionState,
} from '../../../../src/client/components/analyze/types';

function makeSel(overrides?: Partial<SELResult>): SELResult {
  return {
    intent: 'add-feature',
    summary: 'Add a new feature',
    affectedSystems: [],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    ...overrides,
  };
}

function makeCml(overrides?: Partial<CMLResult>): CMLResult {
  return {
    overall: 42,
    riskLevel: 'low',
    confidence: 0.8,
    blastRadius: { services: 1, modules: 2, filesEstimated: 3, testFilesAffected: 4 },
    dimensions: { structural: 0.5, semantic: 0.5, historical: 0.5 },
    reasoning: [],
    recommendedRoute: 'human',
    ...overrides,
  };
}

interface RenderOptions {
  selResult?: SELResult | null;
  cmlResult?: CMLResult | null;
  actionState?: ActionState;
  actionError?: string | null;
}

function renderBar(opts: RenderOptions = {}) {
  const handlers = {
    onAddToRoadmap: vi.fn(),
    onDispatchNow: vi.fn(),
    onRefine: vi.fn(),
    onExportSpec: vi.fn(),
  };
  render(
    <AnalyzeActionBar
      selResult={opts.selResult ?? null}
      cmlResult={opts.cmlResult ?? null}
      actionState={opts.actionState ?? 'idle'}
      actionError={opts.actionError ?? null}
      {...handlers}
    />
  );
  return handlers;
}

const btn = (name: RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AnalyzeActionBar', () => {
  it('renders all four action buttons in the idle default state', () => {
    renderBar();
    expect(btn(/Add to Roadmap/i)).toBeDefined();
    expect(btn(/Dispatch Now/i)).toBeDefined();
    expect(btn(/Refine/i)).toBeDefined();
    expect(btn(/Export Spec/i)).toBeDefined();
  });

  it('disables Dispatch/Refine/Export but enables Add-to-Roadmap when there are no results (idle)', () => {
    renderBar({ selResult: null, cmlResult: null, actionState: 'idle' });
    expect(btn(/Add to Roadmap/i).disabled).toBe(false);
    expect(btn(/Dispatch Now/i).disabled).toBe(true);
    expect(btn(/Refine/i).disabled).toBe(true);
    expect(btn(/Export Spec/i).disabled).toBe(true);
  });

  it('enables Dispatch only for a local recommended route and drops the not-available tooltip', () => {
    const localHandlers = renderBar({ cmlResult: makeCml({ recommendedRoute: 'local' }) });
    expect(btn(/Dispatch Now/i).disabled).toBe(false);
    expect(btn(/Dispatch Now/i).getAttribute('title')).toBeNull();
    fireEvent.click(btn(/Dispatch Now/i));
    expect(localHandlers.onDispatchNow).toHaveBeenCalledTimes(1);
  });

  it('keeps Dispatch disabled with an explanatory tooltip for a non-local route', () => {
    const handlers = renderBar({ cmlResult: makeCml({ recommendedRoute: 'human' }) });
    const dispatch = btn(/Dispatch Now/i);
    expect(dispatch.disabled).toBe(true);
    expect(dispatch.getAttribute('title')).toBe('Only available for local-route items');
    fireEvent.click(dispatch);
    expect(handlers.onDispatchNow).not.toHaveBeenCalled();
  });

  it('enables Refine when the selResult has unknowns and fires its handler on click', () => {
    const handlers = renderBar({ selResult: makeSel({ unknowns: ['what backend?'] }) });
    const refine = btn(/Refine/i);
    expect(refine.disabled).toBe(false);
    fireEvent.click(refine);
    expect(handlers.onRefine).toHaveBeenCalledTimes(1);
  });

  it('enables Refine when the selResult has ambiguities even with no unknowns', () => {
    renderBar({ selResult: makeSel({ unknowns: [], ambiguities: ['scope unclear'] }) });
    expect(btn(/Refine/i).disabled).toBe(false);
  });

  it('disables Refine when the selResult has neither unknowns nor ambiguities', () => {
    renderBar({ selResult: makeSel({ unknowns: [], ambiguities: [] }) });
    expect(btn(/Refine/i).disabled).toBe(true);
  });

  it('enables Export Spec whenever a selResult is present and fires its handler on click', () => {
    const handlers = renderBar({ selResult: makeSel() });
    const exportBtn = btn(/Export Spec/i);
    expect(exportBtn.disabled).toBe(false);
    fireEvent.click(exportBtn);
    expect(handlers.onExportSpec).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner-pending, disabled Add-to-Roadmap during roadmap-pending', () => {
    renderBar({ actionState: 'roadmap-pending' });
    const add = btn(/Add to Roadmap/i);
    expect(add.disabled).toBe(true);
    // label is unchanged while pending (only the icon swaps to a spinner)
    expect(add.textContent).toContain('Add to Roadmap');
  });

  it('marks Add-to-Roadmap done with the "Added" label after roadmap-done', () => {
    renderBar({ actionState: 'roadmap-done' });
    const add = btn(/Added/i);
    expect(add.disabled).toBe(true);
    expect(add.textContent).toContain('Added');
    expect(screen.queryByRole('button', { name: /Add to Roadmap/i })).toBeNull();
  });

  it('marks Dispatch done with the "Dispatched" label after dispatch-done', () => {
    renderBar({ cmlResult: makeCml({ recommendedRoute: 'local' }), actionState: 'dispatch-done' });
    const dispatch = btn(/Dispatched/i);
    expect(dispatch.disabled).toBe(true);
    expect(dispatch.textContent).toContain('Dispatched');
  });

  it('treats an in-flight (busy) state as disabling Add and Dispatch but not Refine or Export', () => {
    // dispatch-pending is a busy, non-settled state
    const handlers = renderBar({
      selResult: makeSel({ unknowns: ['x'] }),
      cmlResult: makeCml({ recommendedRoute: 'local' }),
      actionState: 'dispatch-pending',
    });
    expect(btn(/Add to Roadmap/i).disabled).toBe(true);
    expect(btn(/Dispatch Now/i).disabled).toBe(true);
    // Refine/Export gating ignores busy — they depend only on selResult contents
    expect(btn(/Refine/i).disabled).toBe(false);
    expect(btn(/Export Spec/i).disabled).toBe(false);
    fireEvent.click(btn(/Export Spec/i));
    expect(handlers.onExportSpec).toHaveBeenCalledTimes(1);
  });

  it('re-enables Add-to-Roadmap dispatch from a settled done state (done states are not busy)', () => {
    renderBar({ cmlResult: makeCml({ recommendedRoute: 'local' }), actionState: 'roadmap-done' });
    // roadmap-done is settled, so busy is false and Dispatch stays enabled
    expect(btn(/Dispatch Now/i).disabled).toBe(false);
  });

  it('renders the action error message when one is present', () => {
    renderBar({ actionError: 'Roadmap sync failed' });
    expect(screen.getByText('Roadmap sync failed')).toBeDefined();
  });

  it('does not render an error message when actionError is null', () => {
    renderBar({ actionError: null });
    expect(screen.queryByText(/failed/i)).toBeNull();
  });

  it('fires the add-to-roadmap handler on click when enabled', () => {
    const handlers = renderBar();
    fireEvent.click(btn(/Add to Roadmap/i));
    expect(handlers.onAddToRoadmap).toHaveBeenCalledTimes(1);
  });
});
