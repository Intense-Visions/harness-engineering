/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaintenanceBanners } from '../../../../src/client/components/maintenance/MaintenanceBanners';
import type { MaintenanceData } from '../../../../src/client/components/maintenance/useMaintenanceData';

type MaintenanceEvent = MaintenanceData['maintenanceEvent'];

// Construct fully-typed maintenance events. The component narrows on
// `event.type`, so the exact wire shape matters for behavior.
function errorEvent(taskId: string, error?: string): MaintenanceEvent {
  return { type: 'maintenance:error', data: { taskId, error } } as MaintenanceEvent;
}

function baserefFallbackEvent(ref: string, repoRoot: string): MaintenanceEvent {
  return {
    type: 'maintenance:baseref_fallback',
    data: { ref, repoRoot },
  } as MaintenanceEvent;
}

const DISMISS_BUTTON = { name: /dismiss baseref fallback warning/i };

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('MaintenanceBanners', () => {
  describe('InFlightBanner', () => {
    it('renders nothing when no tasks are in flight', () => {
      const { container } = render(
        <MaintenanceBanners inFlightList={[]} maintenanceEvent={null} />
      );
      expect(container.textContent).toBe('');
    });

    it('names the single running task', () => {
      render(<MaintenanceBanners inFlightList={['refresh-baselines']} maintenanceEvent={null} />);
      expect(screen.getByText(/Running:/)).toBeDefined();
      expect(screen.getByText('refresh-baselines')).toBeDefined();
    });

    it('summarizes count and lists tasks when several are running', () => {
      const tasks = ['a', 'b', 'c'];
      render(<MaintenanceBanners inFlightList={tasks} maintenanceEvent={null} />);
      expect(screen.getByText(new RegExp(`Running ${tasks.length} tasks:`))).toBeDefined();
      expect(screen.getByText(tasks.join(', '))).toBeDefined();
    });
  });

  describe('ErrorEventBanner', () => {
    it('reports the failed task id and error message', () => {
      render(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={errorEvent('doc-drift', 'timed out')}
        />
      );
      expect(screen.getByText('doc-drift')).toBeDefined();
      expect(screen.getByText(/failed: timed out/)).toBeDefined();
    });

    it('renders "failed" without a colon when no error string is present', () => {
      render(<MaintenanceBanners inFlightList={[]} maintenanceEvent={errorEvent('doc-drift')} />);
      const banner = screen.getByText(/failed/);
      expect(banner.textContent).toContain('failed');
      expect(banner.textContent).not.toContain('failed:');
    });

    it('does not render an error banner for a non-error event', () => {
      render(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={baserefFallbackEvent('main', '/repo')}
        />
      );
      expect(screen.queryByText(/failed/)).toBeNull();
    });
  });

  describe('BaserefFallbackBanner', () => {
    it('surfaces the fallback ref and repo root', () => {
      render(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={baserefFallbackEvent('main', '/Users/x/repo')}
        />
      );
      expect(screen.getByText(/base-ref fell back to local/)).toBeDefined();
      expect(screen.getByText('main')).toBeDefined();
      expect(screen.getByText('/Users/x/repo')).toBeDefined();
    });

    it('hides the banner after the user dismisses it', () => {
      render(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={baserefFallbackEvent('main', '/repo')}
        />
      );
      fireEvent.click(screen.getByRole('button', DISMISS_BUTTON));
      expect(screen.queryByText(/base-ref fell back to local/)).toBeNull();
    });

    it('re-appears when a fallback with a different identity arrives', () => {
      const { rerender } = render(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={baserefFallbackEvent('main', '/repo-a')}
        />
      );
      fireEvent.click(screen.getByRole('button', DISMISS_BUTTON));
      expect(screen.queryByText(/base-ref fell back to local/)).toBeNull();

      // A fallback from a different worktree (different repoRoot) must show again.
      rerender(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={baserefFallbackEvent('main', '/repo-b')}
        />
      );
      expect(screen.getByText(/base-ref fell back to local/)).toBeDefined();
      expect(screen.getByText('/repo-b')).toBeDefined();
    });

    it('stays dismissed when the same identity re-arrives', () => {
      const { rerender } = render(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={baserefFallbackEvent('main', '/repo-a')}
        />
      );
      fireEvent.click(screen.getByRole('button', DISMISS_BUTTON));

      rerender(
        <MaintenanceBanners
          inFlightList={[]}
          maintenanceEvent={baserefFallbackEvent('main', '/repo-a')}
        />
      );
      expect(screen.queryByText(/base-ref fell back to local/)).toBeNull();
    });
  });

  it('renders in-flight and error banners together when both apply', () => {
    render(
      <MaintenanceBanners
        inFlightList={['task-1']}
        maintenanceEvent={errorEvent('task-2', 'boom')}
      />
    );
    expect(screen.getByText('task-1')).toBeDefined();
    expect(screen.getByText('task-2')).toBeDefined();
    expect(screen.getByText(/failed: boom/)).toBeDefined();
  });
});
