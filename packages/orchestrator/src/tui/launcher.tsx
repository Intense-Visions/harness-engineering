import { render } from 'ink';
import { Orchestrator } from '../orchestrator';
import { Dashboard } from './app';

/**
 * Launches the Ink TUI for the given Orchestrator instance.
 * Returns a function to wait for the TUI to exit.
 */
export function launchTUI(orchestrator: Orchestrator): { waitUntilExit: () => Promise<void> } {
  const { waitUntilExit } = render(<Dashboard orchestrator={orchestrator} />);
  return { waitUntilExit };
}
