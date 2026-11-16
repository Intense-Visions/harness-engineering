import { render } from 'ink';
import type { Orchestrator } from '../orchestrator';
import { Dashboard } from './app';

/**
 * Mounts the Ink dashboard. Kept in its own module so `ink` is only ever loaded
 * through the dynamic `import()` in `launcher.ts` — never at package load time.
 * `ink` pulls in `yoga-wasm-web`, whose top-level `await` makes any `require()`
 * of a graph containing it throw ERR_REQUIRE_ASYNC_MODULE (#2059).
 */
export function renderDashboard(orchestrator: Orchestrator): {
  waitUntilExit: () => Promise<void>;
} {
  const { waitUntilExit } = render(<Dashboard orchestrator={orchestrator} />);
  return { waitUntilExit };
}
