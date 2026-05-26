import type { RoutingDecision } from '@harness-engineering/types';
import type { StructuredLogger } from '../logging/logger.js';

export interface RoutingDecisionBusFilter {
  skillName?: string;
  mode?: string;
  backendName?: string;
  limit?: number;
}

export interface RoutingDecisionBusOptions {
  /** Default 500. Bound on the in-memory ring buffer. */
  capacity?: number;
  /**
   * Logger for the structured `routing-decision` line (O1) and for
   * one-off warn() when a subscriber throws (S6). When omitted, the
   * bus silently swallows subscriber errors (test-mode default).
   */
  logger?: StructuredLogger;
}

/**
 * Spec B Phase 4 (D8): in-process bus + ring buffer for
 * {@link RoutingDecision} events. One emit() per
 * {@link BackendRouter.resolve} call; subscribers receive the
 * decision synchronously after the ring buffer is updated.
 *
 * Subscriber errors are isolated (caught + logged, never thrown
 * back to the emitter) so a misbehaving subscriber cannot block a
 * dispatch. (S6)
 *
 * Capacity-bound (default 500) via Array.shift() — acceptable for
 * v1 (see plan C4); switch to circular indexing if 24h dispatch
 * volume ever pushes 10K+ records/min.
 */
export class RoutingDecisionBus {
  private readonly ringBuffer: RoutingDecision[] = [];
  private readonly listeners = new Set<(d: RoutingDecision) => void>();
  private readonly capacity: number;
  private readonly logger: StructuredLogger | undefined;

  constructor(opts?: RoutingDecisionBusOptions) {
    this.capacity = opts?.capacity ?? 500;
    this.logger = opts?.logger;
  }

  emit(decision: RoutingDecision): void {
    this.ringBuffer.push(decision);
    if (this.ringBuffer.length > this.capacity) {
      this.ringBuffer.shift();
    }
    // O1: one structured line per emit.
    if (this.logger) {
      this.logger.info('routing-decision', {
        useCase: decision.useCase,
        backendName: decision.backendName,
        resolutionPathLength: decision.resolutionPath.length,
        durationMs: decision.durationMs,
      });
    }
    // S6: subscriber errors are caught + logged, never propagated.
    for (const listener of this.listeners) {
      try {
        listener(decision);
      } catch (err) {
        if (this.logger) {
          this.logger.warn('RoutingDecisionBus subscriber threw', {
            error: String(err),
          });
        }
      }
    }
  }

  recent(filter?: RoutingDecisionBusFilter): RoutingDecision[] {
    let out = this.ringBuffer.slice();
    if (filter?.skillName !== undefined) {
      out = out.filter(
        (d) => d.useCase.kind === 'skill' && d.useCase.skillName === filter.skillName
      );
    }
    if (filter?.mode !== undefined) {
      const m = filter.mode;
      out = out.filter(
        (d) =>
          (d.useCase.kind === 'mode' && d.useCase.cognitiveMode === m) ||
          (d.useCase.kind === 'skill' && d.useCase.cognitiveMode === m)
      );
    }
    if (filter?.backendName !== undefined) {
      out = out.filter((d) => d.backendName === filter.backendName);
    }
    // Spec B Phase 5 (review-S1 fix): "recent" returns newest-first. The
    // ring buffer is insertion-order (oldest at [0]); take the last N then
    // reverse so callers (dashboard rows, CLI top-to-bottom) get the most
    // recent decision first. Filters run BEFORE the slice so `limit` bounds
    // the filtered set rather than the raw buffer.
    if (filter?.limit !== undefined) {
      out = out.slice(-filter.limit).reverse();
    } else {
      out = out.reverse();
    }
    return out;
  }

  subscribe(listener: (d: RoutingDecision) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Spec B Phase 5 (review-S2 fix): release all subscriber references so
   * teardown can complete without anchoring closures. Called from
   * `Orchestrator.stop()` before nulling the bus reference. The bus
   * remains usable after clear — `subscribe()` works as normal.
   */
  clearListeners(): void {
    this.listeners.clear();
  }
}
