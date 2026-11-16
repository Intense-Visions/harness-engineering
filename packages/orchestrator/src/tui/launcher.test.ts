import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Orchestrator } from '../orchestrator';

const renderDashboard = vi.fn();
vi.mock('./render', () => ({ renderDashboard }));

import { launchTUI } from './launcher';

// #2059 — launchTUI loads the Ink renderer lazily so `ink` stays out of the
// package's top-level module graph. These tests pin the contract the CLI relies
// on: the synchronous `{ waitUntilExit }` shape, mounting without being awaited,
// and load/mount failures surfacing through waitUntilExit() (never swallowed).
describe('launchTUI (lazy renderer)', () => {
  const orchestrator = {} as Orchestrator;

  beforeEach(() => {
    renderDashboard.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('mounts the dashboard for the orchestrator and resolves when the TUI exits', async () => {
    let exitTui!: () => void;
    renderDashboard.mockReturnValue({
      waitUntilExit: () => new Promise<void>((r) => (exitTui = r)),
    });

    const { waitUntilExit } = launchTUI(orchestrator);
    let exited = false;
    const done = waitUntilExit().then(() => (exited = true));

    await vi.waitFor(() => expect(renderDashboard).toHaveBeenCalledWith(orchestrator));
    expect(exited).toBe(false);
    exitTui();
    await done;
    expect(exited).toBe(true);
  });

  it('mounts even if waitUntilExit is never called', async () => {
    renderDashboard.mockReturnValue({ waitUntilExit: () => Promise.resolve() });
    launchTUI(orchestrator);
    await vi.waitFor(() => expect(renderDashboard).toHaveBeenCalledTimes(1));
  });

  it('surfaces a renderer failure as a rejection of waitUntilExit', async () => {
    renderDashboard.mockImplementation(() => {
      throw new Error('Raw mode is not supported');
    });
    const { waitUntilExit } = launchTUI(orchestrator);
    await expect(waitUntilExit()).rejects.toThrow('Raw mode is not supported');
  });
});
