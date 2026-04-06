import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { SSEManager } from '../sse';
import type { ServerContext } from '../context';

// Single shared manager instance for the process lifetime.
// Tests that need isolation should import and instantiate SSEManager directly.
let sharedManager: SSEManager | null = null;

function getManager(): SSEManager {
  if (!sharedManager) {
    sharedManager = new SSEManager();
  }
  return sharedManager;
}

/** Reset the shared manager (test helper — not exported to client code). */
export function resetManager(): void {
  sharedManager?.stop();
  sharedManager = null;
}

export function buildSseRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/sse', (c) => {
    return streamSSE(c, async (stream) => {
      const manager = getManager();

      // Register the connection — manager handles polling and broadcast
      manager.addConnection(stream, ctx);

      // Send an immediate snapshot so the client doesn't wait 30s for first data
      await manager.tick(ctx);

      // Hold the connection open until the client disconnects (stream.aborted becomes true)
      await new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });
    });
  });

  return router;
}
