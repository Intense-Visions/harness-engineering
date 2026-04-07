import type { SSEStreamingApi } from 'hono/streaming';
import { gatherRoadmap } from './gather/roadmap';
import { gatherHealth } from './gather/health';
import { gatherGraph } from './gather/graph';
import { gatherSecurity } from './gather/security';
import { gatherPerf } from './gather/perf';
import { gatherArch } from './gather/arch';
import { gatherAnomalies } from './gather/anomalies';
import type { OverviewData, ChecksData, SSEEvent } from '../shared/types';
import type { GatherCache } from './gather-cache';

/** Minimal context interface used by SSEManager — avoids circular import with context.ts. */
export interface SSEContext {
  roadmapPath: string;
  projectPath: string;
  pollIntervalMs: number;
  gatherCache: GatherCache;
}

/**
 * Manages all active SSE connections and runs a single shared polling loop.
 * When the first client connects the loop starts; when the last disconnects it stops.
 */
export class SSEManager {
  private connections = new Map<SSEStreamingApi, SSEContext>();
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
  addConnection(stream: SSEStreamingApi, ctx: SSEContext): void {
    this.connections.set(stream, ctx);

    stream.onAbort(() => {
      this.connections.delete(stream);
      if (this.connections.size === 0) {
        this.stop();
      }
    });

    if (!this.isRunning) {
      // The first connection's ctx.pollIntervalMs governs the shared loop.
      // Subsequent connections inherit this interval even if their ctx differs.
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

  private start(ctx: SSEContext): void {
    this.timer = setInterval(() => {
      void this.tick(ctx);
    }, ctx.pollIntervalMs);
  }

  /** Gather all data and broadcast an overview event to all connected streams. */
  async tick(ctx: SSEContext): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this._tick(ctx);
    } finally {
      this.ticking = false;
    }
  }

  /** Safely check stream.closed, treating missing property as alive (relies on onAbort). */
  private isStreamClosed(stream: SSEStreamingApi): boolean {
    try {
      return !!(stream as unknown as { closed?: boolean }).closed;
    } catch {
      return false;
    }
  }

  /** Broadcast an SSE event to all connected streams, pruning dead connections. */
  async broadcast(event: SSEEvent): Promise<void> {
    const dead: SSEStreamingApi[] = [];

    for (const [stream] of this.connections) {
      if (stream.aborted || this.isStreamClosed(stream)) {
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

  private async _tick(ctx: SSEContext): Promise<void> {
    const [roadmap, health, graph] = await Promise.all([
      gatherRoadmap(ctx.roadmapPath),
      gatherHealth(ctx.projectPath),
      gatherGraph(ctx.projectPath),
    ]);

    const overview: OverviewData = { roadmap, health, graph };
    const overviewEvent: SSEEvent = {
      type: 'overview',
      data: overview,
      timestamp: new Date().toISOString(),
    };

    // Run expensive gatherers only on first tick (via GatherCache.run)
    const isFirstRun = !ctx.gatherCache.hasRun('security');

    if (isFirstRun) {
      const [security, perf, arch, anomalies] = await Promise.all([
        ctx.gatherCache.run('security', () => gatherSecurity(ctx.projectPath)),
        ctx.gatherCache.run('perf', () => gatherPerf(ctx.projectPath)),
        ctx.gatherCache.run('arch', () => gatherArch(ctx.projectPath)),
        ctx.gatherCache.run('anomalies', () => gatherAnomalies(ctx.projectPath)),
      ]);

      const checksData: ChecksData = {
        security,
        perf,
        arch,
        anomalies,
        lastRun: new Date().toISOString(),
      };

      const checksEvent: SSEEvent = {
        type: 'checks',
        data: checksData,
        timestamp: new Date().toISOString(),
      };

      await this.broadcast(overviewEvent);
      await this.broadcast(checksEvent);
    } else {
      await this.broadcast(overviewEvent);
    }
  }
}
