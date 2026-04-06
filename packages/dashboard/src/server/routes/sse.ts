import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ServerContext } from '../context';

export function buildSseRouter(ctx: ServerContext): Hono {
  const router = new Hono();

  router.get('/sse', (c) => {
    return streamSSE(c, async (stream) => {
      const manager = ctx.sseManager;

      // Hold the connection open until disconnect. Register BEFORE addConnection
      // and BEFORE the initial tick so early disconnects are never missed.
      const closed = new Promise<void>((resolve) => {
        stream.onAbort(resolve);
      });

      // Register the connection — manager handles polling and broadcast
      manager.addConnection(stream, ctx);

      // Send an immediate snapshot so the client doesn't wait 30s for first data
      await manager.tick(ctx);

      await closed;
    });
  });

  return router;
}
