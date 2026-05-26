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

  emit(_decision: RoutingDecision): void {
    // Stub: implementation lands in Task 3. References fields for noUnusedLocals.
    void this.ringBuffer;
    void this.listeners;
    void this.capacity;
    void this.logger;
    throw new Error('RoutingDecisionBus.emit not yet implemented (Task 3)');
  }

  recent(_filter?: RoutingDecisionBusFilter): RoutingDecision[] {
    throw new Error('RoutingDecisionBus.recent not yet implemented (Task 3)');
  }

  subscribe(_listener: (d: RoutingDecision) => void): () => void {
    throw new Error('RoutingDecisionBus.subscribe not yet implemented (Task 3)');
  }
}
