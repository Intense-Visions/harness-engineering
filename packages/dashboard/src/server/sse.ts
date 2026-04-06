import type { SSEStreamingApi } from 'hono/streaming';
import { gatherRoadmap } from './gather/roadmap';
import { gatherHealth } from './gather/health';
import { gatherGraph } from './gather/graph';
import type { OverviewData, SSEEvent } from '../shared/types';
import type { ServerContext } from './context';

/**
 * Manages all active SSE connections and runs a single shared polling loop.
 * When the first client connects the loop starts; when the last disconnects it stops.
 */
export class SSEManager {
  private connections = new Map<SSEStreamingApi, ServerContext>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  get connectionCount(): number {
    return this.connections.size;
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Register a new SSE stream. Starts the polling loop if this is the first connection.
   * Automatically removes the stream when it aborts (client disconnects).
   */
  addConnection(stream: SSEStreamingApi, ctx: ServerContext): void {
    this.connections.set(stream, ctx);

    stream.onAbort(() => {
      this.connections.delete(stream);
      if (this.connections.size === 0) {
        this.stop();
      }
    });

    if (!this.isRunning) {
      this.start(ctx);
    }
  }

  /** Stop the polling loop and clear all connections. */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private start(ctx: ServerContext): void {
    this.timer = setInterval(() => {
      void this.tick(ctx);
    }, ctx.pollIntervalMs);
  }

  /** Gather all data and broadcast an overview event to all connected streams. */
  async tick(ctx: ServerContext): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this._tick(ctx);
    } finally {
      this.ticking = false;
    }
  }

  private async _tick(ctx: ServerContext): Promise<void> {
    const [roadmap, health, graph] = await Promise.all([
      gatherRoadmap(ctx.roadmapPath),
      gatherHealth(ctx.projectPath),
      gatherGraph(ctx.projectPath),
    ]);

    const overview: OverviewData = { roadmap, health, graph };
    const event: SSEEvent = {
      type: 'overview',
      data: overview,
      timestamp: new Date().toISOString(),
    };

    const dead: SSEStreamingApi[] = [];

    for (const [stream] of this.connections) {
      if (stream.aborted || stream.closed) {
        dead.push(stream);
        continue;
      }
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event),
        });
      } catch {
        dead.push(stream);
      }
    }

    for (const stream of dead) {
      this.connections.delete(stream);
    }
    if (this.connections.size === 0) {
      this.stop();
    }
  }
}
