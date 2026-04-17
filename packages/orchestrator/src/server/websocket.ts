import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * Manages WebSocket connections and broadcasts typed messages to all clients.
 *
 * Attaches to an existing HTTP server via the 'upgrade' event.
 * Only accepts connections to the /ws path.
 *
 * When a `getSnapshot` callback is provided, each newly connected client
 * immediately receives the current orchestrator state so the dashboard
 * doesn't have to wait for the next event-driven broadcast.
 */
export class WebSocketBroadcaster {
  private wss: WebSocketServer;
  private getSnapshot: (() => Record<string, unknown>) | null;

  constructor(httpServer: HttpServer, getSnapshot?: () => Record<string, unknown>) {
    this.wss = new WebSocketServer({ noServer: true });
    this.getSnapshot = getSnapshot ?? null;

    this.wss.on('connection', (ws) => {
      if (this.getSnapshot) {
        const msg = JSON.stringify({ type: 'state_change', data: this.getSnapshot() });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(msg);
        }
      }
    });

    httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request);
      });
    });
  }

  /**
   * Broadcast a typed message to all connected clients.
   *
   * @param type - Message type discriminator (e.g. 'state_change', 'interaction_new', 'agent_event')
   * @param data - Payload to send
   */
  broadcast(type: string, data: unknown): void {
    const message = JSON.stringify({ type, data });
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /** Number of currently connected clients. */
  get clientCount(): number {
    return this.wss.clients.size;
  }

  /** Close all connections and the underlying WebSocketServer. */
  close(): void {
    for (const client of this.wss.clients) {
      client.close();
    }
    this.wss.close();
  }
}
