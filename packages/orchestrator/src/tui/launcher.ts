import type { Orchestrator } from '../orchestrator';

/**
 * Launches the Ink TUI for the given Orchestrator instance.
 * Returns a function to wait for the TUI to exit.
 *
 * The renderer is loaded lazily (dynamic `import()`) so that `ink` — whose
 * `yoga-wasm-web` dependency uses top-level `await` — is not part of the
 * package's top-level module graph. A static import made the published CommonJS
 * entry unloadable: `require('@harness-engineering/orchestrator')` threw
 * ERR_REQUIRE_ASYNC_MODULE (#2059). Rendering starts immediately; a failure to
 * load or mount the TUI surfaces as a rejection of `waitUntilExit()`.
 *
 * @deprecated The TUI is maintained as a fallback for headless/SSH environments.
 * The web dashboard (served at port 8080) is the primary monitoring interface.
 */
export function launchTUI(orchestrator: Orchestrator): { waitUntilExit: () => Promise<void> } {
  console.warn(
    '[DEPRECATED] The TUI is a fallback for headless environments. Use the web dashboard at http://localhost:8080 instead.'
  );
  const mounted = import('./render').then((m) => m.renderDashboard(orchestrator));
  // Attach a no-op handler so a load failure is not reported as an unhandled
  // rejection before the caller gets the chance to await waitUntilExit().
  mounted.catch(() => {});
  return { waitUntilExit: () => mounted.then((tui) => tui.waitUntilExit()) };
}
