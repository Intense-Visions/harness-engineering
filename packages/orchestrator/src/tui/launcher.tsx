import { render } from 'ink';
import { Orchestrator } from '../orchestrator';
import { Dashboard } from './app';

/**
 * Launches the Ink TUI for the given Orchestrator instance.
 * Returns a function to wait for the TUI to exit.
 *
 * @deprecated The TUI is maintained as a fallback for headless/SSH environments.
 * The web dashboard (served at port 8080) is the primary monitoring interface.
 */
export function launchTUI(orchestrator: Orchestrator): { waitUntilExit: () => Promise<void> } {
  console.warn(
    '[DEPRECATED] The TUI is a fallback for headless environments. Use the web dashboard at http://localhost:8080 instead.'
  );
  const { waitUntilExit } = render(<Dashboard orchestrator={orchestrator} />);
  return { waitUntilExit };
}
